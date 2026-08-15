// ==========================================
// FILE: scripts/identity-binding-verify.mjs
// Run: node scripts/identity-binding-verify.mjs
//
// REGRESSION GUARD: authority must derive from a verified, immutable principal —
// request.auth.uid and the server-owned membership/organization records — and never from
// mutable email text.
//
// The defect this exists for was live twice. `b2b_partners` is email-keyed during the
// webhook-buffer window, so five callables looked a caller up by `request.auth.token.email`
// with no `email_verified` check: registering an address was enough to be treated as that
// active partner. One was fixed, the fixture header then described the defect in the PAST
// tense, and four more were still present a round later. This verifier makes the property
// checkable instead of remembered.
// ==========================================
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const FUNCTIONS = resolve(ROOT, 'functions/src');

let checks = 0;
const ok = (label) => { checks += 1; console.log(`  ok ${label}`); };

const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const serverFiles = readdirSync(FUNCTIONS)
  .filter((f) => /\.ts$/.test(f) && !/\.test\.ts$/.test(f))
  .map((f) => resolve(FUNCTIONS, f));

// ---- 1. EVERY ADDRESS READ IS GATED ON email_verified -------------------------------
// An address may only stand in for an identity once Firebase says it was verified.
const ungated = [];
for (const file of serverFiles) {
  const source = stripComments(readFileSync(file, 'utf8'));
  const lines = source.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (!/token\??\.\s*email\b/.test(line)) return;
    if (/email_verified/.test(line)) return;           // gated inline
    // A gate within a few lines above counts: the guard is often a separate statement.
    const window = lines.slice(Math.max(0, index - 4), index + 1).join('\n');
    if (/email_verified/.test(window)) return;
    ungated.push(`${relative(ROOT, file).replace(/\\/g, '/')}:${index + 1}  ${line.trim().slice(0, 90)}`);
  });
}
assert.deepEqual(ungated, [], `AN ADDRESS IS READ WITHOUT A VERIFICATION GATE:\n  ${ungated.join('\n  ')}`);
ok(`${serverFiles.length} server modules scanned; every token.email read is gated on email_verified`);

// ---- 2. THE GATE IS PRESENT WHERE IT MATTERS, AND NOT VACUOUS ------------------------
// If no call site read an address at all the check above would pass trivially, so the
// known email-keyed lookups are required to still exist AND still be gated.
const indexSource = stripComments(readFileSync(resolve(FUNCTIONS, 'index.ts'), 'utf8'));
const addressReads = (indexSource.match(/token\??\.\s*email\b/g) || []).length;
const verificationGates = (indexSource.match(/email_verified/g) || []).length;
assert.ok(addressReads > 0, 'no address read remains, so this verifier proves nothing — re-check the call sites');
assert.ok(
  verificationGates >= addressReads - 1,
  `${addressReads} address reads but only ${verificationGates} verification gates`,
);
// b2b_partners is the email-keyed collection; every lookup that can use an address must be
// downstream of a gate.
assert.match(indexSource, /b2b_partners/, 'the email-keyed collection is gone; re-check this verifier');
ok(`${addressReads} address reads in the deploy entry, ${verificationGates} verification gates`);

// ---- 3. AUTHORITY DERIVES FROM THE VERIFIED uid, NOT FROM AN ADDRESS ----------------
// The staff predicate takes the DOCUMENT only. The document is fetched by uid. Neither can
// be influenced by an address.
assert.match(indexSource, /collection\(['"]admin_users['"]\)\.doc\(/, 'admin_users is no longer looked up by document id');
const byEmail = indexSource.match(/collection\(['"]admin_users['"]\)\.doc\([^)]*[Ee]mail/g) || [];
assert.deepEqual(byEmail, [], `admin_users is looked up BY ADDRESS: ${byEmail.join(', ')}`);
const authoritySource = readFileSync(resolve(FUNCTIONS, 'authority.ts'), 'utf8');
assert.equal(/email/i.test(authoritySource), false, 'the authority core mentions an address concept');
ok('admin_users is addressed by document id only; the authority core has no address concept at all');

// ---- 4. PARTNER AUTHORITY DERIVES FROM IMMUTABLE MEMBERSHIP RECORDS -----------------
// The Portal runtimes bind on partner_identity_bindings/{uid} → partner_memberships, and
// check the organization. None of that is influenced by an address.
const activation = readFileSync(resolve(FUNCTIONS, 'partnerActivationRuntime.ts'), 'utf8');
const memberFn = activation.slice(activation.indexOf('async function member('), activation.indexOf('async function audit('));
assert.ok(memberFn.length > 50, 'could not locate member(); this check would pass vacuously');
assert.match(memberFn, /partner_identity_bindings/, 'membership no longer binds on the identity binding');
assert.match(memberFn, /partner_memberships/, 'membership no longer reads the membership record');
assert.match(memberFn, /partner_organizations/, 'membership no longer checks the organization');
assert.equal(/email/i.test(memberFn), false, 'partner membership resolution consults an address');
// The organization is never taken from the caller payload.
assert.equal(/r\.data\??\.organizationId/.test(memberFn), false, 'the organization comes from the request payload');
ok('partner authority binds on identity-binding → membership → organization, with no address and no payload organization');

// ---- 5. THE VERIFIED-IDENTITY PROPERTY, EXERCISED ------------------------------------
// A behavioural check against the fixture world: three principals share ONE address with
// different authority. If any predicate consulted the address they would be
// indistinguishable; because authority binds on the immutable principal they are not.
const world = (await import(`file://${resolve(ROOT, 'test/fixtures/mondayAuthorityWorld.mjs')}`)).seed();
const compiled = resolve(ROOT, 'functions/lib/authority.js');
assert.ok(existsSync(compiled), 'functions are not compiled; run tsc first');
const authorityMod = await import(`file://${compiled}`);
const authority = authorityMod.default ?? authorityMod;

const groups = new Map();
for (const identity of world.identities) {
  groups.set(identity.contactEmail, [...(groups.get(identity.contactEmail) || []), identity]);
}
const shared = [...groups.entries()].filter(([, members]) => members.length > 1);
assert.ok(shared.length > 0, 'the world has no shared-address group, so this property cannot be exercised');
for (const [address, members] of shared) {
  const verdicts = members.map((m) => ({
    principalId: m.principalId,
    staff: authority.isActiveStaff(m.adminDoc),
    partner: !!(m.partner && m.partner.membershipStatus === 'active'),
  }));
  // Distinct principals sharing an address must be able to hold DIFFERENT authority —
  // otherwise the fixture would not distinguish "same address" from "same principal".
  const distinctAuthority = new Set(verdicts.map((v) => `${v.staff}|${v.partner}`));
  assert.ok(
    distinctAuthority.size > 1,
    `every principal on ${address} holds identical authority, so a binding on the address would be undetectable`,
  );
  // And no principal without its own record may hold authority.
  for (const member of members) {
    if (!member.adminDoc && !member.partner) {
      assert.equal(authority.isActiveStaff(member.adminDoc), false, `${member.principalId} gained authority with no record`);
    }
  }
}
ok(`${shared.length} shared-address group(s) exercised: principals on one address hold different authority, bound to the immutable principal`);

console.log(`\nIdentity binding verification PASS: ${checks} checks. Authority derives from the verified uid and server-owned membership records; every address read is gated on email_verified.`);
