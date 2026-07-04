import { useState, useEffect } from 'react';
import { db } from '../../firebaseConfig';
import { collection, onSnapshot, doc } from 'firebase/firestore';

export default function TournamentTV() {
  const [players, setPlayers] = useState<any[]>([]);
  const [displayState, setDisplayState] = useState<string>('leaderboard');
  const [raffleWinner, setRaffleWinner] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(0); // 🔥 NEW: Auto-Pagination State

  const PLAYERS_PER_PAGE = 10;

  // 🔥 STRICT PRODUCTION LOGIC: Driven entirely by live Firebase 'players' state
  const totalPages = Math.ceil(players.length / PLAYERS_PER_PAGE) || 1;
  const visiblePlayers = players.slice(currentPage * PLAYERS_PER_PAGE, (currentPage + 1) * PLAYERS_PER_PAGE);

  // 🔥 THE 8-SECOND AUTO-PAGINATION TIMER
  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (displayState === 'leaderboard' && totalPages > 1) {
      timer = setInterval(() => {
        setCurrentPage(prev => (prev + 1) % totalPages);
      }, 8000); // Broadcast rotation speed
    }
    return () => clearInterval(timer);
  }, [displayState, totalPages]);

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
      
      // 🔥 LEADERBOARD MATH: Sort by score (Lowest first, 'E' = 0)
      activePlayers.sort((a, b) => {
        const scoreA = a.currentScore === 'E' ? 0 : parseInt(a.currentScore) || 0;
        const scoreB = b.currentScore === 'E' ? 0 : parseInt(b.currentScore) || 0;
        return scoreA - scoreB;
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
      {/* STAGE 1: THE LEADERBOARD (PGA-STYLE) */}
      {/* ========================================== */}
      {displayState === 'leaderboard' && (
      <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        
        {/* Table Headers */}
        <div style={{ display: 'flex', borderBottom: '1px solid #444', paddingBottom: '12px', color: '#888', fontWeight: 'bold', fontSize: '1rem', letterSpacing: '1px', textTransform: 'uppercase' }}>
          <div style={{ width: '80px', textAlign: 'center' }}>POS</div>
          <div style={{ flex: 1, paddingLeft: '20px' }}>PLAYER</div>
          <div style={{ width: '120px', textAlign: 'center' }}>FLIGHT</div>
          <div style={{ width: '120px', textAlign: 'center' }}>TO PAR</div>
          <div style={{ width: '100px', textAlign: 'center' }}>THRU</div>
          <div style={{ width: '100px', textAlign: 'center' }}>TOTAL</div>
        </div>

        {/* Player Rows (Controlled by Pagination Engine) */}
        {visiblePlayers.map((player, index) => {
          // Calculate the true position number across pages
          const trueRank = (currentPage * PLAYERS_PER_PAGE) + index + 1;
          return (
          <div key={player.id} style={{ 
            display: 'flex', alignItems: 'center', backgroundColor: index % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent', 
            padding: '16px 10px', borderBottom: '1px solid #222', fontSize: '1.4rem'
          }}>
            <div style={{ width: '80px', textAlign: 'center', color: '#fff', fontWeight: 'bold' }}>{trueRank}</div>
            <div style={{ flex: 1, paddingLeft: '20px', fontWeight: 'bold', color: '#fff', letterSpacing: '1px' }}>{player.nickname}</div>
            <div style={{ width: '120px', textAlign: 'center', color: '#888', fontSize: '1.1rem' }}>
              {player.flightNumber ? `F-${player.flightNumber}` : '--'}
            </div>
            
            {/* ⛳ BROADCAST SCORE PILL */}
            <div style={{ width: '120px', display: 'flex', justifyContent: 'center' }}>
              <div style={{ 
                width: '60px', padding: '6px 0', textAlign: 'center', borderRadius: '4px', fontWeight: 'bold', fontSize: '1.2rem',
                backgroundColor: player.currentScore === 'E' ? '#333' : (player.currentScore < 0 ? '#1c3a21' : '#3a1c1c'),
                color: player.currentScore === 'E' ? '#fff' : (player.currentScore < 0 ? '#44ff66' : '#ff4444')
              }}>
                {player.currentScore === 'E' ? 'E' : (player.currentScore > 0 ? `+${player.currentScore}` : player.currentScore)}
              </div>
            </div>
            
            <div style={{ width: '100px', textAlign: 'center', color: '#ccc', fontWeight: 'bold', fontSize: '1.2rem' }}>
              {player.thru || 'F'}
            </div>
            <div style={{ width: '100px', textAlign: 'center', color: '#fff', fontWeight: 'bold' }}>
              {player.total || '--'}
            </div>
          </div>
        );
        })}
        
        {players.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px', color: '#555', fontStyle: 'italic', fontSize: '18px', marginTop: '20px', border: '1px dashed #333', borderRadius: '8px', letterSpacing: '2px' }}>
            AWAITING LIVE TOURNAMENT DATA...
          </div>
        )}

        {/* 🔥 PAGE INDICATOR HUD */}
        {totalPages > 1 && (
          <div style={{ textAlign: 'right', color: '#888', fontWeight: 'bold', letterSpacing: '2px', paddingRight: '20px' }}>
            PAGE {currentPage + 1} OF {totalPages}
          </div>
        )}
      </div>
      )}

      {/* ========================================== */}
      {/* STAGE 2: THE PREMIUM PODIUM */}
      {/* ========================================== */}
      {displayState === 'podium' && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: '30px', height: '500px', marginTop: '60px' }}>
          
           {/* 🥈 2ND PLACE (SILVER) */}
           <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 1 }}>
             <div style={{ backgroundColor: '#1a1a1a', border: '1px solid #c0c0c0', padding: '15px 25px', borderRadius: '8px', marginBottom: '20px', textAlign: 'center', boxShadow: '0 10px 20px rgba(0,0,0,0.5)' }}>
               <h3 style={{ margin: 0, color: '#fff', fontSize: '1.5rem', letterSpacing: '1px' }}>{players[1]?.nickname || 'TBA'}</h3>
               <span style={{ color: '#c0c0c0', fontWeight: 'bold' }}>{players[1]?.currentScore === 'E' ? 'E' : (players[1]?.currentScore > 0 ? `+${players[1]?.currentScore}` : players[1]?.currentScore)}</span>
             </div>
             <div style={{ width: '200px', height: '280px', background: 'linear-gradient(180deg, #e6e6e6 0%, #a6a6a6 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRadius: '12px 12px 0 0', border: '2px solid #fff', borderBottom: 'none' }}>
               <h2 style={{ fontSize: '4rem', color: '#000', margin: 0, opacity: 0.6 }}>2</h2>
             </div>
           </div>

           {/* 🥇 1ST PLACE (GOLD) */}
           <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 2 }}>
             <div style={{ backgroundColor: '#1a1a1a', border: '2px solid #D4AF37', padding: '20px 40px', borderRadius: '8px', marginBottom: '20px', textAlign: 'center', boxShadow: '0 15px 30px rgba(212,175,55,0.2)' }}>
               <h3 style={{ margin: 0, color: '#fff', fontSize: '2rem', letterSpacing: '2px' }}>{players[0]?.nickname || 'TBA'}</h3>
               <span style={{ color: '#D4AF37', fontWeight: 'bold', fontSize: '1.5rem' }}>{players[0]?.currentScore === 'E' ? 'E' : (players[0]?.currentScore > 0 ? `+${players[0]?.currentScore}` : players[0]?.currentScore)}</span>
             </div>
             <div style={{ width: '250px', height: '380px', background: 'linear-gradient(180deg, #FFDF73 0%, #B8860B 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRadius: '12px 12px 0 0', border: '2px solid #fff', borderBottom: 'none', boxShadow: '0 0 80px rgba(212,175,55,0.4)' }}>
               <h2 style={{ fontSize: '6rem', color: '#000', margin: 0, opacity: 0.7, textShadow: '2px 2px 4px rgba(255,255,255,0.5)' }}>1</h2>
             </div>
           </div>

           {/* 🥉 3RD PLACE (BRONZE) */}
           <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 1 }}>
             <div style={{ backgroundColor: '#1a1a1a', border: '1px solid #cd7f32', padding: '15px 25px', borderRadius: '8px', marginBottom: '20px', textAlign: 'center', boxShadow: '0 10px 20px rgba(0,0,0,0.5)' }}>
               <h3 style={{ margin: 0, color: '#fff', fontSize: '1.5rem', letterSpacing: '1px' }}>{players[2]?.nickname || 'TBA'}</h3>
               <span style={{ color: '#cd7f32', fontWeight: 'bold' }}>{players[2]?.currentScore === 'E' ? 'E' : (players[2]?.currentScore > 0 ? `+${players[2]?.currentScore}` : players[2]?.currentScore)}</span>
             </div>
             <div style={{ width: '200px', height: '220px', background: 'linear-gradient(180deg, #ffb380 0%, #8c5322 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRadius: '12px 12px 0 0', border: '2px solid #fff', borderBottom: 'none' }}>
               <h2 style={{ fontSize: '4rem', color: '#000', margin: 0, opacity: 0.6 }}>3</h2>
             </div>
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