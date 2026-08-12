// ==========================================
// FILE: src/components/B2B/enterprise/BillingBoundary.tsx
// Enterprise portal — Billing. READ-ONLY display of the enterprise's
// b2b_partners contract (tier, badge, contract dates, credits). All
// upgrade/downgrade/lock-in actions are delegated to the EXISTING WalletSettings
// flow (the same one the SB dashboard uses), which routes through secure
// checkout. This component NEVER writes tier/contract/billing state itself.
// ==========================================
import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../../firebaseConfig';
import WalletSettings from '../WalletSettings';

const fmtDate = (v: any): string | null => {
  if (!v) return null;
  try {
    const d = v.toDate ? v.toDate() : new Date(v);
    return isNaN(d.getTime()) ? null : d.toLocaleDateString();
  } catch {
    return null;
  }
};

export default function BillingBoundary({ partnerUid }: { partnerUid: string }) {
  const [data, setData] = useState<any | null>(null);

  useEffect(() => {
    if (!partnerUid || partnerUid === 'UNKNOWN_USER') return;
    const ref = doc(db, 'b2b_partners', partnerUid);
    const unsub = onSnapshot(ref, (snap) => setData(snap.exists() ? snap.data() : null), (err) => console.error('Billing contract sync error:', err));
    return () => unsub();
  }, [partnerUid]);

  const tier = data?.tier || 'basic_operator';
  const isEnterprise = tier === 'enterprise' || tier === 'Enterprise';
  const startDate = fmtDate(data?.contractStartDate);
  const endDate = fmtDate(data?.contractEndDate);

  return (
    <div style={{ padding: '20px', color: '#fff', maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ color: '#d4af37', margin: 0, letterSpacing: '1px' }}>Billing</h2>
        <p style={{ color: '#888', fontSize: '14px', marginTop: '5px' }}>A read-only view of your commercial contract. Any change is executed through the secure checkout below — no billing state is edited on this screen.</p>
      </div>

      {/* READ-ONLY CONTRACT SUMMARY */}
      <div style={{ display: 'flex', gap: '16px', padding: '24px', backgroundColor: '#0a0a0a', border: `1px solid ${isEnterprise ? '#d4af37' : '#555'}`, borderRadius: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <Field label="Current Tier" value={isEnterprise ? 'ENTERPRISE' : 'SMALL BUSINESS'} accent={isEnterprise ? '#d4af37' : '#aaa'} />
        <Field label="Badge" value={data?.partnerBadge || '—'} accent="#d4af37" />
        <Field label="Lock-In" value={(data?.contractDuration || 'monthly').replace('_', ' ').toUpperCase()} accent={data?.contractDuration && data.contractDuration !== 'monthly' ? '#4CAF50' : '#aaa'} />
        <Field label="Credits" value={(data?.sponsorCredits ?? (isEnterprise ? 6000 : 3000)).toLocaleString()} accent="#4CAF50" />
        <Field label="Billing Window" value={startDate && endDate ? `${startDate} — ${endDate}` : 'Standard Monthly'} accent="#ccc" />
      </div>

      <div style={{ marginBottom: '16px', color: '#666', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>Manage Contract</div>

      {/* DELEGATE ALL WRITES TO THE EXISTING WALLET FLOW */}
      <WalletSettings partnerUid={partnerUid} />
    </div>
  );
}

const Field = ({ label, value, accent }: { label: string; value: string; accent: string }) => (
  <div style={{ flex: '1 1 140px' }}>
    <div style={{ color: '#fff', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>{label}</div>
    <div style={{ color: accent, fontSize: '15px', fontWeight: 'bold' }}>{value}</div>
  </div>
);
