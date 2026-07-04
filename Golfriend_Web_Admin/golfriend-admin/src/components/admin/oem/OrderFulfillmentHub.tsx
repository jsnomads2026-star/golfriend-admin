// ==========================================
// FILE: src/components/admin/oem/OrderFulfillmentHub.tsx
// ==========================================
import { useState, useEffect } from 'react';
import { db } from '../../../firebaseConfig';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, getDoc } from 'firebase/firestore';

interface FulfillmentOrder {
  id: string;
  productName: string;
  buyerUid: string;
  shippingAddress: string;
  vendorId: string; // Tells us who is fulfilling this
  fiatAmount: number;
  status: 'pending_dispatch' | 'awaiting_vendor' | 'shipped' | 'delivered';
  courier?: string;
  trackingNumber?: string;
  // 🔥 Added detailed product info expected from mobile checkout
  quantity?: number;
  variant?: string; // e.g., "Size: L, Color: Navy"
  buyerEmail?: string;
}

export default function OrderFulfillmentHub() {
  const [orders, setOrders] = useState<FulfillmentOrder[]>([]);
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  
  // Holds the input data for rows that are 'awaiting_vendor'
  const [trackingInputs, setTrackingInputs] = useState<Record<string, {courier: string, tracking: string}>>({});
  
  // 🔥 Modal State for Order Inspector
  const [selectedOrder, setSelectedOrder] = useState<FulfillmentOrder | null>(null);

  // 🔥 WIRE ROON: Listen for new purchases from the Mobile App
  useEffect(() => {
    // Note: In production, the mobile app will write to 'fulfillment_orders' upon Stripe success
    const q = query(collection(db, 'fulfillment_orders'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const orderList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as FulfillmentOrder[];
      setOrders(orderList);
    });
    return () => unsubscribe();
  }, []);

  const handleDispatch = async (orderId: string, vendorId: string) => {
    setIsProcessing(orderId);
    try {
      // 1. Check the Vendor CRM to see how they want to receive orders
      const vendorRef = doc(db, 'vendors', vendorId);
      const vendorSnap = await getDoc(vendorRef);
      
      let newStatus = 'shipped'; // Default if Golfriend is shipping it ourselves
      
      if (vendorSnap.exists()) {
        const protocol = vendorSnap.data().fulfillmentProtocol;
        
        if (protocol === 'email_manifest') {
          // Trigger a cloud function to email the vendor, then update status
          console.log(`Sending automated email manifest to vendor for order ${orderId}...`);
          newStatus = 'awaiting_vendor';
        } else if (protocol === 'daily_csv') {
          console.log(`Order ${orderId} queued for midnight CSV export...`);
          newStatus = 'awaiting_vendor';
        }
      }

      // 2. Update the ledger status
      await updateDoc(doc(db, 'fulfillment_orders', orderId), {
        status: newStatus
      });
      
    } catch (error: any) {
      alert(`Dispatch Error: ${error.message}`);
    } finally {
      setIsProcessing(null);
    }
  };

  const handleConfirmShipment = async (orderId: string) => {
    const data = trackingInputs[orderId];
    if (!data || !data.courier || !data.tracking) return alert("Please enter both Courier and Tracking Number.");

    setIsProcessing(orderId);
    try {
      await updateDoc(doc(db, 'fulfillment_orders', orderId), {
        status: 'shipped',
        courier: data.courier,
        trackingNumber: data.tracking
      });
      // Clear the local input state after success
      setTrackingInputs(prev => { const next = {...prev}; delete next[orderId]; return next; });
    } catch (error: any) {
      alert(`Shipment Error: ${error.message}`);
    } finally {
      setIsProcessing(null);
    }
  };

  return (
    <div style={{ padding: '24px', backgroundColor: '#121212', minHeight: '100vh', color: '#fff', fontFamily: 'sans-serif' }}>
      <h2 style={{ color: '#D4AF37', margin: '0 0 8px 0', borderBottom: '1px solid #333', paddingBottom: '12px' }}>
        🚚 ORDER FULFILLMENT HUB
      </h2>
      <p style={{ color: '#aaa', fontSize: '14px', marginBottom: '30px' }}>
        Air-traffic control for physical merchandise. Route orders to dropship partners or print local shipping labels.
      </p>

      <div style={{ backgroundColor: '#1e1e1e', borderRadius: '8px', border: '1px solid #333', padding: '24px' }}>
        <h3 style={{ color: '#fff', margin: '0 0 20px 0', fontSize: '16px' }}>Live Dispatch Queue</h3>
        
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ backgroundColor: '#2a2a2a', borderBottom: '2px solid #444' }}>
              <th style={styles.th}>ORDER ID / ITEM</th>
              <th style={styles.th}>DESTINATION (BUYER)</th>
              <th style={styles.th}>REVENUE</th>
              <th style={styles.th}>LOGISTICS ROUTE</th>
              <th style={styles.th}>ACTION</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Radar is clear. No active orders pending fulfillment.</td></tr>
            ) : (
              orders.map(order => (
                <tr key={order.id} style={{ borderBottom: '1px solid #2a2a2a' }}>
                  <td style={styles.td}>
                    <div style={{ fontSize: '10px', color: '#888', marginBottom: '4px' }}>{order.id}</div>
                    <strong style={{ color: '#fff' }}>{order.productName}</strong>
                  </td>
                  <td style={styles.td}>
                    <div style={{ fontSize: '12px', color: '#ccc' }}>UID: {order.buyerUid.substring(0, 8)}...</div>
                    <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>{order.shippingAddress}</div>
                  </td>
                  <td style={{...styles.td, color: '#4CAF50', fontWeight: 'bold'}}>{order.fiatAmount} THB</td>
                  <td style={styles.td}>
                    <span style={styles.badge(order.status)}>
                      {order.status.replace('_', ' ').toUpperCase()}
                    </span>
                  </td>
                  <td style={styles.td}>
                    {order.status === 'pending_dispatch' && (
                      <button 
                        onClick={() => handleDispatch(order.id, order.vendorId)}
                        disabled={isProcessing === order.id}
                        style={styles.actionBtn}
                      >
                        {isProcessing === order.id ? 'ROUTING...' : 'DISPATCH ORDER ➔'}
                      </button>
                    )}

                    {order.status === 'awaiting_vendor' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <input 
                          type="text" 
                          placeholder="Courier (e.g. Kerry)" 
                          value={trackingInputs[order.id]?.courier || ''}
                          onChange={(e) => setTrackingInputs(prev => ({...prev, [order.id]: {...(prev[order.id] || {tracking: ''}), courier: e.target.value}}))}
                          style={{ padding: '6px', fontSize: '11px', backgroundColor: '#111', color: '#fff', border: '1px solid #444', borderRadius: '4px' }}
                        />
                        <input 
                          type="text" 
                          placeholder="Tracking Number" 
                          value={trackingInputs[order.id]?.tracking || ''}
                          onChange={(e) => setTrackingInputs(prev => ({...prev, [order.id]: {...(prev[order.id] || {courier: ''}), tracking: e.target.value}}))}
                          style={{ padding: '6px', fontSize: '11px', backgroundColor: '#111', color: '#fff', border: '1px solid #444', borderRadius: '4px' }}
                        />
                        <button 
                          onClick={() => handleConfirmShipment(order.id)}
                          disabled={isProcessing === order.id}
                          style={{...styles.actionBtn, backgroundColor: '#4CAF50', color: '#fff'}}
                        >
                          {isProcessing === order.id ? 'SAVING...' : 'CONFIRM SHIPMENT ➔'}
                        </button>
                      </div>
                    )}

                    {order.status === 'shipped' && (
                      <div style={{ fontSize: '11px', color: '#888' }}>
                        <div><strong>Courier:</strong> <span style={{ color: '#ccc' }}>{order.courier}</span></div>
                        <div><strong>Tracking:</strong> <span style={{ color: '#D4AF37' }}>{order.trackingNumber}</span></div>
                      </div>
                    )}

                    {/* 🔥 VIEW DETAILS BUTTON */}
                    <button 
                      onClick={() => setSelectedOrder(order)}
                      style={{...styles.actionBtn, backgroundColor: 'transparent', border: '1px solid #555', color: '#aaa', marginTop: '10px', width: '100%'}}
                    >
                      🔍 VIEW DETAILS
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ========================================== */}
      {/* 🔥 THE ORDER INSPECTOR MODAL */}
      {/* ========================================== */}
      {selectedOrder && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}>
          <div style={{ backgroundColor: '#1e1e1e', padding: '30px', borderRadius: '12px', width: '500px', border: '1px solid #333', boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #333', paddingBottom: '15px', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, color: '#fff' }}>Order Inspector</h3>
              <button onClick={() => setSelectedOrder(null)} style={{ background: 'transparent', border: 'none', color: '#888', fontSize: '20px', cursor: 'pointer' }}>×</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', color: '#ccc', fontSize: '13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#888' }}>Order ID:</span> 
                <strong style={{ color: '#D4AF37' }}>{selectedOrder.id}</strong>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#888' }}>Item:</span> 
                <strong style={{ color: '#fff' }}>{selectedOrder.productName}</strong>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#888' }}>Variant / Qty:</span> 
                <span>{selectedOrder.variant || 'N/A'} (Qty: {selectedOrder.quantity || 1})</span>
              </div>
              
              <hr style={{ borderColor: '#333', width: '100%', margin: '10px 0' }} />
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <span style={{ color: '#888' }}>Buyer UID:</span> 
                <span style={{ fontSize: '11px', color: '#aaa' }}>{selectedOrder.buyerUid}</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <span style={{ color: '#888' }}>Shipping Destination:</span> 
                <span style={{ lineHeight: '1.4' }}>{selectedOrder.shippingAddress}</span>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px', fontSize: '16px' }}>
                <span style={{ color: '#888' }}>Fiat Revenue:</span> 
                <strong style={{ color: '#4CAF50' }}>{selectedOrder.fiatAmount} THB</strong>
              </div>
            </div>

            <div style={{ marginTop: '30px', display: 'flex', gap: '15px' }}>
              {/* 🖨️ NATIVE BROWSER PRINT TRICK */}
              <button onClick={() => window.print()} style={{ flex: 1, padding: '12px', backgroundColor: '#333', color: '#fff', border: '1px solid #555', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>
                🖨️ PRINT PACKING SLIP
              </button>
              <button onClick={() => setSelectedOrder(null)} style={{ flex: 1, padding: '12px', backgroundColor: '#D4AF37', color: '#000', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>
                CLOSE INSPECTOR
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* 🖨️ HIDDEN PRINT-ONLY TEMPLATE */}
      {/* ========================================== */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #print-packing-slip, #print-packing-slip * {
            visibility: visible;
          }
          #print-packing-slip {
            display: block !important;
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 20px;
            background-color: white;
            color: black;
          }
        }
      `}</style>

      {selectedOrder && (
        <div id="print-packing-slip" style={{ display: 'none', fontFamily: 'Arial, sans-serif' }}>
          <div style={{ borderBottom: '2px solid black', paddingBottom: '20px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '24px', letterSpacing: '2px' }}>GOLFRIEND</h1>
              <p style={{ margin: '5px 0 0 0', fontSize: '12px', color: '#555' }}>Official Merchandise Order</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <h2 style={{ margin: 0, fontSize: '18px' }}>PACKING SLIP</h2>
              <p style={{ margin: '5px 0 0 0', fontSize: '12px' }}><strong>Order ID:</strong> {selectedOrder.id}</p>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '40px' }}>
            <div style={{ width: '45%' }}>
              <h4 style={{ margin: '0 0 10px 0', borderBottom: '1px solid #ccc', paddingBottom: '5px' }}>SHIP TO:</h4>
              <p style={{ margin: '0 0 5px 0', fontWeight: 'bold' }}>Buyer UID: {selectedOrder.buyerUid}</p>
              <p style={{ margin: 0, lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>{selectedOrder.shippingAddress}</p>
            </div>
            <div style={{ width: '45%' }}>
              <h4 style={{ margin: '0 0 10px 0', borderBottom: '1px solid #ccc', paddingBottom: '5px' }}>ORDER DETAILS:</h4>
              <p style={{ margin: '0 0 5px 0' }}><strong>Status:</strong> {selectedOrder.status.replace('_', ' ').toUpperCase()}</p>
              <p style={{ margin: 0 }}><strong>Paid:</strong> {selectedOrder.fiatAmount} THB</p>
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '40px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f2f2f2', borderBottom: '2px solid black' }}>
                <th style={{ padding: '10px', textAlign: 'left' }}>QTY</th>
                <th style={{ padding: '10px', textAlign: 'left' }}>ITEM DESCRIPTION</th>
                <th style={{ padding: '10px', textAlign: 'left' }}>VARIANT</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid #ddd' }}>
                <td style={{ padding: '15px 10px' }}><strong>{selectedOrder.quantity || 1}</strong></td>
                <td style={{ padding: '15px 10px' }}>{selectedOrder.productName}</td>
                <td style={{ padding: '15px 10px' }}>{selectedOrder.variant || 'Standard'}</td>
              </tr>
            </tbody>
          </table>

          <div style={{ textAlign: 'center', marginTop: '60px', color: '#555', fontSize: '12px', borderTop: '1px solid #ccc', paddingTop: '20px' }}>
            Thank you for representing Golfriend on the course.<br />
            Support: admin@golfriend.com
          </div>
        </div>
      )}

    </div>
  );
}

const styles = {
  th: { padding: '16px', color: '#888', fontSize: '11px', letterSpacing: '1px', textTransform: 'uppercase' as const },
  td: { padding: '16px', color: '#ccc', fontSize: '13px', verticalAlign: 'top' as const },
  actionBtn: { padding: '8px 16px', backgroundColor: '#D4AF37', color: '#000', fontWeight: 'bold', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' },
  badge: (status: string) => ({
    padding: '4px 8px',
    backgroundColor: status === 'pending_dispatch' ? '#4a148c' : status === 'awaiting_vendor' ? '#e65100' : '#1b5e20',
    border: `1px solid ${status === 'pending_dispatch' ? '#7b1fa2' : status === 'awaiting_vendor' ? '#ef6c00' : '#2e7d32'}`,
    borderRadius: '4px',
    fontSize: '10px',
    fontWeight: 'bold' as const,
    color: '#fff'
  })
};