'use strict';
const VERSION = 'golfriend.country-operations-projection.v1';
const country = value => /^[A-Z]{2}$/.test(String(value || '').trim().toUpperCase()) ? String(value).trim().toUpperCase() : 'UNKNOWN';
const millis = value => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.abs(value) < 100000000000 ? value * 1000 : value;
  if (typeof value === 'string') { const date = Date.parse(value); return Number.isFinite(date) ? date : null; }
  if (value?.toMillis) return millis(value.toMillis());
  if (Number.isFinite(Number(value?.seconds ?? value?._seconds))) return Number(value.seconds ?? value._seconds) * 1000;
  return null;
};
const iso = value => { const valueMs = millis(value); return valueMs === null ? null : new Date(valueMs).toISOString(); };
const count = (map, key, amount = 1) => map.set(key, (map.get(key) || 0) + amount);
function aggregate({users = [], courses = [], clubhouses = [], requests = [], now = Date.now(), periodDays = 30}) {
  const rows = new Map(), row = key => { const value = country(key); if (!rows.has(value)) rows.set(value, {country: value, verifiedMembers: 0, newMembers: 0, activeMembers: null, courseCoverage: {clubhouses: 0, playableLayouts: 0}, memberCourseRequests: 0}); return rows.get(value); };
  let memberRecordsWithCreatedAt = 0;
  const completeness = {verifiedMembers: {state: 'available', source: 'users.verification_status + users.verified_country_code', memberRecords: users.length}, newMembers: {state: 'available', source: 'users.created_at', memberRecords: users.length, recordsWithCreatedAt: 0}, activeMembers: {state: 'not_collected', reason: 'NO_CANONICAL_ACTIVITY_EVENT_WRITER'}, matchDemand: {state: 'not_collected', reason: 'NO_CANONICAL_MATCH_DEMAND_WRITER'}, clubhouseDemand: {state: 'not_collected', reason: 'NO_CANONICAL_CLUBHOUSE_DEMAND_WRITER'}, memberCourseRequests: {state: 'available', source: 'course_acquisition_requests'}, courseCoverage: {state: 'available', source: 'courses + clubhouses'}};
  const cutoff = now - periodDays * 86400000;
  for (const user of users) { const target = row(user.verified_country_code); if (user.verification_status === 'verified') target.verifiedMembers++; const created = millis(user.created_at); if (created !== null) memberRecordsWithCreatedAt++; if (created !== null && created >= cutoff && created <= now) target.newMembers++; }
  for (const course of courses) row(course.country).courseCoverage.playableLayouts++;
  for (const clubhouse of clubhouses) row(clubhouse.country).courseCoverage.clubhouses++;
  for (const request of requests) row(request.country).memberCourseRequests += Number(request.requestCount || 1);
  const result = [...rows.values()].sort((a, b) => a.country.localeCompare(b.country)).map(value => ({...value, currentNeed: value.memberCourseRequests > 0 ? 'Member requests waiting' : value.courseCoverage.playableLayouts === 0 ? 'Course coverage needed' : 'No activity data collected yet'}));
  const totals = result.reduce((out, value) => ({verifiedMembers: out.verifiedMembers + value.verifiedMembers, newMembers: out.newMembers + value.newMembers, activeMembers: null}), {verifiedMembers: 0, newMembers: 0, activeMembers: null});
  completeness.verifiedMembers.verifiedMemberRecords = totals.verifiedMembers;
  completeness.newMembers.recordsWithCreatedAt = memberRecordsWithCreatedAt;
  return Object.freeze({schema: VERSION, version: 1, generatedAt: new Date(now).toISOString(), periodDays, totals, countries: result, sourceCompleteness: completeness});
}
module.exports = Object.freeze({VERSION, aggregate, country, millis, iso});
