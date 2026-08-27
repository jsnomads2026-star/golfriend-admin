'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('./index.js'),'utf8');
test('global automatic refresh defaults disabled and gates every worker claim',()=>{assert.match(source,/return\{enabled:value\.enabled===true/);assert.match(source,/const policy=await countryRefreshPolicy\(\);if\(!policy\.enabled\)return null/);});
test('one Director enable enrolls known countries without provider or course writes',()=>{assert.match(source,/exports\.setCourseCountryAutoRefresh=onCall/);assert.match(source,/await director\(request\)/);assert.match(source,/providerCalls:0,courseWrites:0/);assert.match(source,/filter\(country=>country!=='UNKNOWN'\)/);});
test('global preview is read-only and the Director status gate normalizes active status',()=>{assert.match(source,/exports\.previewCourseCountryAutoRefresh=onCall/);assert.match(source,/quotaEffect:'none'/);assert.match(source,/value\.status\.trim\(\)\.toLocaleLowerCase\(\)==='active'/);});
test('paused and failed country jobs are preserved during enrollment',()=>assert.match(source,/\['paused','failed','queued','running'\]\.includes\(existing\.state\)/));
test('quota ordering and continuous requeue remain policy-driven',()=>{assert.match(source,/countrySchedule\.eligibility\(item\.job,quota,now\)/);assert.match(source,/countrySchedule\.nextCycle\(claim\.job,coverage,quota,now,claim\.policy\)/);});
