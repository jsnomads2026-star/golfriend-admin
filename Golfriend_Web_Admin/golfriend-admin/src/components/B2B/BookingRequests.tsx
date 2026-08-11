// ==========================================
// FILE: src/components/B2B/BookingRequests.tsx
// Small-business portal: incoming booking requests for the operator's courses.
// The operator confirms or rejects; the server settles the seat and stamps the
// player's localized status. All writes via respondBooking / cancelBooking /
// sendBookingMessage — this booking flow is strictly NON-FINANCIAL.
// ==========================================
import { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../../firebaseConfig';

interface Booking {
  id: string;
  courseName: string;
  date: string;
  time: string;
  playerName: string;
  status: string;
}

interface Message {
  id: string;
  senderRole: string;
  text: string;
  createdAt: any;
}

export default function BookingRequests({ partnerUid }: { partnerUid: string }) {
  const [operatedIds, setOperatedIds] = useState<string[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const threadEnd = useRef<HTMLDivElement | null>(null);

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
          status: b.status || 'pending',
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

  // Live-stream the message thread for the selected booking.
  useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    const q = query(collection(db, 'bookings', activeId, 'messages'), orderBy('createdAt'));
    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => {
        const m = d.data() as any;
        return { id: d.id, senderRole: m.senderRole || 'player', text: m.text || '', createdAt: m.createdAt } as Message;
      }));
    }, (err) => console.error('Message sync error:', err));
    return () => unsub();
  }, [activeId]);

  useEffect(() => {
    threadEnd.current?.scrollIntoView({ block: 'nearest' });
  }, [messages]);

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

  const cancel = async (bookingId: string) => {
    setBusyId(bookingId);
    try {
      const fn = httpsCallable(getFunctions(), 'cancelBooking');
      const res: any = await fn({ bookingId });
      if (!res?.data?.success) throw new Error('Cancellation was not accepted.');
      notify('Booking cancelled — seat released.', 'success');
    } catch (e: any) {
      notify(e?.message || 'Failed to cancel booking.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || !activeId) return;
    setSending(true);
    try {
      const fn = httpsCallable(getFunctions(), 'sendBookingMessage');
      const res: any = await fn({ bookingId: activeId, text });
      if (!res?.data?.success) throw new Error('Message was not sent.');
      setDraft('');
    } catch (e: any) {
      notify(e?.message || 'Failed to send message.', 'error');
    } finally {
      setSending(false);
    }
  };

  const pending = bookings.filter((b) => b.status === 'pending');
  const resolved = bookings.filter((b) => b.status !== 'pending').slice(0, 20);
  const activeBooking = bookings.find((b) => b.id === activeId) || null;

  const statusChip = (status: string) => {
    const map: Record<string, { c: string; bg: string }> = {
      pending: { c: '#FFC107', bg: 'rgba(255,193,7,0.12)' },
      confirmed: { c: '#4CAF50', bg: 'rgba(76,175,80,0.12)' },
      rejected: { c: '#ff4444', bg: 'rgba(255,68,68,0.12)' },
      cancelled: { c: '#888', bg: 'rgba(136,136,136,0.12)' },
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
        <p style={{ color: '#888', fontSize: '14px', marginTop: '5px' }}>Confirm or reject incoming tee-time bookings for your courses. Rejections and cancellations auto-release the seat.</p>
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
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => respond(b.id, 'confirm')} disabled={busyId === b.id} style={btn('#4CAF50', '#0a2a12')}>Confirm</button>
                  <button onClick={() => respond(b.id, 'reject')} disabled={busyId === b.id} style={btn('#ff4444', '#2a0a0a')}>Reject</button>
                  <button onClick={() => setActiveId(b.id)} style={btn('#d4af37', '#2a230a')}>Message</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
        <h3 style={{ marginTop: 0, color: '#aaa', fontSize: '14px', textTransform: 'uppercase' }}>Recently Resolved</h3>
        {resolved.length === 0 ? (
          <div style={{ color: '#555', fontSize: '13px' }}>Nothing resolved yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead><tr style={{ color: '#888', borderBottom: '1px solid #333' }}>
                <th style={th}>Player</th><th style={th}>Course</th><th style={th}>Date</th><th style={th}>Time</th><th style={th}>Status</th><th style={{ ...th, textAlign: 'right' }}>Actions</th>
              </tr></thead>
              <tbody>
                {resolved.map((b) => (
                  <tr key={b.id} style={{ borderBottom: '1px solid #222' }}>
                    <td style={td}>{b.playerName}</td><td style={td}>{b.courseName}</td>
                    <td style={td}>{b.date}</td><td style={{ ...td, color: '#fff', fontWeight: 'bold' }}>{b.time}</td>
                    <td style={td}>{statusChip(b.status)}</td>
                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {b.status === 'confirmed' && (
                        <button onClick={() => cancel(b.id)} disabled={busyId === b.id} style={{ ...btn('#ff4444', '#2a0a0a'), marginRight: '6px' }}>Cancel</button>
                      )}
                      <button onClick={() => setActiveId(b.id)} style={btn('#d4af37', '#2a230a')}>Message</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MESSAGING PANEL */}
      {activeBooking && (
        <div style={{ backgroundColor: '#111', border: '1px solid #d4af37', borderRadius: '8px', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ margin: 0, color: '#d4af37', fontSize: '14px', textTransform: 'uppercase' }}>
              Messages — {activeBooking.playerName} · {activeBooking.courseName}
            </h3>
            <button onClick={() => setActiveId(null)} style={btn('#888', '#1a1a1a')}>Close</button>
          </div>
          <div style={{ maxHeight: '260px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', padding: '4px', marginBottom: '12px' }}>
            {messages.length === 0 ? (
              <div style={{ color: '#555', fontSize: '13px', textAlign: 'center', padding: '20px' }}>No messages yet.</div>
            ) : (
              messages.map((m) => {
                const mine = m.senderRole === 'operator';
                return (
                  <div key={m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '70%', backgroundColor: mine ? 'rgba(212,175,55,0.14)' : '#1a1a1a', border: `1px solid ${mine ? '#d4af37' : '#333'}`, borderRadius: '8px', padding: '8px 12px' }}>
                    <div style={{ fontSize: '10px', textTransform: 'uppercase', color: '#888', marginBottom: '3px' }}>{m.senderRole}</div>
                    <div style={{ fontSize: '13px', color: '#fff' }}>{m.text}</div>
                  </div>
                );
              })
            )}
            <div ref={threadEnd} />
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              placeholder="Type a message…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
              style={{ flex: 1, padding: '10px 12px', backgroundColor: '#0a0a0a', border: '1px solid #333', color: '#fff', borderRadius: '6px', boxSizing: 'border-box' }}
            />
            <button onClick={send} disabled={sending || !draft.trim()} style={btn('#4CAF50', '#0a2a12')}>{sending ? '…' : 'Send'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

const btn = (color: string, bg: string) => ({ backgroundColor: bg, color, border: `1px solid ${color}`, borderRadius: '4px', padding: '7px 16px', cursor: 'pointer', fontWeight: 700 as const, fontSize: '12px' });
const th = { padding: '10px 12px', fontSize: '11px', fontWeight: 700 as const };
const td = { padding: '10px 12px', color: '#ccc' };
