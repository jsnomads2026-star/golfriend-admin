import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { classifyPlayBookingDeskError, createBookingAcknowledgementReceipt, parseBookingDeskActionResult, parseBookingDeskMessageResult, parsePlayBookingDeskResponse, PLAY_BOOKING_DESK_STATUSES, validateBookingAcknowledgementReceipt } from '../src/components/B2B/bookingDeskProjection.mjs';

let passed = 0;
const test = (name, run) => { run(); passed += 1; console.log(`PASS ${name}`); };
const permissions = { read:true, message:true, confirm:true, alternative:true, cancel:true, complete:true };
const booking = (overrides = {}) => ({ bookingId:'booking_1', slotId:'slot_1', courseId:'course_1', date:'2026-08-20', time:'07:30', timeZone:'Asia/Bangkok', status:'pending', version:1, memberDisplayName:'Warm Golfer', alternative:null, lastMessageAt:null, ...overrides });
const response = (overrides = {}) => ({ schema:'golfriend.play-booking.v2', role:'manager', permissions, bookings:[booking()], notificationProviderConfigured:false, boundary:'PROVIDER_NEUTRAL_NO_FINANCIAL_OWNERSHIP', ...overrides });
const enterpriseResponse=(overrides={})=>({schema:'golfriend.play-booking.v2',projectionVersion:'golfriend.enterprise-booking-scope.v1',role:'organization_admin',permissions,bookings:[booking()],notificationProviderConfigured:false,boundary:'PROVIDER_NEUTRAL_NO_FINANCIAL_OWNERSHIP',courseIds:['course_1'],delegatedCourseIds:['course_1'],propertyIds:['property_1'],membershipId:'membership_1',sourceVersion:'a'.repeat(64),generatedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+60_000).toISOString(),freshness:'fresh',...overrides});

test('adapts the exact fresh enterprise authority projection',()=>{const result=parsePlayBookingDeskResponse(enterpriseResponse());assert.equal(result.state,'ready');assert.equal(result.projectionVersion,'golfriend.enterprise-booking-scope.v1');assert.equal(result.membershipId,'membership_1');assert.deepEqual(result.courseIds,['course_1']);assert(Object.isFrozen(result.propertyIds))});

test('enterprise role ceilings cannot be elevated by response permissions',()=>{for(const role of['course_manager','booking_staff']){const result=parsePlayBookingDeskResponse(enterpriseResponse({role}));assert.deepEqual(result.permissions,{read:true,message:true,confirm:true,alternative:true,cancel:false,complete:false})}const analyst=parsePlayBookingDeskResponse(enterpriseResponse({role:'analyst_viewer'}));assert.deepEqual(analyst.permissions,{read:true,message:false,confirm:false,alternative:false,cancel:false,complete:false})});

test('enterprise projection rejects stale unknown and cross-course authority',()=>{assert.equal(parsePlayBookingDeskResponse(enterpriseResponse({expiresAt:new Date(Date.now()-1).toISOString()})).state,'unavailable');assert.equal(parsePlayBookingDeskResponse(enterpriseResponse({freshness:'stale'})).state,'unavailable');assert.equal(parsePlayBookingDeskResponse(enterpriseResponse({unknown:true})).state,'unavailable');assert.equal(parsePlayBookingDeskResponse(enterpriseResponse({bookings:[booking({courseId:'course_2'})]})).reason,'cross_course_projection');assert.equal(parsePlayBookingDeskResponse(enterpriseResponse({delegatedCourseIds:['course_2']})).state,'unavailable')});

test('enterprise projection rejects private and unrecognized operation or receipt facts',()=>{for(const extra of[{memberUid:'private'},{pendingOperation:{operationId:'x'}},{receipts:[]}])assert.equal(parsePlayBookingDeskResponse(enterpriseResponse(extra)).state,'unavailable')});

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
  assert.equal(parsePlayBookingDeskResponse(response({bookings:[booking({status:'unknown'})]})).state, 'unavailable');
});

test('validates completed records but excludes them from the active queue without played claims',()=>{
  const result=parsePlayBookingDeskResponse(response({bookings:[booking({bookingId:'booking_done',status:'completed',version:8}),booking()]}));
  assert.equal(result.state,'ready');
  assert.deepEqual(result.bookings.map(item=>item.bookingId),['booking_1']);
  assert.equal(JSON.stringify(result).includes('booking_done'),false);
  assert.equal(JSON.stringify(result).includes('completed'),false);
  assert.equal(parsePlayBookingDeskResponse(response({bookings:[booking({status:'completed',memberUid:'private'})]})).state,'unavailable');
  assert.equal(parsePlayBookingDeskResponse(response({bookings:[booking({status:'completed',version:0})]})).state,'unavailable');
});

