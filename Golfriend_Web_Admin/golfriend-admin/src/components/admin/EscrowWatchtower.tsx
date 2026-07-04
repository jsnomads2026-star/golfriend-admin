import { useState, useEffect } from 'react';
import { db } from '../../firebaseConfig';
import ManualOverride from './ManualOverride'; // 🔥 Injecting the God-Mode HUD
import { collection, query, where, onSnapshot, doc, writeBatch, serverTimestamp, increment } from 'firebase/firestore';

export default function EscrowWatchtower() {
  const [lockedEscrows, setLockedEscrows] = useState<any[]>([]);
  const [selectedUid, setSelectedUid] = useState(""); // 🔥 God-Mode Target State
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null);

  const showNotification = (message: string, type: 'success' | 'error') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  useEffect(() => {
    const q = query(
      collection(db, 'transactions'),
      where('status', '==', 'escrow_locked')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setLockedEscrows(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => unsubscribe();
  }, []);

  const resolveEscrow = async (txId: string, uid: string, amount: number, resolution: 'REFUND' | 'PAYOUT') => {
    // 🛡️ Replaced native window.confirm with direct execution + UI notification
    const batch = writeBatch(db);
    const numericAmount = Math.abs(amount);

    try {
      // 1. Clear the Escrow status in the ledger
      const txRef = doc(db, 'transactions', txId);
      batch.update(txRef, {
        status: resolution === 'REFUND' ? 'failed' : 'completed', 
        resolvedBy: 'DIRECTOR_OVERRIDE',
        resolvedAt: serverTimestamp()
      });

      // 2. Return funds to the original buyer only if refunded
      if (resolution === 'REFUND') {
        const userRef = doc(db, 'users', uid);
        batch.update(userRef, {
          chips: increment(numericAmount)
        });
      }

      await batch.commit();
      showNotification(`Escrow successfully resolved via ${resolution}.`, "success");
    } catch (error: any) {
      showNotification(`Error resolving escrow: ${error.message}`, "error");
    }
  };

  return (
    <div style={{ padding: '24px', backgroundColor: '#121212', minHeight: '100vh', color: '#fff', fontFamily: 'sans-serif', position: 'relative' }}>
      
      {/* NATIVE NOTIFICATION OVERLAY */}
      {notification && (
        <div style={{ position: 'absolute', top: '20px', right: '20px', padding: '16px 24px', zIndex: 1000, backgroundColor: notification.type === 'error' ? '#ff4444' : '#4CAF50', color: '#fff', borderRadius: '8px', fontWeight: 'bold', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
          {notification.message}
        </div>
      )}

      <h2 style={{ color: '#1E88E5', margin: '0 0 8px 0' }}>🔒 ESCROW WATCHTOWER</h2>
      <p style={{ color: '#aaa', fontSize: '14px', marginBottom: '24px' }}>
        Granular control over all active financial holds. Force resolution for disputed matches or crashed tournaments.
      </p>

      <div style={{ backgroundColor: '#1e1e1e', borderRadius: '8px', border: '1px solid #333', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ backgroundColor: '#222', borderBottom: '2px solid #333' }}>
              <th style={{ padding: '16px', color: '#888', fontSize: '12px' }}>ESCROW ID</th>
              <th style={{ padding: '16px', color: '#888', fontSize: '12px' }}>USER (UID)</th>
              <th style={{ padding: '16px', color: '#888', fontSize: '12px' }}>LOCKED AMOUNT</th>
              <th style={{ padding: '16px', color: '#888', fontSize: '12px' }}>TIMESTAMP</th>
              <th style={{ padding: '16px', color: '#888', fontSize: '12px', textAlign: 'right' }}>DIRECTOR ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {lockedEscrows.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: '20px', textAlign: 'center', color: '#555' }}>No active escrow holds detected.</td></tr>
            ) : (
              lockedEscrows.map(escrow => (
                <tr key={escrow.id} style={{ borderBottom: '1px solid #2a2a2a' }}>
                  <td style={{ padding: '16px', fontFamily: 'monospace', color: '#888', fontSize: '12px' }}>{escrow.id}</td>
                  
                  {/* 🔥 CLICKABLE UID TO LAUNCH OVERRIDE */}
                  <td 
                    style={{ padding: '16px', fontFamily: 'monospace', color: '#1E88E5', cursor: 'pointer', textDecoration: 'underline' }}
                    onClick={() => setSelectedUid(escrow.uid)}
                    title="Click to load into Manual Override"
                  >
                    {escrow.uid}
                  </td>
                  
                  <td style={{ padding: '16px', fontWeight: 'bold', color: '#D4AF37' }}>{Math.abs(escrow.amount)} 🪙</td>
                  <td style={{ padding: '16px', color: '#aaa', fontSize: '13px' }}>{escrow.timestamp?.toDate ? escrow.timestamp.toDate().toLocaleString() : 'N/A'}</td>
                  
                  <td style={{ padding: '16px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                    <button 
                      onClick={() => resolveEscrow(escrow.id, escrow.uid, escrow.amount, 'REFUND')}
                      style={{ padding: '6px 12px', backgroundColor: 'rgba(255, 68, 68, 0.1)', color: '#ff4444', border: '1px solid #ff4444', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '10px' }}>
                      REFUND
                    </button>
                    <button 
                      onClick={() => resolveEscrow(escrow.id, escrow.uid, escrow.amount, 'PAYOUT')}
                      style={{ padding: '6px 12px', backgroundColor: 'rgba(76, 175, 80, 0.1)', color: '#4CAF50', border: '1px solid #4CAF50', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '10px' }}>
                      PAYOUT
                    </button>
                    
                    {/* 🔥 THE TACTICAL OVERRIDE BUTTON */}
                    <button 
                      onClick={() => setSelectedUid(escrow.uid)}
                      style={{ padding: '6px 12px', backgroundColor: 'rgba(212, 175, 55, 0.1)', color: '#D4AF37', border: '1px solid #D4AF37', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '10px' }}>
                      ⚡ OVERRIDE
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 🔥 CONDITIONAL TACTICAL HUD */}
      {selectedUid && (
        <ManualOverride 
          injectedUid={selectedUid} 
          onClose={() => setSelectedUid("")} 
        />
      )}

    </div>
  );
}