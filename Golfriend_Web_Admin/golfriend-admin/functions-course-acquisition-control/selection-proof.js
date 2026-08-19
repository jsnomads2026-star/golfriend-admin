'use strict';
const fs = require('node:fs');
const source = fs.readFileSync(require.resolve('./index.js'), 'utf8');
const exportsFound = [...source.matchAll(/exports\.([A-Za-z0-9_]+)\s*=/g)].map((match) => match[1]);
if (exportsFound.length !== 1 || exportsFound[0] !== 'verifyGolfApiSecretBinding') throw Error(`EXPORT_SELECTION_INVALID:${exportsFound.join(',')}`);
for (const prohibited of ['fetch(', 'defineSecret', 'GOLF_API_KEY', 'createHash', 'fingerprint', 'acquireCourseCandidates', 'syncCoursesFromProvider', 'nightlyCourseHealer', 'queryGolfApi']) if (source.includes(prohibited)) throw Error(`PROVIDER_INVOCATION_PRESENT:${prohibited}`);
if (!source.includes('PROVIDER_CONTROL_PATH_RETIRED')) throw Error('RETIRED_CONTROL_NOT_FAIL_CLOSED');
console.log('course acquisition control selection proof PASS: one fail-closed compatibility export, zero secret or provider access');
