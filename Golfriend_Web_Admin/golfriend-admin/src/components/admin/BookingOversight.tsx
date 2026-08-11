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

const statusColor = (s: BookingStatus): string => {
  switch (s) {
    case 'confirmed': return '#4CAF50';
    case 'pending': return '#FFC107';
    case 'rejected': return '#ff4444';
    case 'cancelled': return '#888';
    default: return '#888';
  }
};

export default function BookingOversight() {
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | BookingStatus>('all');
  const [textFilter, setTextFilter] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

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
    <div style={{ padding: '24px', color: '#fff' }}>
      {notification && (
        <div
          style={{
            position: 'fixed', top: '20px', right: '20px', padding: '16px 24px', zIndex: 1000,
            backgroundColor: notification.type === 'error' ? '#ff4444' : '#4CAF50', borderRadius: '8px', fontWeight: 'bold',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          }}
        >
          {notification.msg}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #333', paddingBottom: '12px', marginBottom: '20px' }}>
        <h2 style={{ color: '#d4af37', margin: 0 }}>📖 Booking Oversight</h2>
        <span style={{ color: '#666', fontSize: '12px' }}>{bookings.length} bookings streamed</span>
      </div>
      <p style={{ color: '#aaa', fontSize: '13px', marginTop: 0, marginBottom: '20px' }}>
        Force-confirm, reject, or cancel any tee-time booking. Every action is settled server-side by
        <code style={{ color: '#d4af37', margin: '0 4px' }}>adminResolveBooking</code>
        — seats are never written from this client.
      </p>

      {/* FILTER BAR */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginBottom: '18px' }}>
        {STATUS_FILTERS.map((s) => {
          const active = statusFilter === s;
          const label = s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1);
          const badge = s === 'all' ? bookings.length : counts[s] || 0;
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              style={{
                padding: '6px 14px', borderRadius: '20px', cursor: 'pointer', fontSize: '12px', fontWeight: 700,
                border: `1px solid ${active ? '#d4af37' : '#333'}`,
                backgroundColor: active ? 'rgba(212,175,55,0.15)' : 'transparent',
                color: active ? '#d4af37' : '#aaa',
              }}
            >
              {label} <span style={{ color: '#666' }}>({badge})</span>
            </button>
          );
        })}
        <input
          type="text"
          placeholder="Filter by course or player…"
          value={textFilter}
          onChange={(e) => setTextFilter(e.target.value)}
          style={{ marginLeft: 'auto', minWidth: '240px', padding: '8px 12px', backgroundColor: '#0a0a0a', border: '1px solid #333', color: '#fff', borderRadius: '6px', boxSizing: 'border-box' }}
        />
      </div>

      {/* TABLE */}
      <div style={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '8px', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
          <thead>
            <tr style={{ backgroundColor: '#1a1a1a', color: '#888', borderBottom: '2px solid #333' }}>
              <th style={thStyle}>Player</th>
              <th style={thStyle}>Course</th>
              <th style={thStyle}>Date / Time</th>
              <th style={thStyle}>Status</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: '28px', textAlign: 'center', color: '#555' }}>No bookings match the current filters.</td></tr>
            ) : (
              visible.map((b) => {
                const busy = busyId === b.id;
                const canConfirm = b.status === 'pending';
                const canReject = b.status === 'pending';
                const canCancel = b.status === 'pending' || b.status === 'confirmed';
                return (
                  <tr key={b.id} style={{ borderBottom: '1px solid #222' }}>
                    <td style={tdStyle}>
                      <div style={{ color: '#fff', fontWeight: 600 }}>{b.playerName}</div>
                      <div style={{ fontFamily: 'monospace', color: '#555', fontSize: '11px' }}>{b.playerUid}</div>
                    </td>
                    <td style={tdStyle}>{b.courseName}</td>
                    <td style={tdStyle}>
                      <span>{b.date}</span>{' '}
                      <span style={{ color: '#fff', fontWeight: 'bold' }}>{b.time}</span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', backgroundColor: `${statusColor(b.status)}22`, color: statusColor(b.status) }}>
                        {b.status}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button
                        onClick={() => resolve(b.id, 'confirm')}
                        disabled={busy || !canConfirm}
                        style={actionBtn('#4CAF50', busy || !canConfirm)}
                        title={canConfirm ? 'Force confirm this booking' : 'Only pending bookings can be confirmed'}
                      >
                        {busy ? '…' : 'Force Confirm'}
                      </button>
                      <button
                        onClick={() => resolve(b.id, 'reject')}
                        disabled={busy || !canReject}
                        style={actionBtn('#ff4444', busy || !canReject)}
                        title={canReject ? 'Reject this booking and release the seat' : 'Only pending bookings can be rejected'}
                      >
                        {busy ? '…' : 'Reject'}
                      </button>
                      <button
                        onClick={() => resolve(b.id, 'cancel')}
                        disabled={busy || !canCancel}
                        style={actionBtn('#d4af37', busy || !canCancel)}
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
    </div>
  );
}

const thStyle = { padding: '12px 14px', fontSize: '11px', fontWeight: 700 as const, textTransform: 'uppercase' as const };
const tdStyle = { padding: '12px 14px', color: '#ccc', verticalAlign: 'top' as const };
const actionBtn = (color: string, disabled: boolean) => ({
  marginLeft: '6px',
  background: 'transparent',
  border: `1px solid ${disabled ? '#333' : color}`,
  color: disabled ? '#555' : color,
  borderRadius: '4px',
  padding: '6px 12px',
  cursor: disabled ? 'not-allowed' : 'pointer',
  fontWeight: 700 as const,
  fontSize: '11px',
});
