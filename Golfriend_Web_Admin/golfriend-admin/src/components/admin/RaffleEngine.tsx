import { useState, useEffect } from 'react';
import { db } from '../../firebaseConfig';
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';

export default function RaffleEngine() {
  const [eligiblePlayers, setEligiblePlayers] = useState<any[]>([]);
  const [isSpinning, setIsSpinning] = useState(false);
  const [recentWinner, setRecentWinner] = useState<string | null>(null);

  // 🔥 LIVE SYNC: Pull all registered players to act as "Raffle Tickets"
  useEffect(() => {
    const registrationsRef = collection(db, 'tournaments', 'PATTAYA_OPEN', 'registrations');
    const unsubscribe = onSnapshot(registrationsRef, (snapshot) => {
      const players: any[] = [];
      snapshot.forEach((doc) => {
        players.push({ id: doc.id, ...doc.data() });
      });
      setEligiblePlayers(players);
    });

    return () => unsubscribe();
  }, []);

  const executeSpin = async () => {
    if (eligiblePlayers.length === 0) return;
    
    setIsSpinning(true);
    setRecentWinner(null);

    // 1. Send the TV into "SPINNING..." mode immediately
    await updateDoc(doc(db, 'tournaments', 'PATTAYA_OPEN'), { 
      displayState: 'raffle',
      raffleWinner: '' 
    });

    // 2. Cinematic delay for suspense
    setTimeout(async () => {
      const winnerIndex = Math.floor(Math.random() * eligiblePlayers.length);
      const winner = eligiblePlayers[winnerIndex];
      
      setRecentWinner(winner.nickname);
      setIsSpinning(false);

      // 3. Lock in the winner and cast it to the TV
      await updateDoc(doc(db, 'tournaments', 'PATTAYA_OPEN'), { 
        raffleWinner: winner.nickname 
      });
    }, 2500);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      
      <div style={{ textAlign: 'center', marginBottom: '30px' }}>
        <h2 style={{ color: '#8A2BE2', letterSpacing: '2px', fontSize: '24px', margin: '0 0 10px 0' }}>
          🎁 AUTOMATED RAFFLE ENGINE
        </h2>
        <p style={{ color: '#aaa', fontSize: '14px' }}>
          {eligiblePlayers.length} Active Tickets in the Drum
        </p>
      </div>

      {/* THE MAIN SPIN CONTROL */}
      <button 
        onClick={executeSpin}
        disabled={isSpinning || eligiblePlayers.length === 0}
        style={{
          width: '300px',
          height: '80px',
          backgroundColor: isSpinning ? '#333' : '#8A2BE2',
          color: '#fff',
          border: isSpinning ? '1px solid #555' : 'none',
          borderRadius: '12px',
          fontSize: '20px',
          fontWeight: '900',
          letterSpacing: '3px',
          cursor: (isSpinning || eligiblePlayers.length === 0) ? 'not-allowed' : 'pointer',
          boxShadow: isSpinning ? 'none' : '0 10px 30px rgba(138, 43, 226, 0.4)',
          transition: 'all 0.2s ease-in-out'
        }}
      >
        {isSpinning ? 'DRAWING...' : 'SPIN RAFFLE'}
      </button>

      {/* WINNER DISPLAY HUD */}
      <div style={{ 
        marginTop: '40px', 
        width: '400px', 
        height: '120px',
        backgroundColor: '#111', 
        border: '1px solid #333', 
        borderRadius: '12px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <span style={{ color: '#666', fontSize: '12px', letterSpacing: '1px', textTransform: 'uppercase' }}>
          Latest Winner
        </span>
        <span style={{ color: recentWinner ? '#D4AF37' : '#444', fontSize: '28px', fontWeight: 'bold', marginTop: '10px' }}>
          {recentWinner || '---'}
        </span>
      </div>

    </div>
  );
}