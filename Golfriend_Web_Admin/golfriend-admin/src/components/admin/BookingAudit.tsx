// ==========================================
// FILE: src/components/admin/BookingAudit.tsx
// Staff-only, READ-ONLY viewer of the append-only `booking_audit` trail.
// Completes the approved non-financial booking "audit" capability (written by
// every booking callable via stampBookingAudit; previously had no UI reader).
// Read-only: no client writes. Lane B rule grants booking_audit staff read.
// ==========================================
import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../../firebaseConfig';

interface AuditRow {
  id: string;
  bookingId: string;
  action: string;
  byUid: string;
  byRole: string;
  at: any;
}

const ACTIONS = ['all', 'requested', 'confirmed', 'rejected', 'cancelled', 'admin_confirmed', 'admin_rejected', 'admin_cancelled'];

const actionColor = (a: string): string => {
  if (a.includes('confirm')) return '#4CAF50';
  if (a.includes('reject')) return '#ff4444';
  if (a.includes('cancel')) return '#1E88E5';
  if (a === 'requested') return '#FFC107';
  return '#888';
};

const roleColor = (r: string): string => (r === 'staff' ? '#d4af37' : r === 'operator' ? '#8A2BE2' : '#aaa');

export default function BookingAudit() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Append-only trail, newest first; bounded read. Staff-only (Lane B rule).
    const q = query(collection(db, 'booking_audit'), orderBy('at', 'desc'), limit(300));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setError(null);
        setRows(snap.docs.map((d) => {
          const a = d.data() as any;
          return {
            id: d.id,
            bookingId: a.bookingId || '',
            action: a.action || 'unknown',
            byUid: a.byUid || '',
            byRole: a.byRole || '',
            at: a.at,
          } as AuditRow;
        }));
      },
      () => setError('Could not load the audit trail (staff access required).'),
    );
    return () => unsub();
  }, []);

  const visible = useMemo(() => {
    const t = text.trim().toLowerCase();
    return rows
      .filter((r) => actionFilter === 'all' || r.action === actionFilter)
      .filter((r) => !t || r.bookingId.toLowerCase().includes(t) || r.byUid.toLowerCase().includes(t));
  }, [rows, actionFilter, text]);

  const fmt = (at: any) => {
    try { return at?.toDate ? at.toDate().toLocaleString() : (at?.seconds ? new Date(at.seconds * 1000).toLocaleString() : '—'); }
    catch { return '—'; }
  };

  return (
    <div style={{ padding: '24px', color: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #333', paddingBottom: '12px', marginBottom: '20px' }}>
        <h2 style={{ color: '#d4af37', margin: 0 }}>🧾 Booking Audit Trail</h2>
        <span style={{ color: '#666', fontSize: '12px' }}>{rows.length} events (newest 300) · append-only · read-only</span>
      </div>
      <p style={{ color: '#aaa', fontSize: '13px', marginTop: 0, marginBottom: '18px' }}>
        Immutable record of every booking state change (request / confirm / reject / cancel), stamped server-side. Non-financial — no amounts, no wallet.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginBottom: '16px' }}>
        {ACTIONS.map((a) => {
          const active = actionFilter === a;
          return (
            <button key={a} onClick={() => setActionFilter(a)}
              style={{ padding: '6px 12px', borderRadius: '20px', cursor: 'pointer', fontSize: '12px', fontWeight: 700,
                border: `1px solid ${active ? '#d4af37' : '#333'}`, backgroundColor: active ? 'rgba(212,175,55,0.15)' : 'transparent',
                color: active ? '#d4af37' : '#aaa' }}>
              {a === 'all' ? 'All' : a}
            </button>
          );
        })}
        <input type="text" placeholder="Filter by booking id or actor uid…" value={text} onChange={(e) => setText(e.target.value)}
          style={{ marginLeft: 'auto', minWidth: '260px', padding: '8px 12px', backgroundColor: '#0a0a0a', border: '1px solid #333', color: '#fff', borderRadius: '6px', boxSizing: 'border-box' }} />
      </div>

      {error && <div role="alert" style={{ color: '#ff4444', marginBottom: '12px', fontSize: '13px' }}>{error}</div>}

      <div style={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '8px', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
          <thead>
            <tr style={{ backgroundColor: '#1a1a1a', color: '#888', borderBottom: '2px solid #333' }}>
              <th style={th}>When</th><th style={th}>Action</th><th style={th}>Booking</th><th style={th}>Actor</th><th style={th}>Role</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: '28px', textAlign: 'center', color: '#555' }}>No audit events match the current filters.</td></tr>
            ) : (
              visible.map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid #222' }}>
                  <td style={{ ...td, color: '#aaa', whiteSpace: 'nowrap' }}>{fmt(r.at)}</td>
                  <td style={td}>
                    <span style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: actionColor(r.action), backgroundColor: `${actionColor(r.action)}22` }}>{r.action}</span>
                  </td>
                  <td style={{ ...td, fontFamily: 'monospace', color: '#ccc' }}>{r.bookingId}</td>
                  <td style={{ ...td, fontFamily: 'monospace', color: '#888' }}>{r.byUid}</td>
                  <td style={{ ...td, color: roleColor(r.byRole), fontWeight: 'bold' }}>{r.byRole}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const th = { padding: '12px 14px', fontSize: '11px', fontWeight: 700 as const, textTransform: 'uppercase' as const };
const td = { padding: '11px 14px', color: '#ccc' };
