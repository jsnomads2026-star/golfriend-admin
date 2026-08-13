// Firebase Emulator end-to-end verification of the partner intake pipeline.
// Drives the real client path: Auth emulator sign-in, onCall callables over HTTP
// with ID tokens, Firestore REST (user tokens) for rules + authorization boundaries.
const PROJECT = 'golfriend-v1';
const AUTH = 'http://127.0.0.1:19701/identitytoolkit.googleapis.com/v1/accounts';
const FN = `http://127.0.0.1:5203/${PROJECT}/us-central1`;
const FS = `http://127.0.0.1:19711/v1/projects/${PROJECT}/databases/(default)/documents`;

let pass = 0, fail = 0;
function ok(name, cond, detail = '') { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name} ${detail}`); } }

async function signUp(email) {
  const r = await fetch(`${AUTH}:signUp?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'Passw0rd!', returnSecureToken: true }) });
  const j = await r.json();
  if (!j.idToken) throw new Error('signUp failed: ' + JSON.stringify(j));
  return { idToken: j.idToken, uid: j.localId };
}
// Seed with the emulator "owner" bearer, which bypasses security rules.
async function seed(path, fields) {
  const r = await fetch(`${FS}/${path}`, { method: 'PATCH', headers: { 'Authorization': 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }) });
  if (!r.ok) throw new Error(`seed ${path} failed: ${r.status} ${await r.text()}`);
}
async function callFn(name, data, idToken) {
  const headers = { 'Content-Type': 'application/json' };
  if (idToken) headers['Authorization'] = `Bearer ${idToken}`;
  const r = await fetch(`${FN}/${name}`, { method: 'POST', headers, body: JSON.stringify({ data }) });
  const j = await r.json().catch(() => ({}));
  return { http: r.status, result: j.result, errorStatus: j.error?.status, errorMsg: j.error?.message };
}
async function fsGet(path, idToken) {
  const r = await fetch(`${FS}/${path}`, { headers: idToken ? { 'Authorization': `Bearer ${idToken}` } : {} });
  return { http: r.status, body: await r.json().catch(() => ({})) };
}
async function fsClientWrite(path, idToken) {
  const r = await fetch(`${FS}/${path}`, { method: 'PATCH', headers: { 'Authorization': `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { hacked: { booleanValue: true } } }) });
  return r.status;
}

const validPayload = (locale = 'th') => ({
  checklist: { business_registration: true, ownership_or_authorization: true, responsible_person_id: true },
  consentAccepted: true, attestationAccepted: true, locale,
});

(async () => {
  console.log('== Firebase Emulator e2e: partner intake (Thai journey) ==');
  const staff = await signUp(`staff_${Date.now()}@example.com`);
  const applicant = await signUp(`applicant_${Date.now()}@example.com`);
  const other = await signUp(`other_${Date.now()}@example.com`);
  await seed(`admin_users/${staff.uid}`, { role: { stringValue: 'Director' }, status: { stringValue: 'Active' } });
  console.log(`  seeded staff=${staff.uid.slice(0,6)} applicant=${applicant.uid.slice(0,6)} other=${other.uid.slice(0,6)}`);

  // --- Authorization: unauthenticated submit denied ---
  const unauth = await callFn('submitPartnerApplication', validPayload(), null);
  ok('submit unauthenticated → UNAUTHENTICATED', unauth.errorStatus === 'UNAUTHENTICATED', `(got ${unauth.http}/${unauth.errorStatus})`);

  // --- Failure: invalid submission (no consent) rejected ---
  const bad = await callFn('submitPartnerApplication', { ...validPayload(), consentAccepted: false }, applicant.idToken);
  ok('submit without consent → INVALID_ARGUMENT', bad.errorStatus === 'INVALID_ARGUMENT', `(got ${bad.http}/${bad.errorStatus})`);

  // --- Happy path: applicant submits (locale th) ---
  const sub = await callFn('submitPartnerApplication', validPayload('th'), applicant.idToken);
  ok('applicant submit → success, status submitted', sub.result?.success === true && sub.result?.status === 'submitted', `(${JSON.stringify(sub.result || sub.errorStatus)})`);

  // --- Rules: applicant reads OWN submission (status tracking) ---
  const ownRead = await fsGet(`partner_submissions/${applicant.uid}`, applicant.idToken);
  ok('rules: applicant reads own submission → allowed', ownRead.http === 200, `(http ${ownRead.http})`);
  ok('locale handoff: submission stored locale=th', ownRead.body?.fields?.locale?.stringValue === 'th', `(${ownRead.body?.fields?.locale?.stringValue})`);

  // --- Rules: applicant CANNOT read another applicant's submission ---
  await callFn('submitPartnerApplication', validPayload('en'), other.idToken); // create other's doc
  const crossRead = await fsGet(`partner_submissions/${other.uid}`, applicant.idToken);
  ok('rules: applicant cannot read another submission → denied', crossRead.http === 403, `(http ${crossRead.http})`);

  // --- Rules: client LIST of the collection is denied ---
  const listRead = await fsGet('partner_submissions', applicant.idToken);
  ok('rules: client list of partner_submissions → denied', listRead.http === 403, `(http ${listRead.http})`);

  // --- Rules: applicant CANNOT write partner_submissions directly ---
  const directWrite = await fsClientWrite(`partner_submissions/${applicant.uid}`, applicant.idToken);
  ok('rules: applicant direct write → denied', directWrite === 403, `(http ${directWrite})`);

  // --- Failure/recovery: cannot resubmit while submitted ---
  const resub = await callFn('submitPartnerApplication', validPayload('th'), applicant.idToken);
  ok('resubmit while submitted → FAILED_PRECONDITION', resub.errorStatus === 'FAILED_PRECONDITION', `(got ${resub.errorStatus})`);

  // --- Authorization: non-staff cannot list or review ---
  const badList = await callFn('listPartnerSubmissions', {}, applicant.idToken);
  ok('non-staff list → PERMISSION_DENIED', badList.errorStatus === 'PERMISSION_DENIED', `(got ${badList.errorStatus})`);
  const badReview = await callFn('reviewPartnerSubmission', { submissionId: applicant.uid, decision: 'approve' }, applicant.idToken);
  ok('non-staff review → PERMISSION_DENIED', badReview.errorStatus === 'PERMISSION_DENIED', `(got ${badReview.errorStatus})`);

  // --- Staff: list includes submissions ---
  const list = await callFn('listPartnerSubmissions', {}, staff.idToken);
  const ids = (list.result?.items || []).map((i) => i.id);
  ok('staff list → includes applicant submission', ids.includes(applicant.uid), `(ids ${ids.length})`);

  // --- Staff review lifecycle: begin_review → under_review ---
  const rev1 = await callFn('reviewPartnerSubmission', { submissionId: applicant.uid, decision: 'begin_review' }, staff.idToken);
  ok('staff begin_review → under_review', rev1.result?.status === 'under_review', `(${rev1.result?.status})`);

  // --- request_info → info_needed, then applicant recovery resubmit ---
  const rev2 = await callFn('reviewPartnerSubmission', { submissionId: applicant.uid, decision: 'request_info', reviewNote: 'need reg #' }, staff.idToken);
  ok('staff request_info → info_needed', rev2.result?.status === 'info_needed', `(${rev2.result?.status})`);
  const recovery = await callFn('submitPartnerApplication', validPayload('th'), applicant.idToken);
  ok('recovery: applicant resubmits from info_needed → submitted', recovery.result?.status === 'submitted', `(${recovery.result?.status})`);

  // --- Approve → approved + provisioning handoff; NEVER grants partner status ---
  const rev3 = await callFn('reviewPartnerSubmission', { submissionId: applicant.uid, decision: 'approve' }, staff.idToken);
  ok('staff approve → approved + readyForProvisioning handoff', rev3.result?.status === 'approved' && rev3.result?.readyForProvisioning === true, `(${JSON.stringify(rev3.result)})`);
  const partnerDoc = await fsGet(`b2b_partners/${applicant.uid}`, null); // owner bearer not used → but check via owner
  const partnerDocOwner = await (await fetch(`${FS}/b2b_partners/${applicant.uid}`, { headers: { 'Authorization': 'Bearer owner' } })).status;
  ok('authorization boundary: approval did NOT create b2b_partners (staff-provisioned only)', partnerDocOwner === 404, `(b2b_partners http ${partnerDocOwner})`);

  // --- Cannot re-review a terminal (approved) submission ---
  const rev4 = await callFn('reviewPartnerSubmission', { submissionId: applicant.uid, decision: 'approve' }, staff.idToken);
  ok('re-review approved → FAILED_PRECONDITION', rev4.errorStatus === 'FAILED_PRECONDITION', `(got ${rev4.errorStatus})`);

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
