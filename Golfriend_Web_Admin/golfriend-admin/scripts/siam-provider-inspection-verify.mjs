import assert from 'node:assert/strict';
import fs from 'node:fs';
import {normalizeSiamInspection} from '../src/components/admin/v2/siamProviderInspectionModel.mjs';

const service=fs.readFileSync(new URL('../src/components/admin/v2/courseOperationsService.ts',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../src/components/admin/v2/V2SiamProviderInspector.tsx',import.meta.url),'utf8');
const host=fs.readFileSync(new URL('../src/components/admin/v2/V2CourseOperations.tsx',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
const callable=fs.readFileSync(new URL('../functions/src/courseIngestion.ts',import.meta.url),'utf8');

const empty=normalizeSiamInspection({});assert.deepEqual(empty.clubs,[]);assert.equal(empty.summary.providerCallsUsed,null);assert.deepEqual(empty.summary.unresolvedShells,[]);
const result=normalizeSiamInspection({clubs:[{clubID:'club-1',clubName:'Siam',listHadEmbeddedCourses:false,detailAddedCourseIDs:['course-2'],latitude:12.9,longitude:100.8,courses:[{courseID:'course-2',courseName:'Old Course'}]}],summary:{providerCallsUsed:2,unresolvedShells:[{clubID:'shell-1',clubName:'Shell'}]},secret:'never-render'});
assert.deepEqual(result,{clubs:[{clubID:'club-1',clubName:'Siam',listHadEmbeddedCourses:false,detailAddedCourseIDs:['course-2'],latitude:12.9,longitude:100.8,courses:[{courseID:'course-2',courseName:'Old Course',latitude:null,longitude:null}]}],summary:{providerCallsUsed:2,unresolvedShells:[{clubID:'shell-1',clubName:'Shell'}]}});

assert.match(service,/httpsCallable\(functions,'inspectGolfApiClubRegion'\)/);assert.match(service,/\{latitude:12\.9236,longitude:100\.8825,radiusKm:50,searchText:'Siam'\}/);assert.match(host,/V2SiamProviderInspector service=\{service\}/);assert.match(ui,/READ-ONLY PROVIDER INSPECTION — NO CATALOGUE WRITES/);assert.match(ui,/clubID/);assert.match(ui,/listHadEmbeddedCourses/);assert.match(ui,/detailAddedCourseIDs/);assert.match(ui,/courseID/);assert.match(ui,/summary\.providerCallsUsed/);assert.match(ui,/summary\.unresolvedShells/);assert.doesNotMatch(ui+service,/GOLF_API_KEY|Authorization|Bearer|token|headers|fetch\s*\(/i);assert.match(app,/access\.state === 'authorized'[\s\S]*V2AdminShell/);
const start=callable.indexOf('export const inspectGolfApiClubRegion');const body=callable.slice(start,callable.indexOf('export const commitCourseRegionImport',start));assert.match(body,/requireCoordinator\(request\.auth\.uid\)/);assert.match(body,/enforceAppCheck:\s*true/);assert.doesNotMatch(body,/\.set\(|\.create\(|\.update\(|\.batch\(|runTransaction|collection\("courses"/);
console.log('Siam provider inspection verification PASS: authorized Admin host, exact callable/payload, bounded field whitelist, empty handling, secret-free client, and zero catalogue-write callable.');
