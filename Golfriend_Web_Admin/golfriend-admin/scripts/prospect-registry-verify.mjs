// B5-R16 — server-authoritative prospect registry domain.
// Behavioural tests for identity, lifecycle, duplicate review, merge refusal, contact access
// control and immutable receipts. Pure logic: no I/O, no adapter, no production data.
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  applyStatusTransition,
  CONTACTABLE_STATUSES,
  detectDuplicates,
  deterministicProspectId,
  PROSPECT_SOURCES,
  PROSPECT_STATUSES,
  PROSPECT_TRANSITIONS,
  proposeMerge,
  readContact,
  REGISTRY_SCHEMA,
  registryOutbound,
  registryReceipt,
  validateProspectRecord,
} from '../src/components/admin/v2/prospectRegistryDomain.mjs';
import { OUTBOUND_FIELD_ALLOWLIST } from '../src/components/admin/v2/courseAcquisitionModel.mjs';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const codeOnly = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

// --- contracts ------------------------------------------------------------
assert.equal(REGISTRY_SCHEMA, 'golfriend.admin.prospect-registry.v1');
assert.deepEqual([...PROSPECT_SOURCES], ['golf_api', 'portal_course_lead', 'admin_created_lead', 'existing_course_database', 'referral', 'other_approved_structured']);
assert.equal(PROSPECT_STATUSES.length, 16);
for (const status of ['new', 'researching', 'qualified', 'contact_ready', 'approval_required', 'contact_queued', 'contacted', 'responded', 'interested', 'trial_offered', 'portal_onboarding', 'partner_review', 'active_partner', 'declined', 'do_not_contact', 'archived']) assert.ok(PROSPECT_STATUSES.includes(status), `missing status ${status}`);
assert.ok(CONTACTABLE_STATUSES.every((s) => PROSPECT_STATUSES.includes(s)));

// --- deterministic identity ----------------------------------------------
const idA = deterministicProspectId({ country: 'Thailand', courseName: 'Riverbend G.C.' });
assert.equal(idA, deterministicProspectId({ country: 'thailand', courseName: 'riverbend gc' }), 'the id must fold case and punctuation');
assert.equal(idA, deterministicProspectId({ country: '  Thailand ', courseName: 'Riverbend  G. C.' }));
assert.notEqual(idA, deterministicProspectId({ country: 'Japan', courseName: 'Riverbend G.C.' }), 'country must participate in identity');
assert.match(idA, /^prospect-[0-9a-z]+$/);
// A course identifier takes precedence over a name, so a renamed course keeps its identity.
assert.equal(deterministicProspectId({ country: 'Thailand', courseName: 'Old Name', courseId: 'gc-1' }), deterministicProspectId({ country: 'Thailand', courseName: 'New Name', courseId: 'gc-1' }));

// --- record validation: structured business fields only -------------------
const good = validateProspectRecord({ source: 'golf_api', country: 'Thailand', region: 'Chonburi', courseName: 'Riverbend' });
assert.equal(good.ok, true);
assert.equal(good.record.status, 'new');
assert.ok(Object.isFrozen(good.record));
assert.equal(validateProspectRecord({ country: 'Thailand', courseName: 'R' }).ok, false, 'an approved source is required');
assert.equal(validateProspectRecord({ source: 'scraped_from_web', country: 'T', courseName: 'R' }).ok, false, 'an unapproved source is refused');
assert.equal(validateProspectRecord({ source: 'golf_api', courseName: 'R' }).ok, false, 'a country is required');
assert.equal(validateProspectRecord({ source: 'golf_api', country: 'T' }).ok, false, 'a course name or id is required');
// Undeclared fields are rejected rather than silently persisted.
assert.match(validateProspectRecord({ source: 'golf_api', country: 'T', courseName: 'R', __proto__: {}, notes: 'x' }).errors.join(' '), /Undeclared field: notes/);
// Business identity fields are privacy-screened.
assert.match(validateProspectRecord({ source: 'golf_api', country: 'T', courseName: 'call +66812345678' }).errors.join(' '), /failed privacy screening/);
// Partner status can never be asserted at creation.
assert.match(validateProspectRecord({ source: 'golf_api', country: 'T', courseName: 'R', status: 'active_partner' }).errors.join(' '), /partner authority/i);
// Contact detail is held out of the record body entirely.
assert.equal(validateProspectRecord({ source: 'golf_api', country: 'T', courseName: 'R', contact: { email: 'ops@x.example' } }).record.contactHeld, true);
assert.doesNotMatch(JSON.stringify(validateProspectRecord({ source: 'golf_api', country: 'T', courseName: 'R', contact: { email: 'ops@x.example' } }).record), /ops@x\.example/);

// --- lifecycle: active_partner is unreachable ----------------------------
assert.equal(applyStatusTransition('qualified', 'contact_ready').ok, true);
assert.equal(applyStatusTransition('new', 'contacted').error, 'transition_not_permitted', 'stages cannot be skipped');
assert.equal(applyStatusTransition('archived', 'new').error, 'transition_not_permitted');
for (const from of PROSPECT_STATUSES) {
  const result = applyStatusTransition(from, 'active_partner');
  assert.equal(result.ok, false, `active_partner must be unreachable from ${from}`);
  assert.match(result.error, /partner_status/);
  assert.ok(!(PROSPECT_TRANSITIONS[from] ?? []).includes('active_partner'), `${from} lists active_partner as a target`);
}
// Even a caller claiming the partner grant is redirected to the partner authority service.
assert.equal(applyStatusTransition('partner_review', 'active_partner', { partnerAuthorityGrant: true }).ok, false);
// Do-not-contact and archive are reachable from anywhere — a refusal must always be recordable.
for (const from of ['new', 'researching', 'contacted', 'interested']) {
  assert.equal(applyStatusTransition(from, 'do_not_contact').ok, true, `do_not_contact must be reachable from ${from}`);
  assert.equal(applyStatusTransition(from, 'archived').ok, true);
}
assert.equal(applyStatusTransition('unknown', 'new').error, 'unknown_current_status');
assert.equal(applyStatusTransition('new', 'unknown').error, 'unknown_target_status');

