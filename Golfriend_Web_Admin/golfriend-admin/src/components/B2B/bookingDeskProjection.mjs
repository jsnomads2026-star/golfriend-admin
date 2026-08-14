const RESPONSE_SCHEMA = 'golfriend.play-booking.v2';
const BOUNDARY = 'PROVIDER_NEUTRAL_NO_FINANCIAL_OWNERSHIP';
const ROLES = new Set(['primary_owner', 'manager', 'course_staff', 'support', 'analyst']);
const STATUSES = new Set(['pending', 'confirmed', 'rejected', 'changed', 'cancelled', 'expired']);
const ACTIONS = new Set(['confirm', 'alternative', 'cancel', 'complete', 'message', 'acknowledge']);
const RESPONSE_KEYS = new Set(['schema', 'role', 'permissions', 'bookings', 'notificationProviderConfigured', 'boundary', 'courseIds', 'delegatedCourseIds']);
const PERMISSION_KEYS = Object.freeze(['read', 'message', 'confirm', 'alternative', 'cancel', 'complete']);
const BOOKING_KEYS = new Set(['bookingId', 'slotId', 'courseId', 'date', 'time', 'timeZone', 'status', 'version', 'memberDisplayName', 'alternative', 'lastMessageAt', 'courseName', 'provider', 'cancellationTerms', 'terms', 'receiptRef', 'reference']);
const PROVIDER_KEYS = new Set(['providerId', 'displayName']);
const FORBIDDEN_KEY = /(memberUid|organizationId|playerUid|email|phone|address|private|secret|token|price|amount|fee|payment|wallet|ledger|settlement|refund|payout|escrow)/i;
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{1,159}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const ZONE = /^(UTC|[A-Za-z_]+\/[A-Za-z0-9_+.-]+)$/;

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

function containsForbiddenKey(value) {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(containsForbiddenKey);
  return Object.entries(value).some(([key, nested]) => FORBIDDEN_KEY.test(key) || containsForbiddenKey(nested));
}

function permissions(value) {
  if (!exact(value, new Set(PERMISSION_KEYS))) return null;
  if (PERMISSION_KEYS.some(key => typeof value[key] !== 'boolean')) return null;
  if (value.read !== true) return null;
  return freeze(Object.fromEntries(PERMISSION_KEYS.map(key => [key, value[key]])));
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
  if (!bookingId || !slotId || !courseId || !date || !DATE.test(date) || !time || !TIME.test(time) || !timeZone || !ZONE.test(timeZone) || !STATUSES.has(rawStatus) || !Number.isInteger(version) || version < 1 || !memberDisplayName) return null;
  const providerFact = provider(value.provider);
  if (providerFact === undefined) return null;
  const courseName = value.courseName === undefined || value.courseName === null ? null : bounded(value.courseName, 120);
  const terms = value.cancellationTerms ?? value.terms;
  const reference = value.receiptRef ?? value.reference;
  const termsFact = terms === undefined || terms === null ? null : bounded(terms, 1000);
  const referenceFact = reference === undefined || reference === null ? null : id(reference);
  const lastMessageAt = value.lastMessageAt === undefined || value.lastMessageAt === null ? null : iso(value.lastMessageAt);
  if ((value.courseName != null && !courseName) || (terms != null && !termsFact) || (reference != null && !referenceFact) || (value.lastMessageAt != null && !lastMessageAt)) return null;
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

export function parsePlayBookingDeskResponse(raw) {
  if (!exact(raw, RESPONSE_KEYS) || containsForbiddenKey(raw)) return unavailable('response_invalid');
  if (raw.schema !== RESPONSE_SCHEMA || raw.boundary !== BOUNDARY || !ROLES.has(raw.role) || typeof raw.notificationProviderConfigured !== 'boolean' || !Array.isArray(raw.bookings) || raw.bookings.length > 200) return unavailable('response_invalid');
  const allowed = permissions(raw.permissions);
  if (!allowed) return unavailable('permissions_invalid');
  const bookings = raw.bookings.map(booking);
  if (bookings.some(item => item === null)) return unavailable('booking_projection_invalid');
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

export const PLAY_BOOKING_DESK_STATUSES = freeze([...STATUSES]);
