import { useEffect, useState } from 'react';
import { collection, query, where, getDocs, doc, writeBatch, increment } from 'firebase/firestore';
import { db } from '../../firebaseConfig'; // Adjust path for your web project

interface PendingValidation {
  id: string; // The User ID (UID)
  nickname: string;
  photo_url: string;
  verification_status: string;
}

export default function PhotoValidator() {
  const [pendingClaims, setPendingClaims] = useState<PendingValidation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    fetchPendingValidations();
  }, []);

  const fetchPendingValidations = async () => {
    try {
      // 🔥 PHASE 3 WIRE: Query the master users collection for AI Bouncer edge cases
      const q = query(collection(db, 'users'), where('verification_status', '==', 'pending_watchtower'));
      const snap = await getDocs(q);
      
      const claims = snap.docs.map(doc => ({
        id: doc.id,
        nickname: doc.data().nickname || 'Unknown',
        photo_url: doc.data().photo_url || '',
        verification_status: doc.data().verification_status
      })) as PendingValidation[];
      
      setPendingClaims(claims);
    } catch (error) {
      console.error("Failed to fetch validations:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDecision = async (claim: PendingValidation, isApproved: boolean) => {
    setProcessingId(claim.id);
    
    try {
      const batch = writeBatch(db);
      const userRef = doc(db, 'users', claim.id); // The claim ID is now the master UID

      if (isApproved) {
        batch.update(userRef, { 
          isVerified: true,
          verification_status: 'verified',
          chips: increment(50), 
          reliability_score: increment(10) // 🔥 Aligned perfectly with Phase 2 AI Rewards
        });
      } else {
        batch.update(userRef, { 
          isVerified: false,
          verification_status: 'rejected',
          photo_url: "", // 🔥 Immediately eradicate the invalid photo from the profile
          reliability_score: increment(-15) 
        });
      }

      await batch.commit();

      // Remove from local UI state
      setPendingClaims(prev => prev.filter(c => c.id !== claim.id));
      alert(`Photo ${isApproved ? 'Approved' : 'Rejected'} for ${claim.nickname}.`);

    } catch (error) {
      console.error("Batch update failed:", error);
      alert("Database error. Could not process decision.");
    } finally {
      setProcessingId(null);
    }
  };

  if (isLoading) return <div style={{ color: 'white', padding: 20 }}>Loading Watchtower...</div>;

  return (
    <div style={styles.container}>
      <h2 style={styles.header}>PHOTO WATCHTOWER (PENDING: {pendingClaims.length})</h2>
      
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
              </div>

              <div style={styles.buttonRow}>
                <button 
                  style={{...styles.btn, ...styles.btnReject}}
                  onClick={() => handleDecision(claim, false)}
                  disabled={processingId === claim.id}
                >
                  {processingId === claim.id ? '...' : 'REJECT (FLAG)'}
                </button>
                <button 
                  style={{...styles.btn, ...styles.btnApprove}}
                  onClick={() => handleDecision(claim, true)}
                  disabled={processingId === claim.id}
                >
                  {processingId === claim.id ? '...' : 'APPROVE (VERIFY)'}
                </button>
              </div>
            </div>
          ))}
        </div>
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