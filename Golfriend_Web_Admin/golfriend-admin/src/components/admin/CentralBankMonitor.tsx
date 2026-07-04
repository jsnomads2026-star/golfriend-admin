import { useState, useEffect, useMemo } from 'react';
import { db } from '../../firebaseConfig';
import ManualOverride from './ManualOverride'; // 🔥 Injecting the component
import { collection, query, orderBy, limit, onSnapshot, doc } from 'firebase/firestore';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface LedgerEntry {
  id: string;
  uid: string;
  type: string;
  amount?: number;
  status: string;
  product?: any;
  timestamp: any;
}

export default function CentralBankMonitor() {
  const [transactions, setTransactions] = useState<LedgerEntry[]>([]);
  const [isLive, setIsLive] = useState(true);
  const [hudStats, setHudStats] = useState({ fiatVolume: 0, escrowLocked: 0, chipVelocity: 0 });
  const [selectedUid, setSelectedUid] = useState(""); // 🔥 State to hold the clicked ID

  // 🧮 ECONOMIC HEALTH HUD MATH (Global Lifetime Treasury)
  useEffect(() => {
    // Listen directly to the master platform ledger, ignoring the 100-row limit of the UI feed
    const unsubscribe = onSnapshot(doc(db, 'platform', 'treasury'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setHudStats({
          fiatVolume: data.totalFiatVolumeUsd || 0,
          escrowLocked: data.totalEscrowLocked || 0,
          chipVelocity: data.netChipVelocity || 0
        });
      }
    }, (error) => console.error("Treasury Feed Error:", error));
    
    return () => unsubscribe();
  }, []);

  // 🔥 THE LIVE FEED: Wiretap the master transactions ledger
  useEffect(() => {
    if (!isLive) return;

    const q = query(
      collection(db, 'transactions'),
      orderBy('timestamp', 'desc'),
      limit(100)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const feed = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as LedgerEntry[];
      
      setTransactions(feed);
    }, (error) => {
      console.error("Central Bank Feed Disconnected:", error);
    });

    return () => unsubscribe();
  }, [isLive]);

  // 📈 CHART MATH: Calculate momentum over the last 100 transactions
  const chartData = useMemo(() => {
    // Reverse the feed so the oldest transaction is on the left, newest on the right
    const chron = [...transactions].reverse();
    let cumulative = 0;
    
    return chron.map(tx => {
      // Only chart actual chip movement
      if (tx.status === 'completed' && tx.amount) cumulative += tx.amount;
      
      const dateObj = tx.timestamp?.toDate ? tx.timestamp.toDate() : new Date();
      return {
        time: dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        velocity: cumulative,
        rawAmount: tx.amount
      };
    });
  }, [transactions]);

  const renderAmount = (tx: LedgerEntry) => {
    if (tx.type === 'PHYSICAL_GOODS_PURCHASE' && tx.product) {
      return <span style={{ color: '#4CAF50' }}>{tx.product.fiatPriceUsd} (FIAT)</span>;
    }
    if (tx.amount) {
      return <span style={{ color: tx.amount > 0 ? '#4CAF50' : '#ff4444' }}>{tx.amount > 0 ? '+' : ''}{tx.amount} 🪙</span>;
    }
    return <span style={{ color: '#888' }}>N/A</span>;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return '#4CAF50';
      case 'pending_fulfillment': return '#D4AF37';
      case 'escrow_locked': return '#1E88E5';
      case 'failed': return '#ff4444';
      default: return '#888';
    }
  };

  return (
    <div style={{ padding: '24px', backgroundColor: '#121212', color: '#fff', fontFamily: 'sans-serif' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #333', paddingBottom: '12px', marginBottom: '24px' }}>
        <h2 style={{ color: '#D4AF37', margin: 0 }}>🏦 CENTRAL BANK LIVE FEED</h2>
        <button 
          onClick={() => setIsLive(!isLive)} 
          style={{ padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px', backgroundColor: isLive ? '#1c3a21' : '#3a1c1c', color: isLive ? '#44ff66' : '#ff4444', border: `1px solid ${isLive ? '#4CAF50' : '#ff4444'}` }}
        >
          {isLive ? '🔴 LIVE FEED ACTIVE' : '⏸️ FEED PAUSED'}
        </button>
      </div>

      {/* 📊 MACRO-ECONOMIC HUD */}
      <div style={{ display: 'flex', gap: '15px', marginBottom: '25px' }}>
        <div style={{ flex: 1, padding: '20px', backgroundColor: '#111', border: '1px solid #333', borderRadius: '8px', textAlign: 'center' }}>
          <div style={{ fontSize: '12px', color: '#aaa', textTransform: 'uppercase', letterSpacing: '1px' }}>Fiat Volume (USD)</div>
          <div style={{ fontSize: '28px', fontWeight: '900', color: '#4CAF50', marginTop: '8px' }}>${hudStats.fiatVolume.toFixed(2)}</div>
        </div>
        <div style={{ flex: 1, padding: '20px', backgroundColor: '#111', border: '1px solid #333', borderRadius: '8px', textAlign: 'center' }}>
          <div style={{ fontSize: '12px', color: '#aaa', textTransform: 'uppercase', letterSpacing: '1px' }}>Active Escrow Locks</div>
          <div style={{ fontSize: '28px', fontWeight: '900', color: '#1E88E5', marginTop: '8px' }}>{hudStats.escrowLocked.toLocaleString()} 🪙</div>
        </div>
        <div style={{ flex: 1, padding: '20px', backgroundColor: '#1a1a00', border: '1px solid #D4AF37', borderRadius: '8px', textAlign: 'center' }}>
          <div style={{ fontSize: '12px', color: '#D4AF37', textTransform: 'uppercase', letterSpacing: '1px' }}>Net Chip Velocity</div>
          <div style={{ fontSize: '28px', fontWeight: '900', color: hudStats.chipVelocity >= 0 ? '#FFD700' : '#ff4444', marginTop: '8px' }}>
            {hudStats.chipVelocity > 0 ? '+' : ''}{hudStats.chipVelocity.toLocaleString()} 🪙
          </div>
        </div>
      </div>

      {/* ========================================== */}
      {/* 📈 TIME-SERIES VELOCITY CHART */}
      {/* ========================================== */}
      <div style={{ backgroundColor: '#1e1e1e', borderRadius: '8px', border: '1px solid #333', padding: '20px', marginBottom: '25px', height: '350px' }}>
        <h3 style={{ color: '#D4AF37', marginTop: 0, marginBottom: '20px', fontSize: '14px', letterSpacing: '1px' }}>
          CHIP VELOCITY MOMENTUM (LAST 100 TX)
        </h3>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="colorVelocity" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#D4AF37" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="#D4AF37" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
            <XAxis dataKey="time" stroke="#888" fontSize={12} tickMargin={10} minTickGap={30} />
            <YAxis stroke="#888" fontSize={12} tickFormatter={(val) => `${val > 0 ? '+' : ''}${val}`} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#111', borderColor: '#333', color: '#fff', borderRadius: '8px' }}
              itemStyle={{ color: '#D4AF37', fontWeight: 'bold' }}
              labelStyle={{ color: '#888', marginBottom: '5px' }}
            />
            <Area type="monotone" dataKey="velocity" stroke="#D4AF37" strokeWidth={3} fillOpacity={1} fill="url(#colorVelocity)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div style={{ backgroundColor: '#1e1e1e', borderRadius: '8px', border: '1px solid #333', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ backgroundColor: '#2a2a2a', borderBottom: '2px solid #444' }}>
              <th style={styles.th}>TIMESTAMP</th>
              <th style={styles.th}>TX ID</th>
              <th style={styles.th}>USER (UID)</th>
              <th style={styles.th}>OPERATION TYPE</th>
              <th style={styles.th}>AMOUNT / VALUE</th>
              <th style={styles.th}>STATUS</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {transactions.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '20px', textAlign: 'center', color: '#888' }}>No recent transactions detected.</td>
              </tr>
            ) : (
              transactions.map((tx) => (
                <tr key={tx.id} style={{ borderBottom: '1px solid #2a2a2a' }}>
                  <td style={styles.td}>
                    {tx.timestamp?.toDate ? tx.timestamp.toDate().toLocaleString() : 'Just now'}
                  </td>
                  <td style={{ ...styles.td, fontFamily: 'monospace', color: '#888', fontSize: '12px' }}>{tx.id}</td>
                  <td 
                    style={{ ...styles.td, fontFamily: 'monospace', color: '#4CAF50', cursor: 'pointer', textDecoration: 'underline' }}
                    title="Click to load into Manual Override"
                    onClick={() => setSelectedUid(tx.uid || '')}
                  >
                    {tx.uid ? tx.uid.substring(0, 8) + '...' : 'LEGACY_DOC'}
                  </td>
                  <td style={{ ...styles.td, fontWeight: 'bold' }}>{tx.type ? tx.type.replace(/_/g, ' ') : 'UNKNOWN'}</td>
                  <td style={styles.td}>{renderAmount(tx)}</td>
                  <td style={styles.td}>
                    <span style={{ padding: '4px 8px', borderRadius: '4px', backgroundColor: '#111', border: `1px solid ${getStatusColor(tx.status || 'unknown')}`, color: getStatusColor(tx.status || 'unknown'), fontSize: '12px', fontWeight: 'bold' }}>
                      {tx.status ? tx.status.toUpperCase() : 'UNKNOWN'}
                    </span>
                  </td>
                  <td style={{ ...styles.td, textAlign: 'right' }}>
                    <button
                      onClick={() => setSelectedUid(tx.uid || '')}
                      disabled={!tx.uid || tx.uid === 'LEGACY_DOC'}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: tx.uid && tx.uid !== 'LEGACY_DOC' ? 'rgba(212, 175, 55, 0.1)' : '#222',
                        color: tx.uid && tx.uid !== 'LEGACY_DOC' ? '#D4AF37' : '#555',
                        border: `1px solid ${tx.uid && tx.uid !== 'LEGACY_DOC' ? '#D4AF37' : '#333'}`,
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 'bold',
                        cursor: tx.uid && tx.uid !== 'LEGACY_DOC' ? 'pointer' : 'not-allowed',
                        letterSpacing: '0.5px',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      ⚡ OVERRIDE
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 🔥 CONDITIONAL POPUP OVERRIDE */}
      {selectedUid && (
        <ManualOverride 
          injectedUid={selectedUid} 
          onClose={() => setSelectedUid("")} 
        />
      )}

    </div>
  );
}

const styles = {
  th: { padding: '16px', color: '#888', fontSize: '12px', letterSpacing: '1px' },
  td: { padding: '16px', color: '#ccc', fontSize: '14px' }
};