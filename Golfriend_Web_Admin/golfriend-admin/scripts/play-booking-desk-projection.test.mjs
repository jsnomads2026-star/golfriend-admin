import assert from 'node:assert/strict';
import { classifyPlayBookingDeskError, createBookingAcknowledgementReceipt, parsePlayBookingDeskResponse, PLAY_BOOKING_DESK_STATUSES } from '../src/components/B2B/bookingDeskProjection.mjs';

let passed = 0;
const test = (name, run) => { run(); passed += 1; console.log(`PASS ${name}`); };
const permissions = { read:true, message:true, confirm:true, alternative:true, cancel:true, complete:true };
const booking = (overrides = {}) => ({ bookingId:'booking_1', slotId:'slot_1', courseId:'course_1', date:'2026-08-20', time:'07:30', timeZone:'Asia/Bangkok', status:'pending', version:1, memberDisplayName:'Warm Golfer', alternative:null, lastMessageAt:null, ...overrides });
const response = (overrides = {}) => ({ schema:'golfriend.play-booking.v2', role:'manager', permissions, bookings:[booking()], notificationProviderConfigured:false, boundary:'PROVIDER_NEUTRAL_NO_FINANCIAL_OWNERSHIP', ...overrides });

test('accepts exact authoritative response and freezes every projection', () => {
  const result = parsePlayBookingDeskResponse(response());
  assert.equal(result.state, 'ready');
  assert.deepEqual(result.bookings[0].teeTime, { date:'2026-08-20', time:'07:30', timeZone:'Asia/Bangkok' });
  assert.equal(result.bookings[0].provider, null);
  assert(Object.isFrozen(result) && Object.isFrozen(result.bookings) && Object.isFrozen(result.bookings[0]));
});

test('maps authoritative alternative state to changed without exposing its message', () => {
  const result = parsePlayBookingDeskResponse(response({ bookings:[booking({ status:'alternative_proposed', alternative:{slotId:'slot_2', message:'private operational text'} })] }));
  assert.equal(result.state, 'ready');
  assert.equal(result.bookings[0].status, 'changed');
  assert.equal(JSON.stringify(result).includes('private operational text'), false);
});

test('accepts exact statuses and rejects all other lifecycle claims', () => {
  assert.deepEqual(PLAY_BOOKING_DESK_STATUSES, ['pending','confirmed','rejected','changed','cancelled','expired']);
  for (const status of PLAY_BOOKING_DESK_STATUSES) assert.equal(parsePlayBookingDeskResponse(response({bookings:[booking({status})]})).state, 'ready');
  assert.equal(parsePlayBookingDeskResponse(response({bookings:[booking({status:'completed'})]})).state, 'unavailable');
});

test('projects optional provider course terms and reference only when valid', () => {
  const result = parsePlayBookingDeskResponse(response({bookings:[booking({courseName:'Royal Course',provider:{providerId:'desk_1',displayName:'Course Desk'},cancellationTerms:'Cancel before the stated deadline.',receiptRef:'receipt_1'})]}));
  assert.deepEqual(result.bookings[0].course, {courseId:'course_1',name:'Royal Course'});
  assert.deepEqual(result.bookings[0].provider, {providerId:'desk_1',displayName:'Course Desk'});
  assert.equal(result.bookings[0].terms, 'Cancel before the stated deadline.');
  assert.equal(result.bookings[0].reference, 'receipt_1');
});

test('rejects unknown, private, identity and financial fields recursively', () => {
  for (const extra of [{unknown:'x'},{memberUid:'secret'},{organizationId:'org_1'},{payment:{amount:1}},{provider:{providerId:'desk_1',displayName:'Desk',secret:'x'}}]) {
    const result = parsePlayBookingDeskResponse(response({bookings:[booking(extra)]}));
    assert.equal(result.state, 'unavailable');
    assert.equal(JSON.stringify(result).includes('secret'), false);
  }
  assert.equal(parsePlayBookingDeskResponse({...response(), unknown:'x'}).state, 'unavailable');
});

test('rejects malformed IDs times versions permissions and oversized rows', () => {
  const invalid = [
    booking({bookingId:'../private'}), booking({date:'tomorrow'}), booking({time:'morning'}),
    booking({timeZone:'local'}), booking({version:0}), booking({memberDisplayName:'x'.repeat(81)}),
  ];
  for (const item of invalid) assert.equal(parsePlayBookingDeskResponse(response({bookings:[item]})).state, 'unavailable');
  assert.equal(parsePlayBookingDeskResponse(response({permissions:{...permissions,read:false}})).state, 'unavailable');
  assert.equal(parsePlayBookingDeskResponse(response({bookings:Array.from({length:201},()=>booking())})).state, 'unavailable');
});

test('fails closed when delegated course scope is absent or contradicted', () => {
  assert.equal(parsePlayBookingDeskResponse(response({role:'course_staff'})).state, 'delegated_scope_unavailable');
  assert.equal(parsePlayBookingDeskResponse(response({role:'course_staff',courseIds:['course_2']})).state, 'delegated_scope_unavailable');
  const ready = parsePlayBookingDeskResponse(response({role:'course_staff',courseIds:['course_1']}));
  assert.equal(ready.state, 'ready');
  assert.deepEqual(ready.delegatedCourseIds, ['course_1']);
});

test('classifies conflict stale and unavailable errors without exposing details', () => {
  assert.equal(classifyPlayBookingDeskError({code:'functions/aborted'}), 'conflict');
  assert.equal(classifyPlayBookingDeskError({message:'VERSION_CONFLICT'}), 'conflict');
  assert.equal(classifyPlayBookingDeskError({code:'functions/failed-precondition'}), 'stale');
  assert.equal(classifyPlayBookingDeskError({message:'SOURCE_VERSION_CONFLICT'}), 'conflict');
  assert.equal(classifyPlayBookingDeskError({code:'functions/permission-denied'}), 'unavailable');
});

test('creates stable immutable non-authoritative acknowledgement receipts', () => {
  const input = {bookingId:'booking_1',version:4,status:'confirmed',action:'acknowledge',commandId:'command_1'};
  const first = createBookingAcknowledgementReceipt(input), replay = createBookingAcknowledgementReceipt({...input});
  assert.deepEqual(first, replay);
  assert.match(first.receiptId, /^bda_[a-f0-9]{16}$/);
  assert.equal(first.authority, 'client_projection');
  assert.equal(first.transmissionIncluded, false);
  assert(Object.isFrozen(first));
  assert.throws(()=>createBookingAcknowledgementReceipt({...input,memberUid:'secret'}));
  assert.throws(()=>createBookingAcknowledgementReceipt({...input,version:0}));
});

console.log(`${passed}/9 play booking desk projection tests PASS`);
