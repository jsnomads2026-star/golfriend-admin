// Applicant -> Admin -> activation -> Partner Portal acceptance against ONE shared
// Firebase emulator data plane (Auth + Firestore + Functions + Storage).
//
// Drives the real client path: Auth emulator sign-in, onCall callables over HTTP with real
// ID tokens, Firestore REST with user tokens for rules boundaries. Nothing here is a source
// grep: every assertion drives the deployed function or the real ruleset.
//
// NO OUT-OF-BAND STATE SEEDING. Every state the journey needs is reached through a product
// callable. The emulator "owner" bearer is used only for things that are genuinely outside the
// journey - creating the Admin role documents and the course record an operator would already
// have, disabling an account, and deliberately TAMPERING with a stored receipt to prove the
// tamper detection. Each of those is announced where it happens.
import {createHash, randomUUID} from 'node:crypto';

if (process.env.GOLFRIEND_LOCAL_AUTH_FIXTURES !== 'enabled') throw new Error('Set GOLFRIEND_LOCAL_AUTH_FIXTURES=enabled to run this emulator-only acceptance.');
const PASSWORD = process.env.GOLFRIEND_LOCAL_E2E_PASSWORD;
if (typeof PASSWORD !== 'string' || PASSWORD.length < 16) throw new Error('GOLFRIEND_LOCAL_E2E_PASSWORD must contain at least 16 transient characters.');

// The browser acceptance reuses this harness against the app's hard-coded precommission
// demo project, so the project id is selectable. Both are demo-* and offline-only.
const PROJECT = process.env.GOLFRIEND_ACCEPTANCE_PROJECT || 'demo-partner-acquisition';
const AUTH = 'http://127.0.0.1:19801/identitytoolkit.googleapis.com/v1/accounts';
const FN = `http://127.0.0.1:19821/${PROJECT}/us-central1`;
const FS = `http://127.0.0.1:19811/v1/projects/${PROJECT}/databases/(default)/documents`;

const AGREEMENT_VERSION = 'golfriend.course-partner.v1';
const AGREEMENT_DIGEST = 'e16d5070c66bbf4b89beade4407b415def779076c71dbb48237db7b1157adc11';
const LOCALES = ['en', 'th', 'ko', 'ja', 'zh', 'es', 'fr', 'de'];
const sha = (v) => createHash('sha256').update(v).digest('hex');
const appIdFor = (uid) => `pa_${sha(uid).slice(0, 24)}`;
const evidenceIdFor = (appId, checksum) => `pae_${sha(`${appId}|${checksum}`).slice(0, 32)}`;
const contractApprovalIdFor = (appId, scope) => `pca_${sha(`${appId}|${scope}`).slice(0, 32)}`;
const cmd = () => randomUUID().replaceAll('-', '_');

let pass = 0, fail = 0; const failures = [];
const ok = (name, cond, detail = '') => { if (cond) { pass++; console.log(`  PASS  ${name}`); } else { fail++; failures.push(name); console.log(`  FAIL  ${name} ${detail}`); } };
const section = (t) => console.log(`\n== ${t} ==`);
const note = (t) => console.log(`  ..    ${t}`);

