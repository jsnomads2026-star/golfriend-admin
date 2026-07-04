// ==========================================
// FILE: src/pages/B2BPartners.tsx
// ==========================================
import React, { useState } from 'react';
import { collection, query, where, getDocs, doc, getDoc, writeBatch, serverTimestamp, increment, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebaseConfig';

export default function B2BPartners() {
  const [searchTerm, setSearchTerm] = useState('');
  const [targetUser, setTargetUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [partnerTx, setPartnerTx] = useState<any[]>([]);
  const [mintAmount, setMintAmount] = useState('10000');
  const [adjustmentAmount, setAdjustmentAmount] = useState('');
  const [adjustmentMemo, setAdjustmentMemo] = useState('');

  // 🔥 LEDGER WATCHTOWER: Live Firebase Listener for the specific partner
  React.useEffect(() => {
    if (!targetUser) {
      setPartnerTx([]);
      return;
    }
    const q = query(
      collection(db, 'transactions'),
      where('userId', '==', targetUser.id),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const txs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPartnerTx(txs);
    });
    return () => unsubscribe();
  }, [targetUser]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setTargetUser(null);

    try {
      // 1. First, try a direct ID lookup (Fastest and 100% reliable for UIDs)
      const docRef = doc(db, 'users', searchTerm.trim());
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        setTargetUser({ id: docSnap.id, ...docSnap.data() });
      } else {
        // 2. Fallback: Search by Email
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('email', '==', searchTerm.toLowerCase().trim()));
        const emailSnap = await getDocs(q);

        if (!emailSnap.empty) {
          setTargetUser({ id: emailSnap.docs[0].id, ...emailSnap.docs[0].data() });
        } else {
          setMessage('UID not found in database. The partner must log into the app once to generate their profile.');
        }
      }
    } catch (error) {
      setMessage('Search failed. Check console for details.');
      console.error(error);
    }
    setLoading(false);
  };

  const handleUpgradeTier = async () => {
    if (!targetUser) return;
    setLoading(true);
    try {
      const batch = writeBatch(db);
      const userRef = doc(db, 'users', targetUser.id);
      const txRef = doc(collection(db, 'transactions'));

      batch.update(userRef, { tier: 'commercial' });
      batch.set(txRef, {
        userId: targetUser.id,
        title: 'Account Tier Upgrade: COMMERCIAL',
        type: 'B2B_UPGRADE',
        status: 'completed',
        enforcedBy: 'ADMIN_WATCHTOWER',
        createdAt: serverTimestamp()
      });

      await batch.commit();
      setMessage(`Success! Account upgraded to Commercial.`);
      setTargetUser({ ...targetUser, tier: 'commercial' });
    } catch (error) {
      setMessage('Failed to upgrade account tier.');
      console.error(error);
    }
    setLoading(false);
  };

  const handleLedgerAdjustment = async () => {
    if (!targetUser) return;
    const amount = parseInt(adjustmentAmount);
    if (isNaN(amount) || amount === 0) return setMessage('Enter a non-zero adjustment amount.');
    if (!adjustmentMemo.trim()) return setMessage('A memo is required for CPA audit compliance.');
    setLoading(true);
    try {
      const batch = writeBatch(db);
      const userRef = doc(db, 'users', targetUser.id);
      const txRef = doc(collection(db, 'transactions'));

      batch.update(userRef, { chips: increment(amount) });
      batch.set(txRef, {
        userId: targetUser.id,
        title: `Admin Override: ${adjustmentMemo}`,
        amount: amount,
        type: amount > 0 ? 'ADMIN_REFUND' : 'ADMIN_DEDUCTION',
        status: 'completed',
        enforcedBy: 'ADMIN_WATCHTOWER',
        createdAt: serverTimestamp()
      });

      await batch.commit();
      setMessage(`Ledger adjusted by ${amount} chips.`);
      setTargetUser({ ...targetUser, chips: (targetUser.chips || 0) + amount });
      setAdjustmentAmount('');
      setAdjustmentMemo('');
    } catch (error) {
      setMessage('Failed to adjust ledger.');
      console.error(error);
    }
    setLoading(false);
  };

  const handleMintChips = async () => {
    if (!targetUser) return;
    const amount = parseInt(mintAmount);
    if (isNaN(amount) || amount <= 0) return setMessage('Enter a valid chip amount.');
    setLoading(true);
    try {
      const batch = writeBatch(db);
      const userRef = doc(db, 'users', targetUser.id);
      const txRef = doc(collection(db, 'transactions'));

      batch.update(userRef, { chips: increment(amount) });
      batch.set(txRef, {
        userId: targetUser.id,
        title: `Admin Mint: +${amount} Chips`,
        amount: amount,
        type: 'ADMIN_MINT',
        status: 'completed',
        enforcedBy: 'ADMIN_WATCHTOWER',
        createdAt: serverTimestamp()
      });

      await batch.commit();
      setMessage(`Successfully minted ${amount} chips.`);
      setTargetUser({ ...targetUser, chips: (targetUser.chips || 0) + amount });
    } catch (error) {
      setMessage('Failed to mint chips.');
      console.error(error);
    }
    setLoading(false);
  };

  return (
    <div className="p-8 text-white w-full">
      <h1 className="text-2xl font-bold text-[#D4AF37] mb-2 uppercase tracking-widest">B2B Partner Command Center</h1>
      <p className="text-gray-400 mb-8">Manually upgrade local venues, mint B2B chips, and audit commercial ledgers.</p>

      {/* Search Console */}
      <div className="bg-[#111] border border-gray-800 p-6 rounded-lg mb-8 max-w-2xl">
        <h2 className="text-lg font-bold text-gray-200 mb-4">Locate Business Account</h2>
        <form onSubmit={handleSearch} className="flex gap-4">
          <input 
            type="text" 
            placeholder="Enter Email or exact UID..." 
            className="flex-1 bg-black border border-gray-700 rounded px-4 py-2 text-white focus:outline-none focus:border-[#D4AF37]"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <button 
            type="submit" 
            disabled={loading || !searchTerm}
            className="bg-gray-800 hover:bg-gray-700 text-white font-bold px-6 py-2 rounded transition-colors"
          >
            {loading ? 'SCANNING...' : 'LOCATE'}
          </button>
        </form>
        {message && <p className="mt-4 text-sm text-[#D4AF37]">{message}</p>}
      </div>

      {/* Target User Dashboard */}
      {targetUser && (
        <div className="bg-[#111] border border-[#D4AF37] p-6 rounded-lg max-w-2xl">
          <div className="flex justify-between items-center mb-6 border-b border-gray-800 pb-4">
            <div>
              <h3 className="text-xl font-bold text-white">{targetUser.nickname || 'Unknown Account'}</h3>
              <p className="text-sm text-gray-500">{targetUser.email}</p>
              <p className="text-xs text-gray-600 mt-1">UID: {targetUser.id}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-400">Current Tier</p>
              <p className={`text-lg font-bold uppercase ${targetUser.tier === 'commercial' ? 'text-[#D4AF37]' : 'text-gray-300'}`}>
                {targetUser.tier || 'Standard'}
              </p>
            </div>
          </div>

          <div className="flex justify-between items-center mb-6">
            <div>
              <p className="text-sm text-gray-400">Vault Balance</p>
              <p className="text-2xl font-bold text-white">{targetUser.chips || 0} 🪙</p>
            </div>
          </div>

          <div className="flex gap-4 mb-8">
            {targetUser.tier !== 'commercial' ? (
              <button onClick={handleUpgradeTier} disabled={loading} className="flex-1 bg-transparent border-2 border-[#D4AF37] hover:bg-[#D4AF37] hover:text-black text-[#D4AF37] font-black tracking-widest py-3 rounded-lg transition-colors">
                1. UPGRADE TIER TO COMMERCIAL
              </button>
            ) : (
              <div className="flex-1 bg-green-900/20 border border-green-800 text-green-400 font-bold flex items-center justify-center rounded-lg tracking-wider">
                ✓ VIP PARTNER ACTIVE
              </div>
            )}
            
            <div className="flex-1 flex gap-2">
              <input 
                type="number" 
                value={mintAmount} 
                onChange={(e) => setMintAmount(e.target.value)} 
                className="w-1/3 bg-black border border-gray-700 text-white px-4 py-2 rounded-lg text-center font-bold"
              />
              <button onClick={handleMintChips} disabled={loading} className="w-2/3 bg-[#D4AF37] hover:bg-yellow-500 text-black font-black tracking-widest py-3 rounded-lg transition-colors">
                2. MINT CHIPS
              </button>
            </div>
          </div>

          {/* B2B Commercial Ledger */}
          <div className="mt-8 border-t border-gray-800 pt-6">
            <h4 className="text-lg font-bold text-[#D4AF37] mb-4 uppercase tracking-widest">Ledger Watchtower</h4>
            <div className="bg-black border border-gray-800 rounded-lg overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-900 border-b border-gray-800">
                    <th className="p-3 text-xs text-gray-400">DATE</th>
                    <th className="p-3 text-xs text-gray-400">MEMO</th>
                    <th className="p-3 text-xs text-gray-400">TYPE</th>
                    <th className="p-3 text-xs text-gray-400 text-right">AMOUNT</th>
                  </tr>
                </thead>
                <tbody>
                  {partnerTx.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-gray-500 text-sm">No transactions found for this partner on the ledger.</td>
                    </tr>
                  ) : (
                    partnerTx.map(tx => (
                      <tr key={tx.id} className="border-b border-gray-900">
                        <td className="p-3 text-xs text-gray-500">{tx.createdAt?.toDate ? tx.createdAt.toDate().toLocaleString() : 'Processing...'}</td>
                        <td className="p-3 text-sm text-gray-200">{tx.title}</td>
                        <td className="p-3 text-xs text-gray-500">{tx.type}</td>
                        <td className={`p-3 text-sm font-bold text-right ${tx.amount > 0 ? 'text-[#D4AF37]' : 'text-gray-300'}`}>
                          {tx.amount > 0 ? '+' : ''}{tx.amount || 0}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* ⚖️ DISPUTE RESOLUTION: Ledger Correction Block */}
            <div className="mt-6 bg-[#1a1a00] border border-[#D4AF37] p-4 rounded-lg">
              <h5 className="text-sm font-bold text-[#D4AF37] mb-3 uppercase">Ledger Correction & Refund Protocol</h5>
              <div className="flex gap-2">
                <input 
                  type="number" 
                  placeholder="Amount (e.g. 500 or -500)"
                  value={adjustmentAmount} 
                  onChange={(e) => setAdjustmentAmount(e.target.value)} 
                  className="w-1/4 bg-black border border-gray-700 text-white px-3 py-2 rounded text-sm"
                />
                <input 
                  type="text" 
                  placeholder="Mandatory CPA Audit Memo..."
                  value={adjustmentMemo} 
                  onChange={(e) => setAdjustmentMemo(e.target.value)} 
                  className="w-2/4 bg-black border border-gray-700 text-white px-3 py-2 rounded text-sm"
                />
                <button onClick={handleLedgerAdjustment} disabled={loading} className="w-1/4 bg-[#D4AF37] hover:bg-yellow-500 text-black font-bold py-2 rounded text-sm transition-colors">
                  EXECUTE OVERRIDE
                </button>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}