import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, writeBatch, increment, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebaseConfig'; // Adjust to your web project path

interface EscrowGame {
  id: string; // The gameId
  hostUid: string;
  courseName: string;
  baseStakes: number;
  escrow_pool: number;
  status: 'open' | 'active' | 'completed' | 'cancelled';
  participantIds: string[];
}

export default function LedgerWatchtower() {
  const [activeGames, setActiveGames] = useState<EscrowGame[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    fetchActiveEscrows();
  }, []);

  const fetchActiveEscrows = async () => {
    try {
      // Query the 'games' collection for matches that still hold locked chips
      const q = query(
        collection(db, 'games'), 
        where('status', 'in', ['open', 'active'])
      );
      const snap = await getDocs(q);
      
      const games = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as EscrowGame[];
      
      setActiveGames(games);
    } catch (error) {
      console.error("Failed to fetch escrow data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleForceRefund = async (game: EscrowGame) => {
    const confirmRefund = window.confirm(
      `WARNING: This will forcefully cancel the match at ${game.courseName} and refund ${game.baseStakes} chips to all participants. Proceed?`
    );
    if (!confirmRefund) return;

    setProcessingId(game.id);

    try {
      const batch = writeBatch(db);

      // 1. Cancel the Game Document
      const gameRef = doc(db, 'games', game.id);
      batch.update(gameRef, { 
        status: 'cancelled',
        escrow_pool: 0, // Drain the pool
        settledAt: serverTimestamp(),
        settledBy: 'ADMIN_OVERRIDE'
      });

      // 2. Loop through all participants to refund their chips
      game.participantIds.forEach(uid => {
        // A. Give the chips back to their master wallet
        const userRef = doc(db, 'users', uid);
        batch.update(userRef, { chips: increment(game.baseStakes) }); // 🔥 FIXED: Reverted to true master schema

        // B. Write a mandatory receipt to the immutable ledger
        const newTransactionRef = doc(collection(db, 'users', uid, 'transactions'));
        batch.set(newTransactionRef, {
          title: `Admin Escrow Refund: ${game.courseName}`,
          amount: game.baseStakes,
          type: 'ESCROW_REFUND',
          enforcedBy: 'DIRECTOR_CONSOLE',
          reference_id: game.id,
          timestamp: serverTimestamp()
        });
      });

      // 3. Execute the Atomic Refund
      await batch.commit();

      // Remove from UI
      setActiveGames(prev => prev.filter(g => g.id !== game.id));
      alert(`Escrow drained. Match cancelled and chips refunded to ${game.participantIds.length} players.`);

    } catch (error) {
      console.error("Atomic refund failed:", error);
      alert("CRITICAL ERROR: Could not process refund. The ledger remains untouched.");
    } finally {
      setProcessingId(null);
    }
  };

  if (isLoading) return <div style={{ color: 'white', padding: 20 }}>Loading Escrow Ledgers...</div>;

  return (
    <div style={styles.container}>
      <h2 style={styles.header}>ESCROW WATCHTOWER (ACTIVE LOCKS: {activeGames.length})</h2>
      
      {activeGames.length === 0 ? (
        <p style={{ color: '#aaa' }}>No chips currently locked in escrow.</p>
      ) : (
        <div style={styles.list}>
          {activeGames.map(game => (
            <div key={game.id} style={styles.row}>
              <div style={styles.infoCol}>
                <h3 style={styles.courseTitle}>{game.courseName}</h3>
                <p style={styles.detailText}>
                  Status: <span style={{color: '#d4af37'}}>{game.status.toUpperCase()}</span> | 
                  Players: {game.participantIds.length}
                </p>
                <p style={styles.detailText}>Host UID: {game.hostUid}</p>
              </div>

              <div style={styles.financeCol}>
                <p style={styles.poolText}>LOCKED POOL: {game.escrow_pool} CHIPS</p>
                <p style={styles.detailText}>({game.baseStakes} / player)</p>
              </div>

              <div style={styles.actionCol}>
                <button 
                  style={{...styles.btn, ...styles.btnRefund}}
                  onClick={() => handleForceRefund(game)}
                  disabled={processingId === game.id}
                >
                  {processingId === game.id ? 'PROCESSING...' : 'FORCE REFUND & CANCEL'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Basic inline styles for the web dashboard
const styles = {
  container: { padding: '24px', backgroundColor: '#121212', minHeight: '100vh', fontFamily: 'sans-serif' },
  header: { color: '#d4af37', borderBottom: '1px solid #333', paddingBottom: '12px', marginBottom: '24px' },
  list: { display: 'flex', flexDirection: 'column' as const, gap: '16px' },
  row: { 
    display: 'flex', alignItems: 'center', backgroundColor: '#1e1e1e', 
    padding: '20px', borderRadius: '8px', border: '1px solid #333' 
  },
  infoCol: { flex: 2 },
  financeCol: { flex: 1, textAlign: 'right' as const, paddingRight: '24px' },
  actionCol: { flex: 1, display: 'flex', justifyContent: 'flex-end' },
  courseTitle: { margin: '0 0 8px 0', color: '#fff', fontSize: '18px' },
  detailText: { margin: '0 0 4px 0', color: '#888', fontSize: '13px' },
  poolText: { margin: '0 0 4px 0', color: '#ff4444', fontSize: '16px', fontWeight: 'bold' as const },
  btn: { padding: '12px 24px', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' as const },
  btnRefund: { backgroundColor: '#3a1c1c', color: '#ff4444', border: '1px solid #ff4444' }
};