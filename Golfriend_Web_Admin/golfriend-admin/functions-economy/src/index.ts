import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { isActiveDirector } from './authority.js';
import { buildV2EconomyMasterSnapshot } from './economyMasterRead.js';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const toDocuments = (snapshot: admin.firestore.QuerySnapshot) => snapshot.docs.map((item) => ({ id: item.id, data: item.data() }));

// The only Economy codebase export: bounded, non-member-identifying reads from
// canonical V2 authority. It has no secrets and no financial mutation path.
export const getV2EconomyMasterSnapshot = onCall({ region: 'asia-southeast1', memory: '256MiB' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication is required.');
  const adminSnap = await db.collection('admin_users').doc(request.auth.uid).get();
  if (!isActiveDirector(adminSnap.exists ? adminSnap.data() : null)) {
    throw new HttpsError('permission-denied', 'Director authority is required.');
  }
  const [policies, lots, journals, reconciliationCases, policyAudit] = await Promise.all([
    db.collection('v2_economy_policy_versions').limit(100).get(),
    db.collection('v2_tee_lots').limit(500).get(),
    db.collection('v2_economy_journal_entries').limit(250).get(),
    db.collection('v2_economy_reconciliation_cases').limit(250).get(),
    db.collection('v2_economy_policy_change_audit').limit(100).get(),
  ]);
  return buildV2EconomyMasterSnapshot({ policies: toDocuments(policies), lots: toDocuments(lots), journals: toDocuments(journals), reconciliationCases: toDocuments(reconciliationCases), policyAudit: toDocuments(policyAudit) });
});
