'use strict';
const fs = require('node:fs');
const source = fs.readFileSync(require.resolve('./index.js'), 'utf8');
const exportsFound = [...source.matchAll(/exports\.([A-Za-z0-9_]+)\s*=/g)].map((match) => match[1]);
const prohibited = ['acquireCourseCandidates', 'syncCoursesFromProvider', 'nightlyCourseHealer', 'queryGolfApi'];
if (exportsFound.length !== 1 || exportsFound[0] !== 'getCourseAcquisitionDashboard') throw Error(`EXPORT_SELECTION_INVALID:${exportsFound.join(',')}`);
for (const name of prohibited) if (source.includes(name)) throw Error(`PROHIBITED_FUNCTION_PRESENT:${name}`);
if (/defineSecret|golfapi|https?:\/\//i.test(source)) throw Error('PROVIDER_CAPABILITY_PRESENT');
console.log('course-read selection proof PASS: one read-only export, zero provider capability');
