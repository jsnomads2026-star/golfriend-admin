import { useState, useEffect } from 'react';
import { db } from '../../firebaseConfig';
import { collection, onSnapshot, doc, writeBatch, updateDoc } from 'firebase/firestore';
import TournamentTV from './TournamentTV'; // 🔥 NEW: Importing the TV Component
import RaffleEngine from './RaffleEngine'; // 🔥 NEW: Importing the Raffle Engine

interface TournamentManagerProps {
  tournamentId?: string; // 🔥 Made optional to prevent parent crashes
  isPremium?: boolean;
}

// 🔥 Added default fallback to the active event to restore UI visibility
export default function TournamentManager({ tournamentId = 'PUI_SPORTS_BAR_0007', isPremium = false }: TournamentManagerProps) {
  const [activeTab, setActiveTab] = useState<string>('flights');
  const [waitingRoom, setWaitingRoom] = useState<any[]>([]);
  const [flights, setFlights] = useState<any[][]>([]);
  const [tournamentStatus, setTournamentStatus] = useState<string>('registration_open');
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error' | 'info'} | null>(null);

  // 🔥 CUSTOM NOTIFICATION ENGINE (Replaces window.alert)
  const showNotification = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  // 🔥 REGISTRATION GATE LISTENER
  useEffect(() => {
    if (!tournamentId) return;
    const masterRef = doc(db, 'tournaments', tournamentId);
    const unsubMaster = onSnapshot(masterRef, (document) => {
      if (document.exists()) {
        setTournamentStatus(document.data().status || 'registration_open');
      }
    });
    return () => unsubMaster();
  }, [tournamentId]);
  
  // 1. LIVE FIRESTORE SYNC
  useEffect(() => {
    if (!tournamentId) return;
    const registrationsRef = collection(db, 'tournaments', tournamentId, 'registrations');
    
    const unsubscribe = onSnapshot(registrationsRef, (snapshot) => {
      const activePlayers: any[] = [];
      snapshot.forEach((doc) => {
        activePlayers.push({ id: doc.id, ...doc.data() });
      });
      
      // Split the players: Who is waiting vs. Who is locked into a flight
      const unassigned = activePlayers.filter(u => !u.flightNumber);
      const assigned = activePlayers.filter(u => u.flightNumber);
      
      setWaitingRoom(unassigned);
      
      // Group the assigned players by their flight number for the UI
      const groupedFlights = assigned.reduce((acc, player) => {
        (acc[player.flightNumber] = acc[player.flightNumber] || []).push(player);
        return acc;
      }, {});
      setFlights(Object.values(groupedFlights));
    });

    return () => unsubscribe();
  }, []);

 // 2. CEREMONY REMOTE CONTROL (SECURED & LEAN)
  const triggerState = async (state: string) => {
    if (!isPremium) {
      showNotification("Broadcast Tier Required to change TV state.", "error");
      return;
    }

    try {
      // 🚀 Schema Locked: Localizing transient raffle physics to the TV layer
      await updateDoc(doc(db, 'tournaments', tournamentId), { displayState: state });
      showNotification(`📺 TV Signal Sent: ${state.toUpperCase()}`, "success");
    } catch (error) {
      showNotification("Failed to send TV signal.", "error");
    }
  };

  // 3. THE REGISTRATION GATE TOGGLE
  const toggleRegistration = async () => {
    try {
      const newStatus = tournamentStatus === 'registration_open' ? 'registration_closed' : 'registration_open';
      await updateDoc(doc(db, 'tournaments', tournamentId), { status: newStatus });
      showNotification(`Registration is now: ${newStatus.replace('_', ' ').toUpperCase()}`, "success");
    } catch (error) {
      showNotification("Failed to toggle registration.", "error");
    }
  };

  // 4.5. THE OVERRIDE: RESET FLIGHTS
  const handleResetFlights = async () => {
    if (flights.length === 0) return showNotification("No flights to reset.", "info");
    
    try {
      const batch = writeBatch(db);
      // Flatten the flights array to get all locked players
      flights.flat().forEach(player => {
        const pRef = doc(db, 'tournaments', tournamentId, 'registrations', player.id);
        // Wipe the flight number to send them back to the waiting room
        batch.update(pRef, { flightNumber: null, status: 'waiting' });
      });
      
      await batch.commit();
      showNotification("♻️ Flights reset. Players returned to waiting room.", "success");
    } catch (error) {
      console.error("Reset Error:", error);
      showNotification("Failed to reset flights.", "error");
    }
  };

  // 4. THE SMART AI SORTER SCRIPT (Friend-Group Preservation)
  const handleAISort = async () => {
    if (waitingRoom.length === 0) return showNotification("The waiting room is empty.", "info");

    try {
      const batch = writeBatch(db);
      let nextFlight = flights.length + 1;

      const friendGroups: Record<string, any[]> = {};
      const solos: any[] = [];

      waitingRoom.forEach(player => {
        if (player.flightPartyId) {
          if (!friendGroups[player.flightPartyId]) friendGroups[player.flightPartyId] = [];
          friendGroups[player.flightPartyId].push(player);
        } else {
          solos.push(player);
        }
      });

      let currentFlightList: any[] = [];

      const lockFlight = () => {
        currentFlightList.forEach(p => {
          const pRef = doc(db, 'tournaments', tournamentId, 'registrations', p.id);
          batch.update(pRef, { flightNumber: nextFlight, status: 'locked' });
        });
        nextFlight++;
        currentFlightList = [];
      };

      Object.values(friendGroups).forEach(group => {
        currentFlightList.push(...group);
        while (currentFlightList.length < 4 && solos.length > 0) {
          currentFlightList.push(solos.shift());
        }
        if (currentFlightList.length >= 4) lockFlight();
      });

      if (currentFlightList.length > 0) lockFlight();

      solos.forEach(solo => {
        currentFlightList.push(solo);
        if (currentFlightList.length === 4) lockFlight();
      });

      if (currentFlightList.length > 0) lockFlight();

      await batch.commit();
      showNotification("✅ AI Sorting Complete! Friend groups preserved.", "success");
    } catch (error) {
      console.error("AI Sort Error:", error);
      showNotification("Failed to execute AI Sort.", "error");
    }
  };

  return (
    <div style={{ padding: '20px', color: '#fff', height: '100%', position: 'relative' }}>
      
      {/* NATIVE NOTIFICATION OVERLAY */}
      {notification && (
        <div style={{
          position: 'absolute', top: '10px', right: '20px', padding: '12px 24px', zIndex: 50,
          backgroundColor: notification.type === 'error' ? '#ff4444' : notification.type === 'success' ? '#d4af37' : '#1E88E5',
          color: notification.type === 'info' ? '#fff' : '#000', borderRadius: '8px', fontWeight: 'bold',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)', transition: 'all 0.3s ease-in-out'
        }}>
          {notification.message}
        </div>
      )}

      <h2 style={{ color: '#D4AF37', letterSpacing: '2px', marginBottom: '20px', textTransform: 'uppercase' }}>
        🏆 TOURNAMENT COMMAND: {tournamentId.replace(/_/g, ' ')}
      </h2>
      
      <div style={{ marginBottom: '20px', display: 'flex', gap: '15px' }}>
         <button 
           onClick={handleAISort} 
           style={{ 
             padding: '12px 24px', backgroundColor: '#D4AF37', color: '#000',
             border: 'none', borderRadius: '8px', fontWeight: '900', cursor: 'pointer' 
           }}
         >
           🤖 AI OPTIMIZE FLIGHTS
         </button>

         {/* 🔥 THE OVERRIDE BUTTON */}
         {flights.length > 0 && (
           <button 
             onClick={handleResetFlights} 
             style={{ 
               padding: '12px 24px', backgroundColor: 'transparent', color: '#ff4444',
               border: '1px solid #ff4444', borderRadius: '8px', fontWeight: '900', cursor: 'pointer' 
             }}
           >
             ♻️ UNLOCK & RESET
           </button>
         )}

         {/* 🔥 REGISTRATION GATE BUTTON */}
         <button 
           onClick={toggleRegistration} 
           style={{ 
             padding: '12px 24px', backgroundColor: tournamentStatus === 'registration_open' ? '#44ff44' : '#ff4444', color: '#000',
             border: 'none', borderRadius: '8px', fontWeight: '900', cursor: 'pointer' 
           }}
         >
           {tournamentStatus === 'registration_open' ? '🔓 REGISTRATION: OPEN' : '🔒 REGISTRATION: CLOSED'}
         </button>

         {/* STAGE CONTROLS - PREMIUM ONLY */}
         {isPremium && (
           <div style={{ borderLeft: '2px solid #333', paddingLeft: '15px', display: 'flex', gap: '10px' }}>
             <button onClick={() => triggerState('leaderboard')} style={{ padding: '12px', background: '#222', color: '#fff', border: '1px solid #555', borderRadius: '8px', cursor: 'pointer' }}>
               📊 TV: Leaderboard
             </button>
             <button onClick={() => triggerState('podium')} style={{ padding: '12px', background: '#222', color: '#D4AF37', border: '1px solid #D4AF37', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
               🏆 TV: Show Podium
             </button>
             <button onClick={() => triggerState('raffle')} style={{ padding: '12px', background: '#8A2BE2', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
               🎁 TV: Spin Raffle
             </button>
           </div>
         )}
      </div>

      {/* 🔥 THE NEW TAB NAVIGATION BAR (THEME ENFORCED) */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '2px solid #333', paddingBottom: '10px' }}>
        <button onClick={() => setActiveTab('flights')} style={{ padding: '10px 20px', background: activeTab === 'flights' ? '#D4AF37' : 'transparent', color: activeTab === 'flights' ? '#000' : '#fff', border: activeTab === 'flights' ? 'none' : '1px solid #555', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', transition: '0.2s' }}>👥 FLIGHTS</button>
        <button onClick={() => setActiveTab('ledger')} style={{ padding: '10px 20px', background: activeTab === 'ledger' ? '#D4AF37' : 'transparent', color: activeTab === 'ledger' ? '#000' : '#fff', border: activeTab === 'ledger' ? 'none' : '1px solid #555', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', transition: '0.2s' }}>📊 ADMIN LEDGER</button>
        
        {/* PREMIUM ONLY TABS */}
        {isPremium && (
          <>
            <button onClick={() => setActiveTab('tv')} style={{ padding: '10px 20px', background: activeTab === 'tv' ? '#1E88E5' : 'transparent', color: '#fff', border: activeTab === 'tv' ? 'none' : '1px solid #555', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', transition: '0.2s' }}>📺 TV BROADCAST</button>
            <button onClick={() => setActiveTab('raffle')} style={{ padding: '10px 20px', background: activeTab === 'raffle' ? '#8A2BE2' : 'transparent', color: '#fff', border: activeTab === 'raffle' ? 'none' : '1px solid #555', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', transition: '0.2s' }}>🎁 RAFFLE ENGINE</button>
          </>
        )}
      </div>

      <div style={{ display: 'flex', gap: '20px', minHeight: 'calc(100vh - 150px)' }}>
        
        {/* 🔥 CONDITIONAL RENDERING: FLIGHTS TAB */}
        {activeTab === 'flights' && (
          <>
            {/* WAITING ROOM (UNASSIGNED) */}
        <div style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', padding: '20px', borderRadius: '12px' }}>
          <h3 style={{ color: '#888', borderBottom: '1px solid #333', paddingBottom: '10px' }}>
            WAITING ROOM ({waitingRoom.length})
          </h3>
          {waitingRoom.length === 0 ? (
             <div style={{ marginTop: '10px', color: '#555' }}>Awaiting mobile registrations...</div>
          ) : (
            waitingRoom.map((player) => (
              <div key={player.id} style={{ 
                padding: '10px', 
                background: '#222', 
                marginTop: '10px', 
                borderRadius: '5px',
                borderLeft: player.flightPartyId ? '4px solid #1E88E5' : '4px solid #555' 
              }}>
                <strong>{player.nickname}</strong> | HDCP: {player.handicap || 'N/A'}
                {/* 🔥 EAGLE RULE: Visual expansion of Friend Groups before AI Sort */}
                {player.flightPartyId && (
                  <span style={{ marginLeft: '10px', fontSize: '11px', color: '#1E88E5', backgroundColor: 'rgba(30, 136, 229, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                    Party: {player.flightPartyId.slice(0, 5).toUpperCase()}
                  </span>
                )}
              </div>
            ))
          )}
        </div>

        {/* LOCKED FLIGHTS */}
        <div style={{ flex: 2, backgroundColor: 'rgba(255,255,255,0.05)', padding: '20px', borderRadius: '12px' }}>
          <h3 style={{ color: '#888', borderBottom: '1px solid #333', paddingBottom: '10px' }}>
            LOCKED FLIGHTS ({flights.length})
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', marginTop: '15px' }}>
            {flights.length === 0 ? (
              <div style={{ color: '#555' }}>No flights generated.</div>
            ) : (
              flights.map((group: any, index) => (
                <div key={index} style={{ width: '200px', background: '#1a1a1a', padding: '15px', borderRadius: '8px', border: '1px solid #333' }}>
                  <h4 style={{ color: '#D4AF37', marginTop: 0 }}>Flight {index + 1}</h4>
                  {group.map((p: any) => (
                    <div key={p.id} style={{ fontSize: '14px', marginBottom: '5px' }}>• {p.nickname}</div>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
          </>
        )}

        {/* 🔥 CONDITIONAL RENDERING: TV BROADCAST TAB */}
        {/* 🔥 NEW: ADMIN LEDGER TAB */}
        {activeTab === 'ledger' && (
          <div style={{ flex: 1, backgroundColor: '#111', padding: '20px', borderRadius: '12px', border: '1px solid #333' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', color: '#fff' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #444' }}>
                  <th style={{ textAlign: 'left', padding: '10px' }}>Rank</th>
                  <th style={{ textAlign: 'left', padding: '10px' }}>Player</th>
                  <th style={{ textAlign: 'center', padding: '10px' }}>Thru</th>
                  <th style={{ textAlign: 'center', padding: '10px' }}>Score</th>
                </tr>
              </thead>
              <tbody>
                {flights.flat().map((p, idx) => (
                  <tr key={p.id} style={{ borderBottom: '1px solid #222' }}>
                    <td style={{ padding: '10px' }}>{idx + 1}</td>
                    <td style={{ padding: '10px' }}>{p.nickname}</td>
                    <td style={{ textAlign: 'center', padding: '10px' }}>{p.thru || '-'}</td>
                    <td style={{ textAlign: 'center', padding: '10px', fontWeight: 'bold', color: '#D4AF37' }}>{p.score || 'E'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 🔥 CONDITIONAL RENDERING: TV BROADCAST TAB (PREMIUM LOCKED) */}
        {isPremium && activeTab === 'tv' && (
          <div style={{ flex: 1, position: 'relative', backgroundColor: '#000', borderRadius: '12px', overflow: 'hidden', border: '1px solid #1E88E5' }}>
            <TournamentTV />
            {/* LOCKED OVERLAY - BYPASSED IN DEV MODE */}
            {!import.meta.env.DEV && (
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '15px', zIndex: 10 }}>
                <div style={{ color: '#1E88E5', fontSize: '48px' }}>📺</div>
                <h3 style={{ color: '#fff', fontSize: '24px' }}>Broadcast Tier Required</h3>
                <p style={{ color: '#888' }}>Upgrade to $499/mo to unlock TV Leaderboard engine.</p>
                <button style={{ padding: '10px 20px', backgroundColor: '#1E88E5', border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer' }}>UPGRADE NOW</button>
              </div>
            )}
          </div>
        )}

        {/* 🔥 CONDITIONAL RENDERING: RAFFLE ENGINE TAB (PREMIUM LOCKED) */}
        {isPremium && activeTab === 'raffle' && (
          <div style={{ flex: 1, position: 'relative', backgroundColor: '#0a0a0a', padding: '40px', borderRadius: '12px', border: '1px solid #8A2BE2' }}>
            <RaffleEngine />
            {/* LOCKED OVERLAY - BYPASSED IN DEV MODE */}
            {!import.meta.env.DEV && (
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '15px', zIndex: 10 }}>
                <div style={{ color: '#8A2BE2', fontSize: '48px' }}>🎁</div>
                <h3 style={{ color: '#fff', fontSize: '24px' }}>Broadcast Tier Required</h3>
                <p style={{ color: '#888' }}>Upgrade to $499/mo to unlock Raffle automation.</p>
                <button style={{ padding: '10px 20px', backgroundColor: '#8A2BE2', border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer' }}>UPGRADE NOW</button>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}