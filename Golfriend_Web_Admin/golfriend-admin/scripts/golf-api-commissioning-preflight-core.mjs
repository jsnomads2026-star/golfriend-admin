export const REQUIRED_PROJECT = 'golfriend-v2';
export const REQUIRED_SECRET = 'GOLF_API_KEY';
export const EVIDENCE_STAGES = Object.freeze({
  synthetic: 'synthetic preview — local logic only, not commissioning',
  emulator: 'emulator preview — loopback Firebase only, not live-provider evidence',
  live: 'founder-authorized live read-only preview — requires separate one-request authorization',
});

const loopback = /^(?:localhost|127\.0\.0\.1|\[::1\]):\d+$/;

export function evaluateGolfApiPreflight(input) {
  const checks = [];
  const add = (name, pass, detail) => checks.push({ name, status: pass ? 'PASS' : 'BLOCKED', detail });

  const nodeMajor = Number(String(input.nodeVersion || '').replace(/^v/, '').split('.')[0]);
  add('node20', nodeMajor === 20, nodeMajor === 20 ? `Node ${input.nodeVersion}` : 'Functions preflight requires Node 20');
  add('explicitProject', input.project === REQUIRED_PROJECT,
    input.project === REQUIRED_PROJECT ? REQUIRED_PROJECT : 'Explicit --project=golfriend-v2 is required; V1 and missing targets are rejected');
  add('previewOnly', input.mode === 'preview', input.mode === 'preview' ? 'preview/read-only' : 'apply/production mode is prohibited');
  add('evidenceStage', Object.hasOwn(EVIDENCE_STAGES, input.stage), EVIDENCE_STAGES[input.stage] || 'Unknown evidence stage');
  add('founderAuthorization', input.stage !== 'live' || input.founderAuthorized === true,
    input.stage !== 'live' ? 'not required for synthetic/emulator evidence' : input.founderAuthorized ? 'explicit live read-only authorization recorded' : 'live evidence requires explicit founder authorization');

  const needsEmulator = input.stage === 'emulator' || input.stage === 'live';
  const hostsPresent = Boolean(input.functionsHost && input.firestoreHost);
  const hostsSafe = hostsPresent && loopback.test(input.functionsHost) && loopback.test(input.firestoreHost);
  add('loopbackEmulators', !needsEmulator || hostsSafe,
    !needsEmulator ? 'not required for synthetic-only evaluation' : hostsSafe ? 'Functions and Firestore hosts are loopback-only' : 'Loopback Functions and Firestore emulator hosts are required');

  add('billing', input.billingEnabled === true, input.billingEnabled ? 'billing metadata enabled' : 'billing absent or unavailable');
  add('secretManagerApi', input.secretManagerApi === true,
    input.secretManagerApi ? 'secretmanager.googleapis.com enabled' : 'Secret Manager API absent or unavailable');
  add('secretContainer', input.secretContainer === true,
    input.secretContainer ? `${REQUIRED_SECRET} metadata present` : `${REQUIRED_SECRET} container metadata absent`);
  add('distinctCredentialVersion', input.distinctCredentialVersion === true,
    input.distinctCredentialVersion ? 'enabled V2 credential version metadata present' : 'distinct V2 credential version metadata absent');
  add('emulatorCredentialName', !needsEmulator || input.emulatorCredentialName === true,
    !needsEmulator ? 'not required for synthetic-only evaluation' : input.emulatorCredentialName ? `${REQUIRED_SECRET} configuration name present in process environment` : `${REQUIRED_SECRET} configuration name absent from emulator environment`);

  const productionWrites = 0;
  add('productionWrites', productionWrites === 0, 'productionWrites=0');

  const blocked = checks.filter((check) => check.status === 'BLOCKED');
  return {
    command: 'golf-api-commissioning-preflight',
    project: input.project || null,
    stage: input.stage || null,
    evidenceType: EVIDENCE_STAGES[input.stage] || 'invalid',
    mode: input.mode || null,
    requiredConfigurationNames: ['secretmanager.googleapis.com', REQUIRED_SECRET, 'FUNCTIONS_EMULATOR_HOST', 'FIRESTORE_EMULATOR_HOST'],
    checks,
    productionWrites,
    b3Status: blocked.length === 0 && input.stage === 'live' ? 'READY_FOR_SEPARATELY_AUTHORIZED_LIVE_READ_ONLY_PREVIEW' : 'BLOCKED',
    overall: blocked.length === 0 ? 'PASS' : 'BLOCKED',
  };
}
