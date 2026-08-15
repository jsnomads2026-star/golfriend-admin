// ==========================================
// FILE: scripts/outreach-localization-verify.mjs
// Run: node scripts/outreach-localization-verify.mjs
//
// Eight-locale parity for the enterprise outreach approval surface.
//
// The dictionary is TRANSPILED AND EVALUATED, not pattern-matched. A regex over the source
// would happily "verify" a locale whose values were all empty strings. Here the real object
// is loaded and every value is inspected.
//
// The load-bearing check is the LAST one: a locale that is missing a compliance string must
// not be able to render a blocked draft as if nothing were wrong. Fallback is allowed to
// substitute wording; it is never allowed to substitute a weaker meaning.
// ==========================================
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const require = createRequire(import.meta.url);
const ts = require('typescript');

let checks = 0;
const ok = (label) => { checks += 1; console.log(`  ok ${label}`); };

/** Transpile a .ts module and import it, so the verifier sees the REAL exported values. */
async function loadTs(relativePath) {
  const source = readFileSync(resolve(ROOT, relativePath), 'utf8')
    // The dictionary's only import is a type-only one; strip it so the module stands alone.
    .replace(/^import type .*$/gm, '');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js, 'utf8').toString('base64')}`);
}

const { outreachDict, OUTREACH_ERROR_CODES, outreachErrorKey } = await loadTs('src/i18n/admin/outreach.ts');

// ---- 1. The canonical eight locales, from the single source of truth ---------------
const localesSource = readFileSync(resolve(ROOT, 'src/i18n/locales.ts'), 'utf8');
const declared = [...localesSource.matchAll(/export const LOCALE_CODES = \[([^\]]+)\]/g)][0][1]
  .split(',').map((part) => part.trim().replace(/['"]/g, '')).filter(Boolean);
assert.equal(declared.length, 8, `expected 8 canonical locales, found ${declared.length}`);
assert.deepEqual(Object.keys(outreachDict).sort(), [...declared].sort(), 'the dictionary locales do not match LOCALE_CODES');
ok(`all ${declared.length} canonical locales present: ${declared.join(', ')}`);

// ---- 2. Key parity in BOTH directions ----------------------------------------------
const reference = Object.keys(outreachDict.en).sort();
for (const locale of declared) {
  const keys = Object.keys(outreachDict[locale]).sort();
  assert.deepEqual(keys, reference, `locale '${locale}' key set differs from 'en'`);
}
ok(`key parity across all 8 locales (${reference.length} keys each, ${reference.length * 8} strings)`);

// ---- 3. No value may be blank, whitespace-only, or an untranslated placeholder -------
// A blank renders as an empty cell, and an empty cell where a warning belongs reads as
// "nothing is wrong" — the single most dangerous failure this surface can have.
for (const locale of declared) {
  for (const [key, value] of Object.entries(outreachDict[locale])) {
    assert.equal(typeof value, 'string', `${locale}.${key} is not a string`);
    assert.notEqual(value.trim(), '', `${locale}.${key} is blank`);
    assert.doesNotMatch(value, /^(TODO|TBD|FIXME|XXX|\?\?\?)/i, `${locale}.${key} is an untranslated placeholder`);
    assert.doesNotMatch(value, /undefined|\[object Object\]|NaN/, `${locale}.${key} contains a rendering artifact`);
  }
}
ok('no blank, placeholder or artifact values in any locale');

// ---- 4. Every server error code has a translation, and no translation is orphaned ----
const serverSource = readFileSync(resolve(ROOT, 'functions/src/outreachAuthority.ts'), 'utf8');
// Slice from the array literal itself: the type annotation `readonly string[]` contains a
// `]` of its own, and anchoring on that would silently parse an empty list.
const declStart = serverSource.indexOf('export const OUTREACH_ERROR_CODES');
assert.ok(declStart > 0, 'OUTREACH_ERROR_CODES is not declared on the server');
const arrayStart = serverSource.indexOf('Object.freeze([', declStart);
assert.ok(arrayStart > 0, 'OUTREACH_ERROR_CODES is not a frozen array literal');
const serverBlock = serverSource.slice(arrayStart, serverSource.indexOf('])', arrayStart));
const serverCodes = [...serverBlock.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
assert.ok(serverCodes.length >= 20, `expected the server code list, parsed ${serverCodes.length}`);
assert.deepEqual([...OUTREACH_ERROR_CODES].sort(), [...serverCodes].sort(), 'the client and server error-code lists have drifted apart');

// Client-only states the SERVER never returns. Declared explicitly so the bidirectional
// check stays strict: anything else with an `err.` prefix must correspond to a real server
// code, and any server code must have a translation.
const CLIENT_ONLY_ERROR_KEYS = ['err.unknown', 'err.offline'];
for (const key of CLIENT_ONLY_ERROR_KEYS) {
  assert.ok(reference.includes(key), `${key} is declared client-only but is not in the dictionary`);
  assert.equal(serverCodes.includes(key.slice(4)), false, `${key} is declared client-only but the server emits it`);
}
const errKeys = reference.filter((key) => key.startsWith('err.') && !CLIENT_ONLY_ERROR_KEYS.includes(key));
assert.deepEqual(errKeys.map((k) => k.slice(4)).sort(), [...serverCodes].sort(), 'an error code has no translation, or a translation has no code');
for (const locale of declared) {
  for (const code of serverCodes) {
    assert.ok(outreachDict[locale][`err.${code}`], `locale '${locale}' has no message for '${code}'`);
  }
}
ok(`all ${serverCodes.length} server error codes translated in all 8 locales, with no orphans`);

// ---- 5. An unknown code degrades to a SAFE message, never to a blank or a raw code ----
for (const bogus of ['not_a_code', '', null, undefined, 42, 'ok', '__proto__', 'constructor']) {
  assert.equal(outreachErrorKey(bogus), 'err.unknown', `an unrecognized code (${String(bogus)}) did not map to err.unknown`);
}
for (const locale of declared) {
  const message = outreachDict[locale]['err.unknown'];
  assert.notEqual(message.trim(), '', `locale '${locale}' has a blank unknown-error message`);
}
ok('an unrecognized code maps to a safe unknown-error message in every locale');

// ---- 6. FALLBACK MUST NOT SOFTEN A COMPLIANCE GATE -----------------------------------
// The runtime `translate()` falls back to English when a key is missing. That is fine for
// wording — but a compliance string must exist in every locale in its OWN language, or a
// Thai reviewer sees an English warning they may not read, on the one screen where the
// warning is the entire point. These keys are checked for real, distinct translations.
const COMPLIANCE_KEYS = [
  'hold.unknown', 'hold.active', 'jurisdiction.unapproved', 'sendable.no',
  'notice.noTransmission', 'notice.serverAuthority',
  'err.legal_hold_unknown', 'err.legal_hold_active', 'err.jurisdiction_not_approved',
  'err.separation_of_duties', 'err.transmission_not_permitted', 'err.digest_mismatch',
];
for (const key of COMPLIANCE_KEYS) {
  for (const locale of declared.filter((l) => l !== 'en')) {
    const value = outreachDict[locale][key];
    assert.ok(value && value.trim() !== '', `compliance key '${key}' is blank in '${locale}'`);
    assert.notEqual(
      value, outreachDict.en[key],
      `compliance key '${key}' in '${locale}' is the untranslated English string — a fallback is standing in for a gate`,
    );
  }
}
ok(`${COMPLIANCE_KEYS.length} compliance-critical keys are genuinely translated in all 8 locales`);

// A blocked state must never be worded as permission. These are the words that would
// invert the meaning of the very strings above.
const PERMISSIVE = /\b(sendable now|ready to send|approved to send|you may send|safe to send|no restrictions)\b/i;
for (const locale of declared) {
  for (const key of COMPLIANCE_KEYS) {
    assert.doesNotMatch(outreachDict[locale][key], PERMISSIVE, `${locale}.${key} reads as permission`);
  }
}
// The English sendability line must state the negative outright.
assert.match(outreachDict.en['sendable.no'], /not sendable/i);
assert.match(outreachDict.en['notice.noTransmission'], /no email is transmitted|nothing is sent/i);
ok('no compliance string is worded as permission');

// ---- 7. The UI carries no hard-coded English production strings ----------------------
const ui = readFileSync(resolve(ROOT, 'src/components/admin/v2/V2OutreachApprovals.tsx'), 'utf8');
const withoutComments = ui.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '');
// Text nodes between JSX tags. Anything literal here would render untranslated.
const textNodes = [...withoutComments.matchAll(/>\s*([A-Za-z][A-Za-z ,.'’-]{3,})\s*</g)].map((m) => m[1].trim());
assert.deepEqual(textNodes, [], `hard-coded English text in the UI: ${textNodes.join(' | ')}`);
// Every user-visible label routes through t().
for (const key of ['title', 'subtitle', 'refresh', 'loading', 'empty', 'sendable.no', 'notice.noTransmission']) {
  assert.ok(withoutComments.includes(`t('${key}')`), `the UI does not render '${key}' through t()`);
}
assert.match(withoutComments, /t\(outreachErrorKey\(/, 'the UI does not localize server error codes');
ok('the Admin surface renders every user-visible string through the dictionary');

console.log(`\nOutreach localization verification PASS: ${checks} checks (8 locales, ${reference.length} keys, ${reference.length * 8} strings, ${serverCodes.length} error codes bidirectional, safe unknown-code degradation, ${COMPLIANCE_KEYS.length} compliance keys translated and non-permissive, no hard-coded UI English).`);
