// ==========================================
// FILE: src/components/B2B/enterprise/StaffRoles.tsx
// Enterprise portal — Staff & Roles. Enterprise staff/role state is
// AUTHORITATIVE, so this client NEVER writes it directly. Invites and removals
// go through a NEW server callable (manageEnterpriseStaff) — see the exact
// TypeScript in the slice's final report. The roster is READ live from
// enterprise_staff/{enterpriseUid}/members.
// ==========================================
import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../../../firebaseConfig';

interface StaffMember {
  staffUid: string;
  email?: string;
  role: string;
  status?: string;
  invitedAt?: any;
}

const ROLES = [
  { value: 'manager', label: 'Manager' },
  { value: 'venue_staff', label: 'Venue Staff' },
  { value: 'analyst', label: 'Analyst (read-only)' },
];

export default function StaffRoles({ partnerUid }: { partnerUid: string }) {
  const [members, setMembers] = useState<StaffMember[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('manager');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isInviting, setIsInviting] = useState(false);
  const [note, setNote] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const notify = (msg: string, type: 'success' | 'error') => {
    setNote({ msg, type });
    setTimeout(() => setNote(null), 4000);
  };

  // Live roster from enterprise_staff/{enterpriseUid}/members (read-only).
  useEffect(() => {
    if (!partnerUid || partnerUid === 'UNKNOWN_USER') return;
    const col = collection(db, 'enterprise_staff', partnerUid, 'members');
    const unsub = onSnapshot(col, (snap) => {
      setMembers(snap.docs.map((d) => {
        const m = d.data() as any;
        return { staffUid: m.staffUid || d.id, email: m.email, role: m.role || 'venue_staff', status: m.status, invitedAt: m.invitedAt } as StaffMember;
      }));
    }, (err) => console.error('Staff roster sync error:', err));
    return () => unsub();
  }, [partnerUid]);

  const invite = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return notify('Enter a valid staff email.', 'error');
    setIsInviting(true);
    try {
      const fn = httpsCallable(getFunctions(), 'manageEnterpriseStaff');
      const res: any = await fn({ action: 'invite', email, role: inviteRole });
      if (!res?.data?.success) throw new Error('Invite was not accepted.');
      notify(`Invited ${email} as ${inviteRole}.`, 'success');
      setInviteEmail('');
    } catch (e: any) {
      notify(e?.message || 'Failed to invite staff.', 'error');
    } finally {
      setIsInviting(false);
    }
  };

  const remove = async (staffUid: string) => {
    if (!window.confirm('Remove this staff member from your enterprise?')) return;
    setBusyId(staffUid);
    try {
      const fn = httpsCallable(getFunctions(), 'manageEnterpriseStaff');
      const res: any = await fn({ action: 'remove', staffUid });
      if (!res?.data?.success) throw new Error('Removal was not accepted.');
      notify('Staff member removed.', 'success');
    } catch (e: any) {
      notify(e?.message || 'Failed to remove staff.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const roleLabel = (r: string) => ROLES.find((x) => x.value === r)?.label || r;

  return (
    <div style={{ padding: '20px', color: '#fff', maxWidth: '1000px', margin: '0 auto' }}>
      {note && (
        <div style={{ position: 'fixed', top: '20px', right: '20px', padding: '16px 24px', zIndex: 1000, backgroundColor: note.type === 'error' ? '#ff4444' : '#4CAF50', borderRadius: '8px', fontWeight: 'bold' }}>{note.msg}</div>
      )}

      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ color: '#d4af37', margin: 0, letterSpacing: '1px' }}>Staff & Roles</h2>
        <p style={{ color: '#888', fontSize: '14px', marginTop: '5px' }}>Invite team members and assign roles. Role assignment is authoritative and executed securely on the server — this screen only reads the current roster.</p>
      </div>

      {/* INVITE */}
      <div style={{ backgroundColor: '#111', border: '1px solid #d4af37', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
        <h3 style={{ marginTop: 0, color: '#d4af37', fontSize: '15px' }}>Invite Staff</h3>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="email" value={inviteEmail} placeholder="staff@company.com" onChange={(e) => setInviteEmail(e.target.value)} style={{ ...inputStyle, flex: '2 1 240px' }} />
          <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} style={{ ...inputStyle, flex: '1 1 160px' }}>
            {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <button onClick={invite} disabled={isInviting} style={{ padding: '10px 18px', backgroundColor: isInviting ? '#555' : '#d4af37', color: '#000', border: 'none', borderRadius: '6px', fontWeight: 900, cursor: isInviting ? 'not-allowed' : 'pointer' }}>
            {isInviting ? '…' : 'SEND INVITE'}
          </button>
        </div>
        <div style={{ color: '#666', fontSize: '11px', marginTop: '10px' }}>The invited user must already have a Golfriend account; roles are bound to their uid server-side.</div>
      </div>

      {/* ROSTER */}
      <div style={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '8px', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, color: '#aaa', fontSize: '14px', textTransform: 'uppercase' }}>Enterprise Roster</h3>
          <span style={{ color: '#4CAF50', fontSize: '13px', fontWeight: 'bold' }}>{members.length} member{members.length === 1 ? '' : 's'}</span>
        </div>
        {members.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#555', border: '1px dashed #333', borderRadius: '6px' }}>No staff yet. Invite your first team member above.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ color: '#888', borderBottom: '1px solid #333' }}>
                  <th style={th}>Staff</th><th style={th}>Role</th><th style={th}>Status</th><th style={{ ...th, textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.staffUid} style={{ borderBottom: '1px solid #222' }}>
                    <td style={{ ...td, color: '#fff', fontWeight: 'bold' }}>{m.email || m.staffUid}</td>
                    <td style={td}>
                      <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 'bold', backgroundColor: 'rgba(212,175,55,0.12)', color: '#d4af37', border: '1px solid #d4af37' }}>{roleLabel(m.role)}</span>
                    </td>
                    <td style={td}>
                      <span style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', backgroundColor: m.status === 'active' ? 'rgba(76,175,80,0.12)' : 'rgba(255,193,7,0.12)', color: m.status === 'active' ? '#4CAF50' : '#FFC107' }}>{m.status || 'invited'}</span>
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <button onClick={() => remove(m.staffUid)} disabled={busyId === m.staffUid} style={{ background: 'transparent', border: '1px solid #ff4444', color: '#ff4444', borderRadius: '4px', padding: '5px 12px', cursor: busyId === m.staffUid ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '12px' }}>Remove</button>
                    </td>
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

const inputStyle = { padding: '10px', backgroundColor: '#0a0a0a', border: '1px solid #333', color: '#fff', borderRadius: '4px', boxSizing: 'border-box' as const };
const th = { padding: '10px 12px', fontSize: '11px', fontWeight: 700 as const };
const td = { padding: '10px 12px', color: '#ccc' };
