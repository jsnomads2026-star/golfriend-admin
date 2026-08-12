// ==========================================
// FILE: src/components/B2B/enterprise/OrgProfile.tsx
// Enterprise portal — Organization profile. READ-ONLY view of the enterprise's
// b2b_partners contract document (tier, badge, contract dates, credits) plus a
// live count of operated venues. No authoritative writes happen here.
// ==========================================
import { useState, useEffect } from 'react';
import { doc, onSnapshot, collection, query, where } from 'firebase/firestore';
import { db } from '../../../firebaseConfig';

interface PartnerContract {
  tier?: string;
  status?: string;
  partnerBadge?: string | null;
  contractDuration?: string;
  contractStartDate?: any;
  contractEndDate?: any;
  sponsorCredits?: number;
  operatedCourseIds?: string[];
}

const fmtDate = (v: any): string | null => {
  if (!v) return null;
  try {
    const d = v.toDate ? v.toDate() : new Date(v);
    return isNaN(d.getTime()) ? null : d.toLocaleDateString();
  } catch {
    return null;
  }
};

export default function OrgProfile({ partnerUid, email }: { partnerUid: string; email?: string }) {
  const [data, setData] = useState<PartnerContract | null>(null);
  const [operatedCount, setOperatedCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  // Live contract doc (keyed by uid, matching the webhook writer).
  useEffect(() => {
    if (!partnerUid || partnerUid === 'UNKNOWN_USER') { setLoading(false); return; }
    const ref = doc(db, 'b2b_partners', partnerUid);
    const unsub = onSnapshot(ref, (snap) => {
      setData(snap.exists() ? (snap.data() as PartnerContract) : null);
      setLoading(false);
    }, (err) => { console.error('OrgProfile contract sync error:', err); setLoading(false); });
    return () => unsub();
  }, [partnerUid]);

  // Authoritative operated-venue count from course_operators.
  useEffect(() => {
    if (!partnerUid || partnerUid === 'UNKNOWN_USER') return;
    const q = query(collection(db, 'course_operators'), where('operatorUid', '==', partnerUid));
    const unsub = onSnapshot(q, (snap) => setOperatedCount(snap.size), (err) => console.error('OrgProfile venue count error:', err));
    return () => unsub();
  }, [partnerUid]);

  const tier = data?.tier || 'basic_operator';
  const isEnterprise = tier === 'enterprise' || tier === 'Enterprise';
  const startDate = fmtDate(data?.contractStartDate);
  const endDate = fmtDate(data?.contractEndDate);

  return (
    <div style={{ padding: '20px', color: '#fff', maxWidth: '1000px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ color: '#d4af37', margin: 0, letterSpacing: '1px' }}>Organization</h2>
        <p style={{ color: '#888', fontSize: '14px', marginTop: '5px' }}>Your enterprise identity and commercial contract, read live from the platform. Changes are made through Billing.</p>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#555', border: '1px dashed #333', borderRadius: '8px' }}>Loading organization…</div>
      ) : !data ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#888', border: '1px dashed #333', borderRadius: '8px' }}>
          No contract document found yet. It appears once your onboarding webhook syncs.
        </div>
      ) : (
        <>
          {/* IDENTITY HEADER */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px', padding: '24px', backgroundColor: '#0a0a0a', border: `1px solid ${isEnterprise ? '#d4af37' : '#555'}`, borderRadius: '12px', marginBottom: '20px' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '12px', backgroundColor: '#1a1a1a', border: '1px solid #333', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '30px' }}>
              {isEnterprise ? '💎' : '🤝'}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#fff', fontSize: '20px', fontWeight: 900, letterSpacing: '0.5px' }}>{email || partnerUid}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px' }}>
                <span style={{ color: isEnterprise ? '#d4af37' : '#aaa', fontSize: '12px', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase' }}>
                  {isEnterprise ? 'Enterprise Operator' : 'Small Business'}
                </span>
                {data.partnerBadge && (
                  <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 'bold', backgroundColor: 'rgba(212,175,55,0.12)', color: '#d4af37', border: '1px solid #d4af37' }}>
                    ✓ {data.partnerBadge}
                  </span>
                )}
                <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 'bold', backgroundColor: data.status === 'active_partner' ? 'rgba(76,175,80,0.12)' : 'rgba(255,193,7,0.12)', color: data.status === 'active_partner' ? '#4CAF50' : '#FFC107', textTransform: 'uppercase' }}>
                  {data.status || 'unknown'}
                </span>
              </div>
            </div>
          </div>

          {/* STAT GRID */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '20px' }}>
            <StatCard label="Sponsor Credits" value={(data.sponsorCredits ?? (isEnterprise ? 6000 : 3000)).toLocaleString()} accent="#4CAF50" />
            <StatCard label="Operated Venues" value={String(operatedCount)} accent="#d4af37" />
            <StatCard label="Contract Duration" value={(data.contractDuration || 'monthly').replace('_', ' ').toUpperCase()} accent="#fff" />
            <StatCard label="Billing Window" value={startDate && endDate ? `${startDate} — ${endDate}` : 'Standard Monthly'} accent="#ccc" small />
          </div>

          <div style={{ padding: '14px 18px', backgroundColor: 'rgba(212,175,55,0.05)', border: '1px dashed #333', borderRadius: '8px', color: '#888', fontSize: '12px', lineHeight: '1.5' }}>
            This screen is read-only. Tier upgrades, downgrades and contract lock-ins are handled in the <strong style={{ color: '#d4af37' }}>Billing</strong> tab, which routes through the secure checkout flow. Staff and venues are managed in their own tabs.
          </div>
        </>
      )}
    </div>
  );
}

const StatCard = ({ label, value, accent, small }: { label: string; value: string; accent: string; small?: boolean }) => (
  <div style={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '8px', padding: '20px' }}>
    <div style={{ color: '#aaa', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px' }}>{label}</div>
    <div style={{ color: accent, fontSize: small ? '15px' : '26px', fontWeight: 'bold', marginTop: '10px' }}>{value}</div>
  </div>
);