async function signUp(email) {
  const r = await fetch(`${AUTH}:signUp?key=fake`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({email, password: PASSWORD, returnSecureToken: true})});
  const j = await r.json(); if (!j.idToken) throw new Error('signUp failed ' + JSON.stringify(j));
  return {uid: j.localId, email, idToken: j.idToken};
}
// Mark the synthetic account's contact as verified, then re-issue the token so the
// email_verified CLAIM is actually present (the callables read the claim, not the record).
async function verifyEmail(user) {
  const u = await fetch(`${AUTH}:update`, {method: 'POST', headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer owner'}, body: JSON.stringify({localId: user.uid, emailVerified: true})});
  if (!u.ok) throw new Error('emailVerified update failed ' + await u.text());
  const r = await fetch(`${AUTH}:signInWithPassword?key=fake`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({email: user.email, password: PASSWORD, returnSecureToken: true})});
  const j = await r.json(); if (!j.idToken) throw new Error('re-signin failed ' + JSON.stringify(j));
  user.idToken = j.idToken; return user;
}
async function disableUser(user) {
  const r = await fetch(`${AUTH}:update`, {method: 'POST', headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer owner'}, body: JSON.stringify({localId: user.uid, disableUser: true})});
  if (!r.ok) throw new Error('disable failed ' + await r.text());
}
async function enableUser(user) {
  const r = await fetch(`${AUTH}:update`, {method: 'POST', headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer owner'}, body: JSON.stringify({localId: user.uid, disableUser: false})});
  if (!r.ok) throw new Error('enable failed ' + await r.text());
}
async function seed(path, fields, mask = null) {
  const q = mask ? `?${mask.map((f) => `updateMask.fieldPaths=${f}`).join('&')}` : '';
  const r = await fetch(`${FS}/${path}${q}`, {method: 'PATCH', headers: {'Authorization': 'Bearer owner', 'Content-Type': 'application/json'}, body: JSON.stringify({fields})});
  if (!r.ok) throw new Error(`seed ${path} -> ${r.status} ${await r.text()}`);
}
async function rawGet(path) {
  const r = await fetch(`${FS}/${path}`, {headers: {'Authorization': 'Bearer owner'}});
  return {http: r.status, body: await r.json().catch(() => ({}))};
}
// Every partner callable declares enforceAppCheck:true, and the Functions emulator DOES
// enforce it: a request without an X-Firebase-AppCheck header is rejected before the handler
// runs. Under FIREBASE_DEBUG_FEATURES={"skipTokenVerification":true} the emulator decodes the
// attestation instead of verifying its signature - the framework's accepted emulator
// mechanism. Presence enforcement stays real; signature verification is NOT exercised here.
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const APPCHECK = [
  b64({alg: 'RS256', typ: 'JWT'}),
  b64({sub: 'demo-partner-acquisition-app', aud: [`projects/${PROJECT}`], iss: 'https://firebaseappcheck.googleapis.com/', exp: Math.floor(Date.now() / 1000) + 3600}),
  Buffer.from('emulator-attestation-not-a-signature').toString('base64url'),
].join('.');

async function callFn(name, data, idToken, {appCheck = true} = {}) {
  const headers = {'Content-Type': 'application/json'};
  if (idToken) headers['Authorization'] = `Bearer ${idToken}`;
  if (appCheck) headers['X-Firebase-AppCheck'] = APPCHECK;
  const r = await fetch(`${FN}/${name}`, {method: 'POST', headers, body: JSON.stringify({data})});
  const j = await r.json().catch(() => ({}));
  return {http: r.status, result: j.result, errorStatus: j.error?.status, errorMsg: j.error?.message};
}
async function fsGet(path, idToken) {
  const r = await fetch(`${FS}/${path}`, {headers: idToken ? {'Authorization': `Bearer ${idToken}`} : {}});
  return {http: r.status, body: await r.json().catch(() => ({}))};
}
async function fsClientWrite(path, idToken, fields = {tampered: {booleanValue: true}}) {
  const r = await fetch(`${FS}/${path}`, {method: 'PATCH', headers: {'Authorization': `Bearer ${idToken}`, 'Content-Type': 'application/json'}, body: JSON.stringify({fields})});
  return r.status;
}
const S = (v) => ({stringValue: String(v)});

const draftFor = (email, org, type, country, representationBasis = 'company') => ({
  organization: org, organizationType: type, country, region: 'Central',
  contactName: 'Somchai Prasert', contactEmail: email, contactPhone: '+66801234567', locale: 'th',
  representationBasis,
  courseName: `${org} Course`, courseAddress: '99 Fairway Road', courseWebsite: 'https://example.com',
  consent: true, terms: true,
  organizationIdentity: {legalName: `${org} Co., Ltd.`, registrationId: '0105558001234', jurisdiction: country},
  courseProfile: {name: `${org} Course`, address: '99 Fairway Road', website: 'https://example.com', holes: 18, timeZone: 'Asia/Bangkok', catalogueLocales: LOCALES},
});

/** Upload one document through the real callable and return its server-derived id. */
async function uploadDocument(user, appId, kind, text) {
  const bytes = Buffer.from(text);
  const checksum = sha(bytes);
  const result = await callFn('uploadPartnerApplicationEvidenceV2', {
    commandId: cmd(), kind, fileName: `${kind}.pdf`, contentType: 'application/pdf',
    sizeBytes: bytes.length, checksum, base64: bytes.toString('base64'),
  }, user.idToken);
  return {result, evidenceId: evidenceIdFor(appId, checksum), checksum};
}

async function countOrgsFor(appId) {
  const r = await fetch(`${FS}/partner_organizations?pageSize=300`, {headers: {'Authorization': 'Bearer owner'}});
  const j = await r.json().catch(() => ({}));
  return (j.documents || []).filter((d) => d.fields?.sourceApplicationId?.stringValue === appId).length;
}

const collectionsWritten = new Set();
async function recordCollections(paths) {
  for (const p of paths) {
    if (!p || p.includes('undefined')) continue;
    const r = await rawGet(p); if (r.http === 200) collectionsWritten.add(p.split('/')[0]);
  }
}

(async () => {
  console.log(`== Partner acquisition acceptance :: project ${PROJECT} ==`);

  // ---------------------------------------------------------------- topology
  section('A - Topology and attestation');
  const probe = await callFn('getMyPartnerApplicationV2', {}, null);
  ok('unauthenticated callable is denied', probe.errorStatus === 'UNAUTHENTICATED', `(got ${probe.http}/${probe.errorStatus})`);

  const applicant = await verifyEmail(await signUp(`sb.applicant.${Date.now()}@example.com`));
  const applicantB = await verifyEmail(await signUp(`sb.other.${Date.now()}@example.com`));
  const director = await signUp(`director.${Date.now()}@example.com`);
  const support = await signUp(`support.${Date.now()}@example.com`);
  const outsider = await verifyEmail(await signUp(`outsider.${Date.now()}@example.com`));
  note('Staff role documents and the course record are operator state that exists before any application; they are not journey steps.');
  await seed(`admin_users/${director.uid}`, {role: S('Director'), status: S('active')});
  await seed(`admin_users/${support.uid}`, {role: S('Support'), status: S('active')});

  const noAttestation = await callFn('getMyPartnerApplicationV2', {}, director.idToken, {appCheck: false});
  ok('A App Check enforced: authenticated call without attestation is denied', noAttestation.errorStatus === 'UNAUTHENTICATED', `(got ${noAttestation.errorStatus})`);
  const withAttestation = await callFn('getMyPartnerApplicationV2', {}, director.idToken);
  ok('A the same call with attestation is accepted', withAttestation.result?.schema === 'golfriend.partner-application-view.v2', `(${JSON.stringify(withAttestation.errorMsg || withAttestation.result?.schema)})`);
  note('App Check signature verification is NOT exercised: skipTokenVerification decodes the attestation. Presence enforcement is proven; cryptographic attestation is not.');

  const terms = await callFn('getPartnerAgreementV2', {}, applicant.idToken);
  ok('A the applicant can read the exact agreement version and digest', terms.result?.version === AGREEMENT_VERSION && terms.result?.digest === AGREEMENT_DIGEST, `(${JSON.stringify(terms.result)})`);
  ok('A the agreement truthfully reports legal review as incomplete', terms.result?.legalReviewComplete === false, `(${terms.result?.legalReviewComplete})`);
  console.log(`  identities: applicant=${applicant.uid} applicantB=${applicantB.uid} director=${director.uid} support=${support.uid} outsider=${outsider.uid}`);

  const appId = appIdFor(applicant.uid);

  // ---------------------------------------------------------------- small business
  section('B - Small Business journey (cafe operator, company representation)');
  const save1 = await callFn('savePartnerApplicationDraftV2', {...draftFor(applicant.email, 'Bangkok Greens', 'cafe', 'TH'), commandId: cmd()}, applicant.idToken);
  ok('B3 draft created', save1.result?.success === true && save1.result?.status === 'draft', `(${JSON.stringify(save1.errorMsg || save1.result)})`);
  ok('B3 application id is derived from uid, not chosen by the client', save1.result?.applicationId === appId, `(${save1.result?.applicationId} vs ${appId})`);

  const resumed = await callFn('getMyPartnerApplicationV2', {}, applicant.idToken);
  ok('B3 draft resumes with the real saved organization', resumed.result?.application?.organization === 'Bangkok Greens', `(${resumed.result?.application?.organization})`);
  ok('B4 organization identity persisted', resumed.result?.application?.organizationIdentity?.registrationId === '0105558001234', `(${JSON.stringify(resumed.result?.application?.organizationIdentity)})`);
  ok('B4 exact eight-locale catalogue persisted', LOCALES.every((l) => resumed.result?.application?.courseProfile?.catalogueLocales?.includes(l)), `(${JSON.stringify(resumed.result?.application?.courseProfile?.catalogueLocales)})`);
  ok('B4 the server publishes the checklist it will itself enforce', Array.isArray(resumed.result?.checklist?.required) && resumed.result.checklist.required.length === 2 && resumed.result.checklist.satisfied === false, `(${JSON.stringify(resumed.result?.checklist)})`);

  const registration = await uploadDocument(applicant, appId, 'company_registration', 'SYNTHETIC COMPANY REGISTRATION - emulator only');
  ok('B5 authoritative upload receipt issued', registration.result.result?.success === true && registration.result.result?.evidenceId === registration.evidenceId, `(${JSON.stringify(registration.result.errorMsg || registration.result.result)})`);
  ok('B5 upload receipt is an immutable audit record', typeof registration.result.result?.receipt?.id === 'string' && registration.result.result.receipt.id.startsWith('paa_'), `(${JSON.stringify(registration.result.result?.receipt)})`);
  const authorization = await uploadDocument(applicant, appId, 'director_authorization', 'SYNTHETIC DIRECTOR AUTHORIZATION - emulator only');
  ok('B5 a second document of a different kind is accepted', authorization.result.result?.success === true, `(${JSON.stringify(authorization.result.errorMsg)})`);

  const untypedBytes = Buffer.from('UNTYPED');
  const untyped = await callFn('uploadPartnerApplicationEvidenceV2', {commandId: cmd(), fileName: 'x.pdf', contentType: 'application/pdf', sizeBytes: untypedBytes.length, checksum: sha(untypedBytes), base64: untypedBytes.toString('base64')}, applicant.idToken);
  ok('B5 an untyped document is refused (kind drives proportionality)', untyped.errorStatus === 'INVALID_ARGUMENT', `(got ${untyped.errorStatus})`);

  const tamperedBytes = Buffer.from('SYNTHETIC');
  const tampered = await callFn('uploadPartnerApplicationEvidenceV2', {commandId: cmd(), kind: 'company_registration', fileName: 'bad.pdf', contentType: 'application/pdf', sizeBytes: tamperedBytes.length, checksum: sha('different'), base64: tamperedBytes.toString('base64')}, applicant.idToken);
  ok('B5 tampered document checksum denied', tampered.errorStatus === 'INVALID_ARGUMENT', `(got ${tampered.errorStatus})`);

  const selfVerify = await fsClientWrite(`partner_applications_v2/${appId}/evidence/${registration.evidenceId}`, applicant.idToken, {verificationStatus: S('verified')});
  ok('B6 an applicant cannot verify its own document', selfVerify === 403, `(http ${selfVerify})`);

  const representative = {name: 'Somchai Prasert', title: 'Managing Director', email: applicant.email, authorityEvidenceId: registration.evidenceId, authorityConfirmed: true};
  const agreement = {version: AGREEMENT_VERSION, digest: AGREEMENT_DIGEST, explicitlyAccepted: true, signerIsAuthorizedRepresentative: true};
  const acceptBefore = await callFn('acceptVerifiedCourseOnboardingAgreementV2', {commandId: cmd(), representative, agreement}, applicant.idToken);
  ok('B6 agreement blocked while evidence is unverified (fails closed)', acceptBefore.errorStatus === 'FAILED_PRECONDITION', `(got ${acceptBefore.errorStatus})`);

  const supportVerify = await callFn('reviewPartnerApplicationEvidenceV2', {commandId: cmd(), applicationId: appId, evidenceId: registration.evidenceId, decision: 'verified'}, support.idToken);
  ok('B6 Support cannot verify a document (Director/Manager only)', supportVerify.errorStatus === 'PERMISSION_DENIED', `(got ${supportVerify.errorStatus})`);
  const noReason = await callFn('reviewPartnerApplicationEvidenceV2', {commandId: cmd(), applicationId: appId, evidenceId: registration.evidenceId, decision: 'rejected'}, director.idToken);
  ok('B6 a rejection without a reason is refused', noReason.errorStatus === 'INVALID_ARGUMENT', `(got ${noReason.errorStatus})`);

  const verifyRegistration = await callFn('reviewPartnerApplicationEvidenceV2', {commandId: cmd(), applicationId: appId, evidenceId: registration.evidenceId, decision: 'verified', expectedRevision: 0}, director.idToken);
  ok('B6 Admin verifies the registration document through the product surface', verifyRegistration.result?.success === true && verifyRegistration.result?.revision === 1, `(${JSON.stringify(verifyRegistration.errorMsg || verifyRegistration.result)})`);
  const staleRevision = await callFn('reviewPartnerApplicationEvidenceV2', {commandId: cmd(), applicationId: appId, evidenceId: registration.evidenceId, decision: 'verified', expectedRevision: 0}, director.idToken);
  ok('B6 a stale reviewer revision is refused', staleRevision.errorStatus === 'FAILED_PRECONDITION', `(got ${staleRevision.errorStatus})`);

  const storedDocument = await rawGet(`partner_applications_v2/${appId}/evidence/${registration.evidenceId}`);
  ok('B6 the server owns status, reviewer, reason, timestamp and revision', storedDocument.body?.fields?.verificationStatus?.stringValue === 'verified'
    && storedDocument.body?.fields?.verifiedByRole?.stringValue === 'Director'
    && storedDocument.body?.fields?.reviewedByUid?.stringValue === director.uid
    && Boolean(storedDocument.body?.fields?.reviewedAt?.timestampValue)
    && storedDocument.body?.fields?.revision?.integerValue === '1', `(${JSON.stringify(storedDocument.body?.fields && Object.keys(storedDocument.body.fields))})`);
  ok('B6 the decision carries an immutable audit receipt', typeof verifyRegistration.result?.receipt?.id === 'string' && verifyRegistration.result.receipt.id.startsWith('paa_'), `(${JSON.stringify(verifyRegistration.result?.receipt)})`);

  const accept = await callFn('acceptVerifiedCourseOnboardingAgreementV2', {commandId: cmd(), representative, agreement}, applicant.idToken);
  ok('B7 exact agreement version/digest accepted', accept.result?.success === true && typeof accept.result?.agreementReceiptId === 'string', `(${JSON.stringify(accept.errorMsg || accept.result)})`);

  const wrongDigest = await callFn('acceptVerifiedCourseOnboardingAgreementV2', {commandId: cmd(), representative, agreement: {...agreement, digest: sha('wrong')}}, applicant.idToken);
  ok('B7 agreement digest mismatch denied', wrongDigest.errorStatus === 'INVALID_ARGUMENT' || wrongDigest.errorStatus === 'FAILED_PRECONDITION', `(got ${wrongDigest.errorStatus})`);
  const wrongVersion = await callFn('acceptVerifiedCourseOnboardingAgreementV2', {commandId: cmd(), representative, agreement: {...agreement, version: 'golfriend.course-partner.v2'}}, applicant.idToken);
  ok('B7 agreement version mismatch denied', wrongVersion.errorStatus === 'INVALID_ARGUMENT' || wrongVersion.errorStatus === 'FAILED_PRECONDITION', `(got ${wrongVersion.errorStatus})`);

  const submitTooSoon = await callFn('submitPartnerApplicationV2', {commandId: cmd()}, applicant.idToken);
  ok('B8 submission is refused while the authority instrument is unverified (proportionate proof)', submitTooSoon.errorStatus === 'FAILED_PRECONDITION', `(got ${submitTooSoon.errorStatus})`);

  await callFn('reviewPartnerApplicationEvidenceV2', {commandId: cmd(), applicationId: appId, evidenceId: authorization.evidenceId, decision: 'verified'}, director.idToken);
  const afterVerification = await callFn('getMyPartnerApplicationV2', {}, applicant.idToken);
  ok('B8 the checklist reports satisfied once both groups are verified', afterVerification.result?.checklist?.satisfied === true, `(${JSON.stringify(afterVerification.result?.checklist)})`);

  const submit = await callFn('submitPartnerApplicationV2', {commandId: cmd()}, applicant.idToken);
  ok('B8 application submitted', submit.result?.success === true, `(${JSON.stringify(submit.errorMsg || submit.result)})`);

  const toReview = await callFn('reviewPartnerApplicationV2', {applicationId: appId, status: 'under_review', note: 'Reviewing', commandId: cmd()}, director.idToken);
  ok('B9 admin moves application to under_review', toReview.result?.success === true, `(${JSON.stringify(toReview.errorMsg)})`);

  // ---- information needed, alternative evidence, resubmission -------------------------
  const askAlternative = await callFn('reviewPartnerApplicationEvidenceV2', {commandId: cmd(), applicationId: appId, evidenceId: authorization.evidenceId, decision: 'alternative_requested', reason: 'Supply a board resolution instead of the director letter.'}, support.idToken);
  ok('B10 Support can ask the applicant for an alternative document', askAlternative.result?.success === true, `(${JSON.stringify(askAlternative.errorMsg || askAlternative.result)})`);
  ok('B10 asking for an alternative reopens the application for the applicant', askAlternative.result?.reopened === true, `(${JSON.stringify(askAlternative.result)})`);
  const reopened = await callFn('getMyPartnerApplicationV2', {}, applicant.idToken);
  ok('B10 the applicant sees information-needed and the reason', reopened.result?.application?.status === 'info_needed' && typeof reopened.result?.application?.alternativeEvidenceRequest?.reason === 'string', `(${reopened.result?.application?.status})`);
  ok('B10 the checklist drops back to unsatisfied while the alternative is outstanding', reopened.result?.checklist?.satisfied === false, `(${JSON.stringify(reopened.result?.checklist)})`);

  const board = await uploadDocument(applicant, appId, 'board_resolution', 'SYNTHETIC BOARD RESOLUTION - emulator only');
  ok('B10 alternative evidence upload receipt issued', board.result.result?.evidenceId === board.evidenceId, `(${JSON.stringify(board.result.errorMsg || board.result.result)})`);
  const verifyBoard = await callFn('reviewPartnerApplicationEvidenceV2', {commandId: cmd(), applicationId: appId, evidenceId: board.evidenceId, decision: 'verified'}, director.idToken);
  ok('B10 Admin verifies the alternative document', verifyBoard.result?.success === true, `(${JSON.stringify(verifyBoard.errorMsg)})`);
  const resubmit = await callFn('submitPartnerApplicationV2', {commandId: cmd()}, applicant.idToken);
  ok('B10 applicant resubmits after the information request', resubmit.result?.success === true, `(${JSON.stringify(resubmit.errorMsg || resubmit.result)})`);

  // ---- contract approval ---------------------------------------------------------------
  await callFn('reviewPartnerApplicationV2', {applicationId: appId, status: 'under_review', note: 'Re-reviewing', commandId: cmd()}, director.idToken);
  const approveNoContract = await callFn('reviewPartnerApplicationV2', {applicationId: appId, status: 'approved', note: 'Approved', commandId: cmd()}, director.idToken);
  ok('B11 approval without a contract approval record is denied', approveNoContract.errorStatus === 'FAILED_PRECONDITION', `(got ${approveNoContract.errorStatus})`);

  const supportContract = await callFn('approvePartnerContractV2', {commandId: cmd(), applicationId: appId, scope: 'small_business_service', effectiveFrom: '2026-08-18T00:00:00.000Z', commissionBps: 300}, support.idToken);
  ok('B11 Support cannot record a contract approval', supportContract.errorStatus === 'PERMISSION_DENIED', `(got ${supportContract.errorStatus})`);
  const falseLegal = await callFn('approvePartnerContractV2', {commandId: cmd(), applicationId: appId, scope: 'small_business_service', effectiveFrom: '2026-08-18T00:00:00.000Z', commissionBps: 300, legalReviewComplete: true}, director.idToken);
  ok('B11 legal review cannot be declared complete without a reference', falseLegal.errorStatus === 'FAILED_PRECONDITION', `(got ${falseLegal.errorStatus})`);
  const wrongCommission = await callFn('approvePartnerContractV2', {commandId: cmd(), applicationId: appId, scope: 'small_business_service', effectiveFrom: '2026-08-18T00:00:00.000Z', commissionBps: 500}, director.idToken);
  ok('B11 a commission other than the Founder rate is refused', wrongCommission.errorStatus === 'INVALID_ARGUMENT', `(got ${wrongCommission.errorStatus})`);

  const contract = await callFn('approvePartnerContractV2', {commandId: cmd(), applicationId: appId, scope: 'small_business_service', effectiveFrom: '2026-08-18T00:00:00.000Z', commissionBps: 300}, director.idToken);
  const approvalId = contractApprovalIdFor(appId, 'small_business_service');
  ok('B11 Director records the contract approval through the product surface', contract.result?.success === true && contract.result?.approvalId === approvalId, `(${JSON.stringify(contract.errorMsg || contract.result)})`);
  ok('B11 the approval truthfully reports legal review as pending', contract.result?.legalReviewComplete === false, `(${contract.result?.legalReviewComplete})`);
  const contractReplay = await callFn('approvePartnerContractV2', {commandId: cmd(), applicationId: appId, scope: 'small_business_service', effectiveFrom: '2026-08-18T00:00:00.000Z', commissionBps: 300}, director.idToken);
  ok('B11 a repeated approval returns the SAME record instead of minting a second', contractReplay.result?.restarted === true && contractReplay.result?.approvalId === approvalId, `(${JSON.stringify(contractReplay.result)})`);
  const storedApproval = await rawGet(`partner_contract_approvals/${approvalId}`);
  ok('B11 the stored approval records approver, scope, agreement version and digest', storedApproval.body?.fields?.approverUid?.stringValue === director.uid
    && storedApproval.body?.fields?.approverRole?.stringValue === 'Director'
    && storedApproval.body?.fields?.scope?.stringValue === 'small_business_service'
    && storedApproval.body?.fields?.agreementVersion?.stringValue === AGREEMENT_VERSION
    && storedApproval.body?.fields?.agreementDigest?.stringValue === AGREEMENT_DIGEST
    && storedApproval.body?.fields?.legalReviewComplete?.booleanValue === false, `(${JSON.stringify(storedApproval.body?.fields && Object.keys(storedApproval.body.fields))})`);

  const supportApprove = await callFn('reviewPartnerApplicationV2', {applicationId: appId, status: 'approved', note: 'Approved', contractApprovalId: approvalId, commandId: cmd()}, support.idToken);
  ok('B11 Support role cannot approve (Director/Manager only)', supportApprove.errorStatus === 'FAILED_PRECONDITION' || supportApprove.errorStatus === 'PERMISSION_DENIED', `(got ${supportApprove.errorStatus})`);

  const approve = await callFn('reviewPartnerApplicationV2', {applicationId: appId, status: 'approved', note: 'Approved', contractApprovalId: approvalId, commandId: cmd()}, director.idToken);
  ok('B11 admin approves the application', approve.result?.success === true && approve.result?.courseCandidateCreated === true, `(${JSON.stringify(approve.errorMsg || approve.result)})`);

  const preActivationPortal = await callFn('getPartnerTrialReceiptV1', {}, applicant.idToken);
  ok('B13 approved-but-not-activated cannot enter the Portal', preActivationPortal.errorStatus === 'PERMISSION_DENIED', `(got ${preActivationPortal.errorStatus})`);
  const preB2b = await rawGet(`b2b_partners/${applicant.uid}`);
  ok('B13 no Portal role document exists before activation', preB2b.http === 404, `(http ${preB2b.http})`);

  const courseId = `course_${Date.now()}`;
  await seed(`courses/${courseId}`, {name: S('Bangkok Greens Course'), country: S('TH')});
  const activate = await callFn('activatePartner', {applicationId: appId, courseId, commandId: cmd()}, director.idToken);
  ok('B12 activation succeeds', activate.result?.success === true, `(${JSON.stringify(activate.errorMsg || activate.result)})`);
  ok('B12 a cafe operator resolves to Small Business', activate.result?.tier === 'small_business', `(${activate.result?.tier})`);
  const orgId = activate.result?.organizationId;
  const statementId = activate.result?.statementId;
  console.log(`  organizationId=${orgId} statementId=${statementId} statementNumber=${activate.result?.statementNumber} tier=${activate.result?.tier}`);

  const orgDoc = await rawGet(`partner_organizations/${orgId}`);
  ok('B12 exactly one organization created', orgDoc.http === 200, `(http ${orgDoc.http})`);
  const ownerRole = await rawGet(`partner_memberships/${orgId}_${applicant.uid}`);
  ok('B12 owner role created', ownerRole.body?.fields?.role?.stringValue === 'primary_owner', `(${JSON.stringify(ownerRole.body?.fields?.role)})`);
  ok('B12 the membership carries the Portal authority fields (one identity, not two systems)',
    ownerRole.body?.fields?.status?.stringValue === 'active' && ownerRole.body?.fields?.businessId?.stringValue === orgId && Boolean(ownerRole.body?.fields?.effectiveAt?.stringValue),
    `(${JSON.stringify(ownerRole.body?.fields && Object.keys(ownerRole.body.fields))})`);
  const trialDoc = await rawGet(`partner_trials/${orgId}`);
  ok('B12 exactly one immutable trial created', trialDoc.http === 200 && trialDoc.body?.fields?.immutable?.booleanValue === true, `(http ${trialDoc.http})`);
  ok('B12 trial is 90 days', Number(trialDoc.body?.fields?.days?.integerValue) === 90, `(${trialDoc.body?.fields?.days?.integerValue})`);

  const dup = await callFn('activatePartner', {applicationId: appId, courseId, commandId: cmd()}, director.idToken);
  ok('D duplicate activation does not mint a second organization', (await countOrgsFor(appId)) === 1, `(orgs=${await countOrgsFor(appId)}, retry said: ${JSON.stringify(dup.errorMsg || dup.result)})`);
  ok('D a retried activation returns the SAME organization and is marked restarted', dup.result?.restarted === true && dup.result?.organizationId === orgId, `(${JSON.stringify(dup.errorMsg || dup.result)})`);
  const concurrent = await Promise.all([0, 1, 2].map(() => callFn('activatePartner', {applicationId: appId, courseId, commandId: cmd()}, director.idToken)));
  ok('D concurrent activations still leave exactly one organization', Boolean(orgId) && (await countOrgsFor(appId)) === 1, `(orgs=${await countOrgsFor(appId)}, ${JSON.stringify(concurrent.map((x) => x.result?.organizationId || x.errorStatus))})`);
  ok('D concurrent activations create exactly one trial and one statement', (await rawGet(`partner_trials/${orgId}`)).http === 200 && (await rawGet(`partner_statements/${statementId}`)).http === 200, '(trial or statement missing)');

  // ---- the Small Business Portal actually opens ----------------------------------------
  const sbPortal = await callFn('getSmallBusinessPortalV1', {locale: 'th'}, applicant.idToken);
  ok('B16 a newly activated Small Business enters its Portal', sbPortal.result?.state === 'current', `(${JSON.stringify(sbPortal.errorMsg || sbPortal.result?.state)})`);
  ok('B16 the Portal is scoped to the activated organization', sbPortal.result?.business?.businessId === orgId, `(${sbPortal.result?.business?.businessId} vs ${orgId})`);
  ok('B16 the Portal shows a draft profile seeded from the application, claiming no approval', sbPortal.result?.business?.status === 'draft' && sbPortal.result?.business?.legalName === 'Bangkok Greens Co., Ltd.', `(${JSON.stringify(sbPortal.result?.business)})`);
  const outsiderPortal = await callFn('getSmallBusinessPortalV1', {locale: 'en'}, outsider.idToken);
  ok('B16 a non-partner is denied the Small Business Portal', outsiderPortal.errorStatus === 'PERMISSION_DENIED', `(got ${outsiderPortal.errorStatus})`);

  const portalReceipt = await callFn('getPartnerTrialReceiptV1', {}, applicant.idToken);
  const adminReceipt = await callFn('getAdminPartnerTrialReceiptV1', {organizationId: orgId}, director.idToken);
  ok('B14 Portal receipt ready', portalReceipt.result?.state === 'ready', `(${JSON.stringify(portalReceipt.result?.reason || portalReceipt.errorMsg)})`);
  ok('B15 Admin receipt ready', adminReceipt.result?.state === 'ready', `(${JSON.stringify(adminReceipt.result?.reason || adminReceipt.errorMsg)})`);
  const ps = portalReceipt.result?.statement, adm = adminReceipt.result?.statement;
  ok('B15 Portal and Admin digests are identical', Boolean(ps?.receiptDigest) && ps?.receiptDigest === adm?.receiptDigest, `(${ps?.receiptDigest} vs ${adm?.receiptDigest})`);
  ok('B15 Portal and Admin statement bodies are byte-identical', Boolean(ps) && JSON.stringify(ps) === JSON.stringify(adm), '(bodies differ or absent)');
  ok('B14 $29.00 normal', ps?.totals?.normalMinor === 2900, `(${ps?.totals?.normalMinor})`);
  ok('B14 -$29.00 discount', ps?.totals?.discountMinor === 2900, `(${ps?.totals?.discountMinor})`);
  ok('B14 $0.00 due', ps?.totals?.dueMinor === 0, `(${ps?.totals?.dueMinor})`);
  ok('B14 no commission line on Small Business', (ps?.lines || []).length > 0 && ps.lines.every((l) => l.kind !== 'enterprise_attributed_commission'), `(${JSON.stringify((ps?.lines || []).map((l) => l.kind))})`);
  ok('B14 receipt carries the agreement digest', ps?.agreementDigest === AGREEMENT_DIGEST, `(${ps?.agreementDigest})`);
  ok('B14 zero-due trial issues as final with no tax collected', ps?.issueMode === 'final' && ps?.tax?.collected === false, `(${ps?.issueMode}/${ps?.tax?.collected})`);
  ok('B14 the receipt states that legal review is not complete', ps?.legalReviewComplete === false, `(${ps?.legalReviewComplete})`);
  ok('D absent tax authority reports authority_missing, never exempt', ps?.tax?.state === 'authority_missing', `(${ps?.tax?.state})`);
  ok('B14 remaining trial days are reported from the stored dates', Number(portalReceipt.result?.trial?.days) === 90 && portalReceipt.result?.trial?.cancelledAt === null, `(${JSON.stringify(portalReceipt.result?.trial)})`);

  const storedStatement = await rawGet(`partner_statements/${statementId}`);
  ok('B15 returned receipt equals the STORED document digest', Boolean(ps?.receiptDigest) && storedStatement.body?.fields?.receiptDigest?.stringValue === ps.receiptDigest, `(${storedStatement.body?.fields?.receiptDigest?.stringValue})`);
  ok('B15 stored statement number matches the activation result', Boolean(activate.result?.statementNumber) && storedStatement.body?.fields?.statementNumber?.stringValue === activate.result.statementNumber, `(${storedStatement.body?.fields?.statementNumber?.stringValue})`);

  await recordCollections([
    `partner_applications_v2/${appId}`, `course_growth_candidates/${appId}`, `partner_organizations/${orgId}`,
    `partner_identity_bindings/${applicant.uid}`, `partner_memberships/${orgId}_${applicant.uid}`,
    `b2b_partners/${applicant.uid}`, `partner_trials/${orgId}`, `partner_statements/${statementId}`,
    `partner_contract_approvals/${approvalId}`, `courses/${courseId}`, `admin_users/${director.uid}`,
    `small_businesses/${orgId}`, `partner_application_audits/${approve.result?.receipt?.id}`,
  ]);

  // ---------------------------------------------------------------- enterprise
  section('C - Enterprise journey (golf course)');
  const bAppId = appIdFor(applicantB.uid);
  await callFn('savePartnerApplicationDraftV2', {...draftFor(applicantB.email, 'Chiang Mai Links', 'golf_course', 'TH', 'sole_proprietor'), commandId: cmd()}, applicantB.idToken);
  const bView = await callFn('getMyPartnerApplicationV2', {}, applicantB.idToken);
  ok('C1 a sole proprietor is asked for ONE document group, not a company set', bView.result?.checklist?.required?.length === 1, `(${JSON.stringify(bView.result?.checklist?.required)})`);

  const bRegistration = await uploadDocument(applicantB, bAppId, 'sole_proprietor_registration', 'SOLE PROPRIETOR REGISTRATION - emulator only');
  ok('C2 sole-proprietor registration uploaded', bRegistration.result.result?.success === true, `(${JSON.stringify(bRegistration.result.errorMsg)})`);
  const bVerify = await callFn('reviewPartnerApplicationEvidenceV2', {commandId: cmd(), applicationId: bAppId, evidenceId: bRegistration.evidenceId, decision: 'verified'}, director.idToken);
  ok('C2 Admin verifies the course operator authority', bVerify.result?.success === true, `(${JSON.stringify(bVerify.errorMsg)})`);

  const bAccept = await callFn('acceptVerifiedCourseOnboardingAgreementV2', {commandId: cmd(), representative: {name: 'Nattapong S', title: 'General Manager', email: applicantB.email, authorityEvidenceId: bRegistration.evidenceId, authorityConfirmed: true}, agreement}, applicantB.idToken);
  ok('C2 course/operator authority evidence accepted', bAccept.result?.success === true, `(${JSON.stringify(bAccept.errorMsg || bAccept.result)})`);
  const bSubmit = await callFn('submitPartnerApplicationV2', {commandId: cmd()}, applicantB.idToken);
  ok('C2 a single proportionate document is enough for a sole proprietor', bSubmit.result?.success === true, `(${JSON.stringify(bSubmit.errorMsg)})`);
  await callFn('reviewPartnerApplicationV2', {applicationId: bAppId, status: 'under_review', note: 'r', commandId: cmd()}, director.idToken);

  const bContract = await callFn('approvePartnerContractV2', {commandId: cmd(), applicationId: bAppId, scope: 'course_partner_founding_commission', effectiveFrom: '2026-08-18T00:00:00.000Z', commissionBps: 300, legalReviewComplete: true, legalReviewReference: 'LEGAL-2026-08-18-TH'}, director.idToken);
  const bApprovalId = contractApprovalIdFor(bAppId, 'course_partner_founding_commission');
  ok('C3 course partner contract approved with the 300bps founding commission', bContract.result?.success === true && bContract.result?.approvalId === bApprovalId, `(${JSON.stringify(bContract.errorMsg || bContract.result)})`);
  ok('C3 a Director may record legal review complete against a reference', bContract.result?.legalReviewComplete === true, `(${bContract.result?.legalReviewComplete})`);

  const crossScope = await callFn('reviewPartnerApplicationV2', {applicationId: bAppId, status: 'approved', note: 'ok', contractApprovalId: approvalId, commandId: cmd()}, director.idToken);
  ok('C4 an approval belonging to another application cannot approve this one', crossScope.errorStatus === 'FAILED_PRECONDITION', `(got ${crossScope.errorStatus})`);

  const bApprove = await callFn('reviewPartnerApplicationV2', {applicationId: bAppId, status: 'approved', note: 'ok', contractApprovalId: bApprovalId, commandId: cmd()}, director.idToken);
  ok('C4 admin approves the Enterprise application', bApprove.result?.success === true, `(${JSON.stringify(bApprove.errorMsg)})`);
  ok('C3 approval records the founding commission, no monthly subscription', bApprove.result?.invoiceEligible === false, `(${JSON.stringify(bApprove.result)})`);

  const bCourseId = `course_b_${Date.now()}`; await seed(`courses/${bCourseId}`, {name: S('Chiang Mai Links'), country: S('TH')});
  const bBadTier = await callFn('activatePartner', {applicationId: bAppId, courseId: bCourseId, tier: 'enterprise_but_invalid', commandId: cmd()}, director.idToken);
  ok('D client-selected invalid tier is rejected outright', bBadTier.errorStatus === 'INVALID_ARGUMENT', `(got ${bBadTier.errorStatus})`);
  // The Admin explicitly asks for Small Business on a course-shaped organization. The server
  // classification wins: a golf course IS an Enterprise relationship.
  const bActivate = await callFn('activatePartner', {applicationId: bAppId, courseId: bCourseId, tier: 'small_business', commandId: cmd()}, director.idToken);
  ok('C5 Enterprise organization and course authority created', bActivate.result?.success === true, `(${JSON.stringify(bActivate.errorMsg || bActivate.result)})`);
  ok('C5 a course-shaped organization resolves to Enterprise even against an Admin downgrade', bActivate.result?.tier === 'enterprise', `(${bActivate.result?.tier})`);
  const bOrgId = bActivate.result?.organizationId; const bStatementId = bActivate.result?.statementId;

  const bAuthority = await callFn('getPartnerAuthorityState', {}, applicantB.idToken);
  ok('C6 the Enterprise partner enters its Portal authority state', bAuthority.result?.organization?.organizationId === bOrgId, `(${JSON.stringify(bAuthority.errorMsg || bAuthority.result?.organization?.organizationId)})`);
  ok('C6 the Enterprise partner is the primary owner of its organization', bAuthority.result?.membership?.role === 'primary_owner', `(${bAuthority.result?.membership?.role})`);
  const bSmallBusinessPortal = await callFn('getSmallBusinessPortalV1', {locale: 'en'}, applicantB.idToken);
  ok('C6 an Enterprise partner is not given a Small Business Portal', bSmallBusinessPortal.errorStatus === 'NOT_FOUND' || bSmallBusinessPortal.errorStatus === 'PERMISSION_DENIED', `(got ${bSmallBusinessPortal.errorStatus})`);

  const bPortal = await callFn('getPartnerTrialReceiptV1', {}, applicantB.idToken);
  const bps = bPortal.result?.statement;
  ok('C6 Enterprise Portal receipt ready', bPortal.result?.state === 'ready', `(${JSON.stringify(bPortal.result?.reason)})`);
  ok('C6 truthful ZERO attributable basis', bps?.basis?.kind === 'attributed_bookings' && bps?.basis?.verifiedBookingCount === 0 && bps?.basis?.grossMinor === 0, `(${JSON.stringify(bps?.basis)})`);
  ok('C6 $0 due during trial', bps?.totals?.dueMinor === 0, `(${bps?.totals?.dueMinor})`);
  ok('C3 no Small Business subscription line on Enterprise (no double charge)', Boolean(bps) && (bps.lines || []).every((l) => l.kind !== 'small_business_subscription'), `(${JSON.stringify((bps?.lines || []).map((l) => l.kind))})`);
  ok('C7 external-money boundary restated on the Enterprise receipt', typeof bps?.externalMoneyBoundary === 'string' && /tee-time/.test(bps.externalMoneyBoundary), `(${bps?.externalMoneyBoundary})`);
  ok('C8 the course and the Small Business relationships are separately scoped and separately stated', Boolean(orgId) && Boolean(bOrgId) && orgId !== bOrgId && statementId !== bStatementId && ps?.tier === 'small_business' && bps?.tier === 'enterprise', `(${orgId}/${bOrgId})`);

  // ---------------------------------------------------------------- security & lifecycle
  section('D - Security and lifecycle');
  const crossRead = await fsGet(`partner_applications_v2/${appId}`, applicantB.idToken);
  ok('D cross-applicant direct read denied by rules', crossRead.http === 403, `(http ${crossRead.http})`);
  const crossWrite = await fsClientWrite(`partner_applications_v2/${appId}`, applicantB.idToken);
  ok('D cross-applicant direct write denied by rules', crossWrite === 403, `(http ${crossWrite})`);
  const bOwnView = await callFn('getMyPartnerApplicationV2', {}, applicantB.idToken);
  ok('D applicant B reads only its OWN application', bOwnView.result?.application?.organization === 'Chiang Mai Links', `(${bOwnView.result?.application?.organization})`);
  const crossEvidenceReview = await callFn('reviewPartnerApplicationEvidenceV2', {commandId: cmd(), applicationId: appId, evidenceId: registration.evidenceId, decision: 'rejected', reason: 'not mine'}, applicantB.idToken);
  ok('D an applicant cannot review another applicant document', crossEvidenceReview.errorStatus === 'PERMISSION_DENIED', `(got ${crossEvidenceReview.errorStatus})`);

  const crossOrgPortal = await callFn('getPartnerTrialReceiptV1', {organizationId: orgId}, applicantB.idToken);
  ok('D cross-organization Portal receipt denied', crossOrgPortal.errorStatus === 'PERMISSION_DENIED', `(got ${crossOrgPortal.errorStatus})`);
  const outsiderAdmin = await callFn('getAdminPartnerTrialReceiptV1', {organizationId: orgId}, outsider.idToken);
  ok('D non-staff Admin receipt denied', outsiderAdmin.errorStatus === 'PERMISSION_DENIED', `(got ${outsiderAdmin.errorStatus})`);
  const unauthReceipt = await callFn('getAdminPartnerTrialReceiptV1', {organizationId: orgId}, null);
  ok('D unauthenticated Admin receipt denied', unauthReceipt.errorStatus === 'UNAUTHENTICATED', `(got ${unauthReceipt.errorStatus})`);
  const clientTrialRead = await fsGet(`partner_trials/${orgId}`, applicant.idToken);
  ok('D direct client read of partner_trials denied by rules', clientTrialRead.http === 403, `(http ${clientTrialRead.http})`);
  const clientStatementRead = await fsGet(`partner_statements/${statementId}`, applicant.idToken);
  ok('D direct client read of partner_statements denied by rules', clientStatementRead.http === 403, `(http ${clientStatementRead.http})`);
  const clientApprovalRead = await fsGet(`partner_contract_approvals/${approvalId}`, applicant.idToken);
  ok('D direct client read of partner_contract_approvals denied by rules', clientApprovalRead.http === 403, `(http ${clientApprovalRead.http})`);
  const clientBusinessRead = await fsGet(`small_businesses/${orgId}`, applicant.idToken);
  ok('D direct client read of small_businesses denied by rules (the Portal reads through a callable)', clientBusinessRead.http === 403, `(http ${clientBusinessRead.http})`);
  const selfPartnerRead = await fsGet(`b2b_partners/${applicant.uid}`, applicant.idToken);
  ok('D the narrowly necessary self-read of b2b_partners IS allowed by rules', selfPartnerRead.http === 200, `(http ${selfPartnerRead.http})`);
  const crossPartnerRead = await fsGet(`b2b_partners/${applicantB.uid}`, applicant.idToken);
  ok('D that self-read does not extend to another partner', crossPartnerRead.http === 403, `(http ${crossPartnerRead.http})`);

  // ---- invitations: validity, cross-organization conflict, replay ----------------------
  const invitee = await verifyEmail(await signUp(`staff.${Date.now()}@example.com`));
  const invite = await callFn('managePartnerStaff', {action: 'invite', email: invitee.email, role: 'manager', commandId: cmd()}, applicantB.idToken);
  ok('D staff invitation issued once', invite.result?.success === true, `(${JSON.stringify(invite.errorMsg || invite.result)})`);
  const inviteReplay = await callFn('managePartnerStaff', {action: 'invite', email: invitee.email, role: 'manager', commandId: cmd()}, applicantB.idToken);
  ok('D invitation replay is idempotent on the same invitation id', Boolean(invite.result?.invitationId) && inviteReplay.result?.invitationId === invite.result.invitationId, `(${inviteReplay.result?.invitationId})`);
  const outsiderInvite = await callFn('managePartnerStaff', {action: 'invite', email: invitee.email, role: 'manager', commandId: cmd()}, outsider.idToken);
  ok('D non-member cannot issue an invitation', outsiderInvite.errorStatus === 'PERMISSION_DENIED', `(got ${outsiderInvite.errorStatus})`);
  const wrongInvitee = await callFn('acceptPartnerInvitation', {invitationId: invite.result?.invitationId, commandId: cmd()}, outsider.idToken);
  ok('D an invitation cannot be accepted by a different email', wrongInvitee.errorStatus === 'PERMISSION_DENIED', `(got ${wrongInvitee.errorStatus})`);
  const unknownInvite = await callFn('acceptPartnerInvitation', {invitationId: 'invite_does_not_exist', commandId: cmd()}, invitee.idToken);
  ok('D an unknown invitation id is denied', unknownInvite.errorStatus === 'PERMISSION_DENIED', `(got ${unknownInvite.errorStatus})`);
  const accepted = await callFn('acceptPartnerInvitation', {invitationId: invite.result?.invitationId, commandId: cmd()}, invitee.idToken);
  ok('D the invited staff member joins the organization', accepted.result?.organizationId === bOrgId, `(${JSON.stringify(accepted.errorMsg || accepted.result)})`);
  const acceptTwice = await callFn('acceptPartnerInvitation', {invitationId: invite.result?.invitationId, commandId: cmd()}, invitee.idToken);
  ok('D a spent invitation cannot be replayed', acceptTwice.errorStatus === 'PERMISSION_DENIED', `(got ${acceptTwice.errorStatus})`);
  const crossOrgInvite = await callFn('managePartnerStaff', {action: 'invite', email: invitee.email, role: 'manager', commandId: cmd()}, applicant.idToken);
  const crossOrgAccept = await callFn('acceptPartnerInvitation', {invitationId: crossOrgInvite.result?.invitationId, commandId: cmd()}, invitee.idToken);
  ok('D one account maps to ONE organization: a second relationship needs its own account', crossOrgAccept.errorStatus === 'ALREADY_EXISTS', `(got ${crossOrgAccept.errorStatus})`);

  // ---- receipt tampering ---------------------------------------------------------------
  // A THIRD partner is onboarded specifically to be the tamper subject. Altering a stored
  // receipt is irreversible in practice - the digest covers the serialized body, so even
  // writing the original text back does not restore the original field ordering - and the two
  // partners above must stay healthy for the browser acceptance that reuses this data plane.
  section('D1 - tamper subject (a third activated partner)');
  const applicantC = await verifyEmail(await signUp(`sb.tamper.${Date.now()}@example.com`));
  const cAppId = appIdFor(applicantC.uid);
  await callFn('savePartnerApplicationDraftV2', {...draftFor(applicantC.email, 'Phuket Sands', 'golf_course', 'TH', 'sole_proprietor'), commandId: cmd()}, applicantC.idToken);
  const cRegistration = await uploadDocument(applicantC, cAppId, 'sole_proprietor_registration', 'TAMPER SUBJECT REGISTRATION - emulator only');
  await callFn('reviewPartnerApplicationEvidenceV2', {commandId: cmd(), applicationId: cAppId, evidenceId: cRegistration.evidenceId, decision: 'verified'}, director.idToken);
  await callFn('acceptVerifiedCourseOnboardingAgreementV2', {commandId: cmd(), representative: {name: 'Pim R', title: 'Owner', email: applicantC.email, authorityEvidenceId: cRegistration.evidenceId, authorityConfirmed: true}, agreement}, applicantC.idToken);
  await callFn('submitPartnerApplicationV2', {commandId: cmd()}, applicantC.idToken);
  await callFn('reviewPartnerApplicationV2', {applicationId: cAppId, status: 'under_review', note: 'r', commandId: cmd()}, director.idToken);
  const cContract = await callFn('approvePartnerContractV2', {commandId: cmd(), applicationId: cAppId, scope: 'course_partner_founding_commission', effectiveFrom: '2026-08-18T00:00:00.000Z', commissionBps: 300}, director.idToken);
  await callFn('reviewPartnerApplicationV2', {applicationId: cAppId, status: 'approved', note: 'ok', contractApprovalId: cContract.result?.approvalId, commandId: cmd()}, director.idToken);
  const cCourseId = `course_c_${Date.now()}`; await seed(`courses/${cCourseId}`, {name: S('Phuket Sands'), country: S('TH')});
  const cActivate = await callFn('activatePartner', {applicationId: cAppId, courseId: cCourseId, commandId: cmd()}, director.idToken);
  ok('D1 the tamper subject completes the same journey end to end', cActivate.result?.success === true && cActivate.result?.tier === 'enterprise', `(${JSON.stringify(cActivate.errorMsg || cActivate.result)})`);
  const cOrgId = cActivate.result?.organizationId, cStatementId = cActivate.result?.statementId;
  const cBefore = await callFn('getPartnerTrialReceiptV1', {}, applicantC.idToken);
  ok('D1 its receipt is healthy before the tamper', cBefore.result?.state === 'ready', `(${cBefore.result?.reason})`);

  note('OUT-OF-BAND WRITE (deliberate attack simulation): this third statement is altered directly to prove tamper detection. The Small Business and Enterprise receipts above stay intact.');
  await seed(`partner_statements/${cStatementId}`, {statementNumber: S('GF-TRIAL-TAMPERED')}, ['statementNumber']);
  const tamperedRead = await callFn('getPartnerTrialReceiptV1', {}, applicantC.idToken);
  ok('D receipt tampering surfaces a security state before values render', tamperedRead.result?.state === 'unavailable' && tamperedRead.result?.reason === 'receipt_digest_mismatch', `(${tamperedRead.result?.state}/${tamperedRead.result?.reason})`);
  ok('D tampered receipt returns NO statement values', tamperedRead.result?.statement === null, `(${JSON.stringify(tamperedRead.result?.statement)?.slice(0, 80)})`);
  const tamperedAdmin = await callFn('getAdminPartnerTrialReceiptV1', {organizationId: cOrgId}, director.idToken);
  ok('D Admin sees the identical tampering verdict', tamperedAdmin.result?.reason === 'receipt_digest_mismatch', `(${tamperedAdmin.result?.reason})`);
  const untouchedEnterprise = await callFn('getAdminPartnerTrialReceiptV1', {organizationId: bOrgId}, director.idToken);
  ok('D tampering with one receipt does not disturb another', untouchedEnterprise.result?.state === 'ready' && untouchedEnterprise.result?.statement?.receiptDigest === bps?.receiptDigest, `(${untouchedEnterprise.result?.state}/${untouchedEnterprise.result?.reason})`);

  const missing = await callFn('getAdminPartnerTrialReceiptV1', {organizationId: 'org_does_not_exist_000'}, director.idToken);
  ok('D missing trial receipt fails closed with a stated reason', missing.result?.state === 'unavailable' && missing.result?.reason === 'no_activated_trial_for_organization', `(${JSON.stringify(missing.result)})`);
  const badOrg = await callFn('getAdminPartnerTrialReceiptV1', {organizationId: '!!'}, director.idToken);
  ok('D malformed organization id rejected', badOrg.errorStatus === 'INVALID_ARGUMENT', `(got ${badOrg.errorStatus})`);

  // ---- suspension reaches the Portal, not just the shell --------------------------------
  const orgVersion = Number((await rawGet(`partner_organizations/${orgId}`)).body?.fields?.version?.integerValue || 1);
  const suspend = await callFn('setPartnerOrganizationStatus', {organizationId: orgId, status: 'suspended', expectedVersion: orgVersion, commandId: cmd()}, director.idToken);
  ok('D admin can suspend an organization', suspend.result?.success === true, `(${JSON.stringify(suspend.errorMsg)})`);
  const suspendedB2b = await rawGet(`b2b_partners/${applicant.uid}`);
  ok('D suspension revokes the Portal role document state', suspendedB2b.body?.fields?.status?.stringValue === 'suspended', `(${suspendedB2b.body?.fields?.status?.stringValue})`);
  const suspendedPortal = await callFn('getSmallBusinessPortalV1', {locale: 'en'}, applicant.idToken);
  ok('D a suspended organization cannot open the Small Business Portal', suspendedPortal.errorStatus === 'PERMISSION_DENIED', `(got ${suspendedPortal.errorStatus})`);
  await callFn('setPartnerOrganizationStatus', {organizationId: orgId, status: 'active', expectedVersion: orgVersion + 1, commandId: cmd()}, director.idToken);
  const restoredPortal = await callFn('getSmallBusinessPortalV1', {locale: 'en'}, applicant.idToken);
  ok('D reactivation restores the Portal', restoredPortal.result?.state === 'current', `(${JSON.stringify(restoredPortal.errorMsg || restoredPortal.result?.state)})`);

  // ---- trial cancellation, read-only and export -----------------------------------------
  const cancel = await callFn('cancelPartnerTrialV1', {commandId: cmd()}, applicant.idToken);
  ok('B17 the partner can cancel its own trial', cancel.result?.success === true, `(${JSON.stringify(cancel.errorMsg || cancel.result)})`);
  ok('B17 cancellation is zero due and opens the read-only/export window', cancel.result?.amountDueMinor === 0 && cancel.result?.exportAvailable === true && typeof cancel.result?.readOnlyUntil === 'string', `(${JSON.stringify(cancel.result)})`);
  const cancelReplay = await callFn('cancelPartnerTrialV1', {commandId: cmd()}, applicant.idToken);
  ok('B17 cancelling twice is the same cancellation', cancelReplay.result?.restarted === true && cancelReplay.result?.cancelledAt === cancel.result?.cancelledAt, `(${JSON.stringify(cancelReplay.result)})`);
  const cancelledReceipt = await callFn('getPartnerTrialReceiptV1', {}, applicant.idToken);
  ok('B17 the Portal receipt reports the cancellation', cancelledReceipt.result?.trial?.cancelledAt === cancel.result?.cancelledAt, `(${cancelledReceipt.result?.trial?.cancelledAt})`);
  ok('B17 the sealed statement is unchanged by cancellation', cancelledReceipt.result?.statement?.receiptDigest === ps?.receiptDigest, `(${cancelledReceipt.result?.statement?.receiptDigest})`);
  const cancelledAdmin = await callFn('getAdminPartnerTrialReceiptV1', {organizationId: orgId}, director.idToken);
  ok('B17 Admin sees the identical cancelled receipt', cancelledAdmin.result?.trial?.cancelledAt === cancel.result?.cancelledAt && cancelledAdmin.result?.statement?.receiptDigest === ps?.receiptDigest, `(${JSON.stringify(cancelledAdmin.result?.trial)})`);
  const outsiderCancel = await callFn('cancelPartnerTrialV1', {commandId: cmd()}, outsider.idToken);
  ok('D a non-member cannot cancel a trial', outsiderCancel.errorStatus === 'PERMISSION_DENIED', `(got ${outsiderCancel.errorStatus})`);

  // ---- current-account enforcement -------------------------------------------------------
  note('OUT-OF-BAND WRITE (deliberate): the applicant account is DISABLED through the Auth admin API, exactly as an operator offboarding would.');
  await disableUser(applicant);
  const disabledPortal = await callFn('getPartnerTrialReceiptV1', {}, applicant.idToken);
  ok('D a disabled account is denied even with an already-issued token', disabledPortal.errorStatus === 'PERMISSION_DENIED', `(got ${disabledPortal.errorStatus || 'success'})`);
  const disabledApplicantWrite = await callFn('savePartnerApplicationDraftV2', {...draftFor(applicant.email, 'Bangkok Greens', 'cafe', 'TH'), commandId: cmd()}, applicant.idToken);
  ok('D a disabled applicant cannot save or submit', disabledApplicantWrite.errorStatus === 'PERMISSION_DENIED', `(got ${disabledApplicantWrite.errorStatus || 'success'})`);
  await disableUser(director);
  const disabledAdmin = await callFn('reviewPartnerApplicationEvidenceV2', {commandId: cmd(), applicationId: bAppId, evidenceId: bRegistration.evidenceId, decision: 'rejected', reason: 'offboarded'}, director.idToken);
  ok('D a disabled Admin cannot decide a document', disabledAdmin.errorStatus === 'PERMISSION_DENIED', `(got ${disabledAdmin.errorStatus || 'success'})`);
  note('Signature attestation is still not exercised under skipTokenVerification; account state is now re-read from Firebase Auth on every sensitive call, so a disable takes effect immediately rather than at token expiry.');
  // Restore both accounts so the same emulator data plane stays walkable by a human in the
  // browser acceptance that follows this run.
  await enableUser(applicant); await enableUser(director);
  const reEnabled = await callFn('getPartnerTrialReceiptV1', {}, applicant.idToken);
  ok('D re-enabling the account restores access on the same token', reEnabled.result?.state === 'ready', `(${JSON.stringify(reEnabled.errorMsg || reEnabled.result?.state)})`);

  const storedJson = JSON.stringify((await rawGet(`partner_statements/${statementId}`)).body).replace(/course tee-time payments[^"]*/g, '');
  ok('D no external-money kind appears in any stored statement', storedJson.length > 200 && !/course_tee_time_payment|tournament_entry_fee|tournament_prize|organizer_funds|betting|stakes|escrow/.test(storedJson), '(external money kind found)');

  await recordCollections([`partner_organizations/${bOrgId}`, `partner_trials/${bOrgId}`, `partner_statements/${bStatementId}`, `partner_staff_invitations/${invite.result?.invitationId}`, `partner_authority_audits/${activate.result?.receipt?.receiptId}`]);

  // Handoff for the authenticated browser acceptance: synthetic identities and organization
  // ids only. No token, no password, no production identifier.
  if (process.env.GOLFRIEND_ACCEPTANCE_HANDOFF) {
    const {writeFileSync} = await import('node:fs');
    writeFileSync(process.env.GOLFRIEND_ACCEPTANCE_HANDOFF, JSON.stringify({
      project: PROJECT,
      smallBusiness: {email: applicant.email, uid: applicant.uid, applicationId: appId, organizationId: orgId, statementId, statementNumber: activate.result?.statementNumber, tier: activate.result?.tier,
        totals: ps?.totals, agreementDigest: ps?.agreementDigest, receiptDigest: ps?.receiptDigest, pricingPolicyVersion: ps?.pricingPolicyVersion, trialStartsAt: ps?.trialStartsAt, trialEndsAt: ps?.trialEndsAt},
      enterprise: {email: applicantB.email, uid: applicantB.uid, organizationId: bOrgId, statementId: bStatementId, basis: bps?.basis, totals: bps?.totals},
      director: {email: director.email, uid: director.uid},
      collections: [...collectionsWritten].sort(),
    }, null, 2));
    console.log(`  handoff written: ${process.env.GOLFRIEND_ACCEPTANCE_HANDOFF}`);
  }

  section('Collections written');
  console.log('  ' + [...collectionsWritten].sort().join('\n  '));
  section('Result');
  console.log(`  pass=${pass} fail=${fail}`);
  if (failures.length) { console.log('  failing:'); failures.forEach((f) => console.log(`    - ${f}`)); }
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
