import { useState, useEffect } from 'react';
import { db } from '../../firebaseConfig';
import { collection, onSnapshot, doc } from 'firebase/firestore';

export default function TournamentTV() {
  const [players, setPlayers] = useState<any[]>([]);
  const [displayState, setDisplayState] = useState<string>('leaderboard');
  const [raffleWinner, setRaffleWinner] = useState<string>('');

  // LIVE SYNC: The TV listens directly to the course data
  useEffect(() => {
    // 🔥 TV LISTENS FOR GOD MODE COMMANDS
    const masterRef = doc(db, 'tournaments', 'PATTAYA_OPEN');
    const unsubMaster = onSnapshot(masterRef, (document) => {
      if (document.exists()) {
        setDisplayState(document.data().displayState || 'leaderboard');
        setRaffleWinner(document.data().raffleWinner || '');
      }
    });

    const registrationsRef = collection(db, 'tournaments', 'PATTAYA_OPEN', 'registrations');
    
    const unsubscribe = onSnapshot(registrationsRef, (snapshot) => {
      const activePlayers: any[] = [];
      snapshot.forEach((doc) => {
        // Default to 'E' (Even) if no score exists yet
        activePlayers.push({ id: doc.id, ...doc.data(), currentScore: doc.data().currentScore || 'E' });
      });
      
      setPlayers(activePlayers);
    });

    return () => {
      unsubscribe();
      unsubMaster();
    };
  }, []);

  return (
    <div style={{ 
      minHeight: '100vh', backgroundColor: '#000', color: '#fff', 
      fontFamily: 'sans-serif', padding: '40px',
      backgroundImage: 'radial-gradient(circle at 50% 0%, #1a1a1a 0%, #000 70%)'
    }}>
      
      {/* HEADER */}
      <div style={{ textAlign: 'center', marginBottom: '50px' }}>
        <h1 style={{ fontSize: '3rem', color: '#D4AF37', letterSpacing: '4px', margin: 0, textTransform: 'uppercase' }}>
          Pattaya Open 2026
        </h1>
        <h2 style={{ fontSize: '1.5rem', color: '#888', letterSpacing: '2px', margin: '10px 0 0 0', fontWeight: 'normal' }}>
          Live Official Leaderboard
        </h2>
      </div>

      {/* ========================================== */}
      {/* STAGE 1: THE LEADERBOARD */}
      {/* ========================================== */}
      {displayState === 'leaderboard' && (
      <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '15px' }}>
        
        {/* Table Headers */}
        <div style={{ display: 'flex', borderBottom: '2px solid #D4AF37', paddingBottom: '10px', color: '#D4AF37', fontWeight: 'bold', fontSize: '1.2rem' }}>
          <div style={{ width: '100px', textAlign: 'center' }}>POS</div>
          <div style={{ flex: 1 }}>PLAYER</div>
          <div style={{ width: '150px', textAlign: 'center' }}>FLIGHT</div>
          <div style={{ width: '100px', textAlign: 'center' }}>SCORE</div>
        </div>

        {/* Player Rows */}
        {players.map((player, index) => (
          <div key={player.id} style={{ 
            display: 'flex', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', 
            padding: '20px 10px', borderRadius: '8px', fontSize: '1.5rem', border: '1px solid #222'
          }}>
            <div style={{ width: '100px', textAlign: 'center', color: '#888', fontWeight: 'bold' }}>{index + 1}</div>
            <div style={{ flex: 1, fontWeight: 'bold', letterSpacing: '1px' }}>{player.nickname}</div>
            <div style={{ width: '150px', textAlign: 'center', color: '#888', fontSize: '1.2rem' }}>
              {player.flightNumber ? `F-${player.flightNumber}` : '--'}
            </div>
            <div style={{ width: '100px', textAlign: 'center', fontWeight: '900', color: player.currentScore === 'E' ? '#fff' : (player.currentScore < 0 ? '#ff4444' : '#44ff44') }}>
              {player.currentScore}
            </div>
          </div>
        ))}
      </div>
      )}

      {/* ========================================== */}
      {/* STAGE 2: THE PODIUM */}
      {/* ========================================== */}
      {displayState === 'podium' && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: '20px', height: '400px', marginTop: '50px' }}>
           {/* 2nd Place */}
           <div style={{ width: '200px', height: '250px', background: 'silver', color: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRadius: '10px 10px 0 0' }}>
              <h2>2ND</h2>
              <h3>{players[1]?.nickname || 'TBA'}</h3>
           </div>
           {/* 1st Place */}
           <div style={{ width: '220px', height: '350px', background: '#D4AF37', color: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRadius: '10px 10px 0 0', boxShadow: '0 0 50px rgba(212,175,55,0.5)' }}>
              <h1>1ST 🏆</h1>
              <h2>{players[0]?.nickname || 'TBA'}</h2>
           </div>
           {/* 3rd Place */}
           <div style={{ width: '200px', height: '200px', background: '#cd7f32', color: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRadius: '10px 10px 0 0' }}>
              <h2>3RD</h2>
              <h3>{players[2]?.nickname || 'TBA'}</h3>
           </div>
        </div>
      )}

      {/* ========================================== */}
      {/* STAGE 3: THE RAFFLE */}
      {/* ========================================== */}
      {displayState === 'raffle' && (
        <div style={{ textAlign: 'center', marginTop: '100px' }}>
           <h2 style={{ color: '#8A2BE2', fontSize: '3rem', margin: 0, textShadow: '0 0 20px #8A2BE2' }}>🎁 RANDOM RAFFLE WINNER 🎁</h2>
           <h1 style={{ fontSize: '6rem', color: '#fff', letterSpacing: '5px', marginTop: '20px' }}>
              {raffleWinner || 'SPINNING...'}
           </h1>
        </div>
      )}

      {/* SPONSOR TICKER */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, backgroundColor: '#111', padding: '15px', textAlign: 'center', borderTop: '1px solid #333' }}>
        <span style={{ color: '#555', letterSpacing: '2px', fontSize: '1rem' }}>SPONSORED BY GOLFRIEND EXCHANGE & LOCAL PARTNERS</span>
      </div>
    </div>
  );
}