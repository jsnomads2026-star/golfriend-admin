// ============================================================================
// Command intent, single-flight and cache disposal for the outreach approval surface.
//
// WHY THIS EXISTS (replay). The server has a replay ledger: the same command id with the
// same payload replays the original outcome instead of applying it twice. The UI defeated
// that entirely by minting a fresh id on every click, so a double-click or a retry after a
// timeout was two DIFFERENT commands to the server. The version compare-and-set caught the
// double-click by luck — the second write was stale — but an accepted-but-response-lost
// retry is not stale, and would have applied twice.
//
// The unit of identity is the USER'S INTENT, not the click: "approve draft d1 as seen at
// version 3". The same intent always carries the same command id, however many times it is
// attempted, so the server can recognise a retry. A different intent — a different target
// state, a different version, different content — is a different id.
//
// WHY THIS EXISTS (disposal). Draft content is only shown to the creator and the assigned
// reviewer. That decision is made by the server for a PARTICULAR identity at a PARTICULAR
// moment. Once the identity, role, status, organization scope, request version or App Check
// state changes, previously authorized content on screen is no longer authorized, and
// keeping it is a disclosure. It is dropped rather than left to go stale.
//
// Pure and framework-free so it can be tested exhaustively without a renderer, which is
// what scripts/outreach-intent-verify.mjs does.
// ============================================================================

/** Everything that can change what a caller is allowed to see. */
export interface AuthorityIdentity {
  uid: string | null;
  role: string | null;
  status: string | null;
  /** Organization / course scope, when the surface is scoped to one. */
  scope?: string | null;
  /** Server request/contract version, if the transport reports one. */
  requestVersion?: string | number | null;
  /** Whether the app currently holds a verified App Check token. */
  appCheck?: boolean | null;
  /** Whether the client believes it is online. Offline is an authority-unknown state. */
  online?: boolean | null;
}

const part = (value: unknown): string => {
  // ABSENT marker. Written as an escape, not a raw byte: a literal NUL in the source makes
  // the whole file binary to git, so the diff becomes unreviewable. It stays distinct from
  // any real value because no caller-supplied string may contain a control character.
  if (value === null || value === undefined) return '\u0000';
  return String(value).normalize('NFC').trim().toLowerCase();
};

/**
 * A stable fingerprint of everything that governs authorization. Any change to any
 * component produces a different fingerprint, and a different fingerprint means the cached
 * view was authorized for someone or something else.
 */
export function authorityFingerprint(identity: AuthorityIdentity | null | undefined): string {
  if (!identity) return 'anonymous';
  // Length-prefixed, for the same reason intentKey is: a delimiter-joined fingerprint is
  // ambiguous the moment a component can contain the delimiter, and `role` is an
  // unvalidated free string. Two identities sharing a fingerprint would share a storage
  // namespace and a disposal verdict.
  return [
    identity.uid, identity.role, identity.status, identity.scope,
    identity.requestVersion, identity.appCheck, identity.online,
  ].map((value) => { const text = part(value); return `${text.length}:${text}`; }).join('');
}

/**
 * Whether cached content must be discarded. Fails CLOSED: an unknown or absent identity on
 * either side disposes, because "we cannot tell whether this is still the same authority"
 * is not "it is".
 */
export function shouldDisposeCache(
  previous: AuthorityIdentity | null | undefined,
  next: AuthorityIdentity | null | undefined,
): boolean {
  if (!previous || !next) return true;
  if (!next.uid) return true;                       // signed out
  if (next.online === false) return true;           // offline: authority cannot be revalidated
  if (next.appCheck === false) return true;         // attestation lost
  return authorityFingerprint(previous) !== authorityFingerprint(next);
}

/**
 * The identity of a user's INTENT. Content is included so that editing what would be
 * approved produces a different intent, and therefore a different command id — a retry
 * must never carry new content under an id the server already accepted.
 */
export interface IntentDescriptor {
  draftId: string;
  requestedState: string;
  expectedVersion: number;
  /** Digest or fingerprint of any content the intent carries. Optional. */
  contentRef?: string | null;
}

