const RESPONSE_SCHEMA = 'golfriend.play-booking.v2';
const BOUNDARY = 'PROVIDER_NEUTRAL_NO_FINANCIAL_OWNERSHIP';
const ROLES = new Set(['primary_owner', 'manager', 'course_staff', 'support', 'analyst']);
const ENTERPRISE_ROLES = new Set(['organization_owner','organization_admin','course_manager','booking_staff','analyst_viewer']);
const STATUSES = new Set(['pending', 'confirmed', 'rejected', 'changed', 'cancelled', 'expired']);
const ACTIONS = new Set(['confirm', 'alternative', 'cancel', 'complete', 'message', 'acknowledge']);
const RESPONSE_KEYS = new Set(['schema', 'role', 'permissions', 'bookings', 'notificationProviderConfigured', 'boundary', 'courseIds', 'delegatedCourseIds']);
const ENTERPRISE_SCOPE_VERSION = 'golfriend.enterprise-booking-scope.v1';
const RESPONSE_KEYS_V2 = new Set(['schema','role','permissions','bookings','notificationProviderConfigured','boundary','courseIds','delegatedCourseIds','propertyIds','membershipId','projectionVersion','sourceVersion','generatedAt','expiresAt','freshness']);
const PERMISSION_KEYS = Object.freeze(['read', 'message', 'confirm', 'alternative', 'cancel', 'complete']);
const ROLE_PERMISSIONS = freezePermissions({
  primary_owner: { read:true, message:true, confirm:true, alternative:true, cancel:true, complete:true },
  manager: { read:true, message:true, confirm:true, alternative:true, cancel:true, complete:true },
  course_staff: { read:true, message:true, confirm:true, alternative:true, cancel:false, complete:true },
  support: { read:true, message:true, confirm:false, alternative:false, cancel:false, complete:false },
  analyst: { read:true, message:false, confirm:false, alternative:false, cancel:false, complete:false },
});
const ENTERPRISE_ROLE_PERMISSIONS = freezePermissions({
  organization_owner:{read:true,message:true,confirm:true,alternative:true,cancel:true,complete:true},
  organization_admin:{read:true,message:true,confirm:true,alternative:true,cancel:true,complete:true},
  course_manager:{read:true,message:true,confirm:true,alternative:true,cancel:false,complete:false},
  booking_staff:{read:true,message:true,confirm:true,alternative:true,cancel:false,complete:false},
  analyst_viewer:{read:true,message:false,confirm:false,alternative:false,cancel:false,complete:false},
});
const BOOKING_KEYS = new Set(['bookingId', 'slotId', 'courseId', 'date', 'time', 'timeZone', 'status', 'version', 'memberDisplayName', 'alternative', 'lastMessageAt', 'courseName', 'provider', 'cancellationTerms', 'terms', 'receiptRef', 'reference']);
const PROVIDER_KEYS = new Set(['providerId', 'displayName']);
const FORBIDDEN_KEY = /(memberUid|organizationId|playerUid|email|phone|address|private|secret|token|price|amount|fee|payment|wallet|ledger|settlement|refund|payout|escrow)/i;
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{1,159}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const ZONE = /^(UTC|[A-Za-z_]+\/[A-Za-z0-9_+.-]+)$/;
const NOTIFICATION = new Set(['queued', 'PROVIDER_UNCONFIGURED']);
const COMPLETED_OUT_OF_QUEUE = Symbol('completed_out_of_active_queue');

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value, allowed) => record(value) && Object.keys(value).every(key => allowed.has(key));
const bounded = (value, max) => typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= max ? value : null;
const id = value => { const clean = bounded(value, 160); return clean && ID.test(clean) ? clean : null; };
const iso = value => { const clean = bounded(value, 40); return clean && Number.isFinite(Date.parse(clean)) ? new Date(clean).toISOString() : null; };
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
const unavailable = reason => freeze({ state: 'unavailable', reason, bookings: [] });

