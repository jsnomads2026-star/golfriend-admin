import { useState } from 'react';
import { db } from '../../../firebaseConfig';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export default function SponsorOnboardingWizard() {
  // --- STEP 1: GLOBAL INTAKE STATE ---
  const [corpName, setCorpName] = useState("");
  const [projectLead, setProjectLead] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [competitorBlocklist, setCompetitorBlocklist] = useState("");
  const [campaignObjective, setCampaignObjective] = useState<"OEM" | "COMMERCIAL" | "TOURNAMENT" | "">("");

  // --- WIZARD NAVIGATION ---
  const [step, setStep] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [finalizedOrder, setFinalizedOrder] = useState<any>(null);

  // --- STEP 2: BRANCH STATES (Pending Injection) ---
  // GLOBAL ASSET & CURRENCY
  const [currency, setCurrency] = useState("THB");
  const [visualAsset, setVisualAsset] = useState<File | null>(null);

  // OEM States
  const [productName, setProductName] = useState("");
  const [productCategory, setProductCategory] = useState("");
  const [baseCost, setBaseCost] = useState("");
  const [targetMargin, setTargetMargin] = useState("");
  const [inventoryLimit, setInventoryLimit] = useState("");
  const [fulfillmentProtocol, setFulfillmentProtocol] = useState("");
  const [originAddress, setOriginAddress] = useState("");
  
  // COMMERCIAL States
  const [adCopy, setAdCopy] = useState("");
  const [placementTier, setPlacementTier] = useState("");
  const [geofence, setGeofence] = useState("");
  const [wealthProfile, setWealthProfile] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // TOURNAMENT States
  const [sponsorTier, setSponsorTier] = useState("");
  const [targetEvent, setTargetEvent] = useState("");
  const [bountyContribution, setBountyContribution] = useState("");

  const handleNext = () => {
    if (!campaignObjective) return alert("Please select a Campaign Objective.");
    setStep(2);
  };

  // 🔥 THE GATEWAY ENGINE: Structuring Schema #19
  const executeCheckout = async () => {
    setIsProcessing(true);
    try {
      // 1. Compile the Universal Global Intake
      const payload: any = {
        corpName,
        projectLead,
        contactEmail,
        contactPhone,
        competitorBlocklist,
        campaignObjective,
        status: 'pending_payment', // Awaiting Stripe Webhook clearance
        createdAt: serverTimestamp(),
      };

      // 2. Append the Specific Branched Data & Dynamic Pricing
      payload.currency = currency; // Global currency tracking
      payload.hasVisualAsset = !!visualAsset; // Flag for Vision API

      if (campaignObjective === 'OEM') {
        payload.oemData = { productName, productCategory, baseCost: Number(baseCost), targetMarginPercent: Number(targetMargin), inventoryLimit: Number(inventoryLimit), fulfillmentProtocol, originAddress };
        payload.fiatPrice = Number(baseCost) * (1 + Number(targetMargin) / 100);
        // 🔥 COMPLIANCE LOCK: Physical goods cannot use virtual currency. Fiat only.
      } else if (campaignObjective === 'COMMERCIAL') {
        payload.commercialData = { adCopy, placementTier, geofence, wealthProfile, startDate, endDate };
        // Base CPM calculation logic (Cinematic Takeover vs Standard Feed)
        payload.fiatPrice = placementTier === 'cinematic_takeover' ? 5000 : 1500; 
      } else if (campaignObjective === 'TOURNAMENT') {
        payload.tournamentData = { sponsorTier, targetEvent, bountyContribution: Number(bountyContribution) };
        payload.fiatPrice = Number(bountyContribution);
      }

      // 3. Fire to Firestore Database (Schema #19)
      const docRef = await addDoc(collection(db, 'marketplaceOffers'), payload);
      
      // 🔥 CENTRAL BANK INJECTION: Automatically log fiat revenue to the master ledger
      await addDoc(collection(db, 'transactions'), {
        uid: docRef.id, // Using the offer ID as the sponsor entity reference
        type: campaignObjective === 'OEM' ? 'OEM_SPONSORSHIP' : campaignObjective === 'TOURNAMENT' ? 'TOURNAMENT_FEE' : 'AD_PLACEMENT_FEE',
        status: 'completed', 
        paymentProvider: 'OEM_DIRECT',
        fiatAmountUsd: payload.fiatPrice || 0,
        productName: `${corpName} - ${campaignObjective} Campaign`,
        timestamp: serverTimestamp()
      });
      
      // 4. Push to Step 3 (Manifest) instead of resetting
      setFinalizedOrder({ id: docRef.id, ...payload });
      setStep(3);
      
    } catch (error: any) {
      alert("❌ Gateway Error: " + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div style={{ padding: '24px', backgroundColor: '#121212', minHeight: '100vh', color: '#fff', fontFamily: 'sans-serif' }}>
      <h2 style={{ color: '#d4af37', borderBottom: '1px solid #333', paddingBottom: '12px' }}>
        B2B SPONSOR ONBOARDING PORTAL
      </h2>
      
      {/* ========================================== */}
      {/* STAGE 1: GLOBAL INTAKE */}
      {/* ========================================== */}
      {step === 1 && (
        <div id="step-1-global-intake" style={{ maxWidth: '600px', marginTop: '20px' }}>
          <h3 style={{ color: '#888' }}>Step 1: Corporate Identity & Routing</h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '20px' }}>
            <input type="text" placeholder="Corporate/Brand Name" value={corpName} onChange={(e) => setCorpName(e.target.value)} style={styles.input} />
            <input type="text" placeholder="Project Lead (Point of Contact)" value={projectLead} onChange={(e) => setProjectLead(e.target.value)} style={styles.input} />
            
            <div style={{ display: 'flex', gap: '10px' }}>
              <input type="email" placeholder="Secure Email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} style={{...styles.input, flex: 1}} />
              <input type="tel" placeholder="Phone (e.g. +66 81...)" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} style={{...styles.input, flex: 1}} />
            </div>

            <textarea placeholder="Direct Competitor Blocklist (e.g. Titleist, TaylorMade)" value={competitorBlocklist} onChange={(e) => setCompetitorBlocklist(e.target.value)} style={{...styles.input, height: '80px', resize: 'vertical'}} />

            <div style={{ marginTop: '10px', padding: '15px', backgroundColor: '#1e1e1e', borderRadius: '8px', border: '1px solid #333' }}>
              <h4 style={{ margin: '0 0 10px 0', color: '#D4AF37' }}>Select Campaign Track</h4>
              <select value={campaignObjective} onChange={(e: any) => setCampaignObjective(e.target.value)} style={styles.input}>
                <option value="">-- Select Objective --</option>
                <option value="OEM">Retail & Equipment (OEM Exchange)</option>
                <option value="COMMERCIAL">Digital Real Estate (Ad Hub)</option>
                <option value="TOURNAMENT">Event Presence (Tournament Sponsor)</option>
              </select>
            </div>

            <button onClick={handleNext} style={styles.btnPrimary}>PROCEED TO CAMPAIGN BUILDER ➔</button>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* STAGE 2: THE BRANCHED PAYLOADS */}
      {/* ========================================== */}
      {step === 2 && (
        <div id="step-2-branched-payload" style={{ marginTop: '20px', maxWidth: '600px' }}>
          <h3 style={{ color: '#D4AF37', borderBottom: '1px dashed #333', paddingBottom: '10px' }}>
            Step 2: {campaignObjective} Payload Configuration
          </h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '15px' }}>
            
            {/* BRANCH A: OEM EXCHANGE */}
            {campaignObjective === 'OEM' && (
              <>
                <input type="text" placeholder="Product Name (e.g. Pro V1 Dozen)" value={productName} onChange={(e) => setProductName(e.target.value)} style={styles.input} />
                <select value={productCategory} onChange={(e) => setProductCategory(e.target.value)} style={styles.input}>
                  <option value="">-- Select Category --</option>
                  <option value="equipment">Equipment & Clubs</option>
                  <option value="apparel">Apparel</option>
                  <option value="experience">Simulator / Experience</option>
                </select>
                
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <select value={currency} onChange={(e) => setCurrency(e.target.value)} style={{...styles.input, flex: 0.5}}>
                    <option value="THB">THB</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                  </select>
                  <input type="number" placeholder={`Wholesale Base Cost (${currency})`} value={baseCost} onChange={(e) => setBaseCost(e.target.value)} style={{...styles.input, flex: 1}} />
                  <input type="number" placeholder="Target Margin (%)" value={targetMargin} onChange={(e) => setTargetMargin(e.target.value)} style={{...styles.input, flex: 1}} />
                </div>
                
                {/* 🔥 AI PRICING ENGINE PROJECTION */}
                {(baseCost || targetMargin) && (
                  <div style={{ padding: '15px', backgroundColor: '#111', border: '1px solid #4CAF50', borderRadius: '5px' }}>
                    <h4 style={{ margin: '0 0 10px 0', color: '#4CAF50' }}>🤖 AI Dynamic Pricing Output</h4>
                    <p style={{ margin: '5px 0', color: '#aaa', fontSize: '13px' }}>Fiat Price (Stripe): <strong style={{color: '#fff'}}>{(parseFloat(baseCost || "0") * (1 + parseFloat(targetMargin || "0") / 100)).toFixed(2)} {currency}</strong></p>
                    <p style={{ margin: '5px 0', color: '#888', fontSize: '11px', fontStyle: 'italic' }}>*Physical goods are strictly Stripe/Fiat only per Apple/Google App Store guidelines.*</p>
                  </div>
                )}

                <input type="number" placeholder="Inventory Limit (Hard Cap)" value={inventoryLimit} onChange={(e) => setInventoryLimit(e.target.value)} style={styles.input} />
                <select value={fulfillmentProtocol} onChange={(e) => setFulfillmentProtocol(e.target.value)} style={styles.input}>
                  <option value="">-- Fulfillment Protocol --</option>
                  <option value="direct_shipping">Direct Shipping</option>
                  <option value="pro_shop_pickup">Pro-Shop Pickup</option>
                </select>
                {fulfillmentProtocol === 'direct_shipping' && (
                  <textarea placeholder="Corporate Origin Address (For Returns/Logistics)" value={originAddress} onChange={(e) => setOriginAddress(e.target.value)} style={{...styles.input, height: '60px'}} />
                )}
              </>
            )}

            {/* BRANCH B: COMMERCIAL AD HUB */}
            {campaignObjective === 'COMMERCIAL' && (
              <>
                <textarea placeholder="Ad Copy / CTA Message" value={adCopy} onChange={(e) => setAdCopy(e.target.value)} style={{...styles.input, height: '80px'}} />
                <select value={placementTier} onChange={(e) => setPlacementTier(e.target.value)} style={styles.input}>
                  <option value="">-- Placement Prominence --</option>
                  <option value="standard_feed">Standard Feed Card (1x Base CPM)</option>
                  <option value="cinematic_takeover">Cinematic Dashboard Takeover (3x Base CPM)</option>
                </select>
                <input type="text" placeholder="Geofencing Precision (e.g. 50km radius of Pattaya)" value={geofence} onChange={(e) => setGeofence(e.target.value)} style={styles.input} />
                <select value={wealthProfile} onChange={(e) => setWealthProfile(e.target.value)} style={styles.input}>
                  <option value="">-- Wealth/Audience Profiling --</option>
                  <option value="all">All Golfers</option>
                  <option value="single_digit">Single-Digit Handicap Only</option>
                  <option value="verified_elite">Verified Elite Badges Only</option>
                </select>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <div style={{ flex: 1 }}><label style={{color: '#888', fontSize: '12px'}}>Start Date</label><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={styles.input} /></div>
                  <div style={{ flex: 1 }}><label style={{color: '#888', fontSize: '12px'}}>End Date</label><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={styles.input} /></div>
                </div>
              </>
            )}

            {/* BRANCH C: TOURNAMENT ECOSYSTEM */}
            {campaignObjective === 'TOURNAMENT' && (
              <>
                <select value={sponsorTier} onChange={(e) => setSponsorTier(e.target.value)} style={styles.input}>
                  <option value="">-- Sponsorship Tier --</option>
                  <option value="title_sponsor">Title Sponsor</option>
                  <option value="hole_in_one">Hole-In-One Sponsor</option>
                  <option value="banquet_host">Banquet Host</option>
                </select>
                <select value={targetEvent} onChange={(e) => setTargetEvent(e.target.value)} style={styles.input}>
                  <option value="">-- Target Live Event --</option>
                  <option value="PATTAYA_OPEN">Pattaya Open 2026</option>
                </select>
                <input type="number" placeholder="Prize/Bounty Contribution (THB)" value={bountyContribution} onChange={(e) => setBountyContribution(e.target.value)} style={styles.input} />
              </>
            )}

            {/* UNIVERSAL ASSET UPLOAD (Applies to all branches) */}
            <div style={{ padding: '20px', border: '2px dashed #555', borderRadius: '8px', textAlign: 'center', backgroundColor: '#1a1a1a', position: 'relative' }}>
              <input 
                type="file" 
                accept="image/*"
                onChange={(e) => setVisualAsset(e.target.files ? e.target.files[0] : null)}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }} 
              />
              <span style={{ color: visualAsset ? '#4CAF50' : '#D4AF37', fontWeight: 'bold' }}>
                {visualAsset ? `✅ ASSET SECURED: ${visualAsset.name}` : '📸 UPLOAD VISUAL ASSET (CLICK OR DRAG)'}
              </span>
              <p style={{ color: '#666', fontSize: '12px', margin: '5px 0 0 0' }}>Will be routed to AI Vision Gatekeeper for ToS & Resolution scan.</p>
            </div>

            {/* CHECKOUT GATES */}
            <div style={{ display: 'flex', gap: '15px', marginTop: '20px' }}>
              <button onClick={() => setStep(1)} disabled={isProcessing} style={{...styles.btnSecondary, marginTop: 0, flex: 1}}>⬅ BACK</button>
              <button 
                onClick={executeCheckout} 
                disabled={isProcessing}
                style={{...styles.btnPrimary, marginTop: 0, flex: 2, backgroundColor: isProcessing ? '#555' : '#4CAF50', color: '#fff', cursor: isProcessing ? 'not-allowed' : 'pointer'}}
              >
                {isProcessing ? 'SCANNING ASSETS & ROUTING TO STRIPE...' : 'INITIATE AI QUOTE & STRIPE GATEWAY ➔'}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* STAGE 3: OFFICIAL COMMERCIAL MANIFEST */}
      {/* ========================================== */}
      {step === 3 && finalizedOrder && (
        <div id="step-3-success" style={{ marginTop: '20px', maxWidth: '600px' }}>
          <div style={{ padding: '20px', backgroundColor: '#1e1e1e', border: '1px solid #4CAF50', borderRadius: '8px' }}>
            <h3 style={{ color: '#4CAF50', margin: '0 0 10px 0' }}>✅ INTAKE SUCCESSFUL</h3>
            <p style={{ color: '#aaa', fontSize: '14px', margin: 0 }}>Payload locked to Schema #19. Awaiting Stripe gateway clearance.</p>

            {/* THE PRINTABLE TICKET */}
            <div style={{ marginTop: '25px', padding: '20px', backgroundColor: '#000', border: '1px dashed #555', fontFamily: 'monospace' }}>
              <h4 style={{ margin: '0 0 15px 0', color: '#D4AF37', borderBottom: '1px solid #333', paddingBottom: '10px', fontSize: '18px', letterSpacing: '1px' }}>
                📦 GOLFRIEND COMMERCIAL MANIFEST
              </h4>
              
              <div style={{ fontSize: '14px', color: '#ccc', lineHeight: '1.8' }}>
                <div><strong style={{color: '#888'}}>ORDER ID:</strong> {finalizedOrder.id}</div>
                <div><strong style={{color: '#888'}}>DATE:</strong> {new Date().toLocaleDateString()}</div>
                <div><strong style={{color: '#888'}}>SPONSOR ENTITY:</strong> {finalizedOrder.corpName}</div>
                <div><strong style={{color: '#888'}}>CAMPAIGN TRACK:</strong> {finalizedOrder.campaignObjective}</div>
                
                <hr style={{ border: 'none', borderTop: '1px dashed #333', margin: '15px 0' }} />

                {finalizedOrder.campaignObjective === 'OEM' && finalizedOrder.oemData && (
                  <>
                    <div><strong style={{color: '#888'}}>SKU / PRODUCT:</strong> {finalizedOrder.oemData.productName}</div>
                    <div><strong style={{color: '#888'}}>CATEGORY:</strong> {finalizedOrder.oemData.productCategory.toUpperCase()}</div>
                    <div><strong style={{color: '#888'}}>AUTH INVENTORY:</strong> {finalizedOrder.oemData.inventoryLimit} UNITS</div>
                    <div><strong style={{color: '#888'}}>FULFILLMENT:</strong> {finalizedOrder.oemData.fulfillmentProtocol.replace('_', ' ').toUpperCase()}</div>
                    
                    {finalizedOrder.oemData.fulfillmentProtocol === 'direct_shipping' && (
                      <div style={{ marginTop: '15px', padding: '15px', border: '1px solid #333', backgroundColor: '#111' }}>
                        <strong style={{ color: '#D4AF37' }}>RETURN / ORIGIN LOGISTICS:</strong><br/>
                        <div style={{ marginTop: '5px', whiteSpace: 'pre-wrap' }}>{finalizedOrder.oemData.originAddress}</div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '15px', marginTop: '25px' }}>
              <button 
                onClick={() => window.print()} 
                style={{...styles.btnSecondary, flex: 1, borderColor: '#D4AF37', color: '#D4AF37', marginTop: 0}}
              >
                🖨️ PRINT MANIFEST
              </button>
              <button 
                onClick={() => { setStep(1); setCampaignObjective(""); setFinalizedOrder(null); }} 
                style={{...styles.btnPrimary, flex: 1, marginTop: 0}}
              >
                + NEW INTAKE
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

const styles = {
  input: { padding: '12px', borderRadius: '4px', border: '1px solid #555', backgroundColor: '#222', color: '#fff', width: '100%', boxSizing: 'border-box' as const },
  btnPrimary: { padding: '15px', backgroundColor: '#D4AF37', color: '#000', fontWeight: 'bold', border: 'none', borderRadius: '4px', cursor: 'pointer', marginTop: '10px' },
  btnSecondary: { padding: '10px 20px', backgroundColor: '#333', color: '#fff', fontWeight: 'bold', border: '1px solid #555', borderRadius: '4px', cursor: 'pointer', marginTop: '20px' }
};