/**
 * Length-prefixed so the encoding is injective. A delimiter-joined key is ambiguous the
 * moment a component can contain the delimiter — and `contentRef` is built from free-text
 * subject and body, so it certainly can. Two different intents sharing a key would share a
 * command id, which is the one thing this module exists to prevent.
 *
 * The draft id is NOT case-folded: Firestore document ids are case-sensitive and the
 * server's id shape permits both cases, so `D1` and `d1` are different drafts.
 */
const segment = (value: unknown): string => {
  const text = value === null || value === undefined ? '' : String(value).normalize('NFC');
  return `${text.length}:${text}`;
};

export function intentKey(intent: IntentDescriptor): string {
  return [
    segment(intent.draftId),
    segment(part(intent.requestedState)),
    segment(part(intent.expectedVersion)),
    segment(intent.contentRef),
  ].join('');
}

/** Minimal storage surface. sessionStorage satisfies it; so does a plain Map in tests. */
export interface IntentStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PendingIntent {
  commandId: string;
  key: string;
  startedAt: number;
}

export interface ReserveResult {
  /** The STABLE id for this intent. The same on every attempt until it is settled. */
  commandId: string;
  /** True when the id was recovered from storage after a reload/restart. */
  recovered: boolean;
  /**
   * False when the id could not be persisted (storage full, or blocked by privacy
   * settings). The id then lives only in memory, so a crash before the response arrives
   * would mint a new one and could apply the command a second time. Surfaced rather than
   * swallowed, because a silent loss of idempotency is worse than a visible one.
   */
  durable: boolean;
}

const STORAGE_PREFIX = 'golfriend.admin.outreach.intent.';

/** Opaque, within the server's id shape /^[A-Za-z0-9_-]{1,64}$/. */
export function mintCommandId(random: () => string): string {
  return `cmd-${random().replace(/[^A-Za-z0-9]/g, '')}`.slice(0, 64);
}

/**
 * TWO SEPARATE CONCEPTS, which an earlier version of this file wrongly merged into one.
 *
 *   RESERVED — this intent has a stable command id. It stays reserved across failed
 *              attempts, so every retry carries the id the server already knows.
 *   IN FLIGHT — a request for this intent is awaiting a response RIGHT NOW.
 *
 * Merging them meant a transport failure left the intent permanently "in flight": the
 * retry was suppressed client-side and never reached the server, so the button went
 * silently dead — the exact opposite of the retry-replays behaviour intended.
 */
export interface IntentLedger {
  /** Get (or create) the stable command id for this intent. Does NOT mark it in flight. */
  reserve(intent: IntentDescriptor): ReserveResult;
  /** Mark a request as awaiting a response. Returns false if one already is. */
  markInFlight(intent: IntentDescriptor): boolean;
  /** Always call once the attempt finishes, success or failure. */
  clearInFlight(intent: IntentDescriptor): void;
  isInFlight(intent: IntentDescriptor): boolean;
  /** Retire the id after an AUTHORITATIVE outcome. A transport failure is not one. */
  settle(intent: IntentDescriptor): void;
  reservedCount(): number;
  /** Drop everything, in memory AND in storage — used when the authority changes. */
  disposeAll(): void;
}

/**
 * @param store       persistence for restart recovery (sessionStorage in the app)
 * @param fingerprint the authority fingerprint; entries are scoped to it, so a different
 *                    identity can never recover another identity's pending commands
 * @param random      id source, injected so tests are deterministic
 */
