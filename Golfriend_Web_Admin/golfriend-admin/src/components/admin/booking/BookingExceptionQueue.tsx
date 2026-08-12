// ==========================================
// FILE: src/components/admin/booking/BookingExceptionQueue.tsx
// C2C — Booking exception and follow-up queue.
// Read-only: streams bookings + createdAt from Firestore; no client writes.
// Classifies each booking via BookingClassifier; opens BookingDetailPanel
// (with existing 8-locale composer) for follow-up workspace.
// Automatic reminders: no approved backend scheduler — label unavailable.
// ==========================================
import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../../../firebaseConfig';
import { V2Theme } from '../../../theme/v2Theme';
import { V2Badge, V2ControlRow } from '../../../theme/v2Primitives';
import {
  classify,
  EXCEPTION_KINDS_ALL,
  QUEUE_LABELS,
  QUEUE_LOCALES,
  type ExceptionKind,
  type QueueLocale,
} from './BookingClassifier';
import type { BookingRowSlim } from './BookingDetailPanel';

// Extend the slim row with a createdAt timestamp for stale detection.
interface QueueRow extends BookingRowSlim {
  createdAtMs?: number;
}

const EXCEPTION_BADGE_COLORS: Record<ExceptionKind, string> = {
  stale_request:                  V2Theme.errorRed,
  pending_course_response:        V2Theme.warningAmber,
  rejected_requires_notification: V2Theme.errorRed,
  cancelled_requires_ack:         V2Theme.surfaceTextMuted,
  healthy:                        V2Theme.successGreen,
};

interface Props {
  /** Called when the admin opens follow-up workspace for a booking. */
  onFollowUp: (booking: BookingRowSlim) => void;
}

