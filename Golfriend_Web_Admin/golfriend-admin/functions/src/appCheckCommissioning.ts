// ==========================================
// FILE: functions/src/appCheckCommissioning.ts
// Configuration and verification port for App Check on PRIVILEGED callables.
//
// This does NOT provision App Check and cannot. Provisioning is a Firebase console action
// plus a client attestation provider — neither exists in this repository. What this file
// does is decide, from evidence, whether a privileged callable may proceed, and it fails
// CLOSED whenever that evidence is absent, unverified or unknown.
//
// WHY IT EXISTS AS A PORT. The two lanes currently disagree: the Partner Portal declares
// `enforceAppCheck: true` on its privileged callables, while the Admin lane declares it
// nowhere. Same project, two postures. A shared port makes the posture one declared value
// that a gate can check, instead of a per-callable option that drifts silently.
//
// THE PRODUCTION DEFAULT IS FAIL-CLOSED. `REQUIRED_IN_PRODUCTION` is true. The reason the
// system still runs today is that `commissioningStage()` reports `not_provisioned`, and an
// un-provisioned stage is an explicit, visible refusal to claim protection — not a quiet
// allow. Flipping to `enforced` is a one-line change whose every branch is already tested.
// ==========================================

/** Stages a deployment can be in. Ordered from least to most protected. */
export const COMMISSIONING_STAGES = Object.freeze([
  'not_provisioned',   // no attestation provider exists; enforcement would reject every request
  'monitoring',        // tokens accepted and recorded, absence does not block
  'enforced',          // absence or invalidity blocks
] as const);

export type CommissioningStage = (typeof COMMISSIONING_STAGES)[number];

/**
 * App Check MUST be enforced on privileged callables in production. Declared as a constant
 * so the requirement is a fact in the codebase rather than an intention in a document.
 */
export const REQUIRED_IN_PRODUCTION = true;

/**
 * The CURRENT stage of this deployment. `not_provisioned` is the honest value: no
 * attestation provider is configured in the client bundle and no App Check dependency
 * exists in either package. Setting this to 'enforced' without provisioning would reject
 * every real request; setting it to 'enforced' while claiming provisioning that does not
 * exist would be a fabricated production state.
 */
export const COMMISSIONING_STAGE: CommissioningStage = 'not_provisioned';

/** The project this deployment belongs to. Evidence from another project is not evidence. */
// Must match the project this code is actually deployed to. It previously read
// 'golfriend-v2' while .firebaserc defaults to 'golfriend-v1', so switching enforcement on
// would have refused EVERY real token with app_check_project_mismatch — a self-inflicted
// outage disguised as a one-line change. Verified against .firebaserc by
// scripts/commissioning-boundary-verify.mjs.
export const EXPECTED_PROJECT_ID = 'golfriend-v1';

export interface AppCheckEvidence {
  /** Present only when the Functions runtime verified a token. */
  appId?: unknown;
  /** Project the token was minted for. */
  projectId?: unknown;
  /** Token issue time, epoch seconds. */
  issuedAt?: unknown;
  /** Token expiry, epoch seconds. */
  expiresAt?: unknown;
  /** Opaque token identifier, used for replay detection. */
  tokenId?: unknown;
  /** Set by the runtime when verification itself failed. */
  verificationError?: unknown;
}

export const APP_CHECK_DECISIONS = Object.freeze([
  'allowed',
  'app_check_required',       // no evidence at all
  'app_check_invalid',        // malformed, expired, or failed verification
  'app_check_replayed',       // a token id already seen
  'app_check_project_mismatch', // evidence from a different project
  'app_check_not_provisioned',  // enforcement demanded but the stage cannot supply it
]);

export interface AppCheckDecision {
  ok: boolean;
  code: string;
  /** True when the decision was reached without any verified attestation. */
  unattested: boolean;
}

const refuse = (code: string): AppCheckDecision => ({ ok: false, code, unattested: true });
const allow = (): AppCheckDecision => ({ ok: true, code: 'allowed', unattested: false });

/** Replay memory. In production this is backed by a store; the port keeps the contract. */
export interface ReplayMemory {
  seen(tokenId: string): boolean;
  remember(tokenId: string): void;
}

