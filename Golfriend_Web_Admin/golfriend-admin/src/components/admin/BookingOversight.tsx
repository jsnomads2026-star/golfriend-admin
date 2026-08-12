// ==========================================
// FILE: src/components/admin/BookingOversight.tsx
// Admin booking oversight console (strictly NON-FINANCIAL).
// Streams the real `bookings` collection and resolves any booking through the
// server-authoritative `adminResolveBooking` Cloud Function. Clients NEVER write
// seat / settlement state directly — every action is a callable.
// ==========================================
import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../../firebaseConfig';
import { V2Theme } from '../../theme/v2Theme';
import { V2Badge, V2ControlRow } from '../../theme/v2Primitives';
import BookingDetailPanel from './booking/BookingDetailPanel';

type BookingStatus = 'pending' | 'confirmed' | 'rejected' | 'cancelled';
type Decision = 'confirm' | 'reject' | 'cancel';

interface BookingRow {
  id: string;
  slotId: string;
  courseId: string;
  courseName: string;
  date: string;
  time: string;
  playerUid: string;
  playerName: string;
  status: BookingStatus;
}

const STATUS_FILTERS: Array<'all' | BookingStatus> = [
  'all', 'pending', 'confirmed', 'rejected', 'cancelled',
];

export default function BookingOversight() {
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | BookingStatus>('all');
  const [textFilter, setTextFilter] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [detailBooking, setDetailBooking] = useState<BookingRow | null>(null);

  const notify = (msg: string, type: 'success' | 'error') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // Stream ALL bookings live.
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'bookings')),
      (snap) => {
        setBookings(
          snap.docs.map((d) => {
            const b = d.data() as any;
            return {
              id: d.id,
              slotId: b.slotId || '',
              courseId: b.courseId || '',
              courseName: b.courseName || b.courseId || 'Unknown',
              date: b.date || '',
              time: b.time || '',
              playerUid: b.playerUid || '',
              playerName: b.playerName || b.playerUid || 'Unknown',
              status: (['pending', 'confirmed', 'rejected', 'cancelled'].includes(b.status)
                ? b.status
                : 'pending') as BookingStatus,
            } as BookingRow;
          })
        );
      },
      (err) => console.error('Booking oversight sync error:', err)
    );
    return () => unsub();
  }, []);

  const visible = useMemo(() => {
    const t = textFilter.trim().toLowerCase();
    return bookings
      .filter((b) => statusFilter === 'all' || b.status === statusFilter)
      .filter((b) =>
        !t ||
        b.courseName.toLowerCase().includes(t) ||
        b.playerName.toLowerCase().includes(t) ||
        b.courseId.toLowerCase().includes(t) ||
        b.playerUid.toLowerCase().includes(t)
      )
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  }, [bookings, statusFilter, textFilter]);

  const resolve = async (bookingId: string, decision: Decision) => {
    setBusyId(bookingId);
    try {
      const fn = httpsCallable(getFunctions(), 'adminResolveBooking');
      const res: any = await fn({ bookingId, decision });
      if (!res?.data?.success) throw new Error('Resolution was not accepted by the server.');
      const label = decision === 'confirm' ? 'confirmed' : decision === 'reject' ? 'rejected' : 'cancelled';
      notify(`Booking ${label}.`, 'success');
    } catch (e: any) {
      notify(e?.message || 'Failed to resolve booking.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    bookings.forEach((b) => { c[b.status] = (c[b.status] || 0) + 1; });
    return c;
  }, [bookings]);

  return (
    <div style={{ padding: '24px', color: V2Theme.warmWhite }}>
      {notification && (
        <div
          style={{
            position: 'fixed', top: '20px', right: '20px', padding: '16px 24px', zIndex: 1000,
            backgroundColor: notification.type === 'error' ? V2Theme.errorRed : V2Theme.successGreen,
            borderRadius: V2Theme.radiusMd, fontWeight: 'bold',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          }}
        >
          {notification.msg}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${V2Theme.surfaceBorder}`, paddingBottom: '12px', marginBottom: '20px' }}>
        <h2 style={{ color: V2Theme.gold, margin: 0 }}>📖 Booking Oversight</h2>
        <span style={{ color: V2Theme.surfaceTextMuted, fontSize: '12px' }}>{bookings.length} bookings streamed</span>
      </div>
      <p style={{ color: V2Theme.surfaceText, fontSize: '13px', marginTop: 0, marginBottom: '20px' }}>
        Force-confirm, reject, or cancel any tee-time booking. Every action is settled server-side by
        <code style={{ color: V2Theme.gold, margin: '0 4px' }}>adminResolveBooking</code>
        — seats are never written from this client.
      </p>

      <V2ControlRow>
        {STATUS_FILTERS.map((s) => {
          const active = statusFilter === s;
          const label = s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1);
          const badge = s === 'all' ? bookings.length : counts[s] || 0;
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              style={{
                padding: '6px 14px', borderRadius: V2Theme.radiusPill, cursor: 'pointer',
                fontSize: '12px', fontWeight: 700, minHeight: '36px',
                border: `1px solid ${active ? V2Theme.gold : V2Theme.surfaceBorder}`,
                backgroundColor: active ? `${V2Theme.gold}22` : 'transparent',
                color: active ? V2Theme.gold : V2Theme.surfaceTextMuted,
              }}
            >
              {label} <span style={{ color: active ? V2Theme.goldHover : V2Theme.surfaceMuted }}>({badge})</span>
            </button>
          );
        })}
        <input
          type="text"
          placeholder="Filter by course or player…"
          aria-label="Filter bookings"
          value={textFilter}
          onChange={(e) => setTextFilter(e.target.value)}
          style={{
            marginLeft: 'auto', minWidth: '220px', padding: '8px 12px',
            backgroundColor: V2Theme.surfaceCard, border: `1px solid ${V2Theme.surfaceBorder}`,
            color: V2Theme.warmWhite, borderRadius: V2Theme.radiusMd,
            boxSizing: 'border-box', fontFamily: V2Theme.fontFamily,
          }}
        />
      </V2ControlRow>

      <div style={{ border: `1px solid ${V2Theme.surfaceBorder}`, borderRadius: V2Theme.radiusMd, overflowX: 'auto', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px', minWidth: '580px' }}>
          <thead>
            <tr style={{ backgroundColor: V2Theme.surfaceCard, color: V2Theme.surfaceTextMuted, borderBottom: `2px solid ${V2Theme.surfaceBorder}` }}>
              <th style={thStyle}>Player</th>
              <th style={thStyle}>Course</th>
              <th style={thStyle}>Date / Time</th>
              <th style={thStyle}>Status</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: '28px', textAlign: 'center', color: V2Theme.surfaceMuted }}>No bookings match the current filters.</td></tr>
            ) : (
              visible.map((b) => {
                const busy = busyId === b.id;
                const canConfirm = b.status === 'pending';
                const canReject  = b.status === 'pending';
                const canCancel  = b.status === 'pending' || b.status === 'confirmed';
                return (
                  <tr key={b.id} style={{ borderBottom: `1px solid ${V2Theme.surfaceBorder}` }}>
                    <td style={tdStyle}>
                      <div style={{ color: V2Theme.warmWhite, fontWeight: 600 }}>{b.playerName}</div>
                      <div style={{ fontFamily: V2Theme.fontMono, color: V2Theme.surfaceMuted, fontSize: '11px' }}>{b.playerUid}</div>
                    </td>
                    <td style={tdStyle}>{b.courseName}</td>
                    <td style={tdStyle}>
                      <span>{b.date}</span>{' '}
                      <span style={{ color: V2Theme.warmWhite, fontWeight: 'bold' }}>{b.time}</span>
                    </td>
                    <td style={tdStyle}>
                      <V2Badge status={b.status} />
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button
                        onClick={() => setDetailBooking(b)}
                        style={actionBtn(V2Theme.fairwayLight, false)}
                        aria-label={`View details for booking ${b.id}`}
                      >
                        Details
                      </button>
                      <button
                        onClick={() => resolve(b.id, 'confirm')}
                        disabled={busy || !canConfirm}
                        style={actionBtn(V2Theme.successGreen, busy || !canConfirm)}
                        title={canConfirm ? 'Force confirm this booking' : 'Only pending bookings can be confirmed'}
                      >
                        {busy ? '…' : 'Force Confirm'}
                      </button>
                      <button
                        onClick={() => resolve(b.id, 'reject')}
                        disabled={busy || !canReject}
                        style={actionBtn(V2Theme.errorRed, busy || !canReject)}
                        title={canReject ? 'Reject this booking and release the seat' : 'Only pending bookings can be rejected'}
                      >
                        {busy ? '…' : 'Reject'}
                      </button>
                      <button
                        onClick={() => resolve(b.id, 'cancel')}
                        disabled={busy || !canCancel}
                        style={actionBtn(V2Theme.gold, busy || !canCancel)}
                        title={canCancel ? 'Cancel this booking and release the seat' : 'This booking cannot be cancelled'}
                      >
                        {busy ? '…' : 'Cancel'}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* C2B: booking communications panel — renders as overlay, no data-flow change */}
      {detailBooking && (
        <BookingDetailPanel
          booking={detailBooking}
          onClose={() => setDetailBooking(null)}
        />
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = { padding: '12px 14px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' };
const tdStyle: React.CSSProperties = { padding: '12px 14px', color: V2Theme.surfaceText, verticalAlign: 'top' };
const actionBtn = (color: string, disabled: boolean): React.CSSProperties => ({
  marginLeft: '6px',
  background: 'transparent',
  border: `1px solid ${disabled ? V2Theme.surfaceBorder : color}`,
  color: disabled ? V2Theme.surfaceMuted : color,
  borderRadius: V2Theme.radiusSm,
  padding: '6px 12px',
  minHeight: '36px',
  cursor: disabled ? 'not-allowed' : 'pointer',
  fontWeight: 700,
  fontSize: '11px',
});
