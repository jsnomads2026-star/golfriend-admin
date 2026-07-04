import { useState } from 'react';
import { collection, query, where, getDocs, doc, increment, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '../../firebaseConfig'; 

export default function LedgerWatchtower() {
  const [searchQuery, setSearchQuery] = useState("");
  const [targetUser, setTargetUser] = useState<any | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  
  const [chipAdjustment, setChipAdjustment] = useState("0");
  const [reliabilityAdjustment, setReliabilityAdjustment] = useState("0");
  const [overrideReason, setOverrideReason] = useState(""); // 🔥 INJECTED: Audit Trail Reason

  const addLog = (msg: string) => setLogs(prev => [msg, ...prev]);

  const searchProfile = async () => {
    if (!searchQuery) return;
    setIsSearching(true);
    setTargetUser(null);
    addLog(`🔍 Searching for UID or Nickname: ${searchQuery}...`);

    try {
      const usersRef = collection(db, "users");
      let q = query(usersRef, where("nickname", "==", searchQuery));
      let snap = await getDocs(q);

      if (snap.empty) {
        q = query(usersRef, where("__name__", "==", searchQuery));
        snap = await getDocs(q);
      }

      if (snap.empty) {
        addLog(`❌ ERROR: No user found matching '${searchQuery}'.`);
      } else {
        const userData = snap.docs[0].data();
        const userId = snap.docs[0].id;
        setTargetUser({ id: userId, ...userData });
        addLog(`✅ Target Acquired: ${userData.nickname || 'Unknown'} (UID: ${userId})`);
      }
    } catch (error: any) {
      addLog(`❌ NETWORK ERROR: ${error.message}`);
    } finally {
      setIsSearching(false);
    }
  };

  const executeEconomicOverride = async () => {
    if (!targetUser) return;
    // 🔥 SHIELD: Prevent NaN database corruption from empty admin inputs
    const chipsToAdjust = parseInt(chipAdjustment) || 0;
    const reliabilityToAdjust = parseInt(reliabilityAdjustment) || 0;
    
    if (chipsToAdjust === 0 && reliabilityToAdjust === 0) return;
    if (!overrideReason.trim()) return addLog(`❌ ERROR: Audit log reason is required.`); // 🔥 SHIELD

    setIsUpdating(true);
    addLog(`⚡ INITIATING OVERRIDE for ${targetUser.nickname}...`);

    try {
      const batch = writeBatch(db); // 🔥 PREVENT LEAKS: Atomic transaction protocol
      const userRef = doc(db, "users", targetUser.id);
      
      batch.update(userRef, {
        chips: increment(chipsToAdjust), 
        reliability_score: increment(reliabilityToAdjust) 
      });

      // 🔥 INJECTED: Write the permanent ledger receipt atomically to the MASTER ROOT
      const txRef = doc(collection(db, 'transactions'));
      batch.set(txRef, {
        userId: targetUser.id, 
        title: `Admin Override: ${overrideReason.trim()}`,
        amount: chipsToAdjust,
        reliabilityImpact: reliabilityToAdjust, // 🔥 INJECTED: Tracks the exact behavior score change
        type: 'ADMIN_OVERRIDE',
        status: 'completed', 
        enforcedBy: 'DIRECTOR_CONSOLE',
        createdAt: serverTimestamp() // 🔥 This MUST be 'createdAt' to match the Central Bank
      });
      
      await batch.commit(); // 🔥 Locks the math

      addLog(`💰 SUCCESS: Adjusted Chips by ${chipsToAdjust}.`);
      addLog(`📈 SUCCESS: Adjusted Reliability by ${reliabilityToAdjust}.`);
      
      setTargetUser((prev: any) => ({
        ...prev,
        chips: (prev.chips || 0) + chipsToAdjust, 
        reliability_score: (prev.reliability_score || 0) + reliabilityToAdjust
      }));

      setChipAdjustment("0");
      setReliabilityAdjustment("0");
    } catch (error: any) {
      addLog(`❌ OVERRIDE FAILED: ${error.message}`);
    } finally {
      setIsUpdating(false);
    }
  };

// 🔥 INJECTED: B2B Commercial Partner Promotion & 10k Chip Bundle
  const executeCommercialUpgrade = async () => {
    if (!targetUser) return;
    if (!window.confirm(`Are you sure you want to upgrade ${targetUser.nickname} to Commercial Tier and issue 10,000 Chips?`)) return;

    setIsUpdating(true);
    addLog(`⚡ INITIATING B2B UPGRADE for ${targetUser.nickname}...`);

    try {
      const batch = writeBatch(db);
      const userRef = doc(db, "users", targetUser.id);
      
      batch.update(userRef, {
        tier: 'commercial', 
        chips: increment(10000) 
      });

      const txRef = doc(collection(db, 'transactions'));
      batch.set(txRef, {
        userId: targetUser.id, 
        title: `Admin Action: B2B Commercial Promotion (10k Bundle)`,
        amount: 10000,
        reliabilityImpact: 0,
        type: 'B2B_UPGRADE',
        status: 'completed', 
        enforcedBy: 'DIRECTOR_CONSOLE',
        createdAt: serverTimestamp()
      });
      
      await batch.commit();

      addLog(`✅ SUCCESS: ${targetUser.nickname} is now a VIP Partner.`);
      addLog(`💰 SUCCESS: 10,000 Commercial Chips Deposited.`);
      
      setTargetUser((prev: any) => ({
        ...prev,
        tier: 'commercial',
        chips: (prev.chips || 0) + 10000 
      }));
    } catch (error: any) {
      addLog(`❌ B2B UPGRADE FAILED: ${error.message}`);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div style={{ padding: '24px', backgroundColor: '#121212', minHeight: '100vh', fontFamily: 'sans-serif' }}>
      <h2 style={{ color: '#d4af37', borderBottom: '1px solid #333', paddingBottom: '12px', marginBottom: '24px' }}>
        LEDGER WATCHTOWER (MANUAL OVERRIDE)
      </h2>

      <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#1e1e1e', border: '1px solid #333', borderRadius: '8px' }}>
        <h3 style={{ marginTop: 0, color: '#fff', fontSize: '16px' }}>Target Acquisition</h3>
        <div style={{ display: 'flex', gap: '10px' }}>
          <input 
            type="text" 
            placeholder="Enter Exact Nickname or UID..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ padding: '10px', width: '300px', borderRadius: '4px', border: '1px solid #555', backgroundColor: '#333', color: '#fff' }}
          />
          <button 
            onClick={searchProfile} 
            disabled={isSearching}
            style={{ backgroundColor: isSearching ? '#555' : '#1E88E5', color: '#fff', padding: '10px 20px', fontWeight: 'bold', border: 'none', borderRadius: '4px', cursor: isSearching ? 'not-allowed' : 'pointer' }}
          >
            {isSearching ? 'SCANNING...' : 'LOCATE TARGET'}
          </button>
        </div>
      </div>

      {targetUser && (
        <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
          <div style={{ flex: 1, padding: '20px', backgroundColor: 'rgba(212, 175, 55, 0.05)', border: '1px solid #d4af37', borderRadius: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <h3 style={{ marginTop: 0, color: '#d4af37', marginBottom: '5px' }}>Target: {targetUser.nickname || 'Unnamed Player'}</h3>
              <span style={{ backgroundColor: targetUser.tier === 'commercial' ? '#d4af37' : '#333', color: targetUser.tier === 'commercial' ? '#000' : '#fff', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' }}>
                {targetUser.tier === 'commercial' ? 'VIP PARTNER' : 'SOCIAL TIER'}
              </span>
            </div>
            <p style={{ color: '#888', fontSize: '12px', margin: '0 0 15px 0' }}>UID: {targetUser.id}</p>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', padding: '10px', backgroundColor: '#000', borderRadius: '4px' }}>
              <span style={{ color: '#aaa' }}>Current Chip Balance:</span>
              <span style={{ color: '#4CAF50', fontWeight: 'bold' }}>
                {targetUser.chips || 0} 
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', backgroundColor: '#000', borderRadius: '4px', marginBottom: '15px' }}>
              <span style={{ color: '#aaa' }}>Reliability Score:</span>
              <span style={{ color: targetUser.reliability_score >= 80 ? '#4CAF50' : '#ff4444', fontWeight: 'bold' }}>
                {targetUser.reliability_score || 0} / 100
              </span>
            </div>
            
            {/* 🔥 B2B UPGRADE TERMINAL */}
            {targetUser.tier !== 'commercial' && (
              <button 
                onClick={executeCommercialUpgrade} 
                disabled={isUpdating} 
                style={{ width: '100%', backgroundColor: isUpdating ? '#555' : '#d4af37', color: '#000', padding: '12px', fontWeight: 'bold', border: 'none', borderRadius: '4px', cursor: isUpdating ? 'not-allowed' : 'pointer' }}
              >
                {isUpdating ? 'PROCESSING...' : '💎 PROMOTE TO VIP & ISSUE 10K CHIPS'}
              </button>
            )}
          </div>

          <div style={{ flex: 1, padding: '20px', backgroundColor: '#1e1e1e', border: '1px solid #ff4444', borderRadius: '8px' }}>
             <h3 style={{ marginTop: 0, color: '#ff4444' }}>Execute Manual Override</h3>
             <p style={{ color: '#aaa', fontSize: '12px', marginBottom: '15px' }}>Use negative numbers to deduct.</p>
             <div style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
                <div>
                  <label style={{ display: 'block', color: '#fff', fontSize: '12px', marginBottom: '5px' }}>Chip Adjustment</label>
                  <input type="number" value={chipAdjustment} onChange={(e) => setChipAdjustment(e.target.value)} style={{ padding: '10px', width: '100%', borderRadius: '4px', border: '1px solid #555', backgroundColor: '#333', color: '#fff' }} />
                </div>
                <div>
                  <label style={{ display: 'block', color: '#fff', fontSize: '12px', marginBottom: '5px' }}>Reliability Adjustment</label>
                  <input type="number" value={reliabilityAdjustment} onChange={(e) => setReliabilityAdjustment(e.target.value)} style={{ padding: '10px', width: '100%', borderRadius: '4px', border: '1px solid #555', backgroundColor: '#333', color: '#fff' }} />
                </div>
             </div>

             {/* 🔥 INJECTED: Audit Reason Input */}
             <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', color: '#fff', fontSize: '12px', marginBottom: '5px' }}>Audit Log Reason (Required)</label>
                <input 
                  type="text" 
                  value={overrideReason} 
                  onChange={(e) => setOverrideReason(e.target.value)} 
                  placeholder="e.g. Refunded Bug #402"
                  style={{ padding: '10px', width: '100%', borderRadius: '4px', border: '1px solid #555', backgroundColor: '#333', color: '#fff', boxSizing: 'border-box' }} 
                />
             </div>

             <button onClick={executeEconomicOverride} disabled={isUpdating} style={{ width: '100%', backgroundColor: isUpdating ? '#555' : '#ff4444', color: '#fff', padding: '15px', fontWeight: 'bold', border: 'none', borderRadius: '4px', cursor: isUpdating ? 'not-allowed' : 'pointer' }}>
                {isUpdating ? 'UPDATING...' : 'EXECUTE OVERRIDE'}
              </button>
          </div>
        </div>
      )}

      <div style={{ padding: '15px', backgroundColor: '#000', border: '1px solid #333', borderRadius: '8px', maxHeight: '200px', overflowY: 'auto', fontFamily: 'monospace', fontSize: '12px' }}>
        {logs.map((log, index) => <div key={index} style={{ marginBottom: '4px', color: log.includes('❌') ? '#ff4444' : log.includes('✅') || log.includes('💰') || log.includes('📈') ? '#4CAF50' : '#aaa' }}>{log}</div>)}
      </div>
    </div>
  );
}