function freezePermissions(value) {
  for (const role of Object.keys(value)) Object.freeze(value[role]);
  return Object.freeze(value);
}

function containsForbiddenKey(value) {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(containsForbiddenKey);
  return Object.entries(value).some(([key, nested]) => FORBIDDEN_KEY.test(key) || containsForbiddenKey(nested));
}

function permissions(value, role, ceilings=ROLE_PERMISSIONS) {
  if (!exact(value, new Set(PERMISSION_KEYS))) return null;
  if (PERMISSION_KEYS.some(key => typeof value[key] !== 'boolean')) return null;
  if (value.read !== true) return null;
  const ceiling = ceilings[role];
  if (!ceiling) return null;
  return freeze(Object.fromEntries(PERMISSION_KEYS.map(key => [key, value[key] === true && ceiling[key] === true])));
}

function provider(value) {
  if (value === undefined || value === null) return null;
  if (!exact(value, PROVIDER_KEYS)) return undefined;
  const providerId = id(value.providerId), displayName = bounded(value.displayName, 80);
  return providerId && displayName ? freeze({ providerId, displayName }) : undefined;
}

function alternative(value) {
  if (value === undefined || value === null) return true;
  if (!record(value) || Object.keys(value).some(key => !['slotId', 'message'].includes(key))) return false;
  return Boolean(id(value.slotId));
}

function booking(value) {
  if (!exact(value, BOOKING_KEYS) || containsForbiddenKey(value) || !alternative(value.alternative)) return null;
  const bookingId = id(value.bookingId), slotId = id(value.slotId), courseId = id(value.courseId);
  const date = bounded(value.date, 10), time = bounded(value.time, 5), timeZone = bounded(value.timeZone, 80);
  const rawStatus = value.status === 'alternative_proposed' ? 'changed' : value.status;
  const version = value.version;
  const memberDisplayName = bounded(value.memberDisplayName, 80);
  if (!bookingId || !slotId || !courseId || !date || !DATE.test(date) || !time || !TIME.test(time) || !timeZone || !ZONE.test(timeZone) || (!STATUSES.has(rawStatus) && rawStatus !== 'completed') || !Number.isInteger(version) || version < 1 || !memberDisplayName) return null;
  const providerFact = provider(value.provider);
  if (providerFact === undefined) return null;
  const courseName = value.courseName === undefined || value.courseName === null ? null : bounded(value.courseName, 120);
  const terms = value.cancellationTerms ?? value.terms;
  const reference = value.receiptRef ?? value.reference;
  if (value.cancellationTerms != null && value.terms != null && value.cancellationTerms !== value.terms) return null;
  if (value.receiptRef != null && value.reference != null && value.receiptRef !== value.reference) return null;
  const termsFact = terms === undefined || terms === null ? null : bounded(terms, 1000);
  const referenceFact = reference === undefined || reference === null ? null : id(reference);
  const lastMessageAt = value.lastMessageAt === undefined || value.lastMessageAt === null ? null : iso(value.lastMessageAt);
  if ((value.courseName != null && !courseName) || (terms != null && !termsFact) || (reference != null && !referenceFact) || (value.lastMessageAt != null && !lastMessageAt)) return null;
  if (rawStatus === 'completed') return COMPLETED_OUT_OF_QUEUE;
  return freeze({
    bookingId, slotId, courseId, status: rawStatus, version, memberDisplayName,
    course: freeze({ courseId, name: courseName }),
    teeTime: freeze({ date, time, timeZone }),
    provider: providerFact,
    terms: termsFact,
    reference: referenceFact,
    lastMessageAt,
  });
}

function delegatedCourseIds(raw) {
  const supplied = raw.delegatedCourseIds ?? raw.courseIds;
  if (!Array.isArray(supplied) || supplied.length === 0 || supplied.length > 100) return null;
  const ids = supplied.map(id);
  return ids.every(Boolean) && new Set(ids).size === ids.length ? freeze(ids) : null;
}

