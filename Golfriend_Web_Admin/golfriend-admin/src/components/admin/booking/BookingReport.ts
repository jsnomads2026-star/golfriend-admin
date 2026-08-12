// ==========================================
// FILE: src/components/admin/booking/BookingReport.ts
// C2D — Pure injectable booking operations aggregator.
// No Firestore, no React, no side effects. All inputs injected; fully testable.
// Derives facts only from trusted fields; never infers revenue, payment,
// delivery confirmation, geography, conversion, or SLA success.
// ==========================================
import { classify, type ExceptionKind } from './BookingClassifier';

// ── Input types ──────────────────────────────────────────────────────────────

export interface BookingRecord {
  id: string;
  status: string;
  courseName?: string;
  courseId?: string;
  date?: string;         // tee-time date string (YYYY-MM-DD)
  time?: string;
  playerUid?: string;
  playerName?: string;
  createdAtMs?: number;  // booking creation time in ms; undefined = unknown
  locale?: string;       // golfer's preferred locale if available
}

export interface ReportInput {
  bookings: BookingRecord[];
  nowMs: number;           // injectable clock
  windowStart?: number;    // inclusive ms; undefined = no lower bound
  windowEnd?: number;      // inclusive ms; undefined = nowMs
}

// ── Output types ─────────────────────────────────────────────────────────────

export interface SummaryMetrics {
  total: number;
  pending: number;
  confirmed: number;
  rejected: number;
  cancelled: number;
  unknownStatus: number;
  exceptionCount: number;     // any non-healthy exception
  staleCount: number;
  waitingForCourse: number;
  notificationFollowUps: number; // rejected_requires_notification + cancelled_requires_ack
  unknownTimestamp: number;   // no createdAt — reported, not excluded from total
  inWindow: number;           // bookings with createdAt inside the selected window
}

export interface CourseBreakdown {
  courseName: string;
  total: number;
  confirmed: number;
  pending: number;
  rejected: number;
  cancelled: number;
}

export interface DayTrend {
  dateLabel: string;     // YYYY-MM-DD
  requests: number;
  confirmed: number;
  rejected: number;
  cancelled: number;
  exceptions: number;
  hasData: boolean;      // false = this day is in the window but no bookings
}

export interface AgeBucket {
  label: string;
  minH: number;
  maxH: number;          // Infinity for the last bucket
  count: number;
}

export interface DataQuality {
  missingTimestamp: number;
  missingCourse: number;
  missingLocale: number;
  unknownStatus: number;
  invalidRecords: number;   // empty id or empty status
  totalRecords: number;
  excludedFromWindow: number; // have timestamp but outside window
}

export interface WindowInfo {
  label: string;
  startMs?: number;
  endMs: number;
  durationLabel?: string;
}

export interface ReportOutput {
  summary: SummaryMetrics;
  byStatus: Record<string, number>;
  byCourse: CourseBreakdown[];
  byExceptionKind: Record<ExceptionKind, number>;
  byLocale: Record<string, number>;
  ageBuckets: AgeBucket[];
  trends: DayTrend[];
  dataQuality: DataQuality;
  windowInfo: WindowInfo;
}

// ── Time helpers ─────────────────────────────────────────────────────────────

