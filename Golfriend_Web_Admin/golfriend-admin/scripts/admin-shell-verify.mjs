import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const shell = read('src/components/admin/v2/V2AdminShell.tsx');
const css = read('src/components/admin/v2/V2AdminShell.css');
const nav = read('src/components/admin/v2/adminNavigation.ts');
const app = read('src/App.tsx');
const failures = [];
const requireText = (source, value, label) => { if (!source.includes(value)) failures.push(label); };
const requireRegex = (source, pattern, label) => { if (!pattern.test(source)) failures.push(label); };

for (const component of ['CourseSeeder', 'TeeTimeInventory', 'CourseSyncConsole', 'CourseTeeSheet', 'BookingOversight', 'BookingAudit', 'PartnerVault', 'SponsorDashboard', 'VendorControlSystem', 'OemProductForge', 'BuyerCustomerCRM', 'V2AdminReports']) requireText(app, `<${component}`, `unreachable ${component}`);
requireText(app, 'isAdminArea(requestedArea)', 'route parameter is not allowlisted');
requireText(app, "setSearchParams(area === 'overview' ? {} : { area })", 'navigation is not URL-addressable');
requireText(shell, 'aria-current={activeArea === area.id', 'active navigation state is missing');
requireText(shell, 'aria-expanded={menuOpen}', 'responsive menu disclosure is missing');
requireText(css, '@media(max-width:860px)', 'narrow breakpoint is missing');
requireText(css, 'transform:translateX(-102%)', 'off-canvas narrow navigation is missing');

for (const locale of ['en', 'th', 'ko', 'ja', 'zh', 'es', 'fr', 'de']) {
  requireText(shell, `${locale}: {`, `missing shell locale ${locale}`);
}

requireRegex(shell, /adminTitle:/, 'missing adminTitle copy key');
requireRegex(shell, /adminIdentity:/, 'missing adminIdentity copy key');
requireRegex(shell, /menu:/, 'missing menu copy key');
requireRegex(shell, /primaryNavigation:/, 'missing primaryNavigation copy key');
requireRegex(shell, /closeNavigation:/, 'missing closeNavigation copy key');
requireText(shell, 'const COPY: Record<AdminLocale, typeof EN>', 'shell locale contract is not record-based');
for (const locale of ['en', 'th', 'ko', 'ja', 'zh', 'es', 'fr', 'de']) {
  requireText(shell, `${locale}: {`, `shell locale block missing for ${locale}`);
}

if (/stripe|tee.?time payment/i.test(shell)) failures.push('financial tee-time behavior introduced');
for (const area of ['overview', 'courses', 'bookings', 'partners', 'marketing', 'advertising', 'exchange', 'reports']) {
  requireText(nav, `id: '${area}'`, `navigation area missing ${area}`);
}
for (const locale of ['en', 'th', 'ko', 'ja', 'zh', 'es', 'fr', 'de']) {
  requireText(nav, `${locale}: {`, `navigation locale missing ${locale}`);
}

if (failures.length) {
  console.error(`Admin shell verification FAILED (${failures.length})`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Admin shell verification PASS: V2 admin shell localization, locale ownership, route allowlist, and responsive navigation.');
