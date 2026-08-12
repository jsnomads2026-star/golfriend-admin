import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ADMIN_AREAS, ADMIN_LOCALES } from '../src/components/admin/v2/adminNavigation.ts';
import { CAPABILITY_IDS, COMMISSIONING_CONTRACTS, COMMISSIONING_LOCALES, COMMISSIONING_REGISTRY, DEFAULT_COMMISSIONING_ADAPTERS, validateCommissioningRegistry } from '../src/components/admin/v2/commissioningContracts.ts';
import { generateReport, periodRange, REPORT_LOCALES, REPORT_SCHEMA, REPORT_SECTIONS, reportToCsv, reportToJson, reportToTxt } from '../src/components/admin/v2/reportingModel.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const walk = (directory) => fs.readdirSync(directory, { withFileTypes:true }).flatMap((entry) => entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
const run = (args) => {
  const npmCli = process.env.npm_execpath;
  const result = npmCli
    ? spawnSync(process.execPath, [npmCli, ...args], { cwd:root, stdio:'inherit', shell:false })
    : spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, { cwd:root, stdio:'inherit', shell:process.platform === 'win32' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};

const expectedAreas = ['overview','courses','bookings','partners','marketing','advertising','exchange','reports'];
const expectedLocales = ['en','th','ko','ja','zh','es','fr','de'];
const expectedCapabilities = ['marketing.asset-storage','partners.request-intake','partners.decision-submit','courses.preview-apply','booking.report-ingest','advertising-oem.report-ingest','service-health.report-ingest','jhcc.report-transmit'];
assert.deepEqual(ADMIN_AREAS.map((area) => area.id), expectedAreas);
assert.deepEqual(ADMIN_LOCALES, expectedLocales);
assert.deepEqual(COMMISSIONING_LOCALES, expectedLocales);
assert.deepEqual(REPORT_LOCALES, expectedLocales);
assert.deepEqual(CAPABILITY_IDS, expectedCapabilities);
assert.equal(new Set(CAPABILITY_IDS).size, CAPABILITY_IDS.length);
assert.deepEqual(validateCommissioningRegistry(), []);
assert.ok(COMMISSIONING_REGISTRY.every((entry) => entry.currentState !== 'commissioned'));
assert.ok(COMMISSIONING_REGISTRY.every((entry) => entry.sourceEvidence && entry.explanation));
assert.ok(Object.values(DEFAULT_COMMISSIONING_ADAPTERS).every((adapter) => adapter === null));
assert.equal(new Set(COMMISSIONING_CONTRACTS.map((contract) => contract.schema.name)).size, COMMISSIONING_CONTRACTS.length);
assert.ok(COMMISSIONING_CONTRACTS.every((contract) => contract.schema.version === 1));
assert.equal(REPORT_SCHEMA, 'golfriend.admin.operations-report.v1');

const app = read('src/App.tsx');
const navigation = read('src/components/admin/v2/adminNavigation.ts');
const shell = read('src/components/admin/v2/V2AdminShell.tsx');
const shellCss = read('src/components/admin/v2/V2AdminShell.css');
const readinessUi = read('src/components/admin/v2/CommissioningReadiness.tsx');
const readinessCss = read('src/components/admin/v2/CommissioningReadiness.css');
const course = read('src/components/admin/v2/V2CourseOperations.tsx');
const marketing = read('src/components/admin/v2/V2MarketingLibrary.tsx');
const partners = read('src/components/admin/v2/V2PartnerOperations.tsx');
const partnerProvider = read('src/components/admin/v2/partnerOperationsProvider.ts');
const reports = read('src/components/admin/v2/V2AdminReports.tsx');
const reportingProvider = read('src/components/admin/v2/reportingProvider.ts');
for (const area of expectedAreas) assert.match(app, new RegExp(`activeArea === '${area}'`));
assert.match(app, /isAdminArea\(requestedArea\)/);
assert.doesNotMatch(app, /activeArea === '(photos|escrow|fiat|ledger|bank|tournaments|fulfillment|b2b)'/);
assert.doesNotMatch(navigation + readinessUi, /\bar\s*:/);
assert.match(shell, /AdminLocaleContext\.Provider/);
assert.match(shell, /aria-current=/);
assert.match(shell, /aria-expanded=/);
assert.match(readinessUi, /<table>/);
assert.match(readinessUi, /scope="col"/);
assert.match(readinessUi, /scope="row"/);
assert.match(readinessUi, /entry\.sourceEvidence/);
assert.match(shellCss + readinessCss, /:focus-visible/);
assert.match(shellCss + readinessCss, /min-height:44px/);
assert.match(shellCss, /overflow-x:hidden/);
assert.match(readinessCss, /overflow-x:auto/);
assert.match(shellCss + readinessCss, /prefers-reduced-motion:reduce/);
assert.match(course, /preview\?\.results\.filter\(\(row\)=>row\.result==='updated'\)/);
assert.doesNotMatch(course, /service\.sync\(\{mode:'apply',limit\}\)/);
assert.match(marketing, /local-preview/i);
assert.match(partners, /No approved request backend or decision service is configured/);
assert.match(partnerProvider, /decisionService:null/);
assert.match(reports, /disabled=\{!transmitter\}/);
assert.match(reportingProvider, /Excluded from production totals/);
assert.match(reportingProvider, /defaultReportTransmitter:null=null/);

const v2Sources = walk(path.join(root, 'src/components/admin/v2')).filter((file) => /\.(ts|tsx|mjs)$/.test(file)).map((file) => fs.readFileSync(file, 'utf8')).join('\n');
assert.doesNotMatch(v2Sources, /setDoc\s*\(|updateDoc\s*\(|addDoc\s*\(|deleteDoc\s*\(|writeBatch\s*\(/);
assert.doesNotMatch(v2Sources, /GOLF_API_KEY|client_secret|private_key|Bearer\s+/i);
assert.doesNotMatch(marketing + partners + reports + readinessUi + reportingProvider, /fetch\s*\(|XMLHttpRequest|sendEmail|setInterval\s*\(|\.send\s*\(/i);
assert.doesNotMatch(marketing + partners + reports + readinessUi, /published successfully|partner approved|account created|campaign delivered|JHCC received|transmission successful/i);

const sources = Object.fromEntries(REPORT_SECTIONS.map((id) => [id, { kind:id === 'marketing_store' ? 'local-preview' : 'unavailable', label:`source:${id}`, updatedAt:'2026-08-12', metrics:{ previewCount:1 }, limitations:['Release gate limitation'] }]));
const report = generateReport({ period:periodRange('today', new Date('2026-08-12T00:00:00Z')), sources, generatedAt:'2026-08-12T00:00:00.000Z' });
assert.deepEqual(JSON.parse(reportToJson(report)), report);
assert.match(reportToTxt(report), /source:marketing_store/);
assert.match(reportToTxt(report), /Release gate limitation/);
assert.match(reportToCsv(report), /"source_label","source_timestamp","limitations"/);
assert.match(reportToCsv(report), /Release gate limitation/);

console.log('Admin release source contracts PASS: 8 routes, 8 locales, 8 capabilities, schemas/adapters, authority, honesty, exports, accessibility and responsive boundaries.');
run(['run','build']);
run(['run','gate']);
run(['audit','--omit=dev']);
console.log('Admin release gate PASS: production build, full Lane B gate (including every Admin verifier), and production dependency audit.');
