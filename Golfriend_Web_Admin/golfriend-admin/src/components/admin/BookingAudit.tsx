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
import { V2Theme } from '../../theme/v2Theme';
import { V2Badge, V2ControlRow } from '../../theme/v2Primitives';

interface AuditRow {
  id: string;
  bookingId: string;
  action: string;
  byUid: string;
  byRole: string;
  at: any;
}

const ACTIONS = ['all', 'requested', 'confirmed', 'rejected', 'cancelled', 'admin_confirmed', 'admin_rejected', 'admin_cancelled'];

const roleColor = (r: string): string => (
  r === 'staff' ? V2Theme.gold : r === 'operator' ? '#8A2BE2' : V2Theme.surfaceText
);

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

      <V2ControlRow>
        {ACTIONS.map((a) => {
          const active = actionFilter === a;
          return (
            <button key={a} onClick={() => setActionFilter(a)}
              style={{
                padding: '6px 12px', borderRadius: V2Theme.radiusPill, cursor: 'pointer',
                fontSize: '12px', fontWeight: 700, minHeight: '36px',
                border: `1px solid ${active ? V2Theme.gold : V2Theme.surfaceBorder}`,
                backgroundColor: active ? `${V2Theme.gold}22` : 'transparent',
                color: active ? V2Theme.gold : V2Theme.surfaceTextMuted,
              }}>
              {a === 'all' ? 'All' : a}
            </button>
          );
        })}
        <input
          type="text"
          placeholder="Filter by booking id or actor uid…"
          aria-label="Filter audit events"
          value={text}
          onChange={(e) => setText(e.target.value)}
          style={{
            marginLeft: 'auto', minWidth: '250px', padding: '8px 12px',
            backgroundColor: V2Theme.surfaceCard, border: `1px solid ${V2Theme.surfaceBorder}`,
            color: V2Theme.warmWhite, borderRadius: V2Theme.radiusMd,
            boxSizing: 'border-box', fontFamily: V2Theme.fontFamily,
          }}
        />
      </V2ControlRow>

      {error && <div role="alert" style={{ color: V2Theme.errorRed, marginBottom: '12px', fontSize: '13px' }}>{error}</div>}

      <div style={{ border: `1px solid ${V2Theme.surfaceBorder}`, borderRadius: V2Theme.radiusMd, overflowX: 'auto', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px', minWidth: '560px' }}>
          <thead>
            <tr style={{ backgroundColor: V2Theme.surfaceCard, color: V2Theme.surfaceTextMuted, borderBottom: `2px solid ${V2Theme.surfaceBorder}` }}>
              <th style={th}>When</th><th style={th}>Action</th><th style={th}>Booking</th><th style={th}>Actor</th><th style={th}>Role</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: '28px', textAlign: 'center', color: V2Theme.surfaceMuted }}>No audit events match the current filters.</td></tr>
            ) : (
              visible.map((r) => (
                <tr key={r.id} style={{ borderBottom: `1px solid ${V2Theme.surfaceBorder}` }}>
                  <td style={{ ...td, color: V2Theme.surfaceText, whiteSpace: 'nowrap' }}>{fmt(r.at)}</td>
                  <td style={td}>
                    <V2Badge status={r.action} label={r.action} />
                  </td>
                  <td style={{ ...td, fontFamily: V2Theme.fontMono, color: V2Theme.surfaceText }}>{r.bookingId}</td>
                  <td style={{ ...td, fontFamily: V2Theme.fontMono, color: V2Theme.surfaceTextMuted }}>{r.byUid}</td>
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

const th: React.CSSProperties = { padding: '12px 14px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' };
const td: React.CSSProperties = { padding: '11px 14px', color: V2Theme.surfaceText };
