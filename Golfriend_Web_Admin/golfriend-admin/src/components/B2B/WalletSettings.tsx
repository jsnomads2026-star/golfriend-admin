import { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import GolfText from '../common/GolfText';

// 🔥 CUSTOM MODAL SYSTEM
const CustomModal = ({ visible, title, message, onConfirm, onCancel, isDestructive, confirmText = "CONFIRM" }: any) => {
  if (!visible) return null;

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(5px)' }}>
      <div style={{ width: '100%', maxWidth: '360px', backgroundColor: '#121212', borderRadius: '24px', border: `1px solid ${isDestructive ? '#ff4444' : '#D4AF37'}`, padding: '24px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)', textAlign: 'center' }}>
        <div style={{ display: 'block', color: isDestructive ? '#ff4444' : '#D4AF37', fontSize: '18px', fontWeight: 'bold', marginBottom: '12px' }}>
          <GolfText>{title}</GolfText>
        </div>
        <div style={{ display: 'block', color: '#aaa', fontSize: '14px', marginBottom: '24px', lineHeight: '1.5' }}>
          <GolfText>{message}</GolfText>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          {onCancel && (
            <button onClick={onCancel} style={{ flex: 1, padding: '12px', backgroundColor: 'transparent', color: '#888', border: '1px solid #333', borderRadius: '24px', cursor: 'pointer', fontWeight: 'bold' }}>
              CANCEL
            </button>
          )}
          <button onClick={onConfirm} style={{ flex: 1, padding: '12px', backgroundColor: isDestructive ? '#ff4444' : '#D4AF37', color: isDestructive ? '#fff' : '#000', border: 'none', borderRadius: '24px', cursor: 'pointer', fontWeight: 'bold' }}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default function WalletSettings({ partnerUid }: { partnerUid: string }) {
  const [tier, setTier] = useState<string>("small_business");
  const [contractType, setContractType] = useState<string>("monthly");
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Modal State
  const [modalConfig, setModalConfig] = useState({ visible: false, title: '', message: '', isDestructive: false, action: () => {}, confirmText: "CONFIRM", showCancel: true });

  useEffect(() => {
    if (!partnerUid) return;
    const fetchContractData = async () => {
      const docRef = doc(db, 'b2b_partners', partnerUid);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        setTier(data.tier || "small_business");
        setContractType(data.contractDuration || "monthly");
        
        if (data.contractStartDate) {
           const d = data.contractStartDate.toDate ? data.contractStartDate.toDate() : new Date(data.contractStartDate);
           setStartDate(d.toLocaleDateString());
        }
        if (data.contractEndDate) {
           const d = data.contractEndDate.toDate ? data.contractEndDate.toDate() : new Date(data.contractEndDate);
           setEndDate(d.toLocaleDateString());
        }
      }
    };
    fetchContractData();
  }, [partnerUid]);

  const isEnterprise = tier === 'enterprise';

  // ==========================================
  // AXIS 1: TIER UPGRADE (Vertical Move)
  // ==========================================
  const triggerTierUpgrade = () => {
    setModalConfig({
      visible: true,
      title: '💎 ENTERPRISE UPGRADE',
      message: 'Elevating to the Enterprise tier will instantly unlock Master Host privileges and issue your Verified Enterprise Badge.',
      isDestructive: false,
      confirmText: "PROCEED TO CHECKOUT",
      showCancel: true,
      action: executeTierUpgrade
    });
  };

  // 🔥 STRIPE PAYMENT LINKS (Replace these with your actual Stripe Payment Link URLs)
  const STRIPE_LINKS = {
    // Front Door (Onboarding)
    small_biz_monthly: "https://buy.stripe.com/test_aFa6oI4OKdUa3ecfOQ6Na03",
    
    // Small Business Upgrades
    small_biz_6_months: "https://buy.stripe.com/test_4gM00k0yuaHYcOMfOQ6Na04",
    small_biz_1_year: "https://buy.stripe.com/test_3cIdRa2GCeYe020fOQ6Na05",

    // Enterprise Upgrades
    enterprise_monthly: "https://buy.stripe.com/test_bJe28s2GC4jA5mkauw6Na06",
    enterprise_6_months: "https://buy.stripe.com/test_9B628s95017ocOMfOQ6Na07",
    enterprise_1_year: "https://buy.stripe.com/test_5kQdRa5SOdUag0YbyA6Na08"
  };

  const executeTierUpgrade = async () => {
    setIsProcessing(true);
    setModalConfig({ ...modalConfig, visible: false });
    // 💳 Upgrades Small Business to Enterprise (Monthly) and attaches their UID
    window.location.href = `${STRIPE_LINKS.enterprise_monthly}?client_reference_id=${partnerUid}`;
  };

  // ==========================================
  // AXIS 2: DURATION LOCK-IN (Horizontal Move)
  // ==========================================
  const triggerDurationUpgrade = (duration: '6_months' | '1_year') => {
    const durationText = duration === '6_months' ? '6 Months' : '1 Year';
    setModalConfig({
      visible: true,
      title: `SECURE ${durationText.toUpperCase()} CONTRACT`,
      message: `You are locking in your ${isEnterprise ? 'Enterprise' : 'Small Business'} tier for a rigid ${durationText} cycle. Proceed to checkout to view your adjusted rates.`,
      isDestructive: false,
      confirmText: "PROCEED TO CHECKOUT",
      showCancel: true,
      action: () => executeDurationUpgrade(duration)
    });
  };

  const executeDurationUpgrade = async (duration: '6_months' | '1_year') => {
    setIsProcessing(true);
    setModalConfig({ ...modalConfig, visible: false });
    
    // 💳 Dynamically selects the correct Stripe Link based on their CURRENT tier
    let checkoutUrl = '';
    if (isEnterprise) {
      checkoutUrl = duration === '6_months' ? STRIPE_LINKS.enterprise_6_months : STRIPE_LINKS.enterprise_1_year;
    } else {
      checkoutUrl = duration === '6_months' ? STRIPE_LINKS.small_biz_6_months : STRIPE_LINKS.small_biz_1_year;
    }

    // Routes them to Stripe with their UID attached for the Webhook to read
    window.location.href = `${checkoutUrl}?client_reference_id=${partnerUid}`;
  };

  // ==========================================
  // DOWNGRADE / CANCEL (The Penalty Engine)
  // ==========================================
  const triggerDowngradeModal = () => {
    setModalConfig({
      visible: true,
      title: '⚠️ EARLY CANCELLATION',
      message: 'Breaking your contract early will immediately revoke your Enterprise badge and drop you back to a standard Monthly Small Business tier. Proceed?',
      isDestructive: true,
      confirmText: "BREAK CONTRACT",
      showCancel: true,
      action: executeDowngradePenalty
    });
  };

  const executeDowngradePenalty = async () => {
    setIsProcessing(true);
    setModalConfig({ ...modalConfig, visible: false });

    try {
      const docRef = doc(db, 'b2b_partners', partnerUid);
      await updateDoc(docRef, {
        tier: 'small_business',
        partnerBadge: null, 
        contractDuration: 'monthly',
        contractStartDate: null,
        contractEndDate: null,
        penaltyApplied: true,
        updatedAt: serverTimestamp()
      });
      
      setTier('small_business');
      setContractType('monthly');
      setStartDate(null);
      setEndDate(null);
      
      setModalConfig({
        visible: true,
        title: 'CONTRACT REVOKED',
        message: 'Your privileges have been stripped. You are now on the standard Small Business monthly cycle.',
        isDestructive: false,
        confirmText: "UNDERSTOOD",
        showCancel: false,
        action: () => setModalConfig({ ...modalConfig, visible: false })
      });
    } catch (error) {
      console.error("Downgrade failure:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div style={{ padding: '30px', backgroundColor: '#121212', borderRadius: '12px', border: '1px solid #333', maxWidth: '800px', margin: '0 auto' }}>
      
      <div style={{ borderBottom: '1px solid #333', paddingBottom: '15px', marginBottom: '25px' }}>
        <div style={{ display: 'block', color: '#D4AF37', fontSize: '22px', fontWeight: 'bold', marginBottom: '8px' }}>
          <GolfText>💳 Contract & Billing Engine</GolfText>
        </div>
        <div style={{ display: 'block', color: '#888', fontSize: '13px' }}>
          <GolfText>Manage your operational tier and commercial billing cycle.</GolfText>
        </div>
      </div>

      {/* THE LIVE STATUS HUD */}
      <div style={{ padding: '24px', backgroundColor: '#0a0a0a', borderRadius: '8px', border: `1px solid ${isEnterprise ? '#D4AF37' : '#555'}`, marginBottom: '30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'block', color: '#fff', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>
            <GolfText>Current Status</GolfText>
          </div>
          <div style={{ display: 'block', color: isEnterprise ? '#D4AF37' : '#aaa', fontSize: '20px', fontWeight: 'bold' }}>
            <GolfText>{isEnterprise ? 'ENTERPRISE' : 'SMALL BUSINESS'}</GolfText>
          </div>
        </div>

        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ display: 'block', color: '#fff', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>
            <GolfText>Lock-In Period</GolfText>
          </div>
          <div style={{ display: 'block', color: contractType === 'monthly' ? '#aaa' : '#4CAF50', fontSize: '18px', fontWeight: 'bold' }}>
            <GolfText>{contractType.replace('_', ' ').toUpperCase()}</GolfText>
          </div>
        </div>

        <div style={{ flex: 1, textAlign: 'right' }}>
          <div style={{ display: 'block', color: '#fff', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>
            <GolfText>Billing Cycle</GolfText>
          </div>
          <div style={{ display: 'block', color: '#ccc', fontSize: '12px' }}>
            {startDate && endDate ? (
              <GolfText>{startDate} — {endDate}</GolfText>
            ) : (
              <GolfText>Standard Monthly</GolfText>
            )}
          </div>
        </div>
      </div>

      {/* AXIS 1: TIER UPGRADE (Only visible to Small Business) */}
      {!isEnterprise && (
        <div style={{ marginBottom: '30px', padding: '20px', backgroundColor: 'rgba(212, 175, 55, 0.05)', border: '1px solid #D4AF37', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ display: 'block', color: '#D4AF37', fontSize: '18px', fontWeight: 'bold', marginBottom: '6px' }}>
              <GolfText>Upgrade to Enterprise</GolfText>
            </div>
            <div style={{ display: 'block', color: '#aaa', fontSize: '12px' }}>
              <GolfText>Unlock Tournament TV, CRM, and earn the Verified Enterprise Badge.</GolfText>
            </div>
          </div>
          <button onClick={triggerTierUpgrade} disabled={isProcessing} style={{ padding: '12px 24px', backgroundColor: '#D4AF37', color: '#000', border: 'none', borderRadius: '24px', fontWeight: 'bold', cursor: isProcessing ? 'not-allowed' : 'pointer' }}>
            ELEVATE TIER
          </button>
        </div>
      )}

      {/* AXIS 2: DURATION LOCK-IN (Only visible if Monthly) */}
      {contractType === 'monthly' && (
        <div>
          <div style={{ display: 'block', color: '#fff', fontSize: '16px', fontWeight: 'bold', marginBottom: '15px' }}>
            <GolfText>Secure Your Contract</GolfText>
          </div>
          <div style={{ display: 'flex', gap: '20px' }}>
            <div style={{ flex: 1, padding: '20px', backgroundColor: '#1a1a1a', border: '1px solid #555', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ display: 'block', color: '#D4AF37', fontSize: '13px', fontWeight: 'bold', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '1px' }}><GolfText>Save 10%</GolfText></div>
              <div style={{ display: 'block', color: '#fff', fontSize: '16px', fontWeight: 'bold', marginBottom: '8px' }}><GolfText>6-Month Contract</GolfText></div>
              <div style={{ display: 'block', color: '#888', fontSize: '12px', marginBottom: '20px' }}><GolfText>Lock in your tier for half a year.</GolfText></div>
              <button onClick={() => triggerDurationUpgrade('6_months')} disabled={isProcessing} style={{ padding: '12px 20px', width: '100%', backgroundColor: 'transparent', color: '#fff', border: '1px solid #888', borderRadius: '24px', fontWeight: 'bold', cursor: 'pointer' }}>
                LOCK IN 6 MONTHS
              </button>
            </div>

            <div style={{ flex: 1, padding: '20px', backgroundColor: '#1a1a1a', border: '1px solid #4CAF50', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ display: 'block', color: '#D4AF37', fontSize: '13px', fontWeight: 'bold', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '1px' }}><GolfText>Save 20%</GolfText></div>
              <div style={{ display: 'block', color: '#4CAF50', fontSize: '16px', fontWeight: 'bold', marginBottom: '8px' }}><GolfText>1-Year Contract</GolfText></div>
              <div style={{ display: 'block', color: '#888', fontSize: '12px', marginBottom: '20px' }}><GolfText>Maximize your commitment & value.</GolfText></div>
              <button onClick={() => triggerDurationUpgrade('1_year')} disabled={isProcessing} style={{ padding: '12px 20px', width: '100%', backgroundColor: '#4CAF50', color: '#fff', border: 'none', borderRadius: '24px', fontWeight: 'bold', cursor: 'pointer' }}>
                LOCK IN 1 YEAR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* THE PENALTY ENGINE (Only visible to locked-in users) */}
      {contractType !== 'monthly' && (
        <div style={{ marginTop: '20px', padding: '20px', backgroundColor: 'rgba(255, 68, 68, 0.05)', border: '1px dashed #ff4444', borderRadius: '8px' }}>
          <div style={{ display: 'block', color: '#ff4444', fontWeight: 'bold', fontSize: '14px', marginBottom: '10px' }}>
            <GolfText>Danger Zone: Contract Break</GolfText>
          </div>
          <div style={{ display: 'block', color: '#aaa', fontSize: '12px', marginBottom: '20px', lineHeight: '1.4' }}>
            <GolfText>You are locked into a {contractType.replace('_', ' ')} agreement until {endDate}. Canceling now will trigger the revenue protection protocol, stripping your VIP features instantly.</GolfText>
          </div>
          <button 
            onClick={triggerDowngradeModal}
            disabled={isProcessing}
            style={{ width: '100%', padding: '14px', backgroundColor: 'transparent', color: '#ff4444', border: '1px solid #ff4444', borderRadius: '24px', fontWeight: 'bold', cursor: isProcessing ? 'not-allowed' : 'pointer', fontSize: '12px' }}
          >
            {isProcessing ? 'PROCESSING...' : 'INITIATE EARLY CANCELLATION'}
          </button>
        </div>
      )}

      {/* RENDER THE CUSTOM MODAL */}
      <CustomModal 
        visible={modalConfig.visible}
        title={modalConfig.title}
        message={modalConfig.message}
        isDestructive={modalConfig.isDestructive}
        confirmText={modalConfig.confirmText}
        onConfirm={modalConfig.action}
        onCancel={modalConfig.showCancel ? () => setModalConfig({ ...modalConfig, visible: false }) : undefined}
      />
    </div>
  );
}