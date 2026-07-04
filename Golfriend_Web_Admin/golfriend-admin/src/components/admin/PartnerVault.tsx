import { useState, useEffect } from 'react';
import { db } from '../../firebaseConfig';
import { collection, addDoc, onSnapshot, serverTimestamp, query } from 'firebase/firestore';

export default function PartnerVault() {
  const [partners, setPartners] = useState<any[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // --- FORM STATE ---
  const [corpName, setCorpName] = useState("");
  const [partnerType, setPartnerType] = useState("VENDOR");
  
  // Financial POC (Required for all)
  const [billingPOC, setBillingPOC] = useState("");
  const [billingEmail, setBillingEmail] = useState("");
  const [billingPhone, setBillingPhone] = useState("");

  // Logistics POC (Required for VENDORS only)
  const [warehousePOC, setWarehousePOC] = useState("");
  const [warehouseEmail, setWarehouseEmail] = useState("");
  const [originAddress, setOriginAddress] = useState("");

  // 🔥 WIRE THE VAULT LISTENER
  useEffect(() => {
    // Pointing directly to the b2b_partners collection your webhook uses
    const q = query(collection(db, 'b2b_partners')); 
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setPartners(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

  const executeAddPartner = async () => {
    if (!corpName || !billingEmail) return alert("Corporate Name and Billing Email are strictly required.");
    setIsProcessing(true);

    try {
      const payload: any = {
        corpName,
        partnerType,
        status: 'active',
        billingPOC,
        billingEmail,
        billingPhone,
        createdAt: serverTimestamp()
      };

      // Append Logistics only if they ship physical goods
      if (partnerType === 'VENDOR') {
        payload.logistics = {
          warehousePOC,
          warehouseEmail,
          originAddress
        };
      }

      await addDoc(collection(db, 'partners'), payload);
      
      // Reset Form
      setCorpName(""); setBillingPOC(""); setBillingEmail(""); setBillingPhone("");
      setWarehousePOC(""); setWarehouseEmail(""); setOriginAddress("");
      setIsAdding(false);
    } catch (error: any) {
      alert("❌ Vault Error: " + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const renderBadge = (tier: string) => {
    const safeTier = tier?.toLowerCase() || 'unknown';
    switch(safeTier) {
      case 'enterprise': return <span style={{...styles.badge, backgroundColor: '#D4AF37', color: '#000'}}>🏢 ENTERPRISE</span>;
      case 'small_business': return <span style={{...styles.badge, backgroundColor: '#1E88E5'}}>🏬 SMALL BUSINESS</span>;
      case 'commercial': return <span style={{...styles.badge, backgroundColor: '#4CAF50'}}>💎 COMMERCIAL (MANUAL)</span>;
      default: return <span style={{...styles.badge, backgroundColor: '#333'}}>{tier?.toUpperCase() || 'STANDARD'}</span>;
    }
  };

  return (
    <div style={{ padding: '24px', backgroundColor: '#121212', minHeight: '100vh', color: '#fff', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px dashed #333', paddingBottom: '12px' }}>
        <h2 style={{ color: '#D4AF37', margin: 0 }}>🗄️ THE PARTNER VAULT</h2>
        <button onClick={() => setIsAdding(!isAdding)} style={styles.btnPrimary}>
          {isAdding ? 'CANCEL INTAKE' : '+ ONBOARD NEW PARTNER'}
        </button>
      </div>

      {/* ========================================== */}
      {/* INTAKE FORM (HIDDEN BY DEFAULT) */}
      {/* ========================================== */}
      {isAdding && (
        <div style={{ marginTop: '20px', padding: '20px', backgroundColor: '#1e1e1e', border: '1px solid #4CAF50', borderRadius: '8px' }}>
          <h3 style={{ margin: '0 0 15px 0', color: '#4CAF50' }}>New Corporate Intake</h3>
          
          <div style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
            <input type="text" placeholder="Corporate Name (e.g. Titleist)" value={corpName} onChange={(e) => setCorpName(e.target.value)} style={{...styles.input, flex: 2}} />
            <select value={partnerType} onChange={(e) => setPartnerType(e.target.value)} style={{...styles.input, flex: 1}}>
              <option value="VENDOR">Vendor (Ships Goods)</option>
              <option value="ADVERTISER">Advertiser (Digital Ads)</option>
              <option value="SPONSOR">Sponsor (Events)</option>
            </select>
          </div>

          <div style={{ padding: '15px', backgroundColor: '#111', borderRadius: '4px', marginBottom: '15px', borderLeft: '4px solid #1E88E5' }}>
            <h4 style={{ margin: '0 0 10px 0', color: '#1E88E5' }}>Financial / Contract POC</h4>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input type="text" placeholder="Executive Name" value={billingPOC} onChange={(e) => setBillingPOC(e.target.value)} style={{...styles.input, flex: 1}} />
              <input type="email" placeholder="Billing Email" value={billingEmail} onChange={(e) => setBillingEmail(e.target.value)} style={{...styles.input, flex: 1}} />
              <input type="tel" placeholder="Phone (+66...)" value={billingPhone} onChange={(e) => setBillingPhone(e.target.value)} style={{...styles.input, flex: 1}} />
            </div>
          </div>

          {partnerType === 'VENDOR' && (
            <div style={{ padding: '15px', backgroundColor: '#111', borderRadius: '4px', marginBottom: '15px', borderLeft: '4px solid #4CAF50' }}>
              <h4 style={{ margin: '0 0 10px 0', color: '#4CAF50' }}>Logistics / Warehouse POC (Required for OEM)</h4>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                <input type="text" placeholder="Warehouse Manager Name" value={warehousePOC} onChange={(e) => setWarehousePOC(e.target.value)} style={{...styles.input, flex: 1}} />
                <input type="email" placeholder="Logistics Email (For POs)" value={warehouseEmail} onChange={(e) => setWarehouseEmail(e.target.value)} style={{...styles.input, flex: 1}} />
              </div>
              <textarea placeholder="Physical Origin Address (For Courier / Returns)" value={originAddress} onChange={(e) => setOriginAddress(e.target.value)} style={{...styles.input, height: '60px'}} />
            </div>
          )}

          <button onClick={executeAddPartner} disabled={isProcessing} style={{...styles.btnPrimary, width: '100%', backgroundColor: isProcessing ? '#555' : '#4CAF50'}}>
            {isProcessing ? 'ENCRYPTING TO VAULT...' : 'LOCK PARTNER DATA TO FIRESTORE'}
          </button>
        </div>
      )}

      {/* ========================================== */}
      {/* THE MASTER ROLODEX (LIST VIEW) */}
      {/* ========================================== */}
      <div style={{ marginTop: '20px', display: 'grid', gap: '15px' }}>
        {partners.length === 0 ? (
          <p style={{ color: '#555' }}>The vault is empty. Awaiting corporate intakes.</p>
        ) : (
          partners.map(partner => (
            <div key={partner.id} style={{ padding: '15px', backgroundColor: '#1a1a1a', borderRadius: '6px', border: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                {/* We use partner.id because the webhook sets the UID/Email as the document ID */}
                <h3 style={{ margin: '0 0 5px 0', color: '#fff' }}>{partner.id}</h3>
                <div style={{ fontSize: '13px', color: '#888' }}>
                  Contract: {partner.contractDuration?.toUpperCase()} | Status: <span style={{color: partner.status === 'active_partner' ? '#4CAF50' : '#888'}}>{partner.status || 'Pending'}</span>
                </div>
              </div>
              <div>
                {renderBadge(partner.tier)}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const styles = {
  input: { padding: '10px', borderRadius: '4px', border: '1px solid #555', backgroundColor: '#222', color: '#fff', width: '100%', boxSizing: 'border-box' as const },
  btnPrimary: { padding: '10px 15px', backgroundColor: '#D4AF37', color: '#000', fontWeight: 'bold', border: 'none', borderRadius: '4px', cursor: 'pointer' },
  badge: { padding: '5px 10px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' as const, color: '#fff' }
};