function exactIds(value,max=100){if(!Array.isArray(value)||value.length===0||value.length>max)return null;const values=value.map(id);return values.every(Boolean)&&new Set(values).size===values.length?freeze(values):null}

function parseEnterpriseResponse(raw) {
  if (!exact(raw, RESPONSE_KEYS_V2) || containsForbiddenKey(raw) || raw.schema!==RESPONSE_SCHEMA || raw.boundary!==BOUNDARY || raw.projectionVersion!==ENTERPRISE_SCOPE_VERSION || raw.freshness!=='fresh' || !ENTERPRISE_ROLES.has(raw.role) || typeof raw.notificationProviderConfigured!=='boolean' || !Array.isArray(raw.bookings) || raw.bookings.length>200) return unavailable('response_invalid');
  const membershipId=id(raw.membershipId),sourceVersion=bounded(raw.sourceVersion,64),generatedAt=iso(raw.generatedAt),expiresAt=iso(raw.expiresAt),courseIds=exactIds(raw.courseIds),delegated=exactIds(raw.delegatedCourseIds),propertyIds=exactIds(raw.propertyIds);
  if(!membershipId||!sourceVersion||!/^[a-f0-9]{64}$/.test(sourceVersion)||!generatedAt||!expiresAt||Date.parse(generatedAt)>=Date.parse(expiresAt)||Date.parse(expiresAt)<=Date.now()||!courseIds||!delegated||!propertyIds||delegated.some(courseId=>!courseIds.includes(courseId)))return unavailable('scope_invalid');
  const allowed=permissions(raw.permissions,raw.role,ENTERPRISE_ROLE_PERMISSIONS);if(!allowed)return unavailable('permissions_invalid');
  const parsedBookings=raw.bookings.map(booking);if(parsedBookings.some(item=>item===null))return unavailable('booking_projection_invalid');const bookings=parsedBookings.filter(item=>item!==COMPLETED_OUT_OF_QUEUE);
  if(bookings.some(item=>!courseIds.includes(item.courseId)))return unavailable('cross_course_projection');
  return freeze({state:'ready',schema:RESPONSE_SCHEMA,projectionVersion:ENTERPRISE_SCOPE_VERSION,role:raw.role,permissions:allowed,notificationProviderConfigured:raw.notificationProviderConfigured,boundary:BOUNDARY,membershipId,courseIds,delegatedCourseIds:delegated,propertyIds,sourceVersion,generatedAt,expiresAt,freshness:'fresh',bookings:freeze(bookings)});
}

export function parsePlayBookingDeskResponse(raw) {
  if(record(raw)&&Object.prototype.hasOwnProperty.call(raw,'projectionVersion'))return parseEnterpriseResponse(raw);
  if (!exact(raw, RESPONSE_KEYS) || containsForbiddenKey(raw)) return unavailable('response_invalid');
  if (raw.schema !== RESPONSE_SCHEMA || raw.boundary !== BOUNDARY || !ROLES.has(raw.role) || typeof raw.notificationProviderConfigured !== 'boolean' || !Array.isArray(raw.bookings) || raw.bookings.length > 200) return unavailable('response_invalid');
  const allowed = permissions(raw.permissions, raw.role);
  if (!allowed) return unavailable('permissions_invalid');
  const parsedBookings = raw.bookings.map(booking);
  if (parsedBookings.some(item => item === null)) return unavailable('booking_projection_invalid');
  const bookings = parsedBookings.filter(item => item !== COMPLETED_OUT_OF_QUEUE);
  const delegated = raw.role === 'course_staff' ? delegatedCourseIds(raw) : null;
  if (raw.role === 'course_staff' && (!delegated || bookings.some(item => !delegated.includes(item.courseId)))) {
    return freeze({ state: 'delegated_scope_unavailable', reason: 'delegated_scope_unproven', bookings: [] });
  }
  return freeze({
    state: 'ready', schema: RESPONSE_SCHEMA, role: raw.role, permissions: allowed,
    notificationProviderConfigured: raw.notificationProviderConfigured,
    boundary: BOUNDARY, delegatedCourseIds: delegated,
    bookings: freeze(bookings),
  });
}

