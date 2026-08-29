import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const sourceDirectory = resolve(scriptDirectory, '..', 'functions-course-read');
const manifest = JSON.parse(readFileSync(resolve(sourceDirectory, 'package.json'), 'utf8'));

assert.equal(manifest.main, 'index.js');
assert.equal(manifest.engines?.node, '20');
assert.equal(manifest.dependencies?.['firebase-admin'], '13.6.0');
assert.equal(manifest.dependencies?.['firebase-functions'], '7.0.0');

const sourceRequire = createRequire(resolve(sourceDirectory, 'package.json'));
const firebaseFunctionsEntrypoint = sourceRequire.resolve('firebase-functions');
sourceRequire('firebase-functions');
const lock = JSON.parse(readFileSync(resolve(sourceDirectory, 'package-lock.json'), 'utf8'));
assert.equal(lock.packages?.['node_modules/firebase-functions']?.version, '7.0.0');

console.log(`course-read packaging preflight PASS: Firebase detects firebase-functions@7.0.0 at ${firebaseFunctionsEntrypoint}`);
