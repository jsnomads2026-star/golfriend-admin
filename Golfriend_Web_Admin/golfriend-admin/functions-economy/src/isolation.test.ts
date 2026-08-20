import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const index = readFileSync(resolve(process.cwd(), 'src/index.ts'), 'utf8');
const bootstrapPlan = readFileSync(resolve(process.cwd(), 'src/economyBootstrapPlan.ts'), 'utf8');
const manifest = readFileSync(resolve(process.cwd(), 'package.json'), 'utf8');
const firebaseConfig = JSON.parse(readFileSync(resolve(process.cwd(), '../firebase.economy.json'), 'utf8')) as { functions?: Array<{ codebase?: string; source?: string }>; hosting?: unknown };
assert.match(index, /region:\s*'asia-southeast1'/);
assert.match(index, /isActiveDirector\s*\(/);
assert.match(index, /throw new HttpsError\('permission-denied'/);
assert.match(index, /buildV2EconomyMasterSnapshot/);
assert.doesNotMatch(index, /stripe|booking|golfapi|moderation|runTransaction|\.set\(|\.update\(|\.delete\(/i);
assert.doesNotMatch(bootstrapPlan, /from ['\"]firebase|runTransaction|\.set\(|\.update\(|\.delete\(/i);
assert.doesNotMatch(manifest, /stripe|@google-cloud\/vision/i);
assert.equal(firebaseConfig.hosting, undefined);
assert.deepEqual(firebaseConfig.functions, [{ source: 'functions-economy', codebase: 'economy', disallowLegacyRuntimeConfig: true, ignore: ['node_modules', '.git', 'firebase-debug.log', 'firebase-debug.*.log', '*.local'], predeploy: ['npm --prefix "$RESOURCE_DIR" run build'] }]);
console.log('economy isolation: region, Director gate, read-only imports and dependency boundary passed.');