export function classifyPlayBookingDeskError(error) {
  const code = String(error?.code || error?.name || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  const fact = `${code} ${message}`;
  if (/aborted|already-exists|version[_ -]?conflict|\bconflict\b/.test(fact)) return 'conflict';
  if (/stale|source[_ -]?version|failed-precondition/.test(fact)) return 'stale';
  return 'unavailable';
}

function stableHash(value) {
  let a = 0x811c9dc5, b = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    a = Math.imul(a ^ code, 0x01000193) >>> 0;
    b = Math.imul(b ^ code, 0x85ebca6b) >>> 0;
  }
  return `${a.toString(16).padStart(8, '0')}${b.toString(16).padStart(8, '0')}`;
}

function sha256(value) {
  const bytes = new TextEncoder().encode(value), words = [], bitLength = bytes.length * 8;
  for (const byte of bytes) words.push(byte);
  words.push(0x80);
  while (words.length % 64 !== 56) words.push(0);
  for (let shift = 56; shift >= 0; shift -= 8) words.push(Math.floor(bitLength / 2 ** shift) & 255);
  const k = [], primes = [];
  for (let candidate = 2; primes.length < 64; candidate += 1) {
    if (primes.every(prime => candidate % prime)) {
      primes.push(candidate);
      k.push((Math.cbrt(candidate) % 1 * 0x100000000) >>> 0);
    }
  }
  let hash = primes.slice(0, 8).map(prime => (Math.sqrt(prime) % 1 * 0x100000000) >>> 0);
  const rotate = (word, bits) => (word >>> bits) | (word << (32 - bits));
  for (let offset = 0; offset < words.length; offset += 64) {
    const schedule = new Array(64);
    for (let index = 0; index < 16; index += 1) schedule[index] = ((words[offset + index * 4] << 24) | (words[offset + index * 4 + 1] << 16) | (words[offset + index * 4 + 2] << 8) | words[offset + index * 4 + 3]) >>> 0;
    for (let index = 16; index < 64; index += 1) {
      const x = schedule[index - 15], y = schedule[index - 2];
      const s0 = rotate(x, 7) ^ rotate(x, 18) ^ (x >>> 3), s1 = rotate(y, 17) ^ rotate(y, 19) ^ (y >>> 10);
      schedule[index] = (schedule[index - 16] + s0 + schedule[index - 7] + s1) >>> 0;
    }
    let [a,b,c,d,e,f,g,h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const s1 = rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25), choose = (e & f) ^ (~e & g);
      const t1 = (h + s1 + choose + k[index] + schedule[index]) >>> 0;
      const s0 = rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22), majority = (a & b) ^ (a & c) ^ (b & c), t2 = (s0 + majority) >>> 0;
      h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;
    }
    hash = hash.map((word, index) => (word + [a,b,c,d,e,f,g,h][index]) >>> 0);
  }
  return hash.map(word => word.toString(16).padStart(8, '0')).join('');
}

const actionUnavailable = reason => freeze({ state:'unavailable', reason });
const actionTransitions = Object.freeze({
  confirm: Object.freeze({ pending:'confirmed', changed:'confirmed' }),
  alternative: Object.freeze({ pending:'changed' }),
  cancel: Object.freeze({ pending:'cancelled', changed:'cancelled', confirmed:'cancelled' }),
});