export function createIntentLedger(
  store: IntentStore,
  fingerprint: string,
  random: () => string = () => Math.random().toString(36).slice(2) + Date.now().toString(36),
  now: () => number = () => Date.now(),
): IntentLedger {
  /** Intents that hold a stable command id. Survives failed attempts. */
  const reserved = new Map<string, PendingIntent>();
  /** Intents whose request is awaiting a response right now. */
  const inFlight = new Set<string>();
  const storageKey = (key: string) => `${STORAGE_PREFIX}${fingerprint}.${key}`;

  const readPersisted = (key: string): PendingIntent | null => {
    try {
      const raw = store.getItem(storageKey(key));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as PendingIntent;
      // A stored entry that is not a well-formed id is not usable as one.
      if (!parsed || typeof parsed.commandId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(parsed.commandId)) {
        return null;
      }
      return parsed;
    } catch {
      // Unreadable storage must not block the action; it just means no recovery.
      return null;
    }
  };

  /** Returns whether the id was durably persisted; the caller surfaces a false. */
  const write = (key: string, entry: PendingIntent): boolean => {
    try { store.setItem(storageKey(key), JSON.stringify(entry)); return true; } catch { return false; }
  };

  return {
    reserve(intent) {
      const key = intentKey(intent);
      // 1. Already reserved in this session — including after a failed attempt, which is
      //    the whole point: the retry must carry the id the server already saw.
      const existing = reserved.get(key);
      if (existing) return { commandId: existing.commandId, recovered: false, durable: true };
      // 2. Recovered after a reload: the SAME id, so the server replays rather than
      //    applying a second transition.
      const persisted = readPersisted(key);
      if (persisted) {
        reserved.set(key, persisted);
        return { commandId: persisted.commandId, recovered: true, durable: true };
      }
      // 3. A genuinely new intent.
      const entry: PendingIntent = { commandId: mintCommandId(random), key, startedAt: now() };
      reserved.set(key, entry);
      return { commandId: entry.commandId, recovered: false, durable: write(key, entry) };
    },
    markInFlight(intent) {
      const key = intentKey(intent);
      if (inFlight.has(key)) return false;
      inFlight.add(key);
      return true;
    },
    clearInFlight(intent) {
      inFlight.delete(intentKey(intent));
    },
    isInFlight(intent) {
      return inFlight.has(intentKey(intent));
    },
    settle(intent) {
      const key = intentKey(intent);
      reserved.delete(key);
      inFlight.delete(key);
      try { store.removeItem(storageKey(key)); } catch { /* best-effort */ }
    },
    reservedCount() {
      return reserved.size;
    },
    disposeAll() {
      // Sweep ONLY this fingerprint's namespace, and NEVER an intent that is still in
      // flight. The previous version swept every key under the shared prefix regardless of
      // owner, so an `online` change mid-request destroyed the reserved id and the retry
      // minted a new one — applying an accepted-but-response-lost command a second time.
      // That is the exact failure this module exists to prevent.
      const mine = `${STORAGE_PREFIX}${fingerprint}.`;
      for (const [key] of reserved) {
        if (inFlight.has(key)) continue;   // a live attempt keeps its id
        try { store.removeItem(storageKey(key)); } catch { /* best-effort */ }
        reserved.delete(key);
      }
      try {
        const enumerable = store as IntentStore & { length?: number; key?: (index: number) => string | null };
        if (typeof enumerable.length === 'number' && typeof enumerable.key === 'function') {
          const doomed: string[] = [];
          for (let index = 0; index < enumerable.length; index += 1) {
            const found = enumerable.key(index);
            // Only this fingerprint's keys. Another identity's pending command is not ours
            // to discard, and discarding it would break their idempotency too.
            if (found && found.startsWith(mine)) doomed.push(found);
          }
          for (const found of doomed) {
            const suffix = found.slice(mine.length);
            if (inFlight.has(suffix)) continue;
            store.removeItem(found);
          }
        }
      } catch { /* best-effort */ }
    },
  };
}

/**
 * Whether a command outcome is AUTHORITATIVE — i.e. the server reached a decision, so the
 * intent is finished and its id may be retired.
 *
 * A transport failure is NOT authoritative. That is the accepted-but-response-lost case:
 * the write may well have landed, so the id must be kept and reused on retry. Retiring it
 * would mint a fresh id and apply the change a second time.
 */
export function isAuthoritativeOutcome(outcome: { applied?: boolean; code?: string | null } | null | undefined): boolean {
  if (!outcome) return false;
  if (outcome.applied === true) return true;
  // Codes that mean the server evaluated the request and refused it on its merits.
  const DECIDED = [
    'not_admin', 'insufficient_role', 'separation_of_duties', 'reviewer_not_assigned',
    'invalid_state', 'draft_expired', 'draft_terminal', 'draft_not_found', 'duplicate_draft',
    'digest_mismatch', 'content_rejected', 'payload_rejected', 'jurisdiction_not_approved',
    'legal_hold_active', 'legal_hold_unknown', 'retention_policy_unavailable',
    'transmission_not_permitted', 'replay_payload_mismatch', 'stale_write', 'version_required',
    'unauthenticated', 'app_check_required',
  ];
  return typeof outcome.code === 'string' && DECIDED.indexOf(outcome.code) !== -1;
}
