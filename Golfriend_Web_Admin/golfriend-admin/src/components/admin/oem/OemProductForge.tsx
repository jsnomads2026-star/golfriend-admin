// ==========================================
// FILE: src/components/admin/oem/OemProductForge.tsx
// ==========================================
import { useState, useEffect } from 'react';
import { db } from '../../../firebaseConfig';
import { collection, addDoc, getDocs, query, where, serverTimestamp, doc, deleteDoc, onSnapshot, orderBy } from 'firebase/firestore';

interface Vendor {
  id: string;
  companyName: string;
}

export default function OemProductForge() {
  const [step, setStep] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  
  // Product State
  const [productName, setProductName] = useState("");
  const [category, setCategory] = useState("apparel");
  const [pitchWording, setPitchWording] = useState("");
  const [isGeneratingPitch, setIsGeneratingPitch] = useState(false);
  const [visualAsset, setVisualAsset] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Logistics & Financial State
  const [supplierId, setSupplierId] = useState("");
  const [baseCost, setBaseCost] = useState("");
  const [targetMargin, setTargetMargin] = useState("");

  // Marketplace State
  const [offers, setOffers] = useState<any[]>([]);

  // 🔥 0. LIVE INVENTORY SYNC (Real-time Table)
  useEffect(() => {
    const q = query(collection(db, 'marketplaceOffers'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setOffers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

  // 🔥 1. PULL ACTIVE VENDORS FROM CRM
  useEffect(() => {
    const fetchVendors = async () => {
      const q = query(collection(db, 'vendors'), where('status', '==', 'active'));
      const snapshot = await getDocs(q);
      setVendors(snapshot.docs.map(doc => ({ id: doc.id, companyName: doc.data().companyName })));
    };
    fetchVendors();
  }, []);

  // Handle Local Image Preview
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setVisualAsset(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleAIPitchGeneration = () => {
    if (!productName || !category) {
      alert("Provide a Product Name and Category first.");
      return;
    }
    setIsGeneratingPitch(true);
    
    setTimeout(() => {
      let structuredPitch = "";
      const cleanedName = productName.trim();

      if (category === 'apparel') {
        structuredPitch = `Step up to the tee in pristine style with the all-new ${cleanedName}. Engineered with premium breathable fabric textures for maximum mobility and ultimate comfort across all 18 holes.`;
      } else if (category === 'equipment') {
        structuredPitch = `Unleash absolute precision control with the ${cleanedName}. Fine-tuned launch dynamics and optimal perimeter weighting deliver the competitive edge demanded by modern golfers.`;
      } else {
        structuredPitch = `Complete your professional setup with the essential ${cleanedName}. High-performance craftsmanship designed specifically to complement your game and elevate club lifestyle aesthetics.`;
      }

      setPitchWording(structuredPitch);
      setIsGeneratingPitch(false);
    }, 600);
  };

  const calculateFinalPrice = () => {
    const cost = parseFloat(baseCost) || 0;
    const margin = parseFloat(targetMargin) || 0;
    return (cost * (1 + margin / 100)).toFixed(2);
  };

  const handleDeleteOffer = async (offerId: string) => {
    if (!window.confirm("Are you sure you want to pull this product from the mobile marketplace?")) return;
    try {
      await deleteDoc(doc(db, 'marketplaceOffers', offerId));
    } catch (error: any) {
      alert("Deletion Failed: " + error.message);
    }
  };

  // 🔥 2. PUSH TO LIVE MOBILE MARKETPLACE
  const executeLaunch = async () => {
    setIsProcessing(true);
    try {
      // In a full production environment, we would upload visualAsset to Firebase Storage here and get the URL.
      if (visualAsset) {
        console.log("Ready for future Firebase Storage Upload:", visualAsset.name);
      }
      
      await addDoc(collection(db, 'marketplaceOffers'), {
        type: 'OEM_RETAIL',
        vendorEntity: 'Golfriend Co.', // Hardcoded as First-Party Retail
        supplierId: supplierId, // The Dropship Partner from CRM
        productName,
        category,
        pitchWording,
        baseCost: parseFloat(baseCost),
        targetMargin: parseFloat(targetMargin),
        fiatPrice: parseFloat(calculateFinalPrice()),
        currency: 'THB', // Centralized currency
        inventoryStatus: 'unlimited_dropship',
        status: 'active_in_store',
        createdAt: serverTimestamp()
      });

      alert("🚀 PRODUCT LAUNCHED! It is now live in the mobile Locker Room.");
      setStep(1); // Reset Forge
      setProductName(""); setPitchWording(""); setBaseCost(""); setTargetMargin(""); setVisualAsset(null); setPreviewUrl(null);
    } catch (error: any) {
      alert("Launch Error: " + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div style={{ padding: '24px', backgroundColor: '#121212', minHeight: '100vh', color: '#fff', fontFamily: 'sans-serif' }}>
      <h2 style={{ color: '#D4AF37', margin: '0 0 8px 0', borderBottom: '1px solid #333', paddingBottom: '12px' }}>
        ⚒️ OEM PRODUCT FORGE
      </h2>
      <p style={{ color: '#aaa', fontSize: '14px', marginBottom: '30px' }}>
        Design first-party Golfriend merchandise and instantly push to the mobile Marketplace.
      </p>

      {/* ========================================== */}
      {/* STEP 1 & 2: CREATION AND LOGISTICS */}
      {/* ========================================== */}
      {step === 1 && (
        <div style={{ maxWidth: '600px', backgroundColor: '#1e1e1e', padding: '24px', borderRadius: '8px', border: '1px solid #333' }}>
          <h3 style={{ color: '#fff', marginTop: 0 }}>Phase 1: Creative & Logistics</h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '20px' }}>
            <input type="text" placeholder="Product Name (e.g., Tour-Grade Polo)" value={productName} onChange={(e) => setProductName(e.target.value)} style={styles.input} />
            
            <select value={category} onChange={(e) => setCategory(e.target.value)} style={styles.input}>
              <option value="apparel">Apparel & Clothing</option>
              <option value="equipment">Clubs & Equipment</option>
              <option value="accessories">Accessories & Gear</option>
            </select>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <textarea 
                placeholder="Sales Pitch / Wording (Keep it punchy...)" 
                value={pitchWording} 
                onChange={(e) => setPitchWording(e.target.value)} 
                style={{...styles.input, height: '100px'}} 
                disabled={isGeneratingPitch}
              />
              <button 
                type="button"
                onClick={handleAIPitchGeneration} 
                disabled={isGeneratingPitch}
                style={{ 
                  padding: '10px 14px', 
                  backgroundColor: '#222', 
                  color: '#D4AF37', 
                  border: '1px solid #333', 
                  borderRadius: '4px', 
                  cursor: isGeneratingPitch ? 'wait' : 'pointer', 
                  fontWeight: 'bold',
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  transition: 'background-color 0.2s'
                }}
              >
                {isGeneratingPitch ? '⏳ Synthesizing Pitch...' : '✨ Auto-Generate Pitch'}
              </button>
            </div>
            
            <div style={{ border: '2px dashed #444', padding: '20px', textAlign: 'center', borderRadius: '8px', backgroundColor: '#111' }}>
              <input type="file" accept="image/*" onChange={handleImageUpload} style={{ width: '100%', color: '#aaa' }} />
            </div>

            <div style={{ borderTop: '1px solid #333', margin: '10px 0' }}></div>
            
            <h4 style={{ color: '#D4AF37', margin: '0 0 10px 0' }}>Dropship Supplier & Pricing</h4>
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} style={styles.input}>
              <option value="">-- Select Dropship Vendor --</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.companyName}</option>)}
            </select>

            <div style={{ display: 'flex', gap: '10px' }}>
              <input type="number" placeholder="Base Cost (THB)" value={baseCost} onChange={(e) => setBaseCost(e.target.value)} style={styles.input} />
              <input type="number" placeholder="Target Margin (%)" value={targetMargin} onChange={(e) => setTargetMargin(e.target.value)} style={styles.input} />
            </div>

            <button onClick={() => setStep(2)} style={styles.btnPrimary}>PROCEED TO STAGING PREVIEW ➔</button>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* STEP 3: SPLIT-SCREEN STAGING PREVIEW */}
      {/* ========================================== */}
      {step === 2 && (
        <div>
          <button onClick={() => setStep(1)} style={{...styles.btnSecondary, marginBottom: '20px'}}>⬅ Back to Edit</button>
          
          <div style={{ display: 'flex', gap: '40px', alignItems: 'flex-start' }}>
            
            {/* LEFT: FINANCIAL QUOTE */}
            <div style={{ flex: 1, backgroundColor: '#1e1e1e', padding: '24px', borderRadius: '8px', border: '1px solid #333' }}>
              <h3 style={{ color: '#4CAF50', margin: '0 0 20px 0' }}>Financial Quotation</h3>
              <div style={{ fontSize: '15px', color: '#ccc', lineHeight: '2' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Vendor Entity:</span> <strong style={{color: '#fff'}}>Golfriend Co.</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Wholesale Cost:</span> <span>{baseCost || 0} THB</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Target Margin:</span> <span>{targetMargin || 0}%</span></div>
                <hr style={{ borderColor: '#333' }}/>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '18px', color: '#D4AF37', fontWeight: 'bold' }}>
                  <span>FINAL RETAIL PRICE:</span> <span>{calculateFinalPrice()} THB</span>
                </div>
              </div>

              <button onClick={executeLaunch} disabled={isProcessing} style={{...styles.btnPrimary, backgroundColor: isProcessing ? '#555' : '#4CAF50', width: '100%', marginTop: '30px'}}>
                {isProcessing ? 'INJECTING TO MARKETPLACE...' : 'APPROVE & PUSH TO MOBILE APP ➔'}
              </button>
            </div>

            {/* RIGHT: MOBILE CSS MOCKUP */}
            <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
              <div style={{ width: '320px', backgroundColor: '#0a0a0a', border: '12px solid #222', borderRadius: '36px', padding: '20px', boxShadow: '0 10px 30px rgba(0,0,0,0.8)' }}>
                {/* Mobile Header */}
                <div style={{ textAlign: 'center', color: '#D4AF37', fontSize: '14px', fontWeight: 'bold', marginBottom: '15px', letterSpacing: '2px' }}>GOLFRIEND</div>
                
                {/* The Product Card */}
                <div style={{ backgroundColor: '#111', borderRadius: '12px', overflow: 'hidden', border: '1px solid #333' }}>
                  <div style={{ height: '200px', backgroundColor: '#222', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    {previewUrl ? <img src={previewUrl} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{color: '#555'}}>No Image Provided</span>}
                  </div>
                  <div style={{ padding: '15px' }}>
                    <h4 style={{ color: '#fff', margin: '0 0 5px 0', fontSize: '16px' }}>{productName || 'Product Name'}</h4>
                    <p style={{ color: '#888', fontSize: '12px', margin: '0 0 15px 0', lineHeight: '1.4' }}>{pitchWording || 'Your engaging sales pitch will appear here...'}</p>
                    <button style={{ width: '100%', padding: '12px', backgroundColor: '#D4AF37', color: '#000', border: 'none', borderRadius: '6px', fontWeight: 'bold' }}>
                      BUY NOW - {calculateFinalPrice()} THB
                    </button>
                  </div>
                </div>
                
                {/* Mobile Tab Bar Mockup */}
                <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: '20px', paddingTop: '15px', borderTop: '1px solid #333' }}>
                  <div style={{ width: '20px', height: '20px', backgroundColor: '#333', borderRadius: '50%' }}></div>
                  <div style={{ width: '20px', height: '20px', backgroundColor: '#333', borderRadius: '50%' }}></div>
                  <div style={{ width: '20px', height: '20px', backgroundColor: '#D4AF37', borderRadius: '50%' }}></div>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* STEP 3: LIVE MARKETPLACE INVENTORY TABLE */}
      {/* ========================================== */}
      <div style={{ marginTop: '40px', backgroundColor: '#1e1e1e', padding: '24px', borderRadius: '8px', border: '1px solid #333' }}>
        <h3 style={{ color: '#D4AF37', margin: '0 0 20px 0' }}>Live Marketplace Inventory</h3>
        {offers.length === 0 ? (
          <p style={{ color: '#888' }}>No active products in the marketplace.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #444', color: '#aaa', fontSize: '14px' }}>
                <th style={{ padding: '12px' }}>Product</th>
                <th style={{ padding: '12px' }}>Category</th>
                <th style={{ padding: '12px' }}>Cost / Retail</th>
                <th style={{ padding: '12px' }}>Status</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {offers.map(offer => (
                <tr key={offer.id} style={{ borderBottom: '1px solid #333' }}>
                  <td style={{ padding: '12px', fontWeight: 'bold' }}>{offer.productName}</td>
                  <td style={{ padding: '12px', textTransform: 'capitalize' }}>{offer.category}</td>
                  <td style={{ padding: '12px' }}>
                    <span style={{ color: '#888' }}>{offer.baseCost}</span> / <span style={{ color: '#4CAF50' }}>{offer.fiatPrice} THB</span>
                  </td>
                  <td style={{ padding: '12px' }}>
                    <span style={{ padding: '4px 8px', backgroundColor: 'rgba(76, 175, 80, 0.1)', color: '#4CAF50', borderRadius: '4px', fontSize: '12px' }}>
                      {offer.status}
                    </span>
                  </td>
                  <td style={{ padding: '12px', textAlign: 'right' }}>
                    <button 
                      onClick={() => handleDeleteOffer(offer.id)}
                      style={{ background: 'transparent', border: '1px solid #F44336', color: '#F44336', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}
                    >
                      🗑️ DELETE
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

    </div>
  );
}

const styles = {
  input: { padding: '12px', borderRadius: '4px', border: '1px solid #444', backgroundColor: '#111', color: '#fff', width: '100%', boxSizing: 'border-box' as const, fontSize: '14px' },
  btnPrimary: { padding: '16px', backgroundColor: '#D4AF37', color: '#000', fontWeight: '900', border: 'none', borderRadius: '4px', marginTop: '10px', fontSize: '14px', letterSpacing: '1px', cursor: 'pointer' },
  btnSecondary: { padding: '10px 20px', backgroundColor: '#333', color: '#fff', fontWeight: 'bold', border: '1px solid #555', borderRadius: '4px', cursor: 'pointer' }
};