// ==========================================
// FILE: src/components/B2B/enterprise/EnterpriseReporting.tsx
// Enterprise portal — Reporting. READ-ONLY aggregates computed client-side from
// Firestore reads scoped to the enterprise's operated courses. Nothing is
// written back. NON-FINANCIAL: metrics are bookings by status, total tee-times
// and capacity utilization only — no revenue/price (booking has no money).
// ==========================================
import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../../firebaseConfig';

interface Slot { courseId: string; courseName: string; capacity: number; bookedCount: number; status: string; }
interface Booking { courseId: string; status: string; }

export default function EnterpriseReporting({ partnerUid }: { partnerUid: string }) {
  const [operated, setOperated] = useState<{ courseId: string; courseName: string }[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);

  // Operated courses (defines the reporting scope).
  useEffect(() => {
    if (!partnerUid || partnerUid === 'UNKNOWN_USER') return;
    const q = query(collection(db, 'course_operators'), where('operatorUid', '==', partnerUid));
    const unsub = onSnapshot(q, (snap) => setOperated(snap.docs.map((d) => {
      const o = d.data() as any;
      return { courseId: o.courseId || d.id, courseName: o.courseName || d.id };
    })), (err) => console.error('Reporting operator sync error:', err));
    return () => unsub();
  }, [partnerUid]);

  const ids = useMemo(() => operated.map((o) => o.courseId).slice(0, 10), [operated]);

  // Tee-time inventory across operated courses ('in' supports max 10 ids).
  useEffect(() => {
    if (ids.length === 0) { setSlots([]); return; }
    const q = query(collection(db, 'tee_time_slots'), where('courseId', 'in', ids));
    const unsub = onSnapshot(q, (snap) => setSlots(snap.docs.map((d) => {
      const s = d.data() as any;
      return {
        courseId: s.courseId || '', courseName: s.courseName || s.courseId || 'Unknown',
        capacity: Number(s.capacity || 0), bookedCount: Number(s.bookedCount || 0),
        status: s.status || 'open',
      } as Slot;
    })), (err) => console.error('Reporting slots sync error:', err));
    return () => unsub();
  }, [ids]);

  // Bookings across operated courses.
  useEffect(() => {
    if (ids.length === 0) { setBookings([]); return; }
    const q = query(collection(db, 'bookings'), where('courseId', 'in', ids));
    const unsub = onSnapshot(q, (snap) => setBookings(snap.docs.map((d) => {
      const b = d.data() as any;
      return { courseId: b.courseId || '', status: b.status || 'pending' } as Booking;
    })), (err) => console.error('Reporting bookings sync error:', err));
    return () => unsub();
  }, [ids]);

  // ---- Aggregates (all derived client-side, display only) ----
  const totalTeeTimes = slots.length;
  const totalCapacity = slots.reduce((sum, s) => sum + s.capacity, 0);
  const totalBooked = slots.reduce((sum, s) => sum + s.bookedCount, 0);
  const utilization = totalCapacity > 0 ? Math.round((totalBooked / totalCapacity) * 100) : 0;

  const byStatus = { pending: 0, confirmed: 0, rejected: 0, cancelled: 0 } as Record<string, number>;
  bookings.forEach((b) => { byStatus[b.status] = (byStatus[b.status] || 0) + 1; });

  // Per-venue breakdown (non-financial).
  const perVenue = operated.map((o) => {
    const vSlots = slots.filter((s) => s.courseId === o.courseId);
    const vBookings = bookings.filter((b) => b.courseId === o.courseId);
    const cap = vSlots.reduce((s, x) => s + x.capacity, 0);
    const booked = vSlots.reduce((s, x) => s + x.bookedCount, 0);
    return {
      courseName: o.courseName,
      teeTimes: vSlots.length,
      util: cap > 0 ? Math.round((booked / cap) * 100) : 0,
      confirmed: vBookings.filter((b) => b.status === 'confirmed').length,
    };
  });

  return (
    <div style={{ padding: '20px', color: '#fff', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ color: '#d4af37', margin: 0, letterSpacing: '1px' }}>Reporting</h2>
        <p style={{ color: '#888', fontSize: '14px', marginTop: '5px' }}>Live operational aggregates across your {operated.length} operated venue{operated.length === 1 ? '' : 's'}. Display only — figures are computed from platform data.</p>
      </div>

      {operated.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '50px', color: '#555', border: '1px dashed #333', borderRadius: '8px' }}>
          Onboard a venue to see reporting. Aggregates appear once you operate at least one course.
        </div>
      ) : (
        <>
          {/* HEADLINE STATS */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '20px' }}>
            <StatCard label="Total Bookings" value={String(bookings.length)} accent="#4CAF50" />
            <StatCard label="Total Tee-Times" value={String(totalTeeTimes)} accent="#d4af37" />
            <StatCard label="Capacity Utilization" value={`${utilization}%`} accent={utilization >= 70 ? '#4CAF50' : '#FFC107'} />
            <StatCard label="Seats Booked / Cap" value={`${totalBooked} / ${totalCapacity}`} accent="#fff" />
          </div>

          {/* BOOKING STATUS BREAKDOWN */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px', marginBottom: '20px' }}>
            <StatCard label="Pending Bookings" value={String(byStatus.pending || 0)} accent="#FFC107" />
            <StatCard label="Confirmed Bookings" value={String(byStatus.confirmed || 0)} accent="#4CAF50" />
            <StatCard label="Rejected Bookings" value={String(byStatus.rejected || 0)} accent="#ff4444" />
            <StatCard label="Cancelled Bookings" value={String(byStatus.cancelled || 0)} accent="#1E88E5" />
          </div>

          {/* PER-VENUE TABLE */}
          <div style={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '8px', padding: '20px' }}>
            <h3 style={{ marginTop: 0, color: '#aaa', fontSize: '14px', textTransform: 'uppercase' }}>Per-Venue Performance</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ color: '#888', borderBottom: '1px solid #333' }}>
                    <th style={th}>Venue</th><th style={th}>Tee-Times</th><th style={th}>Utilization</th>
                    <th style={{ ...th, textAlign: 'right' }}>Confirmed</th>
                  </tr>
                </thead>
                <tbody>
                  {perVenue.map((v) => (
                    <tr key={v.courseName} style={{ borderBottom: '1px solid #222' }}>
                      <td style={{ ...td, color: '#fff', fontWeight: 'bold' }}>{v.courseName}</td>
                      <td style={td}>{v.teeTimes}</td>
                      <td style={{ ...td, color: v.util >= 70 ? '#4CAF50' : '#FFC107', fontWeight: 'bold' }}>{v.util}%</td>
                      <td style={{ ...td, textAlign: 'right' }}>{v.confirmed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ marginTop: '16px', color: '#666', fontSize: '11px' }}>
            Booking is non-financial — reporting shows operational counts and capacity utilization only. Reporting scope is limited to the first 10 operated venues (Firestore query constraint).
          </div>
        </>
      )}
    </div>
  );
}

const StatCard = ({ label, value, accent }: { label: string; value: string; accent: string }) => (
  <div style={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '8px', padding: '20px' }}>
    <div style={{ color: '#aaa', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px' }}>{label}</div>
    <div style={{ color: accent, fontSize: '26px', fontWeight: 'bold', marginTop: '10px' }}>{value}</div>
  </div>
);

const th = { padding: '10px 12px', fontSize: '11px', fontWeight: 700 as const };
const td = { padding: '10px 12px', color: '#ccc' };
