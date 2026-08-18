import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {resolveApplicantAccess, NON_PORTAL_APPLICATION_STATUSES} from '../src/auth/roleJourney.js';

const app = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const user = {uid: 'applicant_1'};
const active = {status: 'active_partner', organizationId: 'org_1', tier: 'small_business'};
const decide = (extra = {}) => resolveApplicantAccess({user, identityVerified: true, ...extra});

test('the applicant zone exposes every explicit route and no mode-based fallback', () => {
  for (const route of [
    '/apply/small-business', '/apply/enterprise', '/apply/status',
    '/apply/:applicationId/documents', '/apply/:applicationId/agreement',
    '/apply/:applicationId/review', '/invitation/accept',
  ]) assert.ok(app.includes(`path="${route}"`), `missing route ${route}`);
  assert.match(app, /path="\/admin\/\*" element=\{<Dashboard mode="admin"/);
  assert.match(app, /path="\/portal\/\*" element=\{<Dashboard mode="partner"/);
  // a105933 removed unauthorized fallback rendering; it must not come back.
  assert.doesNotMatch(app, /access\.state === 'unauthorized'[\s\S]{0,80}PartnerApplicationJourney/);
  assert.doesNotMatch(app, /searchParams\.get\(['"]mode/);
});

test('unauthenticated and unverified applicants cannot save or submit', () => {
  assert.equal(resolveApplicantAccess({user: null}).state, 'signed_out');
  assert.equal(resolveApplicantAccess({authPending: true}).state, 'auth_pending');
  // Not asserting verification at all must fail closed, not pass.
  assert.equal(resolveApplicantAccess({user}).state, 'verification_required');
  assert.equal(resolveApplicantAccess({user, identityVerified: false}).state, 'verification_required');
  assert.equal(resolveApplicantAccess({user, identityVerified: true}).state, 'ready');
});

test('no application status short of an activated partner document grants Portal access', () => {
  for (const status of NON_PORTAL_APPLICATION_STATUSES) {
    const result = decide({applicationDoc: {id: 'pa_1', applicantUid: user.uid, status}});
    assert.equal(result.portalReady, false, `${status} must never be Portal-ready`);
  }
  // Approved but the activation transaction has not yet written b2b_partners.
  assert.equal(decide({applicationDoc: {id: 'pa_1', applicantUid: user.uid, status: 'approved'}}).portalReady, false);
  // Approved AND activated.
  assert.equal(decide({applicationDoc: {id: 'pa_1', applicantUid: user.uid, status: 'approved'}, partnerDoc: active}).portalReady, true);
});

test('a disabled or organization-less partner document is not Portal authority', () => {
  const approved = {id: 'pa_1', applicantUid: user.uid, status: 'approved'};
  assert.equal(decide({applicationDoc: approved, partnerDoc: {...active, disabled: true}}).portalReady, false);
  assert.equal(decide({applicationDoc: approved, partnerDoc: {...active, organizationId: '  '}}).portalReady, false);
  assert.equal(decide({applicationDoc: approved, partnerDoc: {...active, status: 'pending'}}).portalReady, false);
});

test('cross-applicant access fails closed', () => {
  const other = {id: 'pa_2', applicantUid: 'someone_else', status: 'draft'};
  assert.equal(decide({applicationDoc: other}).state, 'error');
  assert.equal(decide({applicationDoc: other}).reason, 'cross_applicant_denied');
  const mine = {id: 'pa_1', applicantUid: user.uid, status: 'draft'};
  assert.equal(decide({applicationDoc: mine, requestedApplicationId: 'pa_9'}).reason, 'cross_applicant_denied');
  assert.equal(decide({applicationDoc: mine, requestedApplicationId: 'pa_1'}).state, 'ready');
});

test('applicant states map truthfully to application status', () => {
  const at = status => decide({applicationDoc: {id: 'pa_1', applicantUid: user.uid, status}}).state;
  assert.equal(at('draft'), 'ready');
  assert.equal(at('submitted'), 'submitted');
  assert.equal(at('under_review'), 'submitted');
  assert.equal(at('info_needed'), 'information_needed');
  assert.equal(at('rejected'), 'rejected');
  assert.equal(at('suspended'), 'suspended');
  assert.equal(decide({applicationDoc: {id: 'pa_1', applicantUid: user.uid, status: 'approved'}, partnerDoc: active}).state, 'approved');
});

test('resolution errors never leak into an authorized state', () => {
  assert.equal(resolveApplicantAccess({user, identityVerified: true, resolveError: true}).state, 'error');
  assert.equal(resolveApplicantAccess({user, identityVerified: true, resolveError: true}).portalReady, false);
  assert.equal(resolveApplicantAccess({user, identityVerified: true, roleLoading: true}).state, 'role_resolving');
});