export function createReplayMemory(limit = 10000): ReplayMemory {
  // FIFO eviction, not a full flush. Clearing the whole set at the limit made every
  // previously-seen token replayable at once, at a moment an attacker can choose simply by
  // driving enough distinct tokens. Evicting the oldest bounds memory without ever handing
  // back a window in which the entire history is forgotten.
  //
  // NOTE FOR DEPLOYMENT: this is per-instance. A multi-instance deployment needs a shared
  // store before replay detection is meaningful across instances — recorded as an operator
  // decision, not silently assumed away.
  const seen = new Set<string>();
  return {
    seen: (tokenId) => seen.has(tokenId),
    remember: (tokenId) => {
      if (seen.has(tokenId)) return;
      if (seen.size >= limit) {
        const oldest = seen.values().next().value;
        if (oldest !== undefined) seen.delete(oldest);
      }
      seen.add(tokenId);
    },
  };
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * The authoritative decision for a privileged callable.
 *
 * @param evidence  what the runtime verified, or null/undefined when it verified nothing
 * @param stage     the deployment's commissioning stage
 * @param memory    replay memory; omitted means replay cannot be detected, which is itself
 *                  a reason to refuse under enforcement
 * @param nowSeconds server clock
 */
export function decideAppCheck(
  evidence: AppCheckEvidence | null | undefined,
  stage: CommissioningStage = COMMISSIONING_STAGE,
  memory?: ReplayMemory,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): AppCheckDecision {
  // An unrecognized stage is not a stage. Fail closed rather than guessing.
  if (COMMISSIONING_STAGES.indexOf(stage) === -1) return refuse('app_check_not_provisioned');

  // MONITORING: evidence is recorded when present, and its absence does not block. This
  // stage exists so a deployment can measure coverage before enforcing.
  if (stage === 'monitoring') {
    if (evidence && typeof evidence.tokenId === 'string' && memory) memory.remember(evidence.tokenId);
    return { ok: true, code: 'allowed', unattested: !evidence };
  }

  // NOT PROVISIONED: enforcement is required in production but cannot be supplied. The
  // refusal is explicit. It is NOT reported as `allowed`, because reporting an unprotected
  // request as allowed-and-attested is the fabrication this port exists to prevent.
  if (stage === 'not_provisioned') {
    return REQUIRED_IN_PRODUCTION
      ? refuse('app_check_not_provisioned')
      : { ok: true, code: 'allowed', unattested: true };
  }

  // ENFORCED.
  if (!evidence || typeof evidence !== 'object') return refuse('app_check_required');
  if (evidence.verificationError) return refuse('app_check_invalid');
  if (typeof evidence.appId !== 'string' || evidence.appId.trim() === '') return refuse('app_check_required');
  if (typeof evidence.projectId !== 'string' || evidence.projectId.trim() === '') return refuse('app_check_invalid');
  if (evidence.projectId !== EXPECTED_PROJECT_ID) return refuse('app_check_project_mismatch');
  if (!isFiniteNumber(evidence.issuedAt) || !isFiniteNumber(evidence.expiresAt)) return refuse('app_check_invalid');
  if (evidence.expiresAt <= nowSeconds) return refuse('app_check_invalid');
  if (evidence.issuedAt > nowSeconds + 60) return refuse('app_check_invalid'); // minted in the future
  if (typeof evidence.tokenId !== 'string' || evidence.tokenId.trim() === '') return refuse('app_check_invalid');
  // Without replay memory a replayed token cannot be detected, so enforcement cannot be
  // honestly claimed. Refusing is the fail-closed reading.
  if (!memory) return refuse('app_check_invalid');
  if (memory.seen(evidence.tokenId)) return refuse('app_check_replayed');
  memory.remember(evidence.tokenId);
  return allow();
}

/**
 * Deployment readiness. Reports what is true, and never asserts provisioning that does not
 * exist. `ready` is false while the stage is not `enforced`.
 */
export function commissioningReadiness(stage: CommissioningStage = COMMISSIONING_STAGE): {
  ready: boolean;
  stage: CommissioningStage;
  requiredInProduction: boolean;
  blockers: string[];
} {
  const blockers: string[] = [];
  if (stage !== 'enforced') {
    blockers.push('App Check is not enforced for this deployment');
  }
  if (stage === 'not_provisioned') {
    blockers.push('no attestation provider is provisioned; enforcing now would reject every request');
    blockers.push('operator action required: configure an App Check provider and initialize it in the client bundle');
  }
  return { ready: blockers.length === 0, stage, requiredInProduction: REQUIRED_IN_PRODUCTION, blockers };
}
