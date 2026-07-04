// ==========================================
// FILE: src/components/admin/oem/BuyerCustomerCRM.tsx
// ==========================================
import { useState } from 'react';
import { db } from '../../../firebaseConfig';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';

interface GolferProfile {
  uid: string;
  nickname: string;
  email?: string;
  reliability_score: number;
  chips: number;
  isVerified: boolean;
}

interface OrderHistory {
  id: string;
  productName: string;
  fiatAmount: number;
  status: string;
  createdAt: any;
}

export default function BuyerCustomerCRM() {
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<GolferProfile[]>([]);
  const [selectedGolfer, setSelectedGolfer] = useState<GolferProfile | null>(null);
  const [orderHistory, setOrderHistory] = useState<OrderHistory[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // 🔥 1. SEARCH DIRECTORY FOR GOLFERS
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;
    
    setIsSearching(true);
    setSearchResults([]);
    setSelectedGolfer(null);
    
    try {
      // Note: In a production NoSQL environment, exact string matching is used unless Algolia is connected.
      // We will search by exact Nickname or UID for the CRM lookup.
      const usersRef = collection(db, 'users');
      const qNick = query(usersRef, where('nickname', '==', searchTerm), limit(5));
      
      const snapshot = await getDocs(qNick);
      const results = snapshot.docs.map(doc => ({
        uid: doc.id,
        ...doc.data()
      })) as GolferProfile[];
      
      // Fallback: If no nickname match, try matching the exact UID
      if (results.length === 0) {
        const docSnap = await getDocs(query(usersRef, where('uid', '==', searchTerm)));
        if (!docSnap.empty) {
          results.push({ uid: docSnap.docs[0].id, ...docSnap.docs[0].data() } as GolferProfile);
        }
      }

      setSearchResults(results);
    } catch (error: any) {
      alert(`Search Error: ${error.message}`);
    } finally {
      setIsSearching(false);
    }
  };

  // 🔥 2. PULL LIFETIME ORDER HISTORY
  const loadGolferProfile = async (golfer: GolferProfile) => {
    setSelectedGolfer(golfer);
    setIsLoadingHistory(true);
    setOrderHistory([]);
    
    try {
      const qOrders = query(
        collection(db, 'fulfillment_orders'), 
        where('buyerUid', '==', golfer.uid),
        orderBy('createdAt', 'desc')
      );
      
      const snap = await getDocs(qOrders);
      const history = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as OrderHistory[];
      
      setOrderHistory(history);
    } catch (error: any) {
      console.error("History Error (May require a Firebase Index):", error);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  return (
    <div style={{ padding: '24px', backgroundColor: '#121212', minHeight: '100vh', color: '#fff', fontFamily: 'sans-serif' }}>
      <h2 style={{ color: '#D4AF37', margin: '0 0 8px 0', borderBottom: '1px solid #333', paddingBottom: '12px' }}>
        👥 BUYER CRM & CUSTOMER LEDGER
      </h2>
      <p style={{ color: '#aaa', fontSize: '14px', marginBottom: '30px' }}>
        Look up golfer profiles to view their lifetime value (LTV), shipping history, and OEM purchases.
      </p>

      <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
        
        {/* ========================================== */}
        {/* LEFT: SEARCH & DIRECTORY */}
        {/* ========================================== */}
        <div style={{ flex: 1, backgroundColor: '#1e1e1e', borderRadius: '8px', border: '1px solid #333', padding: '24px' }}>
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
            <input 
              type="text" 
              placeholder="Search by exact Nickname or UID..." 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)} 
              style={{ flex: 1, padding: '12px', borderRadius: '4px', border: '1px solid #444', backgroundColor: '#111', color: '#fff', fontSize: '13px' }}
            />
            <button type="submit" disabled={isSearching} style={{ padding: '0 20px', backgroundColor: '#D4AF37', color: '#000', fontWeight: 'bold', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
              {isSearching ? '...' : 'FIND'}
            </button>
          </form>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {searchResults.length === 0 && !isSearching && (
              <div style={{ color: '#666', fontSize: '12px', textAlign: 'center', padding: '20px 0' }}>Awaiting search query...</div>
            )}
            
            {searchResults.map(golfer => (
              <div 
                key={golfer.uid} 
                onClick={() => loadGolferProfile(golfer)}
                style={{ padding: '15px', backgroundColor: selectedGolfer?.uid === golfer.uid ? '#2a2a2a' : '#111', border: `1px solid ${selectedGolfer?.uid === golfer.uid ? '#D4AF37' : '#333'}`, borderRadius: '6px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div>
                  <strong style={{ color: '#fff', display: 'block', fontSize: '14px' }}>{golfer.nickname}</strong>
                  <span style={{ color: '#666', fontSize: '11px' }}>UID: {golfer.uid.substring(0,8)}...</span>
                </div>
                {golfer.isVerified && <span title="Verified" style={{ color: '#4CAF50' }}>✓</span>}
              </div>
            ))}
          </div>
        </div>

        {/* ========================================== */}
        {/* RIGHT: PROFILE & ORDER HISTORY */}
        {/* ========================================== */}
        <div style={{ flex: 2, backgroundColor: '#1e1e1e', borderRadius: '8px', border: '1px solid #333', padding: '24px', minHeight: '400px' }}>
          {!selectedGolfer ? (
            <div style={{ height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#555', fontSize: '14px' }}>
              Select a golfer from the directory to view their ledger.
            </div>
          ) : (
            <div>
              {/* Profile Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #333', paddingBottom: '20px', marginBottom: '20px' }}>
                <div>
                  <h2 style={{ color: '#fff', margin: '0 0 5px 0' }}>{selectedGolfer.nickname} {selectedGolfer.isVerified && '✅'}</h2>
                  <div style={{ color: '#888', fontSize: '12px', marginBottom: '10px' }}>{selectedGolfer.email || 'No email on file'} • UID: {selectedGolfer.uid}</div>
                  <div style={{ display: 'flex', gap: '15px' }}>
                    <span style={{ backgroundColor: '#111', border: '1px solid #444', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', color: '#D4AF37' }}>{selectedGolfer.chips} CHIPS</span>
                    <span style={{ backgroundColor: '#111', border: '1px solid #444', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', color: '#4CAF50' }}>RELIABILITY: {selectedGolfer.reliability_score}</span>
                  </div>
                </div>
              </div>

              {/* Order History Table */}
              <h4 style={{ color: '#aaa', margin: '0 0 15px 0', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '12px' }}>OEM Purchase Ledger</h4>
              
              {isLoadingHistory ? (
                <div style={{ color: '#D4AF37', fontSize: '12px' }}>Scanning logistics database...</div>
              ) : orderHistory.length === 0 ? (
                <div style={{ padding: '30px', backgroundColor: '#111', borderRadius: '6px', textAlign: 'center', color: '#666', fontSize: '13px', border: '1px dashed #333' }}>
                  This golfer has not purchased any OEM merchandise yet.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#2a2a2a', borderBottom: '2px solid #444' }}>
                      <th style={{ padding: '12px', color: '#888', fontSize: '10px', textTransform: 'uppercase' }}>Item</th>
                      <th style={{ padding: '12px', color: '#888', fontSize: '10px', textTransform: 'uppercase' }}>Revenue</th>
                      <th style={{ padding: '12px', color: '#888', fontSize: '10px', textTransform: 'uppercase' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderHistory.map(order => (
                      <tr key={order.id} style={{ borderBottom: '1px solid #2a2a2a' }}>
                        <td style={{ padding: '12px', color: '#ccc', fontSize: '12px' }}>
                          <strong style={{ color: '#fff', display: 'block' }}>{order.productName}</strong>
                          <span style={{ color: '#666', fontSize: '10px' }}>ID: {order.id}</span>
                        </td>
                        <td style={{ padding: '12px', color: '#4CAF50', fontSize: '12px', fontWeight: 'bold' }}>{order.fiatAmount} THB</td>
                        <td style={{ padding: '12px' }}>
                          <span style={{ padding: '4px 8px', backgroundColor: '#111', border: '1px solid #555', borderRadius: '4px', fontSize: '10px', color: '#aaa' }}>
                            {order.status.replace('_', ' ').toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}