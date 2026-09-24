import { functions } from '../../../firebaseConfig';
// ============================================================================
// Client transport for the enterprise outreach approval workflow.
//
// This file has NO authority. It marshals a request to a callable and returns whatever
// the server decided. It does not evaluate roles, separation of duties, digests, expiry,
// legal hold or jurisdiction — every one of those is decided on the trusted boundary in
// functions/src/outreachAuthority.ts and re-derived from persisted state on each call.
//
// Nothing here simulates a result. If the network fails, the outcome is an explicit
// failure with `applied: false`; it is never optimistically shown as success, because a
// caller that believes an approval landed when it did not is exactly the failure mode this
// whole lane exists to prevent.
// ============================================================================
import { httpsCallable } from 'firebase/functions';

/** Mirrors the server projection. No identity but the caller's own relationship to a draft. */
export interface OutreachRow {
  draftId: string;
  state: string;
  version: number;
  jurisdiction: string | null;
  jurisdictionApproved: boolean;
  legalHold: boolean | null;
  expiresAt: string | null;
  /** Subject and body, so a reviewer can read what they are being asked to approve. */
  subject: string | null;
  body: string | null;
  hasAssignedReviewer: boolean;
  callerIsCreator: boolean;
  callerIsAssignedReviewer: boolean;
  sendable: boolean;
  sendableReason: string;
}

export interface CommandOutcome {
  /** True only when the SERVER reported a committed write. */
  applied: boolean;
  /** True when the server recognised this command id and replayed the original result. */
  replayed: boolean;
  /** Stable server error code, or null on success. Localized via outreachErrorKey(). */
  code: string | null;
  state: string | null;
  version: number | null;
}

export interface OutreachTransport {
  list(): Promise<{ ok: boolean; code: string | null; rows: OutreachRow[] }>;
  command(payload: Record<string, unknown>): Promise<CommandOutcome>;
}

const asOutcome = (value: unknown): CommandOutcome => {
  const data = (value ?? {}) as Record<string, unknown>;
  return {
    applied: data.ok === true,
    replayed: data.replayed === true,
    // A response with no recognizable code is `internal_error`, never null-with-ok-false:
    // an unlabelled failure would render as a blank message and read as success.
    code: data.ok === true ? null : (typeof data.code === 'string' ? data.code : 'internal_error'),
    state: typeof data.state === 'string' ? data.state : null,
    version: typeof data.version === 'number' ? data.version : null,
  };
};
/** The real transport. Every action in the Admin surface goes through these two callables. */
export const productionOutreachTransport: OutreachTransport = {
  async list() {
    try {
      const call = httpsCallable(functions, 'listOutreachDrafts');
      const result = await call({ limit: 50 });
      const data = (result.data ?? {}) as Record<string, unknown>;
      if (data.ok !== true) {
        return { ok: false, code: typeof data.code === 'string' ? data.code : 'internal_error', rows: [] };
      }
      return { ok: true, code: null, rows: Array.isArray(data.rows) ? (data.rows as OutreachRow[]) : [] };
    } catch {
      // A transport failure is reported as a failure. It is never rendered as an empty
      // list, which would read as "there is nothing to approve".
      return { ok: false, code: 'internal_error', rows: [] };
    }
  },
  async command(payload) {
    try {
      const call = httpsCallable(functions, 'outreachDraftCommand');
      const result = await call(payload);
      return asOutcome(result.data);
    } catch {
      return { applied: false, replayed: false, code: 'internal_error', state: null, version: null };
    }
  },
};

