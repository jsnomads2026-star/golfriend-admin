import { useState, useEffect } from 'react';
import { db } from '../../firebaseConfig';
import { collection, query, orderBy, limit, onSnapshot, doc, updateDoc } from 'firebase/firestore';

export default function LiveAutomationLog() {
  const [stream, setStream] = useState<any[]>([]);

  // 🔥 THE REAL-TIME AUTOMATION LISTENER
  useEffect(() => {
    const q = query(
      collection(db, 'marketplaceOffers'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const activeStream = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setStream(activeStream);
    });

    return () => unsubscribe();
  }, []);

  // 🔥 THE GLOBAL MASTER KILL SWITCH
  const executeKillSwitch = async (offerId: string, corpName: string) => {
    const confirmOverride = window.confirm(
      `DIRECTOR OVERRIDE: Instantly purge the active campaign for ${corpName} from the mobile feed?`
    );
    if (!confirmOverride) return;

    try {
      await updateDoc(doc(db, 'marketplaceOffers', offerId), { 
        status: 'inactive_override',
        killedAt: new Date().toISOString()
      });
    } catch (error: any) {
      alert(`❌ Override Failed: ${error.message}`);
    }
  };

  // Helper to render the correct status badge
  const renderStatusBadge = (status: string) => {
    const safeStatus = status?.toLowerCase() || '';
    switch(safeStatus) {
      case 'pending_payment': return <span style={{...styles.badge, backgroundColor: '#555'}}>⏳ PENDING STRIPE</span>;
      case 'ai_scanning': return <span style={{...styles.badge, backgroundColor: '#1E88E5'}}>🤖 AI VISION SCAN</span>;
      case 'active_live':
      case 'active_in_store': return <span style={{...styles.badge, backgroundColor: '#4CAF50'}}>🟢 LIVE ON MOBILE</span>;
      case 'inactive_override': return <span style={{...styles.badge, backgroundColor: '#ff4444'}}>🛑 KILLED BY ADMIN</span>;
      default: return <span style={{...styles.badge, backgroundColor: '#333'}}>{status?.toUpperCase() || 'UNKNOWN'}</span>;
    }
  };

  return (
    <div style={{ padding: '24px', backgroundColor: '#121212', minHeight: '100vh', fontFamily: 'monospace', color: '#fff' }}>
      <h2 style={{ color: '#D4AF37', borderBottom: '1px dashed #333', paddingBottom: '12px' }}>
        📡 LIVE AUTOMATION LOG & KILL SWITCH
      </h2>
      
      <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {stream.length === 0 ? (
          <p style={{ color: '#555' }}>Awaiting inbound transmissions...</p>
        ) : (
          stream.map((log) => (
            <div key={log.id} style={{ 
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
              padding: '15px', backgroundColor: '#1e1e1e', borderLeft: log.status === 'active_live' ? '4px solid #4CAF50' : '4px solid #333', borderRadius: '4px' 
            }}>
              <div style={{ flex: 2 }}>
                {/* Resilient Fallbacks to catch whatever schema your mobile app is writing */}
                <strong style={{ color: '#D4AF37', fontSize: '16px' }}>{log.corpName || log.title || log.productName || 'Unnamed Item'}</strong>
                <span style={{ color: '#888', marginLeft: '10px', fontSize: '12px' }}>Track: {log.campaignObjective || log.category || log.type || 'Standard Listing'}</span>
                <div style={{ marginTop: '5px', fontSize: '12px', color: '#aaa' }}>
                  ID: {log.id} | POC: {log.projectLead || log.vendorId || log.userId || 'N/A'}
                </div>
              </div>

              <div style={{ flex: 1, textAlign: 'center' }}>
                {renderStatusBadge(log.status)}
              </div>

              <div style={{ flex: 1, textAlign: 'right' }}>
                <button 
                  onClick={() => executeKillSwitch(log.id, (log.corpName || log.title || log.productName || 'this item'))}
                  disabled={log.status === 'inactive_override'}
                  style={{ 
                    padding: '10px 15px', backgroundColor: log.status === 'inactive_override' ? '#333' : '#8B0000', 
                    color: '#fff', fontWeight: 'bold', border: 'none', borderRadius: '4px', 
                    cursor: log.status === 'inactive_override' ? 'not-allowed' : 'pointer' 
                  }}
                >
                  EXECUTE KILL SWITCH
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const styles = {
  badge: { padding: '5px 10px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' as const, color: '#fff' }
};