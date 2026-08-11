// ==========================================
// FILE: src/components/B2B/enterprise/VenueManager.tsx
// Enterprise portal — Venues. Lists the courses this enterprise operates
// (course_operators where operatorUid == authed uid) and onboards new venues
// through the EXISTING claimCourseOperator callable. The client only reads its
// own scope; the authoritative operator write happens server-side.
// ==========================================
import { useState, useEffect } from 'react';
import { collection, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../../../firebaseConfig';

interface CourseOption { courseID: string; label: string; city?: string; }
interface OperatedCourse { courseId: string; courseName: string; }

export default function VenueManager({ partnerUid }: { partnerUid: string }) {
  const [vault, setVault] = useState<CourseOption[]>([]);
  const [operated, setOperated] = useState<OperatedCourse[]>([]);
  const [claimCourseId, setClaimCourseId] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [note, setNote] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const notify = (msg: string, type: 'success' | 'error') => {
    setNote({ msg, type });
    setTimeout(() => setNote(null), 4000);
  };

  // Global course vault (for the onboarding picker).
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
            return { courseID: id, label: place ? `${name} — ${place}` : name, city: c.city };
          }).filter((o) => o.courseID).sort((a, b) => a.label.localeCompare(b.label))
        );
      } catch (e) {
        console.error('Venue vault load error:', e);
      }
    })();
  }, []);

  // Courses THIS enterprise operates.
  useEffect(() => {
    if (!partnerUid || partnerUid === 'UNKNOWN_USER') return;
    const q = query(collection(db, 'course_operators'), where('operatorUid', '==', partnerUid));
    const unsub = onSnapshot(q, (snap) => {
      setOperated(snap.docs.map((d) => {
        const o = d.data() as any;
        return { courseId: o.courseId || d.id, courseName: o.courseName || d.id } as OperatedCourse;
      }));
    }, (err) => console.error('Venue operator sync error:', err));
    return () => unsub();
  }, [partnerUid]);

  const operatedIds = new Set(operated.map((o) => o.courseId));
  const claimable = vault.filter((v) => !operatedIds.has(v.courseID));

  const onboardVenue = async () => {
    if (!claimCourseId) return notify('Select a venue to onboard.', 'error');
    setIsBusy(true);
    try {
      const fn = httpsCallable(getFunctions(), 'claimCourseOperator');
      const res: any = await fn({ courseId: claimCourseId });
      if (!res?.data?.success) throw new Error('Onboarding was not accepted.');
      notify(`Onboarded ${res.data.courseName} as an operated venue.`, 'success');
      setClaimCourseId('');
    } catch (e: any) {
      notify(e?.message || 'Failed to onboard venue.', 'error');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div style={{ padding: '20px', color: '#fff', maxWidth: '1100px', margin: '0 auto' }}>
      {note && (
        <div style={{ position: 'fixed', top: '20px', right: '20px', padding: '16px 24px', zIndex: 1000, backgroundColor: note.type === 'error' ? '#ff4444' : '#4CAF50', borderRadius: '8px', fontWeight: 'bold' }}>{note.msg}</div>
      )}

      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ color: '#d4af37', margin: 0, letterSpacing: '1px' }}>Venues</h2>
        <p style={{ color: '#888', fontSize: '14px', marginTop: '5px' }}>Onboard and review the golf courses your enterprise operates. Tee-time availability and pricing per venue are published from Core Operations.</p>
      </div>

      {/* ONBOARD */}
      <div style={{ backgroundColor: '#111', border: '1px solid #d4af37', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
        <h3 style={{ marginTop: 0, color: '#d4af37', fontSize: '15px' }}>Onboard a Venue</h3>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <select value={claimCourseId} onChange={(e) => setClaimCourseId(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
            <option value="">Select a venue to onboard…</option>
            {claimable.map((c) => <option key={c.courseID} value={c.courseID}>{c.label}</option>)}
          </select>
          <button onClick={onboardVenue} disabled={isBusy} style={{ padding: '10px 18px', backgroundColor: isBusy ? '#555' : '#d4af37', color: '#000', border: 'none', borderRadius: '6px', fontWeight: 900, cursor: isBusy ? 'not-allowed' : 'pointer' }}>
            {isBusy ? '…' : 'ONBOARD'}
          </button>
        </div>
        <div style={{ color: '#666', fontSize: '11px', marginTop: '10px' }}>Onboarding assigns your enterprise as the exclusive operator of the selected venue.</div>
      </div>

      {/* OPERATED VENUES */}
      <div style={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '8px', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, color: '#aaa', fontSize: '14px', textTransform: 'uppercase' }}>Operated Venues</h3>
          <span style={{ color: '#4CAF50', fontSize: '13px', fontWeight: 'bold' }}>{operated.length} total</span>
        </div>
        {operated.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#555', border: '1px dashed #333', borderRadius: '6px' }}>No venues onboarded yet.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
            {operated.map((o) => (
              <div key={o.courseId} style={{ backgroundColor: '#1a1a1a', border: '1px solid #222', borderRadius: '8px', padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: '#0a0a0a', border: '1px solid #333', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>⛳</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.courseName}</div>
                  <div style={{ color: '#666', fontSize: '11px' }}>ID: {o.courseId}</div>
                </div>
                <span style={{ color: '#4CAF50', fontSize: '11px', fontWeight: 'bold' }}>✓ ACTIVE</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const inputStyle = { width: '100%', padding: '9px', backgroundColor: '#0a0a0a', border: '1px solid #333', color: '#fff', borderRadius: '4px', boxSizing: 'border-box' as const };
