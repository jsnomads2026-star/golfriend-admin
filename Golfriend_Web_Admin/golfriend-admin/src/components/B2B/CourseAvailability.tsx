// ==========================================
// FILE: src/components/B2B/CourseAvailability.tsx
// Small-business portal: course onboarding + tee-time availability & pricing.
// A partner claims the course they operate (claimCourseOperator) and then
// authors that course's bookable tee-times (manageTeeTimeSlot). All authoritative
// writes go through Cloud Functions; the client only reads its own scope.
// ==========================================
import { useState, useEffect } from 'react';
import { collection, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../../firebaseConfig';

interface CourseOption { courseID: string; label: string; }
interface OperatedCourse { courseId: string; courseName: string; }
interface TeeSlot {
  id: string; courseId: string; courseName: string; date: string; time: string;
  capacity: number; bookedCount: number; priceChips: number; status: 'open' | 'closed';
}

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function CourseAvailability({ partnerUid }: { partnerUid: string }) {
  const [vault, setVault] = useState<CourseOption[]>([]);
  const [operated, setOperated] = useState<OperatedCourse[]>([]);
  const [slots, setSlots] = useState<TeeSlot[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [note, setNote] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const [claimCourseId, setClaimCourseId] = useState('');
  const [courseId, setCourseId] = useState('');
  const [date, setDate] = useState(todayStr());
  const [time, setTime] = useState('08:00');
  const [capacity, setCapacity] = useState('4');
  const [priceChips, setPriceChips] = useState('500');

  const notify = (msg: string, type: 'success' | 'error') => {
    setNote({ msg, type });
    setTimeout(() => setNote(null), 4000);
  };

  // Course vault (for the claim picker).
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collection(db, 'courses'));
        setVault(
          snap.docs.map((d) => {
            const c = d.data() as any;
            const id = c.courseID || d.id;
            const name = c.clubName || c.name || id;
            const place = [c.city, c.country].filter(Boolean).join(', ');
            return { courseID: id, label: place ? `${name} — ${place}` : name };
          }).filter((o) => o.courseID).sort((a, b) => a.label.localeCompare(b.label))
        );
      } catch (e) {
        console.error('Vault load error:', e);
      }
    })();
  }, []);

  // The courses THIS partner operates.
  useEffect(() => {
    if (!partnerUid || partnerUid === 'UNKNOWN_USER') return;
    const q = query(collection(db, 'course_operators'), where('operatorUid', '==', partnerUid));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => {
        const o = d.data() as any;
        return { courseId: o.courseId || d.id, courseName: o.courseName || d.id } as OperatedCourse;
      });
      setOperated(list);
      if (!courseId && list.length) setCourseId(list[0].courseId);
    }, (err) => console.error('Operator sync error:', err));
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerUid]);

  // This partner's tee-time inventory (scoped to operated courses; 'in' max 10).
  useEffect(() => {
    const ids = operated.map((o) => o.courseId).slice(0, 10);
    if (ids.length === 0) { setSlots([]); return; }
    const q = query(collection(db, 'tee_time_slots'), where('courseId', 'in', ids));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => {
        const s = d.data() as any;
        return {
          id: d.id, courseId: s.courseId || '', courseName: s.courseName || s.courseId || 'Unknown',
          date: s.date || '', time: s.time || '', capacity: Number(s.capacity || 0),
          bookedCount: Number(s.bookedCount || 0), priceChips: Number(s.priceChips || 0),
          status: s.status === 'closed' ? 'closed' : 'open',
        } as TeeSlot;
      });
      list.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
      setSlots(list);
    }, (err) => console.error('Inventory sync error:', err));
    return () => unsub();
  }, [operated]);

  const operatedIds = new Set(operated.map((o) => o.courseId));
  const claimable = vault.filter((v) => !operatedIds.has(v.courseID));

  const claimCourse = async () => {
    if (!claimCourseId) return notify('Select a course to onboard.', 'error');
    setIsBusy(true);
    try {
      const fn = httpsCallable(getFunctions(), 'claimCourseOperator');
      const res: any = await fn({ courseId: claimCourseId });
      if (!res?.data?.success) throw new Error('Onboarding was not accepted.');
      notify(`Onboarded ${res.data.courseName}. You can now publish its tee-times.`, 'success');
      setClaimCourseId('');
    } catch (e: any) {
      notify(e?.message || 'Failed to onboard course.', 'error');
    } finally {
      setIsBusy(false);
    }
  };

  const publishSlot = async () => {
    if (!courseId) return notify('Select one of your courses first.', 'error');
    setIsBusy(true);
    try {
      const fn = httpsCallable(getFunctions(), 'manageTeeTimeSlot');
      const res: any = await fn({
        action: 'create', courseId, date, time,
        capacity: parseInt(capacity, 10), priceChips: parseInt(priceChips, 10),
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
    <div style={{ padding: '20px', color: '#fff', maxWidth: '1200px', margin: '0 auto' }}>
      {note && (
        <div style={{ position: 'fixed', top: '20px', right: '20px', padding: '16px 24px', zIndex: 1000, backgroundColor: note.type === 'error' ? '#ff4444' : '#4CAF50', borderRadius: '8px', fontWeight: 'bold' }}>
          {note.msg}
        </div>
      )}

      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ color: '#d4af37', margin: 0, letterSpacing: '1px' }}>Course & Availability</h2>
        <p style={{ color: '#888', fontSize: '14px', marginTop: '5px' }}>Onboard the course you operate, then publish bookable tee-times with your own pricing.</p>
      </div>

      {/* ONBOARDING */}
      <div style={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
        <h3 style={{ marginTop: 0, color: '#fff', fontSize: '15px' }}>1 · Onboard a Course</h3>
        {operated.length > 0 && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
            {operated.map((o) => (
              <span key={o.courseId} style={{ backgroundColor: 'rgba(76,175,80,0.12)', color: '#4CAF50', border: '1px solid #2e7d32', borderRadius: '20px', padding: '5px 12px', fontSize: '12px', fontWeight: 'bold' }}>
                ✓ {o.courseName}
              </span>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <select value={claimCourseId} onChange={(e) => setClaimCourseId(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
            <option value="">Select a course to onboard…</option>
            {claimable.map((c) => <option key={c.courseID} value={c.courseID}>{c.label}</option>)}
          </select>
          <button onClick={claimCourse} disabled={isBusy} style={{ padding: '10px 18px', backgroundColor: isBusy ? '#555' : '#d4af37', color: '#000', border: 'none', borderRadius: '6px', fontWeight: 900, cursor: isBusy ? 'not-allowed' : 'pointer' }}>
            ONBOARD
          </button>
        </div>
      </div>

      {/* AVAILABILITY / PRICING */}
      <div style={{ backgroundColor: '#111', border: '1px solid #d4af37', borderRadius: '8px', padding: '20px', marginBottom: '20px', opacity: operated.length ? 1 : 0.5 }}>
        <h3 style={{ marginTop: 0, color: '#d4af37', fontSize: '15px' }}>2 · Publish Availability & Pricing</h3>
        {operated.length === 0 ? (
          <p style={{ color: '#888', fontSize: '13px' }}>Onboard a course above to unlock availability publishing.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr auto', gap: '12px', alignItems: 'end' }}>
            <div>
              <label style={labelStyle}>Your course</label>
              <select value={courseId} onChange={(e) => setCourseId(e.target.value)} style={inputStyle}>
                {operated.map((o) => <option key={o.courseId} value={o.courseId}>{o.courseName}</option>)}
              </select>
            </div>
            <div><label style={labelStyle}>Date</label><input type="date" min={todayStr()} value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} /></div>
            <div><label style={labelStyle}>Time</label><input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={inputStyle} /></div>
            <div><label style={labelStyle}>Capacity</label><input type="number" min={1} max={8} value={capacity} onChange={(e) => setCapacity(e.target.value)} style={inputStyle} /></div>
            <div><label style={labelStyle}>Price (chips)</label><input type="number" min={0} value={priceChips} onChange={(e) => setPriceChips(e.target.value)} style={inputStyle} /></div>
            <button onClick={publishSlot} disabled={isBusy} style={{ padding: '10px 18px', backgroundColor: isBusy ? '#555' : '#d4af37', color: '#000', border: 'none', borderRadius: '6px', fontWeight: 900, cursor: isBusy ? 'not-allowed' : 'pointer', height: '40px' }}>
              {isBusy ? '…' : 'PUBLISH'}
            </button>
          </div>
        )}
      </div>

      {/* INVENTORY */}
      <div style={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '8px', padding: '20px' }}>
        <h3 style={{ marginTop: 0, color: '#aaa', fontSize: '14px', textTransform: 'uppercase' }}>Your Published Tee-Times</h3>
        {slots.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#555', border: '1px dashed #333', borderRadius: '6px' }}>No tee-times published yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ color: '#888', borderBottom: '1px solid #333' }}>
                  <th style={thStyle}>Course</th><th style={thStyle}>Date</th><th style={thStyle}>Time</th>
                  <th style={thStyle}>Booked / Cap</th><th style={thStyle}>Price</th><th style={thStyle}>Status</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {slots.map((s) => {
                  const full = s.bookedCount >= s.capacity;
                  return (
                    <tr key={s.id} style={{ borderBottom: '1px solid #222' }}>
                      <td style={tdStyle}>{s.courseName}</td>
                      <td style={tdStyle}>{s.date}</td>
                      <td style={{ ...tdStyle, fontWeight: 'bold', color: '#fff' }}>{s.time}</td>
                      <td style={{ ...tdStyle, color: full ? '#ff4444' : '#4CAF50', fontWeight: 'bold' }}>{s.bookedCount} / {s.capacity}</td>
                      <td style={tdStyle}>{s.priceChips.toLocaleString()} 🪙</td>
                      <td style={tdStyle}>
                        <span style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', backgroundColor: s.status === 'open' ? 'rgba(76,175,80,0.12)' : 'rgba(255,193,7,0.12)', color: s.status === 'open' ? '#4CAF50' : '#FFC107' }}>{s.status}</span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        {s.status === 'open'
                          ? <button onClick={() => setStatus(s.id, 'closed')} disabled={isBusy} style={actionBtn('#FFC107')}>Close</button>
                          : <button onClick={() => setStatus(s.id, 'open')} disabled={isBusy} style={actionBtn('#4CAF50')}>Open</button>}
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