export default function BookingExceptionQueue({ onFollowUp }: Props) {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [streamErr, setStreamErr] = useState(false);

  // UI controls
  const [uiLocale, setUiLocale] = useState<QueueLocale>('en');
  const [exceptionFilter, setExceptionFilter] = useState<ExceptionKind | 'all'>('all');
  const [statusFilter, setStatusFilter]  = useState<string>('all');
  const [courseFilter, setCourseFilter]  = useState<string>('all');
  const [sortOrder, setSortOrder]        = useState<'oldest' | 'newest'>('oldest');
  const [showExceptionsOnly, setShowExceptionsOnly] = useState(false);

  const L = QUEUE_LABELS[uiLocale];
  const now = Date.now();

  // Stream ALL bookings with createdAt (independent read-only stream).
  useEffect(() => {
    setLoading(true);
    setStreamErr(false);
    const unsub = onSnapshot(
      query(collection(db, 'bookings'), orderBy('__name__')),
      (snap) => {
        setRows(snap.docs.map((d) => {
          const b = d.data() as any;
          const createdAt = b.createdAt;
          const createdAtMs: number | undefined =
            createdAt?.toMillis
              ? createdAt.toMillis()
              : createdAt?.seconds
              ? createdAt.seconds * 1000
              : undefined;
          return {
            id: d.id,
            courseName: b.courseName || b.courseId || 'Unknown',
            courseId:   b.courseId  || '',
            date:       b.date      || '',
            time:       b.time      || '',
            playerName: b.playerName || b.playerUid || 'Unknown',
            playerUid:  b.playerUid  || '',
            status:     b.status     || 'unknown',
            createdAtMs,
          } as QueueRow;
        }));
        setLoading(false);
      },
      () => { setStreamErr(true); setLoading(false); },
    );
    return () => unsub();
  }, []);

  // Classified rows with deterministic exception kind.
  const classified = useMemo(() => rows.map((r) => ({
    row: r,
    kind: classify({ status: r.status, createdAtMs: r.createdAtMs, nowMs: now }),
  })), [rows, now]);

  // Unique courses for the course filter.
  const courses = useMemo(() => {
    const names = [...new Set(rows.map((r) => r.courseName))].sort();
    return names;
  }, [rows]);

  // Filtered + sorted view.
  const visible = useMemo(() => {
    let result = classified;
    if (showExceptionsOnly) result = result.filter((c) => c.kind !== 'healthy');
    if (exceptionFilter !== 'all') result = result.filter((c) => c.kind === exceptionFilter);
    if (statusFilter !== 'all') result = result.filter((c) => c.row.status === statusFilter);
    if (courseFilter !== 'all') result = result.filter((c) => c.row.courseName === courseFilter);

    result = [...result].sort((a, b) => {
      const aMs = a.row.createdAtMs ?? (sortOrder === 'oldest' ? Infinity : -Infinity);
      const bMs = b.row.createdAtMs ?? (sortOrder === 'oldest' ? Infinity : -Infinity);
      return sortOrder === 'oldest' ? aMs - bMs : bMs - aMs;
    });

    // Put highest-urgency exceptions first within sort, then stale, then pending, then rest.
    const urgency: Record<ExceptionKind, number> = {
      stale_request: 0,
      pending_course_response: 1,
      rejected_requires_notification: 2,
      cancelled_requires_ack: 3,
      healthy: 4,
    };
    result.sort((a, b) => urgency[a.kind] - urgency[b.kind]);

    return result;
  }, [classified, showExceptionsOnly, exceptionFilter, statusFilter, courseFilter, sortOrder]);

  const exceptionCount = classified.filter((c) => c.kind !== 'healthy').length;

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div style={{ fontFamily: V2Theme.fontFamily }}>
      {/* ── Header ── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        borderBottom: `1px solid ${V2Theme.surfaceBorder}`, paddingBottom: '12px', marginBottom: '16px',
        flexWrap: 'wrap', gap: '8px',
      }}>
        <div>
          <h2 style={{ color: V2Theme.gold, margin: 0, fontSize: '18px' }}>⚠️ {L.heading}</h2>
          <p style={{ color: V2Theme.surfaceTextMuted, fontSize: '13px', margin: '4px 0 0' }}>
            {loading ? L.loading : `${exceptionCount} exceptions · ${rows.length} total`}
          </p>
        </div>

        {/* UI locale selector */}
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }} role="group" aria-label="Queue interface language">
          {QUEUE_LOCALES.map((l) => (
            <button
              key={l}
              onClick={() => setUiLocale(l)}
              aria-pressed={uiLocale === l}
              style={{
                padding: '4px 9px', fontSize: '11px', fontWeight: 700,
                borderRadius: V2Theme.radiusPill, cursor: 'pointer', minHeight: '28px',
                border: `1px solid ${uiLocale === l ? V2Theme.gold : V2Theme.surfaceBorder}`,
                backgroundColor: uiLocale === l ? `${V2Theme.gold}22` : 'transparent',
                color: uiLocale === l ? V2Theme.gold : V2Theme.surfaceTextMuted,
              }}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* ── Automatic reminders unavailable notice ── */}
      <div
        data-c2c-send-unavailable="true"
        style={{
          padding: '10px 14px', marginBottom: '16px',
          backgroundColor: `${V2Theme.surfaceMuted}12`,
          border: `1px solid ${V2Theme.surfaceBorder}`,
          borderRadius: V2Theme.radiusMd,
          fontSize: '12px', color: V2Theme.surfaceTextMuted, lineHeight: 1.5,
        }}
      >
        <strong style={{ color: V2Theme.warningAmber }}>{L.sendUnavailable}.</strong>
        {' '}{L.sendUnavailableDetail}
      </div>

      {/* ── Filters ── */}
      <V2ControlRow style={{ marginBottom: '12px' }}>
        {/* Exceptions only toggle */}
        <button
          onClick={() => setShowExceptionsOnly(!showExceptionsOnly)}
          aria-pressed={showExceptionsOnly}
          style={{
            padding: '6px 12px', borderRadius: V2Theme.radiusPill, cursor: 'pointer',
            fontSize: '12px', fontWeight: 700, minHeight: '36px',
            border: `1px solid ${showExceptionsOnly ? V2Theme.errorRed : V2Theme.surfaceBorder}`,
            backgroundColor: showExceptionsOnly ? `${V2Theme.errorRed}18` : 'transparent',
            color: showExceptionsOnly ? V2Theme.errorRed : V2Theme.surfaceTextMuted,
          }}
        >
          {showExceptionsOnly ? L.filterExceptionsOnly : L.filterAll}
        </button>

        {/* Exception type filter */}
        <select
          aria-label="Filter by exception type"
          value={exceptionFilter}
          onChange={(e) => setExceptionFilter(e.target.value as ExceptionKind | 'all')}
          style={selectStyle}
        >
          <option value="all">{L.filterAll} exception types</option>
          {EXCEPTION_KINDS_ALL.map((k) => (
            <option key={k} value={k}>{L[k]}</option>
          ))}
        </select>

        {/* Status filter */}
        <select
          aria-label="Filter by booking status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={selectStyle}
        >
          <option value="all">All statuses</option>
          {['pending', 'confirmed', 'rejected', 'cancelled'].map((s) => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>

        {/* Course filter */}
        {courses.length > 1 && (
          <select
            aria-label="Filter by course"
            value={courseFilter}
            onChange={(e) => setCourseFilter(e.target.value)}
            style={selectStyle}
          >
            <option value="all">All courses</option>
            {courses.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}

        {/* Sort */}
        <select
          aria-label="Sort order"
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value as 'oldest' | 'newest')}
          style={{ ...selectStyle, marginLeft: 'auto' }}
        >
          <option value="oldest">{L.sortOldest}</option>
          <option value="newest">{L.sortNewest}</option>
        </select>
      </V2ControlRow>

      {/* ── States ── */}
      {loading && (
        <div role="status" aria-live="polite" aria-busy style={stateBox}>
          <span>⏳</span> {L.loading}
        </div>
      )}

      {!loading && streamErr && (
        <div role="alert" aria-live="assertive" style={{ ...stateBox, color: V2Theme.errorRed, borderColor: `${V2Theme.errorRed}44` }}>
          <span>⚠️</span> {L.error}
          <button
            onClick={() => { setStreamErr(false); setLoading(true); }}
            aria-label={L.retry}
            style={{ marginLeft: '12px', background: 'none', border: `1px solid ${V2Theme.errorRed}`, color: V2Theme.errorRed, borderRadius: V2Theme.radiusMd, padding: '4px 12px', cursor: 'pointer', fontWeight: 700, fontSize: '12px' }}
          >
            {L.retry}
          </button>
        </div>
      )}

      {!loading && !streamErr && visible.length === 0 && (
        <div role="status" style={stateBox}>
          <span>📭</span>
          <span style={{ color: V2Theme.surfaceMuted }}>
            {rows.length === 0 ? L.empty : L.emptyFiltered}
          </span>
        </div>
      )}

      {/* ── Queue table ── */}
      {!loading && !streamErr && visible.length > 0 && (
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
          <table
            style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '620px' }}
            aria-label="Booking exception queue"
          >
            <thead>
              <tr style={{ backgroundColor: V2Theme.surfaceCard, color: V2Theme.surfaceTextMuted, borderBottom: `2px solid ${V2Theme.surfaceBorder}` }}>
                <th style={th}>Exception</th>
                <th style={th}>Player</th>
                <th style={th}>Course</th>
                <th style={th}>Tee Time</th>
                <th style={th}>Status</th>
                <th style={{ ...th, textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(({ row, kind }) => {
                const color = EXCEPTION_BADGE_COLORS[kind];
                const age = row.createdAtMs ? Math.round((now - row.createdAtMs) / (1000 * 3600)) : null;
                return (
                  <tr
                    key={row.id}
                    style={{
                      borderBottom: `1px solid ${V2Theme.surfaceBorder}`,
                      backgroundColor: kind === 'stale_request' ? `${V2Theme.errorRed}0a` : 'transparent',
                    }}
                  >
                    <td style={td}>
                      <span
                        style={{
                          display: 'inline-block', padding: '2px 8px',
                          borderRadius: V2Theme.radiusPill, fontSize: '11px', fontWeight: 700,
                          textTransform: 'uppercase', letterSpacing: '0.4px',
                          backgroundColor: `${color}22`, color, border: `1px solid ${color}55`,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {L[kind]}
                      </span>
                      {age !== null && kind !== 'healthy' && (
                        <div style={{ fontSize: '10px', color: V2Theme.surfaceMuted, marginTop: '2px' }}>
                          {age}h ago
                        </div>
                      )}
                    </td>
                    <td style={td}>
                      <div style={{ color: V2Theme.warmWhite, fontWeight: 600 }}>{row.playerName}</div>
                      <div style={{ fontFamily: V2Theme.fontMono, color: V2Theme.surfaceMuted, fontSize: '10px' }}>{row.playerUid}</div>
                    </td>
                    <td style={td}>{row.courseName}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      {row.date} <strong style={{ color: V2Theme.warmWhite }}>{row.time}</strong>
                    </td>
                    <td style={td}>
                      <V2Badge status={row.status} />
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      {kind !== 'healthy' ? (
                        <button
                          onClick={() => onFollowUp(row)}
                          aria-label={`${L.followUp}: ${row.playerName} at ${row.courseName}`}
                          style={{
                            padding: '6px 14px', minHeight: '36px',
                            backgroundColor: `${V2Theme.gold}18`,
                            border: `1px solid ${V2Theme.gold}88`,
                            color: V2Theme.gold,
                            borderRadius: V2Theme.radiusMd,
                            fontWeight: 700, fontSize: '12px', cursor: 'pointer',
                          }}
                        >
                          {L.followUp}
                        </button>
                      ) : (
                        <span style={{ fontSize: '11px', color: V2Theme.surfaceMuted }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Disclaimer ── */}
      <p
        data-c2c-disclaimer="true"
        style={{
          marginTop: '20px', fontSize: '11px', color: V2Theme.surfaceMuted,
          lineHeight: 1.55, borderTop: `1px solid ${V2Theme.surfaceBorder}`, paddingTop: '10px',
        }}
      >
        {L.disclaimer}
      </p>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  padding: '6px 10px', height: '36px',
  backgroundColor: V2Theme.surfaceCard,
  border: `1px solid ${V2Theme.surfaceBorder}`,
  color: V2Theme.warmWhite,
  borderRadius: V2Theme.radiusMd,
  fontSize: '12px',
  fontFamily: V2Theme.fontFamily,
  cursor: 'pointer',
};

const stateBox: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '10px',
  padding: '24px',
  textAlign: 'center',
  justifyContent: 'center',
  border: `1px dashed ${V2Theme.surfaceBorder}`,
  borderRadius: V2Theme.radiusLg,
  color: V2Theme.surfaceTextMuted,
  fontSize: '14px',
  margin: '8px 0',
};

const th: React.CSSProperties = {
  padding: '10px 14px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.5px', textAlign: 'left',
};

const td: React.CSSProperties = {
  padding: '10px 14px', color: V2Theme.surfaceText, verticalAlign: 'top',
};
