// ==========================================
// FILE: src/components/B2B/enterprise/StaffRoles.tsx
// Enterprise portal — Staff & Roles. Enterprise staff/role state is AUTHORITATIVE, so
// this client NEVER writes it directly. Invites and removals go through the
// manageEnterpriseStaff callable. The roster is READ live from
// enterprise_staff/{enterpriseUid}/members.
//
// REMOVAL IS NOT A BARE CONFIRM. The server tombstones the membership and records
// immutable evidence, and to do that it requires two things this screen must supply:
//   - a REASON from a closed vocabulary (never free text — a free-text reason on a
//     staff record is a private note about a named person);
//   - a COMMAND ID that is stable for one intent, so that a retry after a timeout
//     re-confirms the original removal instead of recording a second one.
// The command id is PERSISTED, because the failure it protects against (a lost
// response, a refreshed tab) is exactly the case where in-memory state is gone.
// ==========================================
import { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../../../firebaseConfig';
import { useT } from '../../../i18n/hooks';
import { ENTERPRISE_STAFF } from '../../../i18n/partner/enterpriseStaff';

interface StaffMember {
  staffUid: string;
  contactAddress?: string;
  role: string;
  status?: string;
  invitedAt?: any;
}

/** The staff role vocabulary. Mirrors ENTERPRISE_STAFF_ROLES on the server, which
 *  REFUSES an unrecognized role rather than coercing it to venue_staff. */
const ROLES = ['manager', 'venue_staff', 'analyst'] as const;

/** The closed removal vocabulary. Mirrors REMOVAL_REASONS on the server. */
const REMOVAL_REASONS = [
  'left_organization',
  'role_no_longer_required',
  'access_review',
  'requested_by_staff',
  'security_concern',
] as const;
type RemovalReason = (typeof REMOVAL_REASONS)[number];

const COMMAND_STORE_KEY = 'golfriend.admin.enterpriseStaff.removalCommands';

/**
 * A command id that is STABLE for one intent and survives a reload.
 *
 * The id is keyed by (enterprise, staff, reason): the same intent retried — including
 * after the tab was closed — reuses it, so the server recognizes an exact replay and
 * writes no second evidence record. Changing the reason is a DIFFERENT intent and
 * therefore gets a different id, which the server correctly refuses to accept under
 * the old one. The id is dropped once the removal is known to have landed.
 */
function readCommandStore(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(COMMAND_STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function persistentCommandId(intentKey: string): string {
  const store = readCommandStore();
  const existing = store[intentKey];
  if (typeof existing === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(existing)) return existing;
  // The server bounds this to 8–64 chars of [A-Za-z0-9_-]; generate inside that set.
  const bytes = new Uint8Array(16);
  (window.crypto || ({} as any)).getRandomValues?.(bytes);
  const id = `rm-${Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')}`;
  try {
    window.localStorage.setItem(COMMAND_STORE_KEY, JSON.stringify({ ...store, [intentKey]: id }));
  } catch {
    /* storage unavailable: the id is still stable for this session via the ref cache */
  }
  return id;
}

function clearCommandId(intentKey: string): void {
  try {
    const store = readCommandStore();
    delete store[intentKey];
    window.localStorage.setItem(COMMAND_STORE_KEY, JSON.stringify(store));
  } catch {
    /* nothing to clean up */
  }
}

/** Map a callable failure onto a translated message. The server's own text is not
 *  shown: it is English-only and written for an operator reading logs. */
function errorKey(code: unknown): string {
  const raw = typeof code === 'string' ? code : '';
  const bare = raw.replace(/^functions\//, '');
  const known = [
    'invalid-argument', 'permission-denied', 'not-found',
    'failed-precondition', 'already-exists', 'unavailable',
  ];
  return known.includes(bare) ? `err_${bare.replace(/-/g, '_')}` : 'err_unknown';
}

export default function StaffRoles({ partnerUid }: { partnerUid: string }) {
  const t = useT(ENTERPRISE_STAFF as unknown as Record<string, Record<string, string>>);
  const [members, setMembers] = useState<StaffMember[]>([]);
  const [inviteAddress, setInviteAddress] = useState('');
  const [inviteRole, setInviteRole] = useState<string>('manager');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isInviting, setIsInviting] = useState(false);
  const [note, setNote] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<{ staffUid: string; reason: RemovalReason | '' } | null>(null);
  // In-session cache, so a command id stays stable even when storage is unavailable.
  const sessionCommands = useRef<Record<string, string>>({});

  const notify = (msg: string, type: 'success' | 'error') => {
    setNote({ msg, type });
    setTimeout(() => setNote(null), 5000);
  };

  // Live roster from enterprise_staff/{enterpriseUid}/members (read-only).
  useEffect(() => {
    if (!partnerUid || partnerUid === 'UNKNOWN_USER') return;
    const col = collection(db, 'enterprise_staff', partnerUid, 'members');
    const unsub = onSnapshot(col, (snap) => {
      setMembers(snap.docs.map((d) => {
        const m = d.data() as any;
        return {
          staffUid: m.staffUid || d.id,
          contactAddress: m.contactAddress,
          role: m.role || 'venue_staff',
          status: m.status,
          invitedAt: m.invitedAt,
        } as StaffMember;
      }));
    }, (err) => console.error('Staff roster sync error:', err));
    return () => unsub();
  }, [partnerUid]);

  const invite = async () => {
    const address = inviteAddress.trim().toLowerCase();
    if (!address || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return notify(t('invalidAddress'), 'error');
    setIsInviting(true);
    try {
      const fn = httpsCallable(getFunctions(), 'manageEnterpriseStaff');
      // Exactly the declared fields: the server refuses surplus keys.
      const res: any = await fn({ action: 'invite', email: address, role: inviteRole });
      if (!res?.data?.success) throw new Error('rejected');
      notify(t('invited'), 'success');
      setInviteAddress('');
    } catch (e: any) {
      notify(t(errorKey(e?.code)), 'error');
    } finally {
      setIsInviting(false);
    }
  };

  const confirmRemoval = async () => {
    if (!pendingRemoval) return;
    const { staffUid, reason } = pendingRemoval;
    if (!reason) return notify(t('chooseReason'), 'error');

    const intentKey = `${partnerUid}|${staffUid}|${reason}`;
    const commandId = sessionCommands.current[intentKey] || persistentCommandId(intentKey);
    sessionCommands.current[intentKey] = commandId;

    setBusyId(staffUid);
    try {
      const fn = httpsCallable(getFunctions(), 'manageEnterpriseStaff');
      const res: any = await fn({ action: 'remove', staffUid, reason, commandId });
      if (!res?.data?.success) throw new Error('rejected');
      // The intent is settled — an exact replay would be idempotent anyway, but the
      // id has done its job and a stale one should not outlive it.
      clearCommandId(intentKey);
      delete sessionCommands.current[intentKey];
      notify(t('removed'), 'success');
      setPendingRemoval(null);
    } catch (e: any) {
      // The id is deliberately KEPT on failure: the next attempt at this same intent
      // must reuse it so the server can tell a retry from a second removal.
      notify(t(errorKey(e?.code)), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const roleLabel = (r: string) => (ROLES.includes(r as never) ? t(`role_${r}`) : r);
  const statusLabel = (s?: string) => (s === 'active' ? t('status_active') : s === 'removed' ? t('status_removed') : t('status_invited'));

  return (
    <div style={{ padding: '20px', color: '#fff', maxWidth: '1000px', margin: '0 auto' }}>
      {note && (
        <div role="status" style={{ position: 'fixed', top: '20px', right: '20px', padding: '16px 24px', zIndex: 1000, backgroundColor: note.type === 'error' ? '#ff4444' : '#4CAF50', borderRadius: '8px', fontWeight: 'bold', maxWidth: '380px' }}>{note.msg}</div>
      )}

      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ color: '#d4af37', margin: 0, letterSpacing: '1px' }}>{t('title')}</h2>
        <p style={{ color: '#888', fontSize: '14px', marginTop: '5px' }}>{t('subtitle')}</p>
      </div>

      {/* INVITE */}
      <div style={{ backgroundColor: '#111', border: '1px solid #d4af37', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
        <h3 style={{ marginTop: 0, color: '#d4af37', fontSize: '15px' }}>{t('inviteHeading')}</h3>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="email" value={inviteAddress} placeholder={t('invitePlaceholder')} aria-label={t('inviteHeading')} onChange={(e) => setInviteAddress(e.target.value)} style={{ ...inputStyle, flex: '2 1 240px' }} />
          <select value={inviteRole} aria-label={t('colRole')} onChange={(e) => setInviteRole(e.target.value)} style={{ ...inputStyle, flex: '1 1 160px' }}>
            {ROLES.map((r) => <option key={r} value={r}>{t(`role_${r}`)}</option>)}
          </select>
          <button onClick={invite} disabled={isInviting} style={{ padding: '10px 18px', backgroundColor: isInviting ? '#555' : '#d4af37', color: '#000', border: 'none', borderRadius: '6px', fontWeight: 900, cursor: isInviting ? 'not-allowed' : 'pointer' }}>
            {isInviting ? t('sending') : t('sendInvite')}
          </button>
        </div>
        <div style={{ color: '#666', fontSize: '11px', marginTop: '10px' }}>{t('inviteHint')}</div>
      </div>

      {/* ROSTER */}
      <div style={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '8px', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, color: '#aaa', fontSize: '14px', textTransform: 'uppercase' }}>{t('roster')}</h3>
          <span style={{ color: '#4CAF50', fontSize: '13px', fontWeight: 'bold' }}>{members.length} {t('memberCount')}</span>
        </div>
        {members.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#555', border: '1px dashed #333', borderRadius: '6px' }}>{t('empty')}</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ color: '#888', borderBottom: '1px solid #333' }}>
                  <th style={th}>{t('colStaff')}</th><th style={th}>{t('colRole')}</th><th style={th}>{t('colStatus')}</th><th style={{ ...th, textAlign: 'right' }}>{t('colAction')}</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.staffUid} style={{ borderBottom: '1px solid #222' }}>
                    <td style={{ ...td, color: '#fff', fontWeight: 'bold' }}>{m.contactAddress || m.staffUid}</td>
                    <td style={td}>
                      <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 'bold', backgroundColor: 'rgba(212,175,55,0.12)', color: '#d4af37', border: '1px solid #d4af37' }}>{roleLabel(m.role)}</span>
                    </td>
                    <td style={td}>
                      <span style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', backgroundColor: m.status === 'active' ? 'rgba(76,175,80,0.12)' : 'rgba(255,193,7,0.12)', color: m.status === 'active' ? '#4CAF50' : '#FFC107' }}>{statusLabel(m.status)}</span>
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      {/* A tombstoned membership has no access left to revoke. */}
                      {m.status !== 'removed' && (
                        <button onClick={() => setPendingRemoval({ staffUid: m.staffUid, reason: '' })} disabled={busyId === m.staffUid} style={{ background: 'transparent', border: '1px solid #ff4444', color: '#ff4444', borderRadius: '4px', padding: '5px 12px', cursor: busyId === m.staffUid ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '12px' }}>
                          {busyId === m.staffUid ? t('removing') : t('remove')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* REMOVAL — reason is required, and it comes from the closed vocabulary. */}
      {pendingRemoval && (
        <div role="dialog" aria-modal="true" aria-label={t('removeTitle')} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
          <div style={{ background: '#111', border: '1px solid #d4af37', borderRadius: '8px', padding: '24px', maxWidth: '440px', width: '90%' }}>
            <h3 style={{ marginTop: 0, color: '#d4af37', fontSize: '16px' }}>{t('removeTitle')}</h3>
            <p style={{ color: '#aaa', fontSize: '13px' }}>{t('removeBody')}</p>
            <label htmlFor="removal-reason" style={{ display: 'block', color: '#888', fontSize: '12px', marginBottom: '6px' }}>{t('reasonLabel')}</label>
            <select
              id="removal-reason"
              value={pendingRemoval.reason}
              onChange={(e) => setPendingRemoval({ ...pendingRemoval, reason: e.target.value as RemovalReason })}
              style={{ ...inputStyle, width: '100%', marginBottom: '18px' }}
            >
              <option value="">—</option>
              {REMOVAL_REASONS.map((r) => <option key={r} value={r}>{t(`reason_${r}`)}</option>)}
            </select>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setPendingRemoval(null)} style={{ padding: '9px 16px', background: 'transparent', border: '1px solid #555', color: '#ccc', borderRadius: '6px', cursor: 'pointer' }}>{t('cancel')}</button>
              <button
                onClick={confirmRemoval}
                disabled={!pendingRemoval.reason || busyId === pendingRemoval.staffUid}
                style={{ padding: '9px 16px', background: !pendingRemoval.reason ? '#555' : '#ff4444', border: 'none', color: '#fff', borderRadius: '6px', fontWeight: 700, cursor: !pendingRemoval.reason ? 'not-allowed' : 'pointer' }}
              >
                {busyId === pendingRemoval.staffUid ? t('removing') : t('confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inputStyle = { padding: '10px', backgroundColor: '#0a0a0a', border: '1px solid #333', color: '#fff', borderRadius: '4px', boxSizing: 'border-box' as const };
const th = { padding: '10px 12px', fontSize: '11px', fontWeight: 700 as const };
const td = { padding: '10px 12px', color: '#ccc' };
