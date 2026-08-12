// ==========================================
// FILE: src/components/admin/TeeTimeInventory.tsx
// Admin course & tee-time inventory management.
// Courses come from the real `courses` vault; every tee-time write goes through
// the server-authoritative manageTeeTimeSlot Cloud Function (capacity/bookedCount
// stay server-owned so the booking flow has an authoritative counter).
// ==========================================
import { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, onSnapshot, query, orderBy } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../../firebaseConfig';

interface CourseOption {
  courseID: string;
  label: string;
}

interface TeeSlot {
  id: string;
  courseId: string;
  courseName: string;
  date: string;
  time: string;
  capacity: number;
  bookedCount: number;
  status: 'open' | 'closed';
}

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function TeeTimeInventory() {
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [slots, setSlots] = useState<TeeSlot[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [notification, setNotification] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // Form state
  const [courseId, setCourseId] = useState('');
  const [date, setDate] = useState(todayStr());
  const [time, setTime] = useState('08:00');
  const [capacity, setCapacity] = useState('4');
  const [filterDate, setFilterDate] = useState('');

  const notify = (msg: string, type: 'success' | 'error') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // Load the real course vault once for the picker.
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collection(db, 'courses'));
        const opts = snap.docs
          .map((d) => {
            const c = d.data() as any;
            const id = c.courseID || d.id;
            const name = c.clubName || c.name || id;
            const place = [c.city, c.country].filter(Boolean).join(', ');
            return { courseID: id, label: place ? `${name} — ${place}` : name };
          })
          .filter((o) => o.courseID)
          .sort((a, b) => a.label.localeCompare(b.label));
        setCourses(opts);
      } catch (e) {
        console.error('Course vault load error:', e);
        notify('Failed to load course vault.', 'error');
      }
    })();
  }, []);

  // Stream the live tee-time inventory.
  useEffect(() => {
    const q = query(collection(db, 'tee_time_slots'), orderBy('date'), orderBy('time'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setSlots(
          snap.docs.map((d) => {
            const s = d.data() as any;
            return {
              id: d.id,
              courseId: s.courseId || '',
              courseName: s.courseName || s.courseId || 'Unknown',
              date: s.date || '',
              time: s.time || '',
              capacity: Number(s.capacity || 0),
              bookedCount: Number(s.bookedCount || 0),
              status: s.status === 'closed' ? 'closed' : 'open',
            } as TeeSlot;
          })
        );
      },
      (err) => console.error('Tee-time inventory sync error:', err)
    );
    return () => unsub();
  }, []);

  const visibleSlots = useMemo(
    () => (filterDate ? slots.filter((s) => s.date === filterDate) : slots),
    [slots, filterDate]
  );

  const publishSlot = async () => {
    if (!courseId) return notify('Select a course first.', 'error');
    setIsBusy(true);
    try {
      const fn = httpsCallable(getFunctions(), 'manageTeeTimeSlot');
      const res: any = await fn({
        action: 'create',
        courseId,
        date,
        time,
        capacity: parseInt(capacity, 10),
      });
      if (!res?.data?.success) throw new Error('Slot was not created.');
      notify(`Published tee-time ${date} ${time}.`, 'success');
    } catch (e: any) {
      notify(e?.message || 'Failed to publish tee-time.', 'error');
    } finally {
      setIsBusy(false);
    }
  };

  const setStatus = async (slotId: string, status: 'open' | 'closed') => {
    setIsBusy(true);
    try {
      const fn = httpsCallable(getFunctions(), 'manageTeeTimeSlot');
      const res: any = await fn({ action: 'setStatus', slotId, status });
      if (!res?.data?.success) throw new Error('Status change was not accepted.');
      notify(`Slot ${status === 'open' ? 'opened' : 'closed'}.`, 'success');
    } catch (e: any) {
      notify(e?.message || 'Failed to update slot.', 'error');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div style={{ padding: '24px', color: '#fff' }}>
      {notification && (
        <div
          style={{
            position: 'fixed', top: '20px', right: '20px', padding: '16px 24px', zIndex: 1000,
            backgroundColor: notification.type === 'error' ? '#ff4444' : '#4CAF50', borderRadius: '8px', fontWeight: 'bold',
          }}
        >
          {notification.msg}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #333', paddingBottom: '12px', marginBottom: '24px' }}>
        <h2 style={{ color: '#d4af37', margin: 0 }}>⛳ Tee-Time Inventory</h2>
        <span style={{ color: '#666', fontSize: '12px' }}>{courses.length} courses in vault · {slots.length} slots published</span>
      </div>

      {/* PUBLISH FORM */}
      <div style={{ backgroundColor: '#111', border: '1px solid #d4af37', borderRadius: '8px', padding: '20px', marginBottom: '24px' }}>
        <h3 style={{ marginTop: 0, color: '#d4af37', fontSize: '15px' }}>Publish Bookable Tee-Time</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: '12px', alignItems: 'end' }}>
          <div>
            <label style={labelStyle}>Course (from vault)</label>
            <select value={courseId} onChange={(e) => setCourseId(e.target.value)} style={inputStyle}>
              <option value="">Select a course…</option>
              {courses.map((c) => (
                <option key={c.courseID} value={c.courseID}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Date</label>
            <input type="date" min={todayStr()} value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Time</label>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Capacity</label>
            <input type="number" min={1} max={8} value={capacity} onChange={(e) => setCapacity(e.target.value)} style={inputStyle} />
          </div>
          <button
            onClick={publishSlot}
            disabled={isBusy}
            style={{ padding: '10px 18px', backgroundColor: isBusy ? '#555' : '#d4af37', color: '#000', border: 'none', borderRadius: '6px', fontWeight: 900, cursor: isBusy ? 'not-allowed' : 'pointer', height: '40px' }}
          >
            {isBusy ? '…' : 'PUBLISH'}
          </button>
        </div>
      </div>

      {/* LIVE INVENTORY */}
      <div style={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '8px', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, color: '#aaa', fontSize: '14px', textTransform: 'uppercase' }}>Published Inventory</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>Filter date</label>
            <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} style={{ ...inputStyle, width: 'auto' }} />
            {filterDate && (
              <button onClick={() => setFilterDate('')} style={{ background: 'transparent', border: '1px solid #444', color: '#aaa', borderRadius: '4px', padding: '6px 10px', cursor: 'pointer', fontSize: '12px' }}>Clear</button>
            )}
          </div>
        </div>

        {visibleSlots.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#555', border: '1px dashed #333', borderRadius: '6px' }}>
            No tee-time slots published{filterDate ? ' for this date' : ''} yet.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ color: '#888', borderBottom: '1px solid #333' }}>
                  <th style={thStyle}>Course</th>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Time</th>
                  <th style={thStyle}>Booked / Cap</th>
                  <th style={thStyle}>Status</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {visibleSlots.map((s) => {
                  const full = s.bookedCount >= s.capacity;
                  return (
                    <tr key={s.id} style={{ borderBottom: '1px solid #222' }}>
                      <td style={tdStyle}>{s.courseName}</td>
                      <td style={tdStyle}>{s.date}</td>
                      <td style={{ ...tdStyle, fontWeight: 'bold', color: '#fff' }}>{s.time}</td>
                      <td style={{ ...tdStyle, color: full ? '#ff4444' : '#4CAF50', fontWeight: 'bold' }}>{s.bookedCount} / {s.capacity}</td>
                      <td style={tdStyle}>
                        <span style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', backgroundColor: s.status === 'open' ? 'rgba(76,175,80,0.12)' : 'rgba(255,193,7,0.12)', color: s.status === 'open' ? '#4CAF50' : '#FFC107' }}>
                          {s.status}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        {s.status === 'open' ? (
                          <button onClick={() => setStatus(s.id, 'closed')} disabled={isBusy} style={actionBtn('#FFC107')}>Close</button>
                        ) : (
                          <button onClick={() => setStatus(s.id, 'open')} disabled={isBusy} style={actionBtn('#4CAF50')}>Open</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const labelStyle = { display: 'block', color: '#888', fontSize: '11px', marginBottom: '6px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' };
const inputStyle = { width: '100%', padding: '9px', backgroundColor: '#0a0a0a', border: '1px solid #333', color: '#fff', borderRadius: '4px', boxSizing: 'border-box' as const };
const thStyle = { padding: '10px 12px', fontSize: '11px', fontWeight: 700 as const };
const tdStyle = { padding: '10px 12px', color: '#ccc' };
const actionBtn = (color: string) => ({ background: 'transparent', border: `1px solid ${color}`, color, borderRadius: '4px', padding: '5px 12px', cursor: 'pointer', fontWeight: 700 as const, fontSize: '12px' });
