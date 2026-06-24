import { useState, useEffect } from 'react';
import { db } from '../../firebaseConfig';
import { collection, onSnapshot, doc, writeBatch, updateDoc } from 'firebase/firestore';

export default function TournamentManager() {
  const [waitingRoom, setWaitingRoom] = useState<any[]>([]);
  const [flights, setFlights] = useState<any[][]>([]);
  const [tournamentStatus, setTournamentStatus] = useState<string>('registration_open');

  // 🔥 REGISTRATION GATE LISTENER
  useEffect(() => {
    const masterRef = doc(db, 'tournaments', 'PATTAYA_OPEN');
    const unsubMaster = onSnapshot(masterRef, (document) => {
      if (document.exists()) {
        setTournamentStatus(document.data().status || 'registration_open');
      }
    });
    return () => unsubMaster();
  }, []);
  

  // 1. LIVE FIRESTORE SYNC: Listening to the Day 1 Event
  useEffect(() => {
    // For the MVP, we hardcode to your first active local event
    const registrationsRef = collection(db, 'tournaments', 'PATTAYA_OPEN', 'registrations');
    
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

  // 2. CEREMONY REMOTE CONTROL
  const triggerState = async (state: string) => {
    const payload: any = { displayState: state };
    
    if (state === 'raffle') {
      const allPlayers = flights.flat();
      if (allPlayers.length > 0) {
        const randomWinner = allPlayers[Math.floor(Math.random() * allPlayers.length)];
        payload.raffleWinner = randomWinner.nickname;
      }
    }
    
    await updateDoc(doc(db, 'tournaments', 'PATTAYA_OPEN'), payload);
    alert("📺 TV Signal Sent: " + state); // 🔥 ADDED CLICK FEEDBACK
  };

  // 3. THE REGISTRATION GATE TOGGLE
  const toggleRegistration = async () => {
    const newStatus = tournamentStatus === 'registration_open' ? 'registration_closed' : 'registration_open';
    await updateDoc(doc(db, 'tournaments', 'PATTAYA_OPEN'), { status: newStatus });
    alert(`Registration is now: ${newStatus.toUpperCase()}`);
  };

  // 4. THE SMART AI SORTER SCRIPT (Friend-Group Preservation)
  const handleAISort = async () => {
    if (waitingRoom.length === 0) return alert("The waiting room is empty.");

    try {
      const batch = writeBatch(db);
      let nextFlight = flights.length + 1;

      // Split into Friends vs Solos
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
          const pRef = doc(db, 'tournaments', 'PATTAYA_OPEN', 'registrations', p.id);
          batch.update(pRef, { flightNumber: nextFlight, status: 'locked' });
        });
        nextFlight++;
        currentFlightList = [];
      };

      // Process Friend Groups First
      Object.values(friendGroups).forEach(group => {
        currentFlightList.push(...group);
        while (currentFlightList.length < 4 && solos.length > 0) {
          currentFlightList.push(solos.shift());
        }
        if (currentFlightList.length >= 4) lockFlight();
      });

      if (currentFlightList.length > 0) lockFlight();

      // Process Remaining Solos
      solos.forEach(solo => {
        currentFlightList.push(solo);
        if (currentFlightList.length === 4) lockFlight();
      });

      if (currentFlightList.length > 0) lockFlight();

      await batch.commit();
      alert("✅ AI Sorting Complete! Friend groups preserved.");
    } catch (error) {
      console.error("AI Sort Error:", error);
      alert("Failed to execute AI Sort.");
    }
  };

  return (
    <div style={{ padding: '20px', color: '#fff', height: '100%' }}>
      <h2 style={{ color: '#D4AF37', letterSpacing: '2px', marginBottom: '20px' }}>
        🏆 TOURNAMENT COMMAND: PATTAYA OPEN
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

         {/* STAGE CONTROLS */}
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
      </div>

      <div style={{ display: 'flex', gap: '20px', minHeight: 'calc(100vh - 150px)' }}>
        
        {/* WAITING ROOM (UNASSIGNED) */}
        <div style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', padding: '20px', borderRadius: '12px' }}>
          <h3 style={{ color: '#888', borderBottom: '1px solid #333', paddingBottom: '10px' }}>
            WAITING ROOM ({waitingRoom.length})
          </h3>
          {waitingRoom.length === 0 ? (
             <div style={{ marginTop: '10px', color: '#555' }}>Awaiting mobile registrations...</div>
          ) : (
            waitingRoom.map((player) => (
              <div key={player.id} style={{ padding: '10px', background: '#222', marginTop: '10px', borderRadius: '5px' }}>
                <strong>{player.nickname}</strong> | HDCP: {player.handicap || 'N/A'}
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

      </div>
    </div>
  );
}