// --- duplicates are REVIEWED, never merged -------------------------------
const existing = [{ prospectId: idA, country: 'Thailand', courseName: 'Riverbend G.C.' }];
const exact = detectDuplicates({ country: 'Thailand', courseName: 'riverbend gc' }, existing);
assert.equal(exact.requiresReview, true);
assert.equal(exact.autoMerged, false, 'two prospects are never merged automatically');
assert.equal(exact.duplicates[0].confidence, 'exact');
assert.equal(exact.duplicates[0].mergeable, false);
// A same-named course in a DIFFERENT country is a conflict, never a duplicate to merge.
const crossCountry = detectDuplicates({ country: 'Japan', courseName: 'Riverbend G.C.' }, existing);
assert.equal(crossCountry.duplicates[0].confidence, 'cross_country_conflict');
assert.equal(crossCountry.duplicates[0].mergeable, false);
assert.equal(detectDuplicates({ country: 'Thailand', courseName: 'Highland Pines' }, existing).requiresReview, false);

// --- merge requires an explicit reviewer and fails closed on confusion ----
assert.equal(proposeMerge({ primary: { prospectId: '1', country: 'Thailand' }, duplicate: { prospectId: '2', country: 'Thailand' } }).error, 'reviewer_required');
assert.equal(proposeMerge({ primary: { prospectId: '1', country: 'Thailand' }, duplicate: { prospectId: '1', country: 'Thailand' }, reviewerId: 'r' }).error, 'same_record');
assert.equal(proposeMerge({ primary: { prospectId: '1', country: 'Thailand' }, duplicate: { prospectId: '2', country: 'Japan' }, reviewerId: 'r' }).error, 'cross_country_merge_refused');
assert.equal(proposeMerge({ primary: { prospectId: '1', country: 'T', courseId: 'gc-1' }, duplicate: { prospectId: '2', country: 'T', courseId: 'gc-2' }, reviewerId: 'r' }).error, 'cross_course_merge_refused');
const proposal = proposeMerge({ primary: { prospectId: '1', country: 'Thailand' }, duplicate: { prospectId: '2', country: 'Thailand' }, reviewerId: 'reviewer-1' });
assert.equal(proposal.ok, true);
assert.equal(proposal.proposal.applied, false, 'a proposal must not apply a merge');
assert.equal(proposal.proposal.decisionRequired, true);
assert.ok(Object.isFrozen(proposal.proposal));

// --- contact access control ----------------------------------------------
assert.equal(readContact({ contactHeld: true }, { grants: [], purpose: 'outreach' }).permitted, false);
assert.equal(readContact({ contactHeld: true }, { grants: ['acquisition.contact.read'] }).reason, 'purpose_required');
assert.equal(readContact({ contactHeld: true }, { grants: ['acquisition.contact.read'], purpose: 'outreach' }).permitted, true);
assert.equal(readContact({ contactHeld: false }, { grants: ['acquisition.contact.read'], purpose: 'outreach' }).reason, 'no_contact_recorded');
// A refused read returns null, never a partial or masked value that could be reassembled.
assert.equal(readContact({ contactHeld: true }, { grants: [], purpose: 'outreach' }).contact, null);

// --- receipts are immutable and carry no identity ------------------------
const receipt = registryReceipt({ event: 'status_change', prospectId: idA, fromStatus: 'new', toStatus: 'researching', actorRef: 'somchai@admin.example', at: '2026-08-15' });
assert.ok(Object.isFrozen(receipt));
assert.match(receipt.actorRef, /^actor-[0-9a-z]+$/);
assert.doesNotMatch(JSON.stringify(receipt), /somchai@admin\.example/, 'an actor is distinguished, never named');
assert.throws(() => registryReceipt({ event: 'delivered', prospectId: idA, actorRef: 'a', at: '2026-08-15' }));
assert.throws(() => { 'use strict'; receipt.toStatus = 'active_partner'; });

// --- the outbound projection stays the approved allowlist ----------------
const outbound = registryOutbound(good.record);
assert.deepEqual(Object.keys(outbound).sort(), [...OUTBOUND_FIELD_ALLOWLIST].sort());

// --- source contracts ----------------------------------------------------
const domain = read('../src/components/admin/v2/prospectRegistryDomain.mjs');
assert.doesNotMatch(codeOnly(domain), /firebase|firestore|addDoc|setDoc|updateDoc|deleteDoc|writeBatch|httpsCallable|fetch\s*\(|XMLHttpRequest|sendEmail|smtp|mailto:/i);
assert.doesNotMatch(codeOnly(domain), /\bactive_partner\b\s*\]/, 'active_partner must never appear as a transition target');
assert.match(domain, /never merged automatically|never merged/i);

console.log('Prospect registry verification PASS: six approved sources, sixteen-state lifecycle with active_partner unreachable, deterministic folded identity including country, undeclared-field and privacy rejection, duplicate review without auto-merge, cross-country and cross-course merge refusal, grant-and-purpose contact access control, immutable receipts with surrogated actors, and the outbound allowlist preserved.');
