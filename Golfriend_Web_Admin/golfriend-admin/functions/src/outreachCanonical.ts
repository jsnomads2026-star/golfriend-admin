// ==========================================
// FILE: functions/src/outreachCanonical.ts
// SERVER-SIDE canonical form + SHA-256 digest for enterprise outreach approvals.
//
// This is the trusted-boundary twin of src/components/admin/v2/outreachDigest.mjs.
// It MUST produce byte-identical canonical strings and identical digests: an approval
// recorded by the client-side domain and re-verified here has to agree, or an attacker
// could approve one content and persist another. scripts/outreach-production-binding-verify.mjs
// cross-checks the two implementations over shared vectors on every run — the equality
// is asserted, not assumed.
//
// The client file hand-rolls SHA-256 because it must stay synchronous in the browser.
// Here node:crypto is available and is the correct choice: a hand-rolled hash on the
// trusted boundary is a liability, not a feature.
// ==========================================
import { createHash } from "node:crypto";

export const DIGEST_ALGORITHM = "sha-256";
export const CANONICAL_FORM = "golfriend.outreach.canonical.v1";

/**
 * EXACT field order of the canonical form. Declared, never sorted: a runtime's sort
 * order can vary by locale, and inserting a field in the middle would silently
 * re-canonicalize every historic digest.
 */
export const CANONICAL_FIELDS: readonly string[] = Object.freeze([
  "draftType", "locale", "templateVersion", "jurisdiction", "jurisdictionApprovalVersion",
  "prospectRef", "contactRef", "recipientRole", "recipientRef", "contactPreferenceVersion",
  "consentVersion", "doNotContactVersion", "purpose", "evidenceVersion",
  "subject", "body",
]);

/** The only fields permitted to be null. Everything else must be a string. */
const NULLABLE_FIELDS: readonly string[] = Object.freeze([
  "recipientRole", "recipientRef", "evidenceVersion", "jurisdictionApprovalVersion",
]);

export const CANONICALIZATION_ERRORS: readonly string[] = Object.freeze([
  "unknown_field", "missing_field", "duplicate_key", "unsupported_value",
  "non_normalized_text", "control_character", "value_too_long",
]);

const MAX_FIELD_LENGTH = 8192;

/** C0/C1 controls (newline and tab are permitted in a body), zero-width marks, bidi controls. */
const CONTROL_AND_INVISIBLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200F\u2028\u2029\u202A-\u202E\u2066-\u2069\uFEFF]/;

const hasOwn = (target: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(target, key);

const byteLength = (value: string): number => Buffer.byteLength(value, "utf8");

export interface CanonicalResult {
  ok: boolean;
  error: string | null;
  field: string | null;
  canonical: string | null;
}

/**
 * Validate and canonicalize caller content. Non-NFC text is REJECTED, never silently
 * normalized: silent normalization lets two visually identical drafts be approved under
 * one digest and stored under another.
 */
export function canonicalizeOutreachContent(input: unknown): CanonicalResult {
  const refuse = (error: string, field: string | null): CanonicalResult =>
    ({ ok: false, error, field, canonical: null });

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return refuse("unsupported_value", null);
  }
  const record = input as Record<string, unknown>;
  // Own enumerable keys only, so an inherited property cannot smuggle a field in or out.
  const seen = new Set<string>();
  for (const key of Object.keys(record)) {
    if (seen.has(key)) return refuse("duplicate_key", key);
    seen.add(key);
    if (CANONICAL_FIELDS.indexOf(key) === -1) return refuse("unknown_field", key);
  }

  const segments: string[] = [];
  for (const field of CANONICAL_FIELDS) {
    if (!hasOwn(record, field)) return refuse("missing_field", field);
    const raw = record[field];
    if (raw === null) {
      if (NULLABLE_FIELDS.indexOf(field) === -1) return refuse("unsupported_value", field);
      segments.push(`${field}:null:`);
      continue;
    }
    if (typeof raw !== "string") return refuse("unsupported_value", field);
    if (raw.length > MAX_FIELD_LENGTH) return refuse("value_too_long", field);
    // Control characters are a classic way to hide content from a reviewer while
    // changing what would actually be delivered.
    if (CONTROL_AND_INVISIBLE.test(raw)) return refuse("control_character", field);
    if (raw.normalize("NFC") !== raw) return refuse("non_normalized_text", field);
    // Length-prefixed `field:byteLength:value` — injective regardless of value content.
    // A delimiter-joined form is ambiguous whenever a value contains the delimiter.
    segments.push(`${field}:${byteLength(raw)}:${raw}`);
  }
  return { ok: true, error: null, field: null, canonical: `${CANONICAL_FORM}\n${segments.join("\n")}` };
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export interface DigestResult {
  ok: boolean;
  error: string | null;
  field: string | null;
  digest: string | null;
}

/** Canonicalize then hash. A refusal never yields a digest. */
export function outreachContentDigest(input: unknown): DigestResult {
  const canonical = canonicalizeOutreachContent(input);
  if (!canonical.ok || canonical.canonical === null) {
    return { ok: false, error: canonical.error, field: canonical.field, digest: null };
  }
  return {
    ok: true, error: null, field: null,
    digest: `${DIGEST_ALGORITHM}:${sha256Hex(canonical.canonical)}`,
  };
}

/**
 * Length-independent comparison so a digest check does not leak the matching prefix by
 * timing. Length is compared first because an unequal length cannot be hidden anyway.
 */
export function digestsEqual(a: unknown, b: unknown): boolean {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Canonical JSON for command fingerprints. JSON.stringify alone is NOT injective — it
 * erases `undefined`, functions and symbols, so a materially changed replay payload could
 * collide with the original and be served the original success. It is also key-order
 * sensitive, so a logically identical replay could be wrongly rejected. Both directions
 * are wrong, so keys are sorted and unserializable values refuse outright.
 */
export function canonicalJson(value: unknown): string | null {
  const walk = (node: unknown): string => {
    // `undefined` is EMITTED, not erased and not refused. Erasing it makes the fingerprint
    // non-injective (a changed payload could be served the original success); refusing it
    // is wrong too, because a callable client that omits a field sends undefined, and that
    // request deserves its real error rather than a blanket "payload rejected".
    // `#u` is a bare token: every other branch emits JSON, which can only start with a
    // quote, a digit, `-`, `[`, `{`, `t`, `f` or `n`. So no value can forge it.
    if (node === undefined) return "#u";
    if (node === null) return "null";
    if (typeof node === "function" || typeof node === "symbol") throw new Error("unserializable");
    if (typeof node === "number") {
      if (!Number.isFinite(node)) throw new Error("unserializable");
      return JSON.stringify(node);
    }
    if (typeof node === "string" || typeof node === "boolean") return JSON.stringify(node);
    if (Array.isArray(node)) return `[${node.map(walk).join(",")}]`;
    if (typeof node === "object") {
      const obj = node as Record<string, unknown>;
      return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${walk(obj[k])}`).join(",")}}`;
    }
    throw new Error("unserializable");
  };
  try {
    return walk(value);
  } catch {
    return null;
  }
}

/** Fingerprint of a command payload. `null` means the payload cannot be fingerprinted. */
export function commandFingerprint(payload: unknown): string | null {
  const canonical = canonicalJson(payload === undefined ? null : payload);
  if (canonical === null) return null;
  return `cmd-sha256:${sha256Hex(canonical)}`;
}
