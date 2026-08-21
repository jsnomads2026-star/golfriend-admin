import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolveFirebaseTarget } from '../src/firebaseTarget.js';

const root = process.cwd();
const dist = join(root, 'dist');
const legacyProjectMarker = String.fromCharCode(103, 111, 108, 102, 114, 105, 101, 110, 100, 45, 118, 49);

assert.throws(() => resolveFirebaseTarget('v2-preview', {}), /No fallback Firebase target is available/, 'an incomplete V2 configuration must fail closed');
assert.throws(() => resolveFirebaseTarget('golfriend-v1', {}), /Unknown Firebase target/, 'the legacy target must not be selectable');

rmSync(dist, { recursive: true, force: true });
const build = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], { cwd: root, encoding: 'utf8', env: { ...process.env, VITE_FIREBASE_PROJECT: 'v2-preview' } });
assert.equal(build.status, 0, build.stderr || build.stdout);

const assets = join(dist, 'assets');
assert.ok(existsSync(assets), 'production assets must be emitted');
const bundle = readdirSync(assets).filter((file) => file.endsWith('.js')).map((file) => readFileSync(join(assets, file), 'utf8')).join('\n');
assert.ok(!bundle.includes(legacyProjectMarker), 'a production Admin bundle must not embed the legacy Firebase project');
console.log('Admin V2 identity production-bundle guard PASS');
