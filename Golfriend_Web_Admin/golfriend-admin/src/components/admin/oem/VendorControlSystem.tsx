// ==========================================
// FILE: src/components/admin/oem/VendorControlSystem.tsx
// ==========================================
import { useState, useEffect } from 'react';
import { db } from '../../../firebaseConfig';
import { collection, addDoc, serverTimestamp, onSnapshot, query, orderBy } from 'firebase/firestore';

interface Vendor {
  id: string;
  companyName: string;
  contactEmail: string;
  fulfillmentProtocol: string;
  status: string;
}

export default function VendorControlSystem() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [formData, setFormData] = useState({
    companyName: '',
    contactEmail: '',
    fulfillmentProtocol: 'email_manifest', // Default to sending them an email
    originAddress: ''
  });

  // 🔥 LIVE FEED: Wiretap the Vendor CRM Database
  useEffect(() => {
    const q = query(collection(db, 'vendors'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const vendorList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Vendor[];
      setVendors(vendorList);
    });
    return () => unsubscribe();
  }, []);

  const handleOnboardVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.companyName || !formData.contactEmail) return alert("Company Name and Email are required.");
    
    setIsProcessing(true);
    try {
      await addDoc(collection(db, 'vendors'), {
        companyName: formData.companyName,
        contactEmail: formData.contactEmail,
        fulfillmentProtocol: formData.fulfillmentProtocol,
        originAddress: formData.originAddress,
        status: 'active',
        createdAt: serverTimestamp()
      });
      
      setFormData({ companyName: '', contactEmail: '', fulfillmentProtocol: 'email_manifest', originAddress: '' });
    } catch (error: any) {
      alert(`Vendor Onboarding Error: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div style={{ padding: '24px', backgroundColor: '#121212', minHeight: '100vh', color: '#fff', fontFamily: 'sans-serif' }}>
      <h2 style={{ color: '#D4AF37', margin: '0 0 8px 0', borderBottom: '1px solid #333', paddingBottom: '12px' }}>
        🏭 VENDOR CONTROL SYSTEM (CRM)
      </h2>
      <p style={{ color: '#aaa', fontSize: '14px', marginBottom: '30px' }}>
        Manage dropship partners, manufacturing contacts, and automated fulfillment routing.
      </p>

      <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
        
        {/* ========================================== */}
        {/* LEFT COLUMN: VENDOR INTAKE FORM */}
        {/* ========================================== */}
        <div style={{ flex: 1, backgroundColor: '#1e1e1e', borderRadius: '8px', border: '1px solid #333', padding: '24px' }}>
          <h3 style={{ color: '#fff', margin: '0 0 20px 0', fontSize: '16px' }}>+ Onboard New Supply Partner</h3>
          <form onSubmit={handleOnboardVendor} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            
            <div>
              <label style={styles.label}>VENDOR / MANUFACTURER NAME</label>
              <input type="text" value={formData.companyName} onChange={(e) => setFormData({...formData, companyName: e.target.value})} style={styles.input} placeholder="e.g. Titleist Wholesale, Bangkok Print Shop..." />
            </div>

            <div>
              <label style={styles.label}>DISPATCH / CONTACT EMAIL</label>
              <input type="email" value={formData.contactEmail} onChange={(e) => setFormData({...formData, contactEmail: e.target.value})} style={styles.input} placeholder="orders@vendor.com" />
            </div>

            <div>
              <label style={styles.label}>FULFILLMENT PROTOCOL (J.I.T. ROUTING)</label>
              <select value={formData.fulfillmentProtocol} onChange={(e) => setFormData({...formData, fulfillmentProtocol: e.target.value})} style={{...styles.input, color: '#D4AF37', fontWeight: 'bold'}}>
                <option value="email_manifest">Automated Email Packing Slip (Per Order)</option>
                <option value="daily_csv">Daily CSV Export (End of Day)</option>
                <option value="golfriend_stocked">Golfriend Internal Warehouse (Ship to Us)</option>
              </select>
            </div>

            {formData.fulfillmentProtocol !== 'golfriend_stocked' && (
              <div>
                <label style={styles.label}>VENDOR ORIGIN ADDRESS (For User Returns)</label>
                <textarea value={formData.originAddress} onChange={(e) => setFormData({...formData, originAddress: e.target.value})} style={{...styles.input, height: '80px'}} placeholder="Warehouse shipping address..." />
              </div>
            )}

            <button type="submit" disabled={isProcessing} style={{...styles.btnPrimary, backgroundColor: isProcessing ? '#555' : '#4CAF50', cursor: isProcessing ? 'not-allowed' : 'pointer'}}>
              {isProcessing ? 'AUTHORIZING VENDOR...' : 'SECURE VENDOR CONTRACT ➔'}
            </button>
          </form>
        </div>

        {/* ========================================== */}
        {/* RIGHT COLUMN: ACTIVE ROSTER */}
        {/* ========================================== */}
        <div style={{ flex: 2, backgroundColor: '#1e1e1e', borderRadius: '8px', border: '1px solid #333', padding: '24px' }}>
          <h3 style={{ color: '#fff', margin: '0 0 20px 0', fontSize: '16px' }}>Active Vendor Roster</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ backgroundColor: '#2a2a2a', borderBottom: '2px solid #444' }}>
                <th style={styles.th}>VENDOR ENTITY</th>
                <th style={styles.th}>DISPATCH EMAIL</th>
                <th style={styles.th}>ROUTING PROTOCOL</th>
                <th style={styles.th}>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {vendors.length === 0 ? (
                <tr><td colSpan={4} style={{ padding: '20px', textAlign: 'center', color: '#888' }}>No active vendors. Awaiting intake.</td></tr>
              ) : (
                vendors.map(vendor => (
                  <tr key={vendor.id} style={{ borderBottom: '1px solid #2a2a2a' }}>
                    <td style={{...styles.td, fontWeight: 'bold', color: '#D4AF37'}}>{vendor.companyName}</td>
                    <td style={styles.td}>{vendor.contactEmail}</td>
                    <td style={styles.td}>
                      <span style={{ padding: '4px 8px', backgroundColor: '#111', border: '1px solid #555', borderRadius: '4px', fontSize: '11px' }}>
                        {vendor.fulfillmentProtocol.replace('_', ' ').toUpperCase()}
                      </span>
                    </td>
                    <td style={{...styles.td, color: '#4CAF50'}}>● ACTIVE</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
}

const styles = {
  label: { display: 'block', color: '#888', fontSize: '11px', fontWeight: 'bold', marginBottom: '8px', letterSpacing: '1px', textTransform: 'uppercase' as const },
  input: { padding: '12px', borderRadius: '4px', border: '1px solid #444', backgroundColor: '#111', color: '#fff', width: '100%', boxSizing: 'border-box' as const, fontSize: '14px' },
  btnPrimary: { padding: '16px', color: '#fff', fontWeight: '900', border: 'none', borderRadius: '4px', marginTop: '10px', fontSize: '14px', letterSpacing: '1px' },
  th: { padding: '16px', color: '#888', fontSize: '11px', letterSpacing: '1px' },
  td: { padding: '16px', color: '#ccc', fontSize: '13px' }
};