test('projects optional provider course terms and reference only when valid', () => {
  const result = parsePlayBookingDeskResponse(response({bookings:[booking({courseName:'Royal Course',provider:{providerId:'desk_1',displayName:'Course Desk'},cancellationTerms:'Cancel before the stated deadline.',receiptRef:'receipt_1'})]}));
  assert.deepEqual(result.bookings[0].course, {courseId:'course_1',name:'Royal Course'});
  assert.deepEqual(result.bookings[0].provider, {providerId:'desk_1',displayName:'Course Desk'});
  assert.equal(result.bookings[0].terms, 'Cancel before the stated deadline.');
  assert.equal(result.bookings[0].reference, 'receipt_1');
});

test('rejects contradictory duplicated terms and references',()=>{
  assert.equal(parsePlayBookingDeskResponse(response({bookings:[booking({terms:'A',cancellationTerms:'B'})]})).state,'unavailable');
  assert.equal(parsePlayBookingDeskResponse(response({bookings:[booking({reference:'one',receiptRef:'two'})]})).state,'unavailable');
  assert.equal(parsePlayBookingDeskResponse(response({bookings:[booking({terms:'A',cancellationTerms:'A',reference:'one',receiptRef:'one'})]})).state,'ready');
});

test('intersects supplied permissions with the frozen role ceiling',()=>{
  const support=parsePlayBookingDeskResponse(response({role:'support'})),analyst=parsePlayBookingDeskResponse(response({role:'analyst'}));
  assert.deepEqual(support.permissions,{read:true,message:true,confirm:false,alternative:false,cancel:false,complete:false});
  assert.deepEqual(analyst.permissions,{read:true,message:false,confirm:false,alternative:false,cancel:false,complete:false});
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
  assert.equal(validateBookingAcknowledgementReceipt(first),true);
  assert.equal(validateBookingAcknowledgementReceipt({...first,version:5}),false);
  assert.equal(validateBookingAcknowledgementReceipt({...first,receiptId:'bda_0000000000000000'}),false);
  assert.throws(()=>createBookingAcknowledgementReceipt({...input,memberUid:'secret'}));
  assert.throws(()=>createBookingAcknowledgementReceipt({...input,version:0}));
});

const serverId=(prefix,bookingId,commandId)=>`${prefix}_${createHash('sha256').update(`${bookingId}|${commandId}`).digest('hex').slice(0,32)}`;
test('strictly binds action result to booking action command transition version and receipt',()=>{
  const expected={bookingId:'booking_1',action:'confirm',commandId:'command_1',currentVersion:4,currentStatus:'pending'};
  const raw={success:true,bookingId:'booking_1',status:'confirmed',version:5,receiptId:serverId('pbr','booking_1','command_1'),notificationStatus:'PROVIDER_UNCONFIGURED'};
  const result=parseBookingDeskActionResult(raw,expected);
  assert.equal(result.state,'verified');assert.equal(result.status,'confirmed');assert(Object.isFrozen(result));
  for(const changed of [{success:false},{bookingId:'booking_2'},{status:'cancelled'},{version:6},{receiptId:'pbr_'+'0'.repeat(32)},{notificationStatus:'sent'},{unknown:true}])assert.equal(parseBookingDeskActionResult({...raw,...changed},expected).state,'unavailable');
  assert.equal(parseBookingDeskActionResult({...raw,status:'alternative_proposed'},expected).state,'unavailable');
  const alternative={...raw,status:'alternative_proposed',receiptId:serverId('pbr','booking_1','command_2')};
  assert.equal(parseBookingDeskActionResult(alternative,{...expected,action:'alternative',commandId:'command_2'}).state,'verified');
});

test('strictly binds message result to booking command and acknowledged facts',()=>{
  const expected={bookingId:'booking_1',commandId:'message_1',currentVersion:3,currentStatus:'confirmed'};
  const raw={success:true,messageId:serverId('pbm','booking_1','message_1'),notificationStatus:'queued'};
  const result=parseBookingDeskMessageResult(raw,expected);assert.equal(result.state,'verified');assert.equal(result.version,3);
  assert.equal(parseBookingDeskMessageResult({...raw,messageId:'pbm_'+'0'.repeat(32)},expected).state,'unavailable');
  assert.equal(parseBookingDeskMessageResult({...raw,success:false},expected).state,'unavailable');
  assert.equal(parseBookingDeskMessageResult({...raw,unknown:true},expected).state,'unavailable');
});

console.log(`${passed}/18 play booking desk projection tests PASS`);
