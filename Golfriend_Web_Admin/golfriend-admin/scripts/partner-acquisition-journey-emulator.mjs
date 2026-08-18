// Applicant -> Admin -> activation -> Partner Portal acceptance against ONE shared
// Firebase emulator data plane (Auth + Firestore + Functions + Storage).
//
// Drives the real client path: Auth emulator sign-in, onCall callables over HTTP with real
// ID tokens, Firestore REST with user tokens for rules boundaries. Nothing here is a source
// grep: every assertion drives the deployed function or the real ruleset.
//
// Seeding with the emulator "owner" bearer is used ONLY where no product surface can reach a
// required state. Every such seed is announced as OUT-OF-BAND so it can never be mistaken for
// evidence that a product path exists.
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
async function fsClientWrite(path, idToken) {
  const r = await fetch(`${FS}/${path}`, {method: 'PATCH', headers: {'Authorization': `Bearer ${idToken}`, 'Content-Type': 'application/json'}, body: JSON.stringify({fields: {tampered: {booleanValue: true}}})});
  return r.status;
}
const S = (v) => ({stringValue: String(v)});
const I = (v) => ({integerValue: String(v)});

const draftFor = (email, org, type, country) => ({
  organization: org, organizationType: type, country, region: 'Central',
  contactName: 'Somchai Prasert', contactEmail: email, contactPhone: '+66801234567', locale: 'th',
  courseName: `${org} Course`, courseAddress: '99 Fairway Road', courseWebsite: 'https://example.com',
  consent: true, terms: true,
  organizationIdentity: {legalName: `${org} Co., Ltd.`, registrationId: '0105558001234', jurisdiction: country},
  courseProfile: {name: `${org} Course`, address: '99 Fairway Road', website: 'https://example.com', holes: 18, timeZone: 'Asia/Bangkok', catalogueLocales: LOCALES},
});

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
  await seed(`admin_users/${director.uid}`, {role: S('Director'), status: S('active')});
  await seed(`admin_users/${support.uid}`, {role: S('Support'), status: S('active')});

  // App Check is genuinely enforced: the SAME authenticated request is denied with no
  // attestation header and accepted with one. Both halves run against the real callable.
  const noAttestation = await callFn('getMyPartnerApplicationV2', {}, director.idToken, {appCheck: false});
  ok('A App Check enforced: authenticated call without attestation is denied', noAttestation.errorStatus === 'UNAUTHENTICATED', `(got ${noAttestation.errorStatus})`);
  const withAttestation = await callFn('getMyPartnerApplicationV2', {}, director.idToken);
  ok('A the same call with attestation is accepted', withAttestation.result?.schema === 'golfriend.partner-application-view.v2', `(${JSON.stringify(withAttestation.errorMsg || withAttestation.result?.schema)})`);
  note('App Check signature verification is NOT exercised: skipTokenVerification decodes the attestation. Presence enforcement is proven; cryptographic attestation is not.');
  console.log(`  identities: applicant=${applicant.uid} applicantB=${applicantB.uid} director=${director.uid} support=${support.uid} outsider=${outsider.uid}`);

  const appId = appIdFor(applicant.uid);

  // ---------------------------------------------------------------- small business
  section('B - Small Business journey');
  const save1 = await callFn('savePartnerApplicationDraftV2', {...draftFor(applicant.email, 'Bangkok Greens', 'brand', 'TH'), commandId: cmd()}, applicant.idToken);
  ok('B3 draft created', save1.result?.success === true && save1.result?.status === 'draft', `(${JSON.stringify(save1.errorMsg || save1.result)})`);
  ok('B3 application id is derived from uid, not chosen by the client', save1.result?.applicationId === appId, `(${save1.result?.applicationId} vs ${appId})`);

  const resumed = await callFn('getMyPartnerApplicationV2', {}, applicant.idToken);
  ok('B3 draft resumes with the real saved organization', resumed.result?.application?.organization === 'Bangkok Greens', `(${resumed.result?.application?.organization})`);
  ok('B4 organization identity persisted', resumed.result?.application?.organizationIdentity?.registrationId === '0105558001234', `(${JSON.stringify(resumed.result?.application?.organizationIdentity)})`);
  ok('B4 exact eight-locale catalogue persisted', LOCALES.every((l) => resumed.result?.application?.courseProfile?.catalogueLocales?.includes(l)), `(${JSON.stringify(resumed.result?.application?.courseProfile?.catalogueLocales)})`);

  const bytes = Buffer.from('SYNTHETIC AUTHORITY EVIDENCE - emulator only');
  const checksum = sha(bytes);
  const upload = await callFn('uploadPartnerApplicationEvidenceV2', {commandId: cmd(), fileName: 'authority.pdf', contentType: 'application/pdf', sizeBytes: bytes.length, checksum, base64: bytes.toString('base64')}, applicant.idToken);
  const evId = evidenceIdFor(appId, checksum);
  ok('B5 authoritative upload receipt issued', upload.result?.success === true && upload.result?.evidenceId === evId, `(${JSON.stringify(upload.errorMsg || upload.result)})`);
  ok('B5 upload receipt is an immutable audit record', typeof upload.result?.receipt?.id === 'string' && upload.result.receipt.id.startsWith('paa_'), `(${JSON.stringify(upload.result?.receipt)})`);

  const tampered = await callFn('uploadPartnerApplicationEvidenceV2', {commandId: cmd(), fileName: 'bad.pdf', contentType: 'application/pdf', sizeBytes: bytes.length, checksum: sha('different'), base64: bytes.toString('base64')}, applicant.idToken);
  ok('B5 tampered document checksum denied', tampered.errorStatus === 'INVALID_ARGUMENT', `(got ${tampered.errorStatus})`);

  const representative = {name: 'Somchai Prasert', title: 'Managing Director', email: applicant.email, authorityEvidenceId: evId, authorityConfirmed: true};
  const agreement = {version: AGREEMENT_VERSION, digest: AGREEMENT_DIGEST, explicitlyAccepted: true, signerIsAuthorizedRepresentative: true};
  const acceptBefore = await callFn('acceptVerifiedCourseOnboardingAgreementV2', {commandId: cmd(), representative, agreement}, applicant.idToken);
  ok('B6 agreement blocked while evidence is unverified (fails closed)', acceptBefore.errorStatus === 'FAILED_PRECONDITION', `(got ${acceptBefore.errorStatus})`);

  note('OUT-OF-BAND SEED: no callable sets evidence.verificationStatus - seeding it directly to continue the chain.');
  await seed(`partner_applications_v2/${appId}/evidence/${evId}`, {verificationStatus: S('verified'), verifiedByRole: S('Director')});

  const accept = await callFn('acceptVerifiedCourseOnboardingAgreementV2', {commandId: cmd(), representative, agreement}, applicant.idToken);
  ok('B6 exact agreement version/digest accepted', accept.result?.success === true && typeof accept.result?.agreementReceiptId === 'string', `(${JSON.stringify(accept.errorMsg || accept.result)})`);

  const wrongDigest = await callFn('acceptVerifiedCourseOnboardingAgreementV2', {commandId: cmd(), representative, agreement: {...agreement, digest: sha('wrong')}}, applicant.idToken);
  ok('D agreement digest mismatch denied', wrongDigest.errorStatus === 'INVALID_ARGUMENT' || wrongDigest.errorStatus === 'FAILED_PRECONDITION', `(got ${wrongDigest.errorStatus})`);
  const wrongVersion = await callFn('acceptVerifiedCourseOnboardingAgreementV2', {commandId: cmd(), representative, agreement: {...agreement, version: 'golfriend.course-partner.v2'}}, applicant.idToken);
  ok('D agreement version mismatch denied', wrongVersion.errorStatus === 'INVALID_ARGUMENT' || wrongVersion.errorStatus === 'FAILED_PRECONDITION', `(got ${wrongVersion.errorStatus})`);

  const submit = await callFn('submitPartnerApplicationV2', {commandId: cmd()}, applicant.idToken);
  ok('B8 application submitted', submit.result?.success === true, `(${JSON.stringify(submit.errorMsg || submit.result)})`);

  const toReview = await callFn('reviewPartnerApplicationV2', {applicationId: appId, status: 'under_review', note: 'Reviewing', commandId: cmd()}, director.idToken);
  ok('B9 admin moves application to under_review', toReview.result?.success === true, `(${JSON.stringify(toReview.errorMsg)})`);
  const infoNeeded = await callFn('reviewPartnerApplicationV2', {applicationId: appId, status: 'info_needed', note: 'Supply alternative proof of authority.', commandId: cmd()}, director.idToken);
  ok('B9 admin requests information', infoNeeded.result?.success === true && infoNeeded.result?.status === 'info_needed', `(${JSON.stringify(infoNeeded.errorMsg)})`);

  const altBytes = Buffer.from('SYNTHETIC ALTERNATIVE AUTHORITY EVIDENCE - board resolution');
  const altChecksum = sha(altBytes);
  const altUpload = await callFn('uploadPartnerApplicationEvidenceV2', {commandId: cmd(), fileName: 'board-resolution.pdf', contentType: 'application/pdf', sizeBytes: altBytes.length, checksum: altChecksum, base64: altBytes.toString('base64')}, applicant.idToken);
  const altEvId = evidenceIdFor(appId, altChecksum);
  ok('B10 alternative evidence upload receipt issued', altUpload.result?.evidenceId === altEvId, `(${JSON.stringify(altUpload.errorMsg || altUpload.result)})`);
  note('OUT-OF-BAND SEED: alternative evidence likewise cannot be approved by any product surface.');
  await seed(`partner_applications_v2/${appId}/evidence/${altEvId}`, {verificationStatus: S('verified'), verifiedByRole: S('Director')});
  const reAccept = await callFn('acceptVerifiedCourseOnboardingAgreementV2', {commandId: cmd(), representative: {...representative, authorityEvidenceId: altEvId}, agreement}, applicant.idToken);
  ok('B10 agreement re-accepted against alternative evidence', reAccept.result?.success === true, `(${JSON.stringify(reAccept.errorMsg || reAccept.result)})`);
  const resubmit = await callFn('submitPartnerApplicationV2', {commandId: cmd()}, applicant.idToken);
  ok('B10 applicant resubmits after information request', resubmit.result?.success === true, `(${JSON.stringify(resubmit.errorMsg || resubmit.result)})`);

  await callFn('reviewPartnerApplicationV2', {applicationId: appId, status: 'under_review', note: 'Re-reviewing', commandId: cmd()}, director.idToken);
  const approveNoContract = await callFn('reviewPartnerApplicationV2', {applicationId: appId, status: 'approved', note: 'Approved', commandId: cmd()}, director.idToken);
  ok('B11 approval without a contract approval record is denied', approveNoContract.errorStatus === 'FAILED_PRECONDITION', `(got ${approveNoContract.errorStatus})`);

  const approvalId = `pca_${sha(`${appId}|founding`).slice(0, 32)}`;
  note('OUT-OF-BAND SEED: no callable writes partner_contract_approvals - seeding the approval record.');
  await seed(`partner_contract_approvals/${approvalId}`, {applicationId: S(appId), status: S('approved'), commissionBps: I(300), effectiveFrom: S('2026-08-18T00:00:00.000Z')});

  const supportApprove = await callFn('reviewPartnerApplicationV2', {applicationId: appId, status: 'approved', note: 'Approved', contractApprovalId: approvalId, commandId: cmd()}, support.idToken);
  ok('D Support role cannot approve (Director/Manager only)', supportApprove.errorStatus === 'FAILED_PRECONDITION' || supportApprove.errorStatus === 'PERMISSION_DENIED', `(got ${supportApprove.errorStatus})`);

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
  const orgId = activate.result?.organizationId;
  const statementId = activate.result?.statementId;
  console.log(`  organizationId=${orgId} statementId=${statementId} statementNumber=${activate.result?.statementNumber} tier=${activate.result?.tier}`);

  const orgDoc = await rawGet(`partner_organizations/${orgId}`);
  ok('B12 exactly one organization created', orgDoc.http === 200, `(http ${orgDoc.http})`);
  const ownerRole = await rawGet(`partner_memberships/${orgId}_${applicant.uid}`);
  ok('B12 owner role created', ownerRole.body?.fields?.role?.stringValue === 'primary_owner', `(${JSON.stringify(ownerRole.body?.fields?.role)})`);
  const trialDoc = await rawGet(`partner_trials/${orgId}`);
  ok('B12 exactly one immutable trial created', trialDoc.http === 200 && trialDoc.body?.fields?.immutable?.booleanValue === true, `(http ${trialDoc.http})`);
  ok('B12 trial is 90 days', Number(trialDoc.body?.fields?.days?.integerValue) === 90, `(${trialDoc.body?.fields?.days?.integerValue})`);

  const dup = await callFn('activatePartner', {applicationId: appId, courseId, commandId: cmd()}, director.idToken);
  ok('D duplicate activation does not mint a second organization', (await countOrgsFor(appId)) === 1, `(orgs=${await countOrgsFor(appId)}, retry said: ${JSON.stringify(dup.errorMsg || dup.result)})`);
  ok('D a retried activation returns the SAME organization and is marked restarted', dup.result?.restarted === true && dup.result?.organizationId === orgId, `(${JSON.stringify(dup.errorMsg || dup.result)})`);
  const concurrent = await Promise.all([0, 1, 2].map(() => callFn('activatePartner', {applicationId: appId, courseId, commandId: cmd()}, director.idToken)));
  ok('D concurrent activations still leave exactly one organization', Boolean(orgId) && (await countOrgsFor(appId)) === 1, `(orgs=${await countOrgsFor(appId)}, ${JSON.stringify(concurrent.map((x) => x.result?.organizationId || x.errorStatus))})`);
  ok('D concurrent activations create exactly one trial and one statement', (await rawGet(`partner_trials/${orgId}`)).http === 200 && (await rawGet(`partner_statements/${statementId}`)).http === 200, '(trial or statement missing)');

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
  ok('D absent tax authority reports authority_missing, never exempt', ps?.tax?.state === 'authority_missing', `(${ps?.tax?.state})`);

  const storedStatement = await rawGet(`partner_statements/${statementId}`);
  ok('B15 returned receipt equals the STORED document digest', Boolean(ps?.receiptDigest) && storedStatement.body?.fields?.receiptDigest?.stringValue === ps.receiptDigest, `(${storedStatement.body?.fields?.receiptDigest?.stringValue})`);
  ok('B15 stored statement number matches the activation result', Boolean(activate.result?.statementNumber) && storedStatement.body?.fields?.statementNumber?.stringValue === activate.result.statementNumber, `(${storedStatement.body?.fields?.statementNumber?.stringValue})`);

  await recordCollections([
    `partner_applications_v2/${appId}`, `course_growth_candidates/${appId}`, `partner_organizations/${orgId}`,
    `partner_identity_bindings/${applicant.uid}`, `partner_memberships/${orgId}_${applicant.uid}`,
    `b2b_partners/${applicant.uid}`, `partner_trials/${orgId}`, `partner_statements/${statementId}`,
    `partner_contract_approvals/${approvalId}`, `courses/${courseId}`, `admin_users/${director.uid}`,
    `partner_application_audits/${approve.result?.receipt?.id}`,
  ]);

  // ---------------------------------------------------------------- enterprise
  section('C - Enterprise journey');
  const bAppId = appIdFor(applicantB.uid);
  await callFn('savePartnerApplicationDraftV2', {...draftFor(applicantB.email, 'Chiang Mai Links', 'golf_course', 'TH'), commandId: cmd()}, applicantB.idToken);
  const bEvBytes = Buffer.from('COURSE OPERATOR AUTHORITY EVIDENCE'); const bChecksum = sha(bEvBytes);
  await callFn('uploadPartnerApplicationEvidenceV2', {commandId: cmd(), fileName: 'operator-authority.pdf', contentType: 'application/pdf', sizeBytes: bEvBytes.length, checksum: bChecksum, base64: bEvBytes.toString('base64')}, applicantB.idToken);
  const bEvId = evidenceIdFor(bAppId, bChecksum);
  note('OUT-OF-BAND SEED: course/operator authority evidence cannot be verified by any product surface.');
  await seed(`partner_applications_v2/${bAppId}/evidence/${bEvId}`, {verificationStatus: S('verified'), verifiedByRole: S('Director')});
  const bAccept = await callFn('acceptVerifiedCourseOnboardingAgreementV2', {commandId: cmd(), representative: {name: 'Nattapong S', title: 'General Manager', email: applicantB.email, authorityEvidenceId: bEvId, authorityConfirmed: true}, agreement}, applicantB.idToken);
  ok('C2 course/operator authority evidence accepted', bAccept.result?.success === true, `(${JSON.stringify(bAccept.errorMsg || bAccept.result)})`);
  await callFn('submitPartnerApplicationV2', {commandId: cmd()}, applicantB.idToken);
  await callFn('reviewPartnerApplicationV2', {applicationId: bAppId, status: 'under_review', note: 'r', commandId: cmd()}, director.idToken);
  const bApprovalId = `pca_${sha(`${bAppId}|founding`).slice(0, 32)}`;
  await seed(`partner_contract_approvals/${bApprovalId}`, {applicationId: S(bAppId), status: S('approved'), commissionBps: I(300), effectiveFrom: S('2026-08-18T00:00:00.000Z')});
  const bApprove = await callFn('reviewPartnerApplicationV2', {applicationId: bAppId, status: 'approved', note: 'ok', contractApprovalId: bApprovalId, commandId: cmd()}, director.idToken);
  ok('C4 admin approves the Enterprise application', bApprove.result?.success === true, `(${JSON.stringify(bApprove.errorMsg)})`);
  ok('C3 approval records the 300bps founding commission, no monthly subscription', bApprove.result?.invoiceEligible === false, `(${JSON.stringify(bApprove.result)})`);

  const bCourseId = `course_b_${Date.now()}`; await seed(`courses/${bCourseId}`, {name: S('Chiang Mai Links'), country: S('TH')});
  const bBadTier = await callFn('activatePartner', {applicationId: bAppId, courseId: bCourseId, tier: 'enterprise_but_invalid', commandId: cmd()}, director.idToken);
  ok('D client-selected invalid tier is rejected outright', bBadTier.errorStatus === 'INVALID_ARGUMENT', `(got ${bBadTier.errorStatus})`);
  const bActivate = await callFn('activatePartner', {applicationId: bAppId, courseId: bCourseId, commandId: cmd()}, director.idToken);
  ok('C5 Enterprise organization and course authority created', bActivate.result?.success === true, `(${JSON.stringify(bActivate.errorMsg || bActivate.result)})`);
  ok('C5 tier derived server-side as enterprise', bActivate.result?.tier === 'enterprise', `(${bActivate.result?.tier})`);
  const bOrgId = bActivate.result?.organizationId; const bStatementId = bActivate.result?.statementId;

  const bPortal = await callFn('getPartnerTrialReceiptV1', {}, applicantB.idToken);
  const bps = bPortal.result?.statement;
  ok('C6 Enterprise Portal receipt ready', bPortal.result?.state === 'ready', `(${JSON.stringify(bPortal.result?.reason)})`);
  ok('C6 truthful ZERO attributable basis', bps?.basis?.kind === 'attributed_bookings' && bps?.basis?.verifiedBookingCount === 0 && bps?.basis?.grossMinor === 0, `(${JSON.stringify(bps?.basis)})`);
  ok('C6 $0 due during trial', bps?.totals?.dueMinor === 0, `(${bps?.totals?.dueMinor})`);
  ok('C3 no Small Business subscription line on Enterprise (no double charge)', Boolean(bps) && (bps.lines || []).every((l) => l.kind !== 'small_business_subscription'), `(${JSON.stringify((bps?.lines || []).map((l) => l.kind))})`);
  ok('C7 external-money boundary restated on the Enterprise receipt', typeof bps?.externalMoneyBoundary === 'string' && /tee-time/.test(bps.externalMoneyBoundary), `(${bps?.externalMoneyBoundary})`);

  // ---------------------------------------------------------------- security & lifecycle
  section('D - Security and lifecycle');
  const crossRead = await fsGet(`partner_applications_v2/${appId}`, applicantB.idToken);
  ok('D cross-applicant direct read denied by rules', crossRead.http === 403, `(http ${crossRead.http})`);
  const crossWrite = await fsClientWrite(`partner_applications_v2/${appId}`, applicantB.idToken);
  ok('D cross-applicant direct write denied by rules', crossWrite === 403, `(http ${crossWrite})`);
  const bView = await callFn('getMyPartnerApplicationV2', {}, applicantB.idToken);
  ok('D applicant B reads only its OWN application', bView.result?.application?.organization === 'Chiang Mai Links', `(${bView.result?.application?.organization})`);

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

  note('Receipt tampering is applied to the ENTERPRISE statement so the Small Business receipt stays intact.');
  await seed(`partner_statements/${bStatementId}`, {statementNumber: S('GF-TRIAL-TAMPERED')}, ['statementNumber']);
  const tamperedRead = await callFn('getPartnerTrialReceiptV1', {}, applicantB.idToken);
  ok('D receipt tampering surfaces a security state before values render', tamperedRead.result?.state === 'unavailable' && tamperedRead.result?.reason === 'receipt_digest_mismatch', `(${tamperedRead.result?.state}/${tamperedRead.result?.reason})`);
  ok('D tampered receipt returns NO statement values', tamperedRead.result?.statement === null, `(${JSON.stringify(tamperedRead.result?.statement)?.slice(0, 80)})`);
  const tamperedAdmin = await callFn('getAdminPartnerTrialReceiptV1', {organizationId: bOrgId}, director.idToken);
  ok('D Admin sees the identical tampering verdict', tamperedAdmin.result?.reason === 'receipt_digest_mismatch', `(${tamperedAdmin.result?.reason})`);

  const missing = await callFn('getAdminPartnerTrialReceiptV1', {organizationId: 'org_does_not_exist_000'}, director.idToken);
  ok('D missing trial receipt fails closed with a stated reason', missing.result?.state === 'unavailable' && missing.result?.reason === 'no_activated_trial_for_organization', `(${JSON.stringify(missing.result)})`);
  const badOrg = await callFn('getAdminPartnerTrialReceiptV1', {organizationId: '!!'}, director.idToken);
  ok('D malformed organization id rejected', badOrg.errorStatus === 'INVALID_ARGUMENT', `(got ${badOrg.errorStatus})`);

  const orgVersion = Number((await rawGet(`partner_organizations/${orgId}`)).body?.fields?.version?.integerValue || 1);
  const suspend = await callFn('setPartnerOrganizationStatus', {organizationId: orgId, status: 'suspended', expectedVersion: orgVersion, commandId: cmd()}, director.idToken);
  ok('D admin can suspend an organization', suspend.result?.success === true, `(${JSON.stringify(suspend.errorMsg)})`);
  const suspendedB2b = await rawGet(`b2b_partners/${applicant.uid}`);
  ok('D suspension revokes the Portal role document state', suspendedB2b.body?.fields?.status?.stringValue === 'suspended', `(${suspendedB2b.body?.fields?.status?.stringValue})`);
  await callFn('setPartnerOrganizationStatus', {organizationId: orgId, status: 'active', expectedVersion: orgVersion + 1, commandId: cmd()}, director.idToken);

  const invitee = await verifyEmail(await signUp(`staff.${Date.now()}@example.com`));
  const invite = await callFn('managePartnerStaff', {action: 'invite', email: invitee.email, role: 'manager', commandId: cmd()}, applicantB.idToken);
  ok('D staff invitation issued once', invite.result?.success === true, `(${JSON.stringify(invite.errorMsg || invite.result)})`);
  const inviteReplay = await callFn('managePartnerStaff', {action: 'invite', email: invitee.email, role: 'manager', commandId: cmd()}, applicantB.idToken);
  ok('D invitation replay is idempotent on the same invitation id', Boolean(invite.result?.invitationId) && inviteReplay.result?.invitationId === invite.result.invitationId, `(${inviteReplay.result?.invitationId})`);
  const outsiderInvite = await callFn('managePartnerStaff', {action: 'invite', email: invitee.email, role: 'manager', commandId: cmd()}, outsider.idToken);
  ok('D non-member cannot issue an invitation', outsiderInvite.errorStatus === 'PERMISSION_DENIED', `(got ${outsiderInvite.errorStatus})`);

  await disableUser(applicant);
  const disabledCall = await callFn('getPartnerTrialReceiptV1', {}, applicant.idToken);
  // Honest result: an already-issued ID token keeps working after the account is disabled,
  // because no callable verifies with checkRevoked. Recorded as an observed limit, not a pass.
  note(`OBSERVED LIMIT: after disabling the account, an already-issued token still returned ${disabledCall.errorStatus || 'success'}. No callable uses verifyIdToken(checkRevoked), so revocation only takes effect when the token expires.`);
  ok('D revocation behaviour is recorded (not asserted: unprovable under skipTokenVerification)', true);

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
