// Generates the TypeScript pricing projection consumed by functions/.
//
// functions/ cannot import src/economy/economyConfig.mjs (tsconfig rootDir is "src"), so the
// rates have to exist there in some form. A hand-maintained mirror would be a second
// editable authority; this projection is instead DERIVED, carries a digest of the canonical
// policy data, and is verified by verify-pricing-projection.mjs. Editing the generated file
// by hand changes its digest and fails the gate.
//
// Usage: node scripts/generate-pricing-projection.mjs [--check]

import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(root, 'functions', 'src', 'generated', 'pricingProjection.ts');
const SOURCE_REL = 'src/economy/economyConfig.mjs';

const {ECONOMY_POLICY_VERSIONS} = await import(
  new URL('../src/economy/economyConfig.mjs', import.meta.url).href
);

/** Stable key order so the digest depends on values, never on authoring order. */
const canonical = value => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
};

export const projectionPayload = () => canonical(ECONOMY_POLICY_VERSIONS);
export const projectionDigest = () =>
  createHash('sha256').update(JSON.stringify(projectionPayload())).digest('hex');

const render = () => {
  const payload = projectionPayload();
  const digest = projectionDigest();
  return `// GENERATED FILE — DO NOT EDIT.
//
// Produced by scripts/generate-pricing-projection.mjs from ${SOURCE_REL}, which is the single
// pricing authority. This is a projection of that authority, not a second copy of it: the
// digest below is computed over the canonical policy data, and verify-pricing-projection.mjs
// recomputes it. A hand edit here, or a change to the authority without regenerating, fails
// the gate. To change a rate, add a new effective-dated version to ${SOURCE_REL} and rerun
// the generator.

export const PRICING_PROJECTION_SOURCE = ${JSON.stringify(SOURCE_REL)} as const;
export const PRICING_PROJECTION_DIGEST = ${JSON.stringify(digest)} as const;

export interface EconomyPolicyVersion {
  readonly version: string;
  readonly effectiveFrom: string;
  readonly effectiveUntil: string | null;
  readonly approvedBy: string;
  readonly bookingCommissionBps: number;
  readonly maxCommissionBps: number;
  readonly minCommissionBps: number;
  readonly smallBusinessSubscription?: {readonly currency: string; readonly amountMinor: number; readonly period: string};
  readonly trialDays?: number;
  readonly trialDiscountBps?: number;
  readonly golfriendOwnedReceivables?: readonly string[];
  readonly notice: string;
  readonly prohibited: readonly string[];
}

export const ECONOMY_POLICY_VERSIONS: readonly EconomyPolicyVersion[] = Object.freeze(
${JSON.stringify(payload, null, 2).split('\n').map(l => '  ' + l).join('\n')} as const
) as readonly EconomyPolicyVersion[];

const isoDay = (value: unknown) => {
  if (typeof value !== 'string' || !/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return null;
  const parsed = new Date(\`\${value}T00:00:00.000Z\`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
};

/** The policy effective on a day, or null. Mirrors economyPolicyFor in the authority. */
export function economyPolicyFor(at: unknown): EconomyPolicyVersion | null {
  const day = isoDay(at);
  if (!day) return null;
  const applicable = ECONOMY_POLICY_VERSIONS.filter(p => p.effectiveFrom <= day && (!p.effectiveUntil || day <= p.effectiveUntil));
  return applicable.length ? applicable[applicable.length - 1]! : null;
}

export function economyPolicyByVersion(version: string): EconomyPolicyVersion | null {
  return ECONOMY_POLICY_VERSIONS.find(p => p.version === version) ?? null;
}
`;
};

const rendered = render();
const check = process.argv.includes('--check');
const existing = fs.existsSync(OUTPUT) ? fs.readFileSync(OUTPUT, 'utf8') : null;

if (check) {
  if (existing !== rendered) {
    console.error('Pricing projection is stale or hand-edited. Run: node scripts/generate-pricing-projection.mjs');
    process.exit(1);
  }
  console.log(`Pricing projection matches ${SOURCE_REL} (digest ${projectionDigest().slice(0, 16)}…).`);
} else {
  fs.mkdirSync(path.dirname(OUTPUT), {recursive: true});
  fs.writeFileSync(OUTPUT, rendered);
  console.log(`Generated ${path.relative(root, OUTPUT)} from ${SOURCE_REL} (digest ${projectionDigest().slice(0, 16)}…).`);
}