function startOfDay(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function dateLabel(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function daysInRange(startMs: number, endMs: number): string[] {
  const days: string[] = [];
  let d = startOfDay(startMs);
  const end = startOfDay(endMs);
  while (d <= end) {
    days.push(dateLabel(d));
    d += 86_400_000;
  }
  return days;
}

// ── Age buckets ───────────────────────────────────────────────────────────────

const AGE_BUCKET_DEFS: Array<{ label: string; minH: number; maxH: number }> = [
  { label: '< 6 h',          minH: 0,   maxH: 6 },
  { label: '6 h – 24 h',     minH: 6,   maxH: 24 },
  { label: '24 h – 48 h',    minH: 24,  maxH: 48 },
  { label: '> 48 h (stale)', minH: 48,  maxH: Infinity },
];

const KNOWN_STATUSES = new Set(['pending', 'confirmed', 'rejected', 'cancelled']);

// ── Core aggregator ───────────────────────────────────────────────────────────

export function aggregate(input: ReportInput): ReportOutput {
  const { bookings, nowMs } = input;
  const windowEnd   = input.windowEnd   ?? nowMs;
  const windowStart = input.windowStart;

  // Partition bookings into windowed vs outside vs unknown-timestamp.
  const inWindow: BookingRecord[] = [];
  const outsideWindow: BookingRecord[] = [];
  const unknownTs: BookingRecord[] = [];

  for (const b of bookings) {
    if (b.createdAtMs === undefined) {
      unknownTs.push(b);
    } else if (
      b.createdAtMs <= windowEnd &&
      (windowStart === undefined || b.createdAtMs >= windowStart)
    ) {
      inWindow.push(b);
    } else {
      outsideWindow.push(b);
    }
  }

  // All bookings contribute to summary totals (unknown-ts included).
  const all = [...inWindow, ...unknownTs];

  // ── Summary ──────────────────────────────────────────────────────────────
  const summary: SummaryMetrics = {
    total: bookings.length,
    pending: 0, confirmed: 0, rejected: 0, cancelled: 0, unknownStatus: 0,
    exceptionCount: 0, staleCount: 0, waitingForCourse: 0,
    notificationFollowUps: 0, unknownTimestamp: unknownTs.length,
    inWindow: inWindow.length,
  };

  for (const b of all) {
    switch (b.status) {
      case 'pending':   summary.pending++;   break;
      case 'confirmed': summary.confirmed++; break;
      case 'rejected':  summary.rejected++;  break;
      case 'cancelled': summary.cancelled++; break;
      default:          summary.unknownStatus++; break;
    }
    const kind = classify({ status: b.status, createdAtMs: b.createdAtMs, nowMs });
    if (kind !== 'healthy') summary.exceptionCount++;
    if (kind === 'stale_request') summary.staleCount++;
    if (kind === 'pending_course_response') summary.waitingForCourse++;
    if (kind === 'rejected_requires_notification' || kind === 'cancelled_requires_ack') {
      summary.notificationFollowUps++;
    }
  }

  // ── By-status ─────────────────────────────────────────────────────────────
  const byStatus: Record<string, number> = {};
  for (const b of all) {
    byStatus[b.status] = (byStatus[b.status] ?? 0) + 1;
  }

  // ── By-course ─────────────────────────────────────────────────────────────
  const courseMap = new Map<string, CourseBreakdown>();
  for (const b of all) {
    const name = b.courseName || b.courseId || 'Unknown';
    if (!courseMap.has(name)) {
      courseMap.set(name, { courseName: name, total: 0, confirmed: 0, pending: 0, rejected: 0, cancelled: 0 });
    }
    const entry = courseMap.get(name)!;
    entry.total++;
    if (b.status === 'confirmed') entry.confirmed++;
    else if (b.status === 'pending') entry.pending++;
    else if (b.status === 'rejected') entry.rejected++;
    else if (b.status === 'cancelled') entry.cancelled++;
  }
  const byCourse = [...courseMap.values()].sort((a, b) => b.total - a.total);

  // ── By-exception-kind ─────────────────────────────────────────────────────
  const byExceptionKind = {
    stale_request: 0, pending_course_response: 0,
    rejected_requires_notification: 0, cancelled_requires_ack: 0, healthy: 0,
  } as Record<ExceptionKind, number>;
  for (const b of all) {
    const kind = classify({ status: b.status, createdAtMs: b.createdAtMs, nowMs });
    byExceptionKind[kind]++;
  }

  // ── By-locale ─────────────────────────────────────────────────────────────
  const byLocale: Record<string, number> = {};
  for (const b of all) {
    const loc = b.locale || 'unknown';
    byLocale[loc] = (byLocale[loc] ?? 0) + 1;
  }

  // ── Age buckets (pending bookings with known timestamps) ──────────────────
  const ageBuckets: AgeBucket[] = AGE_BUCKET_DEFS.map((def) => ({ ...def, count: 0 }));
  let unknownAgeCount = 0;
  for (const b of all) {
    if (b.status !== 'pending') continue;
    if (b.createdAtMs === undefined) { unknownAgeCount++; continue; }
    const ageH = (nowMs - b.createdAtMs) / 3_600_000;
    const bucket = ageBuckets.find((bk) => ageH >= bk.minH && ageH < bk.maxH);
    if (bucket) bucket.count++;
  }
  if (unknownAgeCount > 0) {
    ageBuckets.push({ label: 'unknown age', minH: 0, maxH: 0, count: unknownAgeCount });
  }

  // ── Trends ────────────────────────────────────────────────────────────────
  // Trend is computed over inWindow bookings only (we need a timestamp for day bucketing).
  let trends: DayTrend[] = [];
  if (windowStart !== undefined) {
    const days = daysInRange(windowStart, windowEnd);
    const trendMap = new Map<string, DayTrend>();
    for (const day of days) {
      trendMap.set(day, {
        dateLabel: day, requests: 0, confirmed: 0, rejected: 0, cancelled: 0, exceptions: 0, hasData: false,
      });
    }
    for (const b of inWindow) {
      const day = dateLabel(b.createdAtMs!);
      if (!trendMap.has(day)) {
        trendMap.set(day, {
          dateLabel: day, requests: 0, confirmed: 0, rejected: 0, cancelled: 0, exceptions: 0, hasData: false,
        });
      }
      const entry = trendMap.get(day)!;
      entry.requests++;
      entry.hasData = true;
      if (b.status === 'confirmed') entry.confirmed++;
      else if (b.status === 'rejected') entry.rejected++;
      else if (b.status === 'cancelled') entry.cancelled++;
      const kind = classify({ status: b.status, createdAtMs: b.createdAtMs, nowMs });
      if (kind !== 'healthy') entry.exceptions++;
    }
    // Mark scaffold days as hasData=false (they exist but have 0 bookings).
    for (const day of days) {
      const entry = trendMap.get(day)!;
      if (entry.requests === 0) entry.hasData = false;
    }
    trends = [...trendMap.values()].sort((a, b) => a.dateLabel.localeCompare(b.dateLabel));
  }

  // ── Data quality ──────────────────────────────────────────────────────────
  const dataQuality: DataQuality = {
    missingTimestamp: 0,
    missingCourse: 0,
    missingLocale: 0,
    unknownStatus: 0,
    invalidRecords: 0,
    totalRecords: bookings.length,
    excludedFromWindow: outsideWindow.length,
  };
  for (const b of bookings) {
    if (!b.id || !b.status) dataQuality.invalidRecords++;
    if (b.createdAtMs === undefined) dataQuality.missingTimestamp++;
    if (!b.courseName && !b.courseId) dataQuality.missingCourse++;
    if (!b.locale) dataQuality.missingLocale++;
    if (!KNOWN_STATUSES.has(b.status)) dataQuality.unknownStatus++;
  }

  // ── Window info ───────────────────────────────────────────────────────────
  const windowInfo: WindowInfo = {
    label: windowStart !== undefined
      ? `${dateLabel(windowStart)} — ${dateLabel(windowEnd)}`
      : 'All time',
    startMs: windowStart,
    endMs: windowEnd,
  };

  return {
    summary, byStatus, byCourse, byExceptionKind, byLocale, ageBuckets, trends,
    dataQuality, windowInfo,
  };
}

// ── CSV export ─────────────────────────────────────────────────────────────

function csvEscape(v: string | number | undefined): string {
  if (v === undefined || v === null) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export interface ExportMetadata {
  generatedAt: string;   // ISO timestamp
  periodLabel: string;
  appliedFilters: string;
  totalRows: number;
  dataLimitations: string[];
}

export const CSV_COLUMNS = [
  'id', 'status', 'courseName', 'courseId', 'date', 'time',
  'playerUid', 'playerName', 'createdAtIso', 'locale', 'exceptionKind',
] as const;

export function exportCSV(bookings: BookingRecord[], meta: ExportMetadata, nowMs: number): string {
  const header = CSV_COLUMNS.join(',');
  const rows = bookings.map((b) => {
    const kind = classify({ status: b.status, createdAtMs: b.createdAtMs, nowMs });
    return [
      b.id, b.status, b.courseName ?? '', b.courseId ?? '',
      b.date ?? '', b.time ?? '', b.playerUid ?? '', b.playerName ?? '',
      b.createdAtMs !== undefined ? new Date(b.createdAtMs).toISOString() : '',
      b.locale ?? '',
      kind,
    ].map(csvEscape).join(',');
  });
  const metaLines = [
    `# Generated: ${meta.generatedAt}`,
    `# Period: ${meta.periodLabel}`,
    `# Filters: ${meta.appliedFilters || 'none'}`,
    `# Total rows: ${meta.totalRows}`,
    ...meta.dataLimitations.map((l) => `# Note: ${l}`),
  ];
  return [...metaLines, header, ...rows].join('\n');
}

export function exportTXT(report: ReportOutput, meta: ExportMetadata): string {
  const { summary: s, dataQuality: dq, windowInfo: wi } = report;
  const lines: string[] = [
    'GOLFRIEND BOOKING OPERATIONS REPORT',
    '='.repeat(44),
    `Generated:  ${meta.generatedAt}`,
    `Period:     ${wi.label}`,
    `Filters:    ${meta.appliedFilters || 'none'}`,
    '',
    'SUMMARY',
    '-'.repeat(32),
    `Total requests:          ${s.total}`,
    `  In selected period:    ${s.inWindow}`,
    `  Unknown timestamp:     ${s.unknownTimestamp}`,
    `Pending:                 ${s.pending}`,
    `Confirmed:               ${s.confirmed}`,
    `Rejected:                ${s.rejected}`,
    `Cancelled:               ${s.cancelled}`,
    `Unknown status:          ${s.unknownStatus}`,
    `Exception count:         ${s.exceptionCount}`,
    `  Stale (>48 h):         ${s.staleCount}`,
    `  Waiting for course:    ${s.waitingForCourse}`,
    `  Notify/acknowledge:    ${s.notificationFollowUps}`,
    '',
    'DATA QUALITY',
    '-'.repeat(32),
    `Missing timestamp:       ${dq.missingTimestamp} / ${dq.totalRecords}`,
    `Missing course:          ${dq.missingCourse} / ${dq.totalRecords}`,
    `Missing locale:          ${dq.missingLocale} / ${dq.totalRecords}`,
    `Unknown status:          ${dq.unknownStatus} / ${dq.totalRecords}`,
    `Invalid records:         ${dq.invalidRecords}`,
    `Excluded from window:    ${dq.excludedFromWindow}`,
    '',
    'DATA LIMITATIONS',
    '-'.repeat(32),
    '- This report contains no revenue, payment, conversion, or delivery data.',
    '- Golfriend does not sell tee times or process payments.',
    '- Bookings with missing timestamps are reported but excluded from period metrics.',
    '- Geography/country data is not inferred from course information.',
    '',
    'FUTURE JHCC REPORTING',
    '-'.repeat(32),
    'Automatic JHCC transmission: NOT AVAILABLE.',
    'No approved reporting contract exists. Manual export only (Copy / CSV / TXT).',
    '',
    ...meta.dataLimitations.map((l) => `Note: ${l}`),
  ];
  return lines.join('\n');
}

// ── Reconciliation helper ────────────────────────────────────────────────────

/** Verify that summary totals are internally consistent. Returns true if valid. */
export function reconcile(report: ReportOutput): { ok: boolean; errors: string[] } {
  const { summary: s } = report;
  const errors: string[] = [];
  const statusSum = s.pending + s.confirmed + s.rejected + s.cancelled + s.unknownStatus;
  if (statusSum !== s.total) {
    errors.push(`Status sum (${statusSum}) ≠ total (${s.total})`);
  }
  if (s.exceptionCount > s.total) {
    errors.push(`Exception count (${s.exceptionCount}) > total (${s.total})`);
  }
  if (s.staleCount > s.pending) {
    errors.push(`Stale count (${s.staleCount}) > pending (${s.pending})`);
  }
  if (s.waitingForCourse > s.pending) {
    errors.push(`Waiting-for-course (${s.waitingForCourse}) > pending (${s.pending})`);
  }
  return { ok: errors.length === 0, errors };
}
