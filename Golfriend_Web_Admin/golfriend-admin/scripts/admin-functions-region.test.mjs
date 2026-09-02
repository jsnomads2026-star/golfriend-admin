import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const adminRoot = join(root, 'src', 'components', 'admin');
const walk = (directory) => readdirSync(directory).flatMap((entry) => {
  const path = join(directory, entry);
  return statSync(path).isDirectory() ? walk(path) : [path];
});

const firebaseConfig = readFileSync(join(root, 'src', 'firebaseConfig.ts'), 'utf8');
assert.match(firebaseConfig, /export const FUNCTIONS_REGION = 'asia-southeast1';/);
assert.match(firebaseConfig, /getFunctions\(app, FUNCTIONS_REGION\)/);
assert.doesNotMatch(firebaseConfig, /getFunctions\(app\)(?!,)/);

const rawClients = walk(adminRoot)
  .filter((path) => /\.(ts|tsx)$/.test(path))
  .filter((path) => /getFunctions\s*\(/.test(readFileSync(path, 'utf8')));
assert.deepEqual(rawClients, [], `Admin must use the shared regional client: ${rawClients.join(', ')}`);

const app = readFileSync(join(root, 'src', 'App.tsx'), 'utf8');
const activeBookingRoute = app.match(/\{activeArea === 'bookings'[^\n]*/)?.[0] || '';
assert.match(activeBookingRoute, /<BookingOperationsV2\s*\/>/);
assert.doesNotMatch(activeBookingRoute, /BookingOversight|BookingAudit|PlayBookingLifecycleV2|BookingOperationsReportV2/);
console.log('admin functions region: shared asia-southeast1 client and V2 Booking Operations route verified.');
