import { useState, useEffect, useMemo } from 'react';
import { db } from '../../firebaseConfig';
import { collection, query, where, orderBy, limit, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';

interface FiatTransaction {
  id: string;
  uid: string;
  type: string;
  status: string;
  paymentProvider?: 'APPLE_PAY' | 'GOOGLE_PAY' | 'STRIPE' | 'OEM_DIRECT' | 'MANUAL_OUTFLOW' | 'UNKNOWN';
  fiatAmountUsd: number;
  productName?: string;
  timestamp: any;
}

export default function FiatLedger() {
  const [fiatTx, setFiatTx] = useState<FiatTransaction[]>([]);
  const [activeTab, setActiveTab] = useState<'INCOME' | 'EXPENSE'>('INCOME');
  
  // Custom Notification State
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null);

  // Expense Logger Modal State
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseVendor, setExpenseVendor] = useState("");
  const [customVendor, setCustomVendor] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const showNotification = (message: string, type: 'success' | 'error') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  useEffect(() => {
    const q = query(
      collection(db, 'transactions'),
      where('type', 'in', ['CHIP_BUNDLE_PURCHASE', 'PHYSICAL_GOODS_PURCHASE', 'OEM_SPONSORSHIP', 'TOURNAMENT_FEE', 'PLATFORM_EXPENSE']),
      orderBy('timestamp', 'desc'),
      limit(200)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => {
        const raw = doc.data();
        return {
          id: doc.id,
          uid: raw.uid || 'SYSTEM',
          type: raw.type,
          status: raw.status || 'unknown',
          paymentProvider: raw.paymentProvider || raw.provider || 'UNKNOWN',
          fiatAmountUsd: raw.product?.fiatPriceUsd || raw.fiatAmountUsd || 0,
          productName: raw.product?.name || raw.bundleName || raw.title || raw.productName || 'Unknown',
          timestamp: raw.timestamp
        };
      });
      setFiatTx(data.filter(tx => tx.fiatAmountUsd > 0));
    });

    return () => unsubscribe();
  }, []);

  // 🧮 P&L AGGREGATE MATH
  const { incomeTx, expenseTx, grossRevenue, totalExpenses, netProfit } = useMemo(() => {
    const income: FiatTransaction[] = [];
    const expenses: FiatTransaction[] = [];
    let gross = 0;
    let expenseTotal = 0;

    fiatTx.forEach(tx => {
      if (tx.status !== 'completed') return;
      if (tx.type === 'PLATFORM_EXPENSE') {
        expenses.push(tx);
        expenseTotal += tx.fiatAmountUsd;
      } else {
        income.push(tx);
        gross += tx.fiatAmountUsd;
      }
    });

    return { incomeTx: income, expenseTx: expenses, grossRevenue: gross, totalExpenses: expenseTotal, netProfit: gross - expenseTotal };
  }, [fiatTx]);

  const activeData = activeTab === 'INCOME' ? incomeTx : expenseTx;

  const handleLogExpense = async () => {
    const finalVendor = expenseVendor === 'Custom...' ? customVendor : expenseVendor;
    if (!expenseAmount || !finalVendor.trim()) {
      return showNotification("Amount and Vendor are required.", "error");
    }

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'transactions'), {
        uid: 'PLATFORM_TREASURY',
        type: 'PLATFORM_EXPENSE',
        status: 'completed',
        paymentProvider: 'MANUAL_OUTFLOW',
        fiatAmountUsd: parseFloat(expenseAmount),
        productName: `OPEX: ${finalVendor.trim()}`,
        timestamp: serverTimestamp()
      });
      showNotification("Business expense successfully logged.", "success");
      setShowExpenseModal(false);
      setExpenseAmount("");
      setExpenseVendor("");
      setCustomVendor("");
      setActiveTab('EXPENSE');
    } catch (error) {
      showNotification("Failed to log expense to master ledger.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="printable-ledger" style={{ padding: '24px', backgroundColor: '#121212', minHeight: '100vh', color: '#fff', fontFamily: 'sans-serif', position: 'relative' }}>
      <style>
        {`
          @media print {
            /* 1. Hide absolutely everything on the screen */
            body * {
              visibility: hidden;
            }
            /* 2. Force ONLY the ledger and its children to be visible */
            .printable-ledger, .printable-ledger * {
              visibility: visible;
            }
            /* 3. Break the ledger out of the layout grid and stretch it full-width */
            .printable-ledger {
              position: absolute;
              left: 0;
              top: 0;
              width: 100%;
              background-color: white !important; 
              padding: 0 !important; 
              color: black !important; 
            }
            .no-print, .no-print * { 
              display: none !important; 
              visibility: hidden !important;
            }
            .print-card { border: 1px solid #ccc !important; background-color: white !important; color: black !important; break-inside: avoid; }
            .print-text { color: black !important; }
            table { border-collapse: collapse; width: 100%; }
            th, td { border: 1px solid #ddd !important; color: black !important; padding: 8px !important; }
          }
        `}
      </style>
      
      {notification && (
        <div style={{ position: 'absolute', top: '20px', right: '20px', padding: '16px 24px', zIndex: 1000, backgroundColor: notification.type === 'error' ? '#ff4444' : '#4CAF50', color: '#fff', borderRadius: '8px', fontWeight: 'bold', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
          {notification.message}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 className="print-text" style={{ color: '#D4AF37', margin: 0 }}>📊 CPA FINANCIAL COMMAND (P&L)</h2>
        <div className="no-print" style={{ display: 'flex', gap: '10px' }}>
          <button onClick={handlePrint} style={{ padding: '10px 20px', backgroundColor: '#1E88E5', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>
            🖨️ PRINT CPA REPORT
          </button>
          <button onClick={() => setShowExpenseModal(true)} style={{ padding: '10px 20px', backgroundColor: '#333', color: '#fff', border: '1px solid #555', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>
            + LOG BUSINESS EXPENSE
          </button>
        </div>
      </div>
      
      {/* 📈 THE MATH HUD */}
      <div style={{ display: 'flex', gap: '15px', marginBottom: '25px' }}>
        <div className="print-card" style={{ flex: 1, padding: '20px', backgroundColor: '#111', border: '1px solid #333', borderRadius: '8px' }}>
          <div className="print-text" style={{ fontSize: '12px', color: '#aaa', fontWeight: 'bold', letterSpacing: '1px' }}>GROSS REVENUE (IN)</div>
          <div className="print-text" style={{ fontSize: '28px', fontWeight: '900', color: '#4CAF50', marginTop: '8px' }}>${grossRevenue.toFixed(2)}</div>
        </div>
        <div className="print-card" style={{ flex: 1, padding: '20px', backgroundColor: '#111', border: '1px solid #333', borderRadius: '8px' }}>
          <div className="print-text" style={{ fontSize: '12px', color: '#aaa', fontWeight: 'bold', letterSpacing: '1px' }}>TOTAL EXPENSES (OUT)</div>
          <div className="print-text" style={{ fontSize: '28px', fontWeight: '900', color: '#ff4444', marginTop: '8px' }}>${totalExpenses.toFixed(2)}</div>
        </div>
        <div className="print-card" style={{ flex: 1, padding: '20px', backgroundColor: '#1a1a00', border: '1px solid #D4AF37', borderRadius: '8px' }}>
          <div className="print-text" style={{ fontSize: '12px', color: '#D4AF37', fontWeight: 'bold', letterSpacing: '1px' }}>NET PROFIT</div>
          <div className="print-text" style={{ fontSize: '28px', fontWeight: '900', color: netProfit >= 0 ? '#D4AF37' : '#ff4444', marginTop: '8px' }}>
            ${netProfit.toFixed(2)}
          </div>
        </div>
      </div>

      {/* 🗂️ TAB NAVIGATION (HIDDEN ON PRINT) */}
      <div className="no-print" style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <button onClick={() => setActiveTab('INCOME')} style={{ flex: 1, padding: '12px', backgroundColor: activeTab === 'INCOME' ? 'rgba(76, 175, 80, 0.1)' : '#111', color: activeTab === 'INCOME' ? '#4CAF50' : '#888', border: `1px solid ${activeTab === 'INCOME' ? '#4CAF50' : '#333'}`, borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>
          💰 INCOMING REVENUE LEDGER
        </button>
        <button onClick={() => setActiveTab('EXPENSE')} style={{ flex: 1, padding: '12px', backgroundColor: activeTab === 'EXPENSE' ? 'rgba(255, 68, 68, 0.1)' : '#111', color: activeTab === 'EXPENSE' ? '#ff4444' : '#888', border: `1px solid ${activeTab === 'EXPENSE' ? '#ff4444' : '#333'}`, borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>
          📉 OUTGOING EXPENSE LEDGER
        </button>
      </div>

      {/* 🧾 DATA TABLE */}
      <div style={{ backgroundColor: '#1e1e1e', borderRadius: '8px', border: '1px solid #333', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ backgroundColor: '#222', borderBottom: '2px solid #333' }}>
              <th style={{ padding: '16px', color: '#888', fontSize: '12px' }}>TIMESTAMP</th>
              <th style={{ padding: '16px', color: '#888', fontSize: '12px' }}>{activeTab === 'INCOME' ? 'USER / SOURCE' : 'ENTITY'}</th>
              <th style={{ padding: '16px', color: '#888', fontSize: '12px' }}>{activeTab === 'INCOME' ? 'PRODUCT' : 'VENDOR / MEMO'}</th>
              <th style={{ padding: '16px', color: '#888', fontSize: '12px' }}>AMOUNT (USD)</th>
              <th style={{ padding: '16px', color: '#888', fontSize: '12px' }}>GATEWAY</th>
            </tr>
          </thead>
          <tbody>
            {activeData.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: '20px', textAlign: 'center', color: '#555' }}>No {activeTab.toLowerCase()} records found on this ledger.</td></tr>
            ) : (
              activeData.map(tx => (
                <tr key={tx.id} style={{ borderBottom: '1px solid #2a2a2a' }}>
                  <td style={{ padding: '16px', color: '#aaa', fontSize: '13px' }}>{tx.timestamp?.toDate ? tx.timestamp.toDate().toLocaleString() : 'Processing...'}</td>
                  <td style={{ padding: '16px', fontFamily: 'monospace', color: '#1E88E5', fontSize: '13px' }}>{tx.uid}</td>
                  <td style={{ padding: '16px', color: '#ddd', fontWeight: 'bold', fontSize: '13px' }}>{tx.productName}</td>
                  <td style={{ padding: '16px', fontWeight: '900', color: activeTab === 'INCOME' ? '#4CAF50' : '#ff4444' }}>
                    {activeTab === 'INCOME' ? '+' : '-'}${tx.fiatAmountUsd.toFixed(2)}
                  </td>
                  <td style={{ padding: '16px', color: '#888', fontSize: '12px', fontWeight: 'bold' }}>{tx.paymentProvider?.replace('_', ' ')}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 📝 EXPENSE LOGGER MODAL */}
      {showExpenseModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ backgroundColor: '#121212', borderRadius: '12px', border: '1px solid #333', padding: '30px', width: '100%', maxWidth: '500px', position: 'relative' }}>
            <button onClick={() => setShowExpenseModal(false)} style={{ position: 'absolute', top: '20px', right: '20px', background: 'none', border: 'none', color: '#888', fontSize: '24px', cursor: 'pointer' }}>&times;</button>
            <h2 style={{ color: '#ff4444', marginTop: 0, borderBottom: '1px solid #222', paddingBottom: '15px' }}>📉 LOG BUSINESS EXPENSE</h2>
            
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', color: '#888', fontSize: '12px', marginBottom: '5px' }}>EXPENSE AMOUNT (USD)</label>
              <input type="number" value={expenseAmount} onChange={(e) => setExpenseAmount(e.target.value)} placeholder="0.00" style={{ width: '100%', padding: '12px', backgroundColor: '#0a0a0a', border: '1px solid #333', borderRadius: '6px', color: '#ff4444', fontWeight: 'bold', fontSize: '18px' }} />
            </div>

            <div style={{ marginBottom: '25px' }}>
              <label style={{ display: 'block', color: '#888', fontSize: '12px', marginBottom: '5px' }}>VENDOR / CATEGORY</label>
              <select value={expenseVendor} onChange={(e) => setExpenseVendor(e.target.value)} style={{ width: '100%', padding: '12px', backgroundColor: '#0a0a0a', border: '1px solid #333', borderRadius: '6px', color: '#fff', marginBottom: '10px' }}>
                <option value="" disabled>Select Vendor...</option>
                <option value="Firebase Blaze Plan (Hosting)">Firebase Blaze Plan (Hosting)</option>
                <option value="FlutterFlow Subscription">FlutterFlow Subscription</option>
                <option value="Porkbun (Domain Registration)">Porkbun (Domain Registration)</option>
                <option value="Expo / Apple Developer Program">Expo / Apple Developer Program</option>
                <option value="Midjourney / AI Services">Midjourney / AI Services</option>
                <option value="Custom...">Custom Vendor...</option>
                <option value="" disabled>Select Expense Category...</option>
                <option value="Transportation & Fuel">Transportation & Fuel</option>
                <option value="Office & Venue Rental">Office & Venue Rental</option>
                <option value="Marketing & Advertisement">Marketing & Advertisement</option>
                <option value="Client Entertainment & Meals">Client Entertainment & Meals</option>
                <option value="Event Supplies & Logistics">Event Supplies & Logistics</option>
                <option value="Custom...">Custom Expense...</option>
              </select>
              {expenseVendor === 'Custom...' && (
                <input type="text" value={customVendor} onChange={(e) => setCustomVendor(e.target.value)} placeholder="Enter custom vendor name..." style={{ width: '100%', padding: '12px', backgroundColor: '#111', border: '1px solid #ff4444', borderRadius: '6px', color: '#fff' }} />
              )}
            </div>

            <button onClick={handleLogExpense} disabled={isSubmitting} style={{ width: '100%', padding: '14px', backgroundColor: '#ff4444', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>
              {isSubmitting ? 'LOGGING...' : 'COMMIT TO LEDGER'}
            </button>
          </div>
        </div>
      )}

    </div>
  );
}