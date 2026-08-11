#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { evaluateGolfApiPreflight, REQUIRED_PROJECT, REQUIRED_SECRET } from './golf-api-commissioning-preflight-core.mjs';

function argsOf(argv) {
  const out = {};
  for (const item of argv) {
    if (!item.startsWith('--') || !item.includes('=')) continue;
    const [key, ...value] = item.slice(2).split('=');
    out[key] = value.join('=');
  }
  return out;
}

function gcloudMetadata(args) {
  const result = spawnSync('gcloud.cmd', args, { encoding: 'utf8', windowsHide: true, shell: false });
  return result.status === 0 ? result.stdout.trim() : '';
}

const args = argsOf(process.argv.slice(2));
const project = args.project;
const safeProject = project === REQUIRED_PROJECT;

// Metadata probes are deliberately skipped until the caller supplies the one
// approved project. Commands request names/booleans only; secret payload access
// is neither implemented nor accepted by this preflight.
let billingEnabled = false;
let secretManagerApi = false;
let secretContainer = false;
let distinctCredentialVersion = false;
if (safeProject) {
  billingEnabled = gcloudMetadata(['billing', 'projects', 'describe', project, '--format=value(billingEnabled)']) === 'True';
  secretManagerApi = gcloudMetadata(['services', 'list', '--enabled', `--project=${project}`, '--filter=config.name:secretmanager.googleapis.com', '--format=value(config.name)']) === 'secretmanager.googleapis.com';
  if (secretManagerApi) {
    secretContainer = gcloudMetadata(['secrets', 'describe', REQUIRED_SECRET, `--project=${project}`, '--format=value(name)']).endsWith(`/secrets/${REQUIRED_SECRET}`);
    if (secretContainer) {
      distinctCredentialVersion = Boolean(gcloudMetadata(['secrets', 'versions', 'list', REQUIRED_SECRET, `--project=${project}`, '--filter=state:enabled', '--limit=1', '--format=value(name)']));
    }
  }
}

const report = evaluateGolfApiPreflight({
  nodeVersion: process.version,
  project,
  stage: args.stage,
  mode: args.mode,
  functionsHost: args['functions-host'],
  firestoreHost: args['firestore-host'],
  billingEnabled,
  secretManagerApi,
  secretContainer,
  distinctCredentialVersion,
  emulatorCredentialName: Object.hasOwn(process.env, REQUIRED_SECRET),
  founderAuthorized: args['founder-authorized'] === 'true',
});

console.log(JSON.stringify(report, null, 2));
process.exitCode = report.overall === 'PASS' ? 0 : 2;
