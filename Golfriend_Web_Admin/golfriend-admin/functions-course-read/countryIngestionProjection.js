'use strict';
const {displayTime, timestampMillis} = require('./projectionTime');

const receiptIdFor = job => `${String(job.jobId || job.id || '')}-batch-${Math.max(1, Number(job.batch || 1))}`;
const countsFor = receipt => Object.freeze({
  added: Number(receipt?.counts?.added || 0),
  updated: Number(receipt?.counts?.updated || 0),
  quarantined: Number(receipt?.counts?.quarantined || 0),
});
const errorFor = receipt => receipt?.requestEvidence?.errorClassification || null;
const countryKey = value => { const country = String(value || 'UNKNOWN').trim().toLocaleUpperCase(); return country === 'SOUTH KOREA' ? 'KOREA' : country; };

function projectJob(job, receipt) {
  const state = receipt?.state || (job?.state === 'queued' ? 'queued' : 'unavailable');
  return Object.freeze({
    id: String(job.jobId || job.id || ''),
    country: job.country || null,
    state,
    counts: countsFor(receipt),
    providerCalls: Number(receipt?.providerCalls || 0),
    // The receipt write time is the immutable completion evidence.  Provider
    // timestamps are never used for Admin completion status.
    completedAt: displayTime(receipt?.completedAt ?? receipt?.recordedAt),
    error: errorFor(receipt),
    ordinal: Number(job.ordinal || 0),
    requiresReceiptId: job.requiresReceiptId || null,
  });
}

function projectReceiptBoundQueue(queue, receipts) {
  const receiptById = new Map(receipts.map(receipt => [receipt.receiptId || receipt.id, receipt]));
  const jobs = queue
    .map(job => projectJob(job, receiptById.get(receiptIdFor(job))))
    .sort((left, right) => left.ordinal - right.ordinal);
  const completed = jobs.filter(job => job.state === 'completed').sort((left, right) => (timestampMillis(right.completedAt) || 0) - (timestampMillis(left.completedAt) || 0))[0] || null;
  const korea = jobs.find(job => job.country === 'KOREA' && job.state === 'completed') || null;
  const nextEligible = jobs.find(job => job.state === 'queued' && receiptById.get(job.requiresReceiptId)?.state === 'completed') || null;
  const dueTimes = queue.map(job => ({country: job.country || null, at: timestampMillis(job.retryAtMs ?? job.nextDueAtMs ?? job.nextEligibleAtMs)})).filter(item => item.at !== null && item.at > Date.now()).sort((left, right) => left.at - right.at);
  const nextScheduled = dueTimes[0] || null;
  const allScheduledCountriesUpToDate = jobs.length > 0 && jobs.every(job => job.state === 'completed') && nextScheduled !== null;
  return Object.freeze({jobs: Object.freeze(jobs), pipeline: Object.freeze({korea, lastCompleted: completed, nextEligible, nextScheduledRunAt: nextScheduled ? displayTime(nextScheduled.at) : null, nextScheduledCountry: nextScheduled?.country || null, allScheduledCountriesUpToDate, scheduledCadence: 'every 5 minutes'})});
}

function attachCountryCoverage(projection, courses, clubhouses) {
  const courseCounts = new Map(), venueCounts = new Map();
  for (const course of courses) { const country = countryKey(course.country), current = courseCounts.get(country) || {courseLayoutCount: 0, needsClubhouseIdentityReviewCount: 0}; current.courseLayoutCount++; if (!course.providerClubId) current.needsClubhouseIdentityReviewCount++; courseCounts.set(country, current); }
  for (const clubhouse of clubhouses) { const country = countryKey(clubhouse.country); venueCounts.set(country, (venueCounts.get(country) || 0) + 1); }
  return Object.freeze({...projection, jobs: Object.freeze(projection.jobs.map(job => { const country = countryKey(job.country); return Object.freeze({...job, clubhouseCount: venueCounts.get(country) || 0, ...(courseCounts.get(country) || {courseLayoutCount: 0, needsClubhouseIdentityReviewCount: 0})}); }))});
}

module.exports = {attachCountryCoverage, projectReceiptBoundQueue};
