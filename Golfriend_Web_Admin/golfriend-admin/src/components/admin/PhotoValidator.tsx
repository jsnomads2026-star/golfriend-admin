import { useEffect, useState, useMemo } from 'react';
import { collection, getDocs, doc, writeBatch, increment } from 'firebase/firestore';
import { db } from '../../firebaseConfig'; 
import ManualOverride from './ManualOverride'; // 🔥 Injecting the God-Mode HUD

interface PendingValidation {
  id: string; 
  nickname: string;
  photo_url: string;
  verification_status: string;
  flagReason?: string; 
}

export default function PhotoValidator() {
  const [pendingClaims, setPendingClaims] = useState<PendingValidation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [reviewModalData, setReviewModalData] = useState<PendingValidation | null>(null); 
  const [historicalUsers, setHistoricalUsers] = useState<any[]>([]); 

  const [selectedUid, setSelectedUid] = useState(""); // 🔥 God-Mode Target State
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null);

  const showNotification = (message: string, type: 'success' | 'error') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // 🧮 SYSTEM HEALTH & ECONOMY HUD MATH
  const hudStats = useMemo(() => {
    const verifiedCount = historicalUsers.filter(u => u.verification_status === 'verified').length;
    const rejectedCount = historicalUsers.filter(u => u.verification_status === 'rejected').length;
    const chipsMinted = verifiedCount * 50;
    return { verifiedCount, rejectedCount, chipsMinted };
  }, [historicalUsers]);

  useEffect(() => {
    fetchWatchtowerData();
  }, []);

  const fetchWatchtowerData = async () => {
    try {
      const snap = await getDocs(collection(db, 'users'));
      
      const pending: PendingValidation[] = [];
      const history: any[] = [];
      
      snap.docs.forEach(doc => {
        const data = doc.data();
        if (data.requiresManualReview === true) {
          pending.push({
            id: doc.id,
            nickname: data.nickname || 'Unknown',
            photo_url: data.photo_url || '',
            verification_status: data.verification_status || 'unverified',
            flagReason: data.flagReason || 'FLAGGED_BY_AI'
          });
        } else if (data.verification_status === 'verified' || data.verification_status === 'rejected' || data.photoValidated === true) {
          history.push({ id: doc.id, ...data });
        }
      });
      
      setPendingClaims(pending);
      setHistoricalUsers(history);
    } catch (error) {
      console.error("Failed to fetch validations:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // 🔥 GOD MODE: LEDGER OVERRIDE ENGINE
  const handleOverride = async (user: any, forceApprove: boolean) => {
    setProcessingId(user.id);
    try {
      const batch = writeBatch(db);
      const userRef = doc(db, 'users', user.id);
      
      if (forceApprove) {
        batch.update(userRef, { 
          isVerified: true, verification_status: 'verified', behavior_badge: 'Verified Member', star_rating_display: 'New Member',
          chips: increment(50), reliability_score: increment(25) 
        });
      } else {
        batch.update(userRef, { 
          isVerified: false, verification_status: 'rejected', behavior_badge: 'Flagged: Admin Override', photo_url: "",
          chips: increment(-50), reliability_score: increment(-25) 
        });
      }
      await batch.commit();
      await fetchWatchtowerData(); 
      showNotification(`Override successful for ${user.nickname}.`, "success");
    } catch (error) {
      showNotification("Override failed.", "error");
      console.error(error);
    } finally {
      setProcessingId(null);
    }
  };

  const handleDecision = async (claim: PendingValidation, isApproved: boolean) => {
    setProcessingId(claim.id);
    
    try {
      const batch = writeBatch(db);
      const userRef = doc(db, 'users', claim.id); 

      if (isApproved) {
        batch.update(userRef, { 
          isVerified: true,
          verification_status: 'verified',
          photoValidated: true,
          requiresManualReview: false, 
          behavior_badge: 'Verified Member',
          star_rating_display: 'New Member',
          chips: increment(50), 
          reliability_score: increment(10)
        });
      } else {
        batch.update(userRef, { 
          isVerified: false,
          verification_status: 'rejected',
          photoValidated: false,
          requiresManualReview: false, 
          behavior_badge: 'Flagged: Invalid Photo',
          photo_url: "", 
          reliability_score: increment(-15) 
        });
      }

      await batch.commit();
      await fetchWatchtowerData(); 
      showNotification(`Photo ${isApproved ? 'Approved' : 'Rejected'} for ${claim.nickname}.`, "success");

    } catch (error) {
      console.error("Batch update failed:", error);
      showNotification("Database error. Could not process decision.", "error");
    } finally {
      setProcessingId(null);
    }
  };

  if (isLoading) return <div style={{ color: 'white', padding: 20 }}>Loading Watchtower...</div>;

  return (
    <div style={{ ...styles.container, position: 'relative' }}>
      
      {/* NATIVE NOTIFICATION OVERLAY */}
      {notification && (
        <div style={{ position: 'absolute', top: '20px', right: '20px', padding: '16px 24px', zIndex: 1000, backgroundColor: notification.type === 'error' ? '#ff4444' : '#4CAF50', color: '#fff', borderRadius: '8px', fontWeight: 'bold', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
          {notification.message}
        </div>
      )}

      <h2 style={styles.header}>PHOTO WATCHTOWER COMMAND CENTER</h2>
      
      {/* 📊 QUALITY & ECONOMY HUD */}
      <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
        <div style={{ flex: 1, padding: '15px', backgroundColor: '#111', border: '1px solid #333', borderRadius: '6px', textAlign: 'center' }}>
          <div style={{ fontSize: '12px', color: '#aaa', textTransform: 'uppercase' }}>Validations Passed</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#4CAF50', marginTop: '5px' }}>{hudStats.verifiedCount}</div>
        </div>
        <div style={{ flex: 1, padding: '15px', backgroundColor: '#111', border: '1px solid #333', borderRadius: '6px', textAlign: 'center' }}>
          <div style={{ fontSize: '12px', color: '#aaa', textTransform: 'uppercase' }}>Validations Failed</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#ff4444', marginTop: '5px' }}>{hudStats.rejectedCount}</div>
        </div>
        <div style={{ flex: 1, padding: '15px', backgroundColor: '#1a1a00', border: '1px solid #d4af37', borderRadius: '6px', textAlign: 'center' }}>
          <div style={{ fontSize: '12px', color: '#d4af37', textTransform: 'uppercase' }}>Economy Injection (Chips Minted)</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#FFD700', marginTop: '5px' }}>{hudStats.chipsMinted.toLocaleString()}</div>
        </div>
      </div>

      {pendingClaims.length === 0 ? (
        <p style={{ color: '#aaa' }}>The queue is empty. All users verified.</p>
      ) : (
        <div style={styles.grid}>
          {pendingClaims.map(claim => (
            <div key={claim.id} style={styles.card}>
              <div style={styles.imagePlaceholder}>
                {claim.photo_url ? (
                  <img 
                    src={claim.photo_url} 
                    alt={`Verification for ${claim.nickname}`} 
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                  />
                ) : (
                  <p style={{color: '#ff4444'}}>ERROR: No Image URL</p>
                )}
              </div>
              
              <div style={styles.infoBox}>
                <h3 style={styles.nickname}>{claim.nickname}</h3>
                <p style={styles.uidText}>UID: {claim.id}</p>
                
                <div style={{ marginTop: '10px', padding: '10px', backgroundColor: '#3a1c1c', borderRadius: '4px', border: '1px solid #ff4444' }}>
                  <div style={{ fontSize: '12px', color: '#ff4444', fontWeight: 'bold' }}>
                    🚨 FLAGGED BY WATCHTOWER AI:
                  </div>
                  <div style={{ fontSize: '14px', color: '#fff', marginTop: '4px', textTransform: 'uppercase' }}>
                    {claim.flagReason?.replace(/_/g, ' ')}
                  </div>
                </div>
              </div>

              <div style={styles.buttonRow}>
                <button 
                  style={{...styles.btn, backgroundColor: '#1E88E5', color: '#fff', borderTop: '1px solid #333' }}
                  onClick={() => setReviewModalData(claim)}
                  disabled={processingId === claim.id}
                >
                  {processingId === claim.id ? 'PROCESSING...' : '🔍 ENLARGE & REVIEW MEDIA'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 📜 HISTORICAL AUDIT & OVERRIDE LEDGER */}
      <div style={{ marginTop: '40px', padding: '20px', backgroundColor: '#111', border: '1px solid #333', borderRadius: '8px' }}>
        <h3 style={{ marginTop: 0, color: '#d4af37', fontSize: '16px', borderBottom: '1px solid #333', paddingBottom: '10px' }}>Historical Ledger & Overrides ({historicalUsers.length})</h3>
        <div style={{ overflowX: 'auto', maxHeight: '400px', overflowY: 'auto' }}>
          <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ color: '#888', borderBottom: '1px solid #333' }}>
                <th style={{ padding: '10px', position: 'sticky', top: 0, backgroundColor: '#111' }}>User</th>
                <th style={{ padding: '10px', position: 'sticky', top: 0, backgroundColor: '#111' }}>Status</th>
                <th style={{ padding: '10px', position: 'sticky', top: 0, backgroundColor: '#111' }}>Badge</th>
                <th style={{ padding: '10px', position: 'sticky', top: 0, backgroundColor: '#111' }}>Chips</th>
                <th style={{ padding: '10px', position: 'sticky', top: 0, backgroundColor: '#111' }}>Reliability</th>
                <th style={{ padding: '10px', position: 'sticky', top: 0, backgroundColor: '#111' }}>God Mode</th>
              </tr>
            </thead>
            <tbody>
              {historicalUsers.map(u => (
                <tr key={u.id} style={{ borderBottom: '1px solid #222' }}>
                  <td 
                    style={{ padding: '10px', color: '#fff', cursor: 'pointer' }}
                    onClick={() => setSelectedUid(u.id)}
                  >
                    {u.nickname} <br/><span style={{ fontSize: '10px', color: '#1E88E5', textDecoration: 'underline' }}>{u.id}</span>
                  </td>
                  <td style={{ padding: '10px', color: u.verification_status === 'verified' ? '#4CAF50' : '#ff4444' }}>{u.verification_status.toUpperCase()}</td>
                  <td style={{ padding: '10px', color: '#aaa' }}>{u.behavior_badge}</td>
                  <td style={{ padding: '10px', color: '#FFD700', fontWeight: 'bold' }}>{u.chips || 0}</td>
                  <td style={{ padding: '10px', color: '#1E88E5', fontWeight: 'bold' }}>{u.reliability_score || 0}</td>
                  <td style={{ padding: '10px', display: 'flex', gap: '8px' }}>
                    {u.verification_status === 'rejected' ? (
                      <button onClick={() => handleOverride(u, true)} disabled={processingId === u.id} style={{ backgroundColor: '#1c3a21', color: '#44ff66', border: '1px solid #44ff66', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>FORCE APPROVE</button>
                    ) : (
                      <button onClick={() => handleOverride(u, false)} disabled={processingId === u.id} style={{ backgroundColor: '#3a1c1c', color: '#ff4444', border: '1px solid #ff4444', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>FORCE REJECT</button>
                    )}
                    <button 
                      onClick={() => setSelectedUid(u.id)}
                      style={{ padding: '5px 10px', backgroundColor: 'rgba(212, 175, 55, 0.1)', color: '#D4AF37', border: '1px solid #D4AF37', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>
                      ⚡ OVERRIDE
                    </button>
                  </td>
                </tr>
              ))}
              {historicalUsers.length === 0 && <tr><td colSpan={6} style={{ padding: '20px', textAlign: 'center', color: '#555' }}>No history found.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* 🔥 THE HIGH-RES MEDIA VIEWER LIGHTBOX */}
      {reviewModalData && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.92)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ maxWidth: '800px', width: '100%', backgroundColor: '#111', borderRadius: '8px', border: '1px solid #d4af37', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            
            <div style={{ padding: '15px 20px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1a1a1a' }}>
              <h2 style={{ margin: 0, color: '#d4af37', fontSize: '18px' }}>EVIDENCE REVIEW: {reviewModalData.nickname}</h2>
              <button onClick={() => setReviewModalData(null)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '24px', cursor: 'pointer' }}>✖</button>
            </div>
            
            <div style={{ width: '100%', height: '500px', backgroundColor: '#000', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              {reviewModalData.photo_url ? (
                reviewModalData.photo_url.toLowerCase().includes('.mp4') || reviewModalData.photo_url.toLowerCase().includes('.mov') ? (
                   <video src={reviewModalData.photo_url} controls autoPlay style={{ maxWidth: '100%', maxHeight: '100%' }} />
                ) : (
                   <img src={reviewModalData.photo_url} alt="Evidence" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                )
              ) : (
                <span style={{ color: '#ff4444', fontWeight: 'bold', letterSpacing: '1px' }}>NO MEDIA DETECTED IN DATABASE</span>
              )}
            </div>

            <div style={{ display: 'flex' }}>
              <button 
                onClick={() => { handleDecision(reviewModalData, false); setReviewModalData(null); }}
                style={{ flex: 1, padding: '20px', backgroundColor: '#3a1c1c', color: '#ff4444', border: 'none', borderTop: '1px solid #333', borderRight: '1px solid #333', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px', letterSpacing: '1px' }}
              >
                DECLINE (FLAG & PENALIZE -15)
              </button>
              <button 
                onClick={() => { handleDecision(reviewModalData, true); setReviewModalData(null); }}
                style={{ flex: 1, padding: '20px', backgroundColor: '#1c3a21', color: '#44ff66', border: 'none', borderTop: '1px solid #333', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px', letterSpacing: '1px' }}
              >
                ACCEPT (VERIFY & MINT 50 CHIPS)
              </button>
            </div>

          </div>
        </div>
      )}

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

// Basic inline styles for the web dashboard (Replace with Tailwind if you are using it)
const styles = {
  container: { padding: '24px', backgroundColor: '#121212', minHeight: '100vh', fontFamily: 'sans-serif' },
  header: { color: '#d4af37', borderBottom: '1px solid #333', paddingBottom: '12px', marginBottom: '24px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' },
  card: { backgroundColor: '#1e1e1e', borderRadius: '8px', border: '1px solid #333', overflow: 'hidden' },
  imagePlaceholder: { height: '250px', backgroundColor: '#2a2a2a', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  infoBox: { padding: '16px' },
  nickname: { margin: '0 0 4px 0', color: '#fff', fontSize: '18px' },
  uidText: { margin: 0, color: '#666', fontSize: '12px' },
  buttonRow: { display: 'flex', borderTop: '1px solid #333' },
  btn: { flex: 1, padding: '16px', border: 'none', cursor: 'pointer', fontWeight: 'bold' as const, fontSize: '14px' },
  btnReject: { backgroundColor: '#3a1c1c', color: '#ff4444' },
  btnApprove: { backgroundColor: '#1c3a21', color: '#44ff66' }
};