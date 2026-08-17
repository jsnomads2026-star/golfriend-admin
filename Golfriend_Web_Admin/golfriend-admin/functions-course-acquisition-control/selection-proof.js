'use strict';
const fs = require('node:fs');
const source = fs.readFileSync(require.resolve('./index.js'), 'utf8');
const exportsFound = [...source.matchAll(/exports\.([A-Za-z0-9_]+)\s*=/g)].map((match) => match[1]);
if (exportsFound.length !== 1 || exportsFound[0] !== 'verifyGolfApiSecretBinding') throw Error(`EXPORT_SELECTION_INVALID:${exportsFound.join(',')}`);
for (const prohibited of ['fetch(', 'acquireCourseCandidates', 'syncCoursesFromProvider', 'nightlyCourseHealer', 'queryGolfApi']) if (source.includes(prohibited)) throw Error(`PROVIDER_INVOCATION_PRESENT:${prohibited}`);
console.log('course acquisition control selection proof PASS: one guarded metadata check, zero provider invocation');
