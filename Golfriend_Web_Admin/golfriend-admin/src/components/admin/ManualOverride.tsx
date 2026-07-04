import { useState, useEffect } from 'react';
import { db } from '../../firebaseConfig';
import { collection, doc, getDoc, updateDoc, writeBatch, serverTimestamp, increment } from 'firebase/firestore';

export default function ManualOverride({ injectedUid = "", onClose }: { injectedUid?: string, onClose?: () => void }) {
  // 🔥 Core State
  const [targetUid, setTargetUid] = useState("");
  const [userProfile, setUserProfile] = useState<any>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [reason, setReason] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  
  // 🔥 Custom Native Notification System
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error' | 'info'} | null>(null);

  // 🔥 Economy State
  const [amount, setAmount] = useState("");

  // 🔥 Reliability State (Locked to verified schema)
  const [relScore, setRelScore] = useState<number | "">("");
  const [badge, setBadge] = useState("");
  const [starRating, setStarRating] = useState("");
  const [verification, setVerification] = useState("");

  const showNotification = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  useEffect(() => {
    if (injectedUid) {
      setTargetUid(injectedUid);
      fetchUser(injectedUid);
    }
  }, [injectedUid]);

  // 1. PRE-WRITE VALIDATION ENGINE
  const fetchUser = async (uidToSearch: string) => {
    if (!uidToSearch.trim()) return showNotification("Target UID is required.", "error");
    
    setIsSearching(true);
    try {
      const userDoc = await getDoc(doc(db, 'users', uidToSearch.trim()));
      if (userDoc.exists()) {
        const data = userDoc.data();
        setUserProfile(data);
        
        // Populate current schema state
        setRelScore(data.reliability_score ?? 100);
        setBadge(data.behavior_badge ?? "Verified Member");
        setStarRating(data.star_rating_display ?? "New Member");
        setVerification(data.verification_status ?? "verified");
        
        showNotification("User profile successfully locked.", "success");
      } else {
        setUserProfile(null);
        showNotification("User not found in database.", "error");
      }
    } catch (error) {
      showNotification("Failed to connect to database.", "error");
    } finally {
      setIsSearching(false);
    }
  };

  // 2. ECONOMY OVERRIDE
  const handleEconomyExecute = async (operationType: 'MINT' | 'BURN') => {
    if (!amount || !reason.trim()) return showNotification("Amount and Audit Reason are required.", "error");
    const numericAmount = Math.abs(parseInt(amount, 10));
    if (isNaN(numericAmount) || numericAmount === 0) return showNotification("Amount must be greater than zero.", "error");

    setIsProcessing(true);
    const finalAmount = operationType === 'BURN' ? -numericAmount : numericAmount;
    const batch = writeBatch(db);

    try {
      const userRef = doc(db, 'users', targetUid.trim());
      batch.update(userRef, { chips: increment(finalAmount) });

      const txRef = doc(collection(db, 'transactions'));
      batch.set(txRef, {
        uid: targetUid.trim(),
        type: 'ADMIN_OVERRIDE',
        amount: finalAmount,
        status: 'completed',
        enforcedBy: 'DIRECTOR_CONSOLE',
        auditReason: reason.trim(),
        timestamp: serverTimestamp()
      });

      await batch.commit();
      showNotification(`Successfully executed ${operationType} for ${numericAmount} chips.`, "success");
      setAmount("");
      fetchUser(targetUid); // Refresh HUD
    } catch (error: any) {
      showNotification(`Execution Failed: ${error.message}`, "error");
    } finally {
      setIsProcessing(false);
    }
  };

  // 3. RELIABILITY OVERRIDE
  const handleReliabilityUpdate = async () => {
    if (!reason.trim()) return showNotification("Audit Reason is required for structural changes.", "error");
    
    setIsProcessing(true);
    try {
      const userRef = doc(db, 'users', targetUid.trim());
      await updateDoc(userRef, {
        reliability_score: Number(relScore),
        behavior_badge: badge,
        star_rating_display: starRating,
        verification_status: verification
      });
      
      showNotification("Reliability metrics permanently updated.", "success");
      fetchUser(targetUid); // Refresh HUD
    } catch (error: any) {
      showNotification(`Update Failed: ${error.message}`, "error");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', fontFamily: 'sans-serif' }}>
      
      {/* NATIVE NOTIFICATION OVERLAY */}
      {notification && (
        <div style={{
          position: 'absolute', top: '20px', right: '20px', padding: '16px 24px', zIndex: 10000,
          backgroundColor: notification.type === 'error' ? '#ff4444' : notification.type === 'success' ? '#4CAF50' : '#1E88E5',
          color: '#fff', borderRadius: '8px', fontWeight: 'bold', boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          animation: 'fadeIn 0.3s ease-in-out'
        }}>
          {notification.message}
        </div>
      )}

      {/* COMMAND CENTER PANEL */}
      <div style={{ backgroundColor: '#121212', borderRadius: '12px', border: '1px solid #333', padding: '30px', width: '100%', maxWidth: '800px', position: 'relative', boxShadow: '0 10px 40px rgba(0,0,0,0.7)', maxHeight: '90vh', overflowY: 'auto' }}>
        
        {onClose && (
          <button onClick={onClose} style={{ position: 'absolute', top: '20px', right: '20px', background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '28px', lineHeight: 1 }}>&times;</button>
        )}

        <div style={{ borderBottom: '1px solid #222', paddingBottom: '15px', marginBottom: '25px' }}>
          <h2 style={{ color: '#d4af37', margin: 0, letterSpacing: '1px' }}>⚡ TACTICAL OVERRIDE COMMAND</h2>
          <p style={{ color: '#888', fontSize: '13px', margin: '8px 0 0 0' }}>Bypass standard protocols. Real-time ledger and reliability manipulation.</p>
        </div>

        {/* UID SEARCH & LOCK */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '25px' }}>
          <input 
            type="text" 
            value={targetUid} 
            onChange={(e) => setTargetUid(e.target.value)}
            placeholder="Target UID (e.g. tEW4Pv8Ru...)"
            style={{ flex: 1, padding: '14px', backgroundColor: '#0a0a0a', border: '1px solid #333', borderRadius: '6px', color: '#fff', fontFamily: 'monospace', fontSize: '14px' }}
          />
          <button 
            onClick={() => fetchUser(targetUid)}
            disabled={isSearching}
            style={{ padding: '0 24px', backgroundColor: '#1E88E5', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: isSearching ? 'not-allowed' : 'pointer' }}
          >
            {isSearching ? 'SCANNING...' : '🔒 LOCK TARGET'}
          </button>
        </div>

        {/* VERIFIED HUD & CONTROLS */}
        {userProfile && (
          <>
            <div style={{ backgroundColor: '#0a0a0a', border: '1px solid #333', borderRadius: '8px', padding: '15px 20px', marginBottom: '25px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div><span style={{ color: '#666', fontSize: '11px', display: 'block' }}>NICKNAME</span><span style={{ color: '#fff', fontWeight: 'bold' }}>{userProfile.nickname || 'Unknown'}</span></div>
              <div><span style={{ color: '#666', fontSize: '11px', display: 'block' }}>WALLET BALANCE</span><span style={{ color: '#d4af37', fontWeight: '900', fontSize: '16px' }}>{userProfile.chips || 0} CHIPS</span></div>
              <div><span style={{ color: '#666', fontSize: '11px', display: 'block' }}>RELIABILITY</span><span style={{ color: '#4CAF50', fontWeight: 'bold' }}>{userProfile.reliability_score || 100} / 100</span></div>
            </div>

            <div style={{ display: 'flex', gap: '20px', marginBottom: '25px' }}>
              
              {/* ECONOMY COLUMN */}
              <div style={{ flex: 1, backgroundColor: '#1a1a1a', border: '1px solid #222', borderRadius: '8px', padding: '20px' }}>
                <h3 style={{ color: '#888', fontSize: '12px', margin: '0 0 15px 0', letterSpacing: '1px' }}>CHIP ECONOMY</h3>
                <input 
                  type="number" 
                  value={amount} 
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Amount"
                  min="1"
                  style={{ width: '100%', padding: '12px', backgroundColor: '#0a0a0a', border: '1px solid #333', borderRadius: '4px', color: '#d4af37', fontWeight: 'bold', fontSize: '16px', marginBottom: '15px' }}
                />
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => handleEconomyExecute('MINT')} disabled={isProcessing} style={{ flex: 1, padding: '12px', backgroundColor: 'rgba(76, 175, 80, 0.1)', color: '#4CAF50', border: '1px solid #4CAF50', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>+ MINT</button>
                  <button onClick={() => handleEconomyExecute('BURN')} disabled={isProcessing} style={{ flex: 1, padding: '12px', backgroundColor: 'rgba(255, 68, 68, 0.1)', color: '#ff4444', border: '1px solid #ff4444', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>- BURN</button>
                </div>
              </div>

              {/* RELIABILITY COLUMN */}
              <div style={{ flex: 1, backgroundColor: '#1a1a1a', border: '1px solid #222', borderRadius: '8px', padding: '20px' }}>
                <h3 style={{ color: '#888', fontSize: '12px', margin: '0 0 15px 0', letterSpacing: '1px' }}>RELIABILITY SYSTEM</h3>
                
                <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '10px', color: '#666' }}>SCORE (0-100)</label>
                    <input type="number" value={relScore} onChange={(e) => setRelScore(Number(e.target.value))} style={{ width: '100%', padding: '8px', backgroundColor: '#0a0a0a', border: '1px solid #333', color: '#fff', borderRadius: '4px' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '10px', color: '#666' }}>STATUS</label>
                    <select value={verification} onChange={(e) => setVerification(e.target.value)} style={{ width: '100%', padding: '8px', backgroundColor: '#0a0a0a', border: '1px solid #333', color: '#fff', borderRadius: '4px' }}>
                      <option value="verified">Verified</option>
                      <option value="pending">Pending</option>
                      <option value="unverified">Unverified</option>
                      <option value="suspended">Suspended</option>
                    </select>
                  </div>
                </div>

                <div style={{ marginBottom: '10px' }}>
                  <label style={{ fontSize: '10px', color: '#666' }}>BEHAVIOR BADGE</label>
                  <select value={badge} onChange={(e) => setBadge(e.target.value)} style={{ width: '100%', padding: '8px', backgroundColor: '#0a0a0a', border: '1px solid #333', color: '#fff', borderRadius: '4px' }}>
                    <option value="Verified Member">Verified Member</option>
                    <option value="Premium Elite">Premium Elite</option>
                    <option value="Warning">Warning Issued</option>
                    <option value="Restricted">Restricted</option>
                  </select>
                </div>

                <div style={{ marginBottom: '15px' }}>
                  <label style={{ fontSize: '10px', color: '#666' }}>STAR RATING DISPLAY</label>
                  <select value={starRating} onChange={(e) => setStarRating(e.target.value)} style={{ width: '100%', padding: '8px', backgroundColor: '#0a0a0a', border: '1px solid #333', color: '#fff', borderRadius: '4px' }}>
                    <option value="New Member">New Member</option>
                    <option value="5 Stars">5 Stars</option>
                    <option value="4 Stars">4 Stars</option>
                    <option value="3 Stars">3 Stars</option>
                    <option value="Under Review">Under Review</option>
                  </select>
                </div>

                <button onClick={handleReliabilityUpdate} disabled={isProcessing} style={{ width: '100%', padding: '12px', backgroundColor: '#1E88E5', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>OVERRIDE METRICS</button>
              </div>

            </div>

            {/* MANDATORY AUDIT LOG (Standardized) */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <select 
                value={reason === "Custom..." ? "Custom..." : reason || ""} 
                onChange={(e) => setReason(e.target.value)}
                style={{ flex: 1, padding: '14px', backgroundColor: '#0a0a0a', border: '1px solid #444', borderRadius: '6px', color: '#fff', fontSize: '13px' }}
              >
                <option value="" disabled>Select Mandatory Audit Reason (Required)...</option>
                <option value="Refund: Failed Escrow Lock (Server Error)">Refund: Failed Escrow Lock (Server Error)</option>
                <option value="Refund: Canceled Tournament Override">Refund: Canceled Tournament Override</option>
                <option value="Penalty: Verified Disciplinary Action">Penalty: Verified Disciplinary Action</option>
                <option value="Penalty: Excessive No-Shows (Ghosting)">Penalty: Excessive No-Shows (Ghosting)</option>
                <option value="Admin Adjust: Promotional / Giveaway Injection">Admin Adjust: Promotional / Giveaway Injection</option>
                <option value="Custom...">Custom Reason (Type below)...</option>
              </select>

              {reason === "Custom..." && (
                <input 
                  type="text" 
                  onBlur={(e) => setReason(e.target.value)}
                  placeholder="Type custom reason here... (Click away to save)"
                  style={{ flex: 1, padding: '14px', backgroundColor: '#111', border: '1px solid #4CAF50', borderRadius: '6px', color: '#fff' }}
                />
              )}
            </div>
          </>
        )}

      </div>
    </div>
  );
}