function expectedAction(value) {
  if (!exact(value, new Set(['bookingId','action','commandId','currentVersion','currentStatus']))) return null;
  const bookingId = id(value.bookingId), commandId = id(value.commandId), transitions = actionTransitions[value.action];
  const nextStatus = transitions?.[value.currentStatus];
  if (!bookingId || !commandId || !Number.isInteger(value.currentVersion) || value.currentVersion < 1 || !nextStatus) return null;
  return { bookingId, commandId, action:value.action, currentVersion:value.currentVersion, currentStatus:value.currentStatus, nextStatus };
}

export function parseBookingDeskActionResult(raw, expected) {
  const fact = expectedAction(expected);
  const keys = new Set(['success','bookingId','status','version','receiptId','notificationStatus']);
  if (!fact || !exact(raw, keys) || raw.success !== true || !NOTIFICATION.has(raw.notificationStatus)) return actionUnavailable('action_result_invalid');
  const rawStatus = raw.status === 'alternative_proposed' ? 'changed' : raw.status;
  const receiptId = `pbr_${sha256(`${fact.bookingId}|${fact.commandId}`).slice(0,32)}`;
  if (raw.bookingId !== fact.bookingId || rawStatus !== fact.nextStatus || raw.version !== fact.currentVersion + 1 || raw.receiptId !== receiptId) return actionUnavailable('action_result_mismatch');
  return freeze({ state:'verified', bookingId:fact.bookingId, action:fact.action, commandId:fact.commandId, previousStatus:fact.currentStatus, status:fact.nextStatus, previousVersion:fact.currentVersion, version:raw.version, receiptId, notificationStatus:raw.notificationStatus });
}

export function parseBookingDeskMessageResult(raw, expected) {
  if (!exact(expected, new Set(['bookingId','commandId','currentVersion','currentStatus']))) return actionUnavailable('message_result_invalid');
  const bookingId = id(expected.bookingId), commandId = id(expected.commandId);
  const keys = new Set(['success','messageId','notificationStatus']);
  if (!bookingId || !commandId || !Number.isInteger(expected.currentVersion) || expected.currentVersion < 1 || !STATUSES.has(expected.currentStatus) || !exact(raw, keys) || raw.success !== true || !NOTIFICATION.has(raw.notificationStatus)) return actionUnavailable('message_result_invalid');
  const messageId = `pbm_${sha256(`${bookingId}|${commandId}`).slice(0,32)}`;
  if (raw.messageId !== messageId) return actionUnavailable('message_result_mismatch');
  return freeze({ state:'verified', bookingId, action:'message', commandId, status:expected.currentStatus, version:expected.currentVersion, messageId, notificationStatus:raw.notificationStatus });
}

export function createBookingAcknowledgementReceipt(input) {
  if (!exact(input, new Set(['bookingId', 'version', 'status', 'action', 'commandId']))) throw new TypeError('Acknowledgement input is invalid.');
  const bookingId = id(input.bookingId), commandId = id(input.commandId);
  if (!bookingId || !commandId || !Number.isInteger(input.version) || input.version < 1 || !STATUSES.has(input.status) || !ACTIONS.has(input.action)) throw new TypeError('Acknowledgement input is invalid.');
  const canonical = `${bookingId}|${input.version}|${input.status}|${input.action}|${commandId}`;
  return freeze({
    schema: 'golfriend.portal.booking-acknowledgement.v1',
    receiptId: `bda_${stableHash(canonical)}`,
    bookingId, version: input.version, status: input.status, action: input.action, commandId,
    authority: 'client_projection', immutable: true, transmissionIncluded: false,
  });
}

export function validateBookingAcknowledgementReceipt(value) {
  if (!exact(value, new Set(['schema','receiptId','bookingId','version','status','action','commandId','authority','immutable','transmissionIncluded']))) return false;
  try {
    const expected = createBookingAcknowledgementReceipt({ bookingId:value.bookingId, version:value.version, status:value.status, action:value.action, commandId:value.commandId });
    return Object.keys(expected).every(key => expected[key] === value[key]);
  } catch { return false; }
}

export const PLAY_BOOKING_DESK_STATUSES = freeze([...STATUSES]);
