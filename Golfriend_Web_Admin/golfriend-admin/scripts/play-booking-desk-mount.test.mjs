import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const small = read('src/components/B2B/SmallBusinessDashboard.tsx');
const enterprise = read('src/components/B2B/EnterpriseDashboard.tsx');

assert.match(small, /<EnterpriseBookingCoordinationDesk\s*\/>/);
assert.match(enterprise, /<EnterpriseBookingCoordinationDesk\s*\/>/);
assert.doesNotMatch(small, /BookingRequests/);
assert.doesNotMatch(enterprise, /BookingRequests/);
assert.doesNotMatch(small, /respondBooking|cancelBooking|sendBookingMessage/);

console.log('Portal booking desk has one callable-backed mounted lifecycle per partner surface.');
