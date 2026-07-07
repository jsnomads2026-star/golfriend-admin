// ==========================================
// FILE: src/components/B2B/CourseTeeSheet.tsx
// ==========================================
import { useState, useEffect } from 'react';
import { doc, updateDoc, collection, query, where, onSnapshot, writeBatch, increment } from 'firebase/firestore';
import { db } from '../../firebaseConfig';

interface Player {
  uid: string;
  nickname: string;
  handicap: number;
  reliability_score: number;
}

interface Flight {
  id: string;
  time: string;
  status: 'pending' | 'checked_in' | 'completed';
  players: Player[];
  cartAssignments?: Record<string, string>;
}

export default function CourseTeeSheet() {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [selectedFlight, setSelectedFlight] = useState<Flight | null>(null);
  const [cartInputs, setCartInputs] = useState<Record<string, string>>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [notification, setNotification] = useState<{msg: string, type: 'success' | 'error'} | null>(null);

  const ACTIVE_COURSE_ID = '0111398836469497431'; // Siam Country Club

  useEffect(() => {
    const q = query(
      collection(db, 'games'),
      where('courseId', '==', ACTIVE_COURSE_ID),
      where('status', 'in', ['pending', 'checked_in'])
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const liveFlights: Flight[] = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        liveFlights.push({
          id: doc.id,
          time: data.time || 'TBD',
          status: data.status || 'pending',
          players: data.players || [],
          cartAssignments: data.cartAssignments || {}
        });
      });
      
      liveFlights.sort((a, b) => a.time.localeCompare(b.time));
      setFlights(liveFlights);
      setSelectedFlight(prev => prev ? liveFlights.find(f => f.id === prev.id) || null : null);
    }, (error) => {
      console.error("Tee Sheet Sync Error:", error);
    });

    return () => unsubscribe();
  }, []);

  const handleCartInputChange = (uid: string, cartNumber: string) => {
    setCartInputs(prev => ({ ...prev, [uid]: cartNumber }));
  };

  const executeCheckIn = async () => {
    if (!selectedFlight) return;
    setIsProcessing(true);

    try {
      const unassigned = selectedFlight.players.some(p => !cartInputs[p.uid]);
      if (unassigned) throw new Error("All players must be assigned a cart to establish liability.");

      const flightRef = doc(db, 'games', selectedFlight.id);
      await updateDoc(flightRef, {
        status: 'checked_in',
        cartAssignments: cartInputs
      });
      
      setNotification({ msg: `Flight ${selectedFlight.time} checked in successfully. Liability locked.`, type: 'success' });
      setSelectedFlight(null);
    } catch (error: any) {
      setNotification({ msg: error.message || "Check-in failed.", type: 'error' });
    } finally {
      setIsProcessing(false);
      setTimeout(() => setNotification(null), 4000);
    }
  };

  const triggerNuclearButton = async (uid: string, nickname: string) => {
    if (!window.confirm(`⚠️ DANGER: Are you sure you want to report ${nickname}? This permanently deducts 25 Reliability points.`)) return;
    
    setIsProcessing(true);
    try {
      const batch = writeBatch(db);
      const userRef = doc(db, 'users', uid);
      
      batch.update(userRef, { 
        reliability_score: increment(-25), 
        behavior_badge: 'Flagged by Course GM' 
      });
      
      await batch.commit();
      setNotification({ msg: `Incident reported for ${nickname}.`, type: 'success' });
    } catch (error) {
      setNotification({ msg: "Failed to process report.", type: 'error' });
    } finally {
      setIsProcessing(false);
      setTimeout(() => setNotification(null), 4000);
    }
  };

  return (
    <div style={{ padding: '24px', color: '#fff' }}>
      {notification && (
        <div style={{ position: 'fixed', top: '20px', right: '20px', padding: '16px 24px', zIndex: 1000, backgroundColor: notification.type === 'error' ? '#ff4444' : '#4CAF50', borderRadius: '8px', fontWeight: 'bold' }}>
          {notification.msg}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #333', paddingBottom: '12px', marginBottom: '24px' }}>
        <h2 style={{ color: '#d4af37', margin: 0 }}>Daily Tee Sheet & Liability Engine</h2>
        <div style={{ backgroundColor: '#1a1a00', border: '1px solid #d4af37', padding: '8px 16px', borderRadius: '4px', color: '#FFD700', fontWeight: 'bold', fontSize: '14px' }}>
          📍 ACTIVE PROPERTY: Siam Country Club
        </div>
      </div>

      <div style={{ display: 'flex', gap: '20px' }}>
        
        {/* LEFT COLUMN: LIVE TEE SHEET */}
        <div style={{ flex: 1, backgroundColor: '#111', border: '1px solid #333', borderRadius: '8px', padding: '20px', maxHeight: '75vh', overflowY: 'auto' }}>
          <h3 style={{ marginTop: 0, color: '#aaa', fontSize: '14px', textTransform: 'uppercase' }}>Today's Vetted Flights</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {flights.length === 0 && <div style={{ color: '#555', fontSize: '14px' }}>No active flights found for this venue.</div>}
            {flights.map(flight => (
              <div 
                key={flight.id} 
                onClick={() => setSelectedFlight(flight)}
                style={{ 
                  padding: '15px', 
                  backgroundColor: flight.status === 'checked_in' ? '#1c3a21' : '#222', 
                  border: `1px solid ${flight.status === 'checked_in' ? '#44ff66' : '#555'}`, 
                  borderRadius: '6px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}
              >
                <div>
                  <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#fff' }}>{flight.time}</div>
                  <div style={{ fontSize: '12px', color: '#aaa' }}>{flight.players.length} Players</div>
                </div>
                <div>
                  {flight.status === 'checked_in' 
                    ? <span style={{ color: '#44ff66', fontWeight: 'bold', fontSize: '12px' }}>✓ ON COURSE</span>
                    : <span style={{ color: '#FFD700', fontWeight: 'bold', fontSize: '12px' }}>PENDING</span>
                  }
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT COLUMN: CHECK-IN ENGINE */}
        <div style={{ flex: 2 }}>
          {selectedFlight ? (
            <div style={{ backgroundColor: '#111', border: '1px solid #d4af37', borderRadius: '8px', padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ margin: 0, color: '#d4af37', fontSize: '20px' }}>Flight Check-In: {selectedFlight.time}</h3>
                {selectedFlight.status === 'checked_in' && (
                  <span style={{ backgroundColor: '#4CAF50', color: '#000', padding: '4px 8px', borderRadius: '4px', fontWeight: 'bold', fontSize: '12px' }}>LIABILITY LOCKED</span>
                )}
              </div>

              <div style={{ display: 'grid', gap: '15px' }}>
                {selectedFlight.players.map((player) => (
                  <div key={player.uid} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#222', padding: '15px', borderRadius: '6px', border: '1px solid #333' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#fff' }}>{player.nickname}</div>
                      <div style={{ fontSize: '12px', color: '#aaa', display: 'flex', gap: '10px', marginTop: '4px' }}>
                        <span>HCP: <strong style={{ color: '#fff' }}>{player.handicap}</strong></span>
                        <span>Reliability: <strong style={{ color: '#1E88E5' }}>{player.reliability_score}</strong></span>
                      </div>
                    </div>

                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ color: '#888', fontSize: '12px', fontWeight: 'bold' }}>ASSIGN CART:</span>
                      {selectedFlight.status === 'checked_in' ? (
                        <div style={{ backgroundColor: '#000', border: '1px solid #555', color: '#44ff66', padding: '8px 12px', borderRadius: '4px', fontWeight: 'bold', flex: 1, textAlign: 'center' }}>
                          {selectedFlight.cartAssignments?.[player.uid] || 'N/A'}
                        </div>
                      ) : (
                        <input 
                          type="text" 
                          placeholder="e.g. Cart 14"
                          value={cartInputs[player.uid] || ""}
                          onChange={(e) => handleCartInputChange(player.uid, e.target.value)}
                          style={{ padding: '8px 12px', borderRadius: '4px', border: '1px solid #d4af37', backgroundColor: '#000', color: '#fff', outline: 'none', flex: 1 }}
                        />
                      )}
                    </div>

                    {selectedFlight.status === 'checked_in' && (
                      <div style={{ marginLeft: '15px' }}>
                        <button 
                          onClick={() => triggerNuclearButton(player.uid, player.nickname)}
                          disabled={isProcessing}
                          style={{ backgroundColor: '#3a1c1c', color: '#ff4444', border: '1px solid #ff4444', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}
                        >
                          🚨 REPORT DAMAGE
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {selectedFlight.status === 'pending' && (
                <div style={{ marginTop: '20px', borderTop: '1px solid #333', paddingTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                  <button 
                    onClick={executeCheckIn}
                    disabled={isProcessing}
                    style={{ backgroundColor: '#D4AF37', color: '#000', border: 'none', padding: '12px 24px', borderRadius: '6px', fontWeight: '900', fontSize: '14px', cursor: isProcessing ? 'not-allowed' : 'pointer' }}
                  >
                    {isProcessing ? 'LOCKING...' : 'COMMIT CHECK-IN & ACTIVATE LIABILITY'}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div style={{ height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', border: '1px dashed #333', borderRadius: '8px', color: '#555' }}>
              Select a flight from the Tee Sheet to manage check-in.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}