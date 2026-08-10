// ==========================================
// FILE: src/components/B2B/BookingRequests.tsx
// Small-business portal: incoming booking requests for the operator's courses.
// The operator confirms or rejects; the server settles the seat + escrow hold
// and stamps the player's localized status. All writes via respondBooking.
// ==========================================
import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../../firebaseConfig';

interface Booking {
  id: string;
  courseName: string;
  date: string;
  time: string;
  playerName: string;
  priceChips: number;
  status: string;
}

export default function BookingRequests({ partnerUid }: { partnerUid: string }) {
  const [operatedIds, setOperatedIds] = useState<string[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const notify = (msg: string, type: 'success' | 'error') => {
    setNote({ msg, type });
    setTimeout(() => setNote(null), 4000);
  };

  useEffect(() => {
    if (!partnerUid || partnerUid === 'UNKNOWN_USER') return;
    const q = query(collection(db, 'course_operators'), where('operatorUid', '==', partnerUid));
    const unsub = onSnapshot(q, (snap) => setOperatedIds(snap.docs.map((d) => (d.data() as any).courseId || d.id)));
    return () => unsub();
  }, [partnerUid]);

  useEffect(() => {
    const ids = operatedIds.slice(0, 10);
    if (ids.length === 0) { setBookings([]); return; }
    const q = query(collection(db, 'bookings'), where('courseId', 'in', ids));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => {
        const b = d.data() as any;
        return {
          id: d.id, courseName: b.courseName || b.courseId || 'Course',
          date: b.date || '', time: b.time || '', playerName: b.playerName || 'Player',
          priceChips: Number(b.priceChips || 0), status: b.status || 'pending',
        } as Booking;
      });
      // Pending first, then most recent date/time.
      list.sort((a, b) => {
        if (a.status === 'pending' && b.status !== 'pending') return -1;
        if (a.status !== 'pending' && b.status === 'pending') return 1;
        return (b.date + b.time).localeCompare(a.date + a.time);
      });
      setBookings(list);
    }, (err) => console.error('Bookings sync error:', err));
    return () => unsub();
  }, [operatedIds]);

  const respond = async (bookingId: string, decision: 'confirm' | 'reject') => {
    setBusyId(bookingId);
    try {
      const fn = httpsCallable(getFunctions(), 'respondBooking');
      const res: any = await fn({ bookingId, decision });
      if (!res?.data?.success) throw new Error('Response was not accepted.');
      notify(`Booking ${decision === 'confirm' ? 'confirmed' : 'rejected'}.`, 'success');
    } catch (e: any) {
      notify(e?.message || 'Failed to respond to booking.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const pending = bookings.filter((b) => b.status === 'pending');
  const resolved = bookings.filter((b) => b.status !== 'pending').slice(0, 20);

  const statusChip = (status: string) => {
    const map: Record<string, { c: string; bg: string }> = {
      pending: { c: '#FFC107', bg: 'rgba(255,193,7,0.12)' },
      confirmed: { c: '#4CAF50', bg: 'rgba(76,175,80,0.12)' },
      rejected: { c: '#ff4444', bg: 'rgba(255,68,68,0.12)' },
    };
    const s = map[status] || map.pending;
    return <span style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', backgroundColor: s.bg, color: s.c }}>{status}</span>;
  };

  return (
    <div style={{ padding: '20px', color: '#fff', maxWidth: '1100px', margin: '0 auto' }}>
      {note && (
        <div style={{ position: 'fixed', top: '20px', right: '20px', padding: '16px 24px', zIndex: 1000, backgroundColor: note.type === 'error' ? '#ff4444' : '#4CAF50', borderRadius: '8px', fontWeight: 'bold' }}>{note.msg}</div>
      )}

      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ color: '#d4af37', margin: 0, letterSpacing: '1px' }}>Booking Requests</h2>
        <p style={{ color: '#888', fontSize: '14px', marginTop: '5px' }}>Confirm or reject incoming tee-time bookings for your courses. Rejections auto-release the seat and refund the player's hold.</p>
      </div>

      <div style={{ backgroundColor: '#111', border: '1px solid #d4af37', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
        <h3 style={{ marginTop: 0, color: '#d4af37', fontSize: '14px', textTransform: 'uppercase' }}>Pending ({pending.length})</h3>
        {pending.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px', color: '#555', border: '1px dashed #333', borderRadius: '6px' }}>No pending booking requests.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {pending.map((b) => (
              <div key={b.id} style={{ display: 'flex', alignItems: 'center', padding: '14px', backgroundColor: '#1a1a1a', borderRadius: '6px', border: '1px solid #222' }}>
                <div style={{ flex: 2 }}>
                  <div style={{ color: '#fff', fontWeight: 'bold' }}>{b.playerName}</div>
                  <div style={{ color: '#aaa', fontSize: '12px' }}>{b.courseName}</div>
                </div>
                <div style={{ flex: 1, color: '#ccc', fontSize: '13px' }}>{b.date} <strong style={{ color: '#fff' }}>{b.time}</strong></div>
                <div style={{ flex: 1, color: '#d4af37', fontSize: '13px' }}>{b.priceChips.toLocaleString()} 🪙</div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => respond(b.id, 'confirm')} disabled={busyId === b.id} style={btn('#4CAF50', '#0a2a12')}>Confirm</button>
                  <button onClick={() => respond(b.id, 'reject')} disabled={busyId === b.id} style={btn('#ff4444', '#2a0a0a')}>Reject</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '8px', padding: '20px' }}>
        <h3 style={{ marginTop: 0, color: '#aaa', fontSize: '14px', textTransform: 'uppercase' }}>Recently Resolved</h3>
        {resolved.length === 0 ? (
          <div style={{ color: '#555', fontSize: '13px' }}>Nothing resolved yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead><tr style={{ color: '#888', borderBottom: '1px solid #333' }}>
                <th style={th}>Player</th><th style={th}>Course</th><th style={th}>Date</th><th style={th}>Time</th><th style={th}>Status</th>
              </tr></thead>
              <tbody>
                {resolved.map((b) => (
                  <tr key={b.id} style={{ borderBottom: '1px solid #222' }}>
                    <td style={td}>{b.playerName}</td><td style={td}>{b.courseName}</td>
                    <td style={td}>{b.date}</td><td style={{ ...td, color: '#fff', fontWeight: 'bold' }}>{b.time}</td>
                    <td style={td}>{statusChip(b.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const btn = (color: string, bg: string) => ({ backgroundColor: bg, color, border: `1px solid ${color}`, borderRadius: '4px', padding: '7px 16px', cursor: 'pointer', fontWeight: 700 as const, fontSize: '12px' });
const th = { padding: '10px 12px', fontSize: '11px', fontWeight: 700 as const };
const td = { padding: '10px 12px', color: '#ccc' };
