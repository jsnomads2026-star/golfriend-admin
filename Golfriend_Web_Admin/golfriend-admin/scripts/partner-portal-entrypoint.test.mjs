import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolvePortalAccess } from '../src/auth/roleJourney.js';

const app = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const user = {uid: 'member_1'};
const active = {status:'active_partner',tier:'small_business',organizationId:'org_1'};
const enterprise = {...active,tier:'enterprise'};
const decide = (mode, extra={}) => resolvePortalAccess({mode,user,nowMs:Date.parse('2026-08-18T00:00:00Z'),...extra});

test('Admin route remains protected and Partner authority cannot cross it', () => {
  assert.match(app, /path="\/admin\/\*" element=\{<Dashboard mode="admin"/);
  assert.equal(decide('admin',{adminDoc:{role:'Director',status:'active'}}).state,'authorized');
  assert.equal(decide('admin',{partnerDoc:enterprise}).state,'unauthorized');
});

test('Partner routes mount the protected resolver and never derive mode from the client', () => {
  assert.match(app, /path="\/portal" element=\{<Dashboard mode="partner"/);
  assert.match(app, /path="\/portal\/:organizationId\/\*" element=\{<ScopedPartnerPortal/);
  assert.match(app, /doc\(db, 'b2b_partners', currentUser\.uid\)/);
  assert.doesNotMatch(app, /b2b_partners', currentUser\.email|charAt\(0\)\.toUpperCase/);
});

test('Small Business and Enterprise rendering is derived from server tier', () => {
  assert.deepEqual(decide('partner',{partnerDoc:active}),{state:'authorized',surface:'small',role:'small_business',organizationId:'org_1'});
  assert.deepEqual(decide('partner',{partnerDoc:enterprise}),{state:'authorized',surface:'enterprise',role:'enterprise',organizationId:'org_1'});
  assert.match(app, /access\.surface === 'enterprise'[\s\S]*EnterpriseDashboard[\s\S]*SmallBusinessDashboard/);
});

test('unauthenticated disabled expired and unknown-tier access fail closed', () => {
  assert.equal(resolvePortalAccess({mode:'partner',user:null}).state,'signed_out');
  assert.equal(decide('partner',{partnerDoc:{...active,disabled:true}}).state,'suspended');
  assert.equal(decide('partner',{partnerDoc:{...active,trialEndsAt:'2026-08-17T00:00:00Z'}}).state,'suspended');
  assert.equal(decide('partner',{partnerDoc:{...active,tier:'invented'}}).state,'unauthorized');
  assert.equal(decide('partner',{partnerDoc:{...active,status:undefined}}).state,'suspended');
});

test('organization-scoped deep links deny cross-organization access', () => {
  assert.equal(decide('partner',{partnerDoc:active,requestedOrganizationId:'org_1'}).state,'authorized');
  assert.equal(decide('partner',{partnerDoc:active,requestedOrganizationId:'org_2'}).state,'unauthorized');
  assert.equal(decide('partner',{partnerDoc:{...active,organizationId:''}}).state,'unauthorized');
});

test('refresh re-resolves server authority and logout or session expiry clears access', () => {
  assert.match(app, /onAuthStateChanged/);
  assert.match(app, /onSnapshot\(partnerRef/);
  assert.match(app, /SESSION_IDLE_MS = 30 \* 60 \* 1000/);
  assert.match(app, /setTimeout\(\(\) => \{ executeSecureLogout\(\); \}, SESSION_IDLE_MS\)/);
  assert.match(app, /await signOut\(getAuth\(\)\)/);
  assert.equal(resolvePortalAccess({mode:'partner',user:null,partnerDoc:active}).state,'signed_out');
});

test('public handoff cannot select authority and partner projection remains intact', () => {
  assert.doesNotMatch(app, /searchParams\.get\(['"]mode|location\.pathname.*mode/);
  assert.match(app, /partnerData=\{partnerData\}/);
  assert.doesNotMatch(app, /setPartnerData\(\{.*organizationId/);
});
