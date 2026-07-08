import React, { useState, useEffect } from 'react';
import { db, storage } from '../../firebaseConfig';
import { doc, setDoc, collection, getDocs } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import QRCode from 'react-qr-code';

export default function EventGenesisConsole() {
  // 🔥 INJECTED: Auth Context for Universal Referral Deep Link
  const auth = getAuth();
  const partnerUid = auth.currentUser?.uid || "UNKNOWN_PARTNER";
  const referralDeepLink = `golfriend://invite?ref=${partnerUid}`;

  // Core Details
  const [eventName, setEventName] = useState('');
  const [courseId, setCourseId] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [startTime, setStartTime] = useState('08:00');
  const [matchFormat, setMatchFormat] = useState('Stroke Play (Net)');
  const [entryFee, setEntryFee] = useState('');
  const [currency, setCurrency] = useState('THB');
  const [maxPlayers, setMaxPlayers] = useState('');
  
  // 🔥 NEW: Searchable Course State
  const [courseSearch, setCourseSearch] = useState('');
  const [showCourseDropdown, setShowCourseDropdown] = useState(false);

  // 🔥 NEW: Calculator State
  const [isCalcOpen, setIsCalcOpen] = useState(false);
  const [calcPlayers, setCalcPlayers] = useState(144);
  const [calcCut, setCalcCut] = useState(20);
  const [calcSkillSplit, setCalcSkillSplit] = useState(60);
  const [calcGreenFee, setCalcGreenFee] = useState(1500); // Default placeholder
  const [calcFnB, setCalcFnB] = useState(500); // Default placeholder
  
  // 🔥 UPGRADED: Dynamic Array States
  const [prizePool, setPrizePool] = useState<string[]>([]);
  const [prizeInput, setPrizeInput] = useState('');
  const [raffleItems, setRaffleItems] = useState<string[]>([]);
  const [raffleInput, setRaffleInput] = useState('');
  const [includesDinner, setIncludesDinner] = useState(false);

  // 🔥 NEW: File Upload & Marketing State
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [bankDetails, setBankDetails] = useState('');
  const [salesPitch, setSalesPitch] = useState('');
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);

  // Auto-generate local preview URLs for the Mobile Simulator
  const previewMediaUrl = coverFile ? URL.createObjectURL(coverFile) : '';

  // 🔥 NEW: Live Course Engine States
  const [availableCourses, setAvailableCourses] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 🔥 MOCK AI PITCH GENERATOR
  const handleAIPitch = () => {
    if (!eventName || !courseId) return alert("Enter a Name and Course first!");
    setIsGeneratingAI(true);
    setTimeout(() => {
      setSalesPitch(`Experience the ultimate showdown at the ${eventName}! Battle it out on the pristine fairways for massive prizes, exclusive raffle gear, and absolute glory. Limited spots available—secure your tee time now!`);
      setIsGeneratingAI(false);
    }, 1500);
  };

  // 🔥 FETCH LIVE COURSES ON MOUNT (Unrestricted Worldwide Engine)
  useEffect(() => {
    const fetchCourses = async () => {
      try {
        const snapshot = await getDocs(collection(db, 'courses'));
        const courses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // 🌍 REMOVED PATTAYA GEOFENCE: Load all worldwide courses for Admin selection
        setAvailableCourses(courses);
        if (courses.length > 0) setCourseId(courses[0].id);
      } catch (error) {
        console.error("Failed to fetch courses:", error);
      }
    };
    fetchCourses();
  }, []);

  // 🔥 ARRAY BUILDER LOGIC
  const handleAddTag = (e: React.KeyboardEvent, type: 'prize' | 'raffle') => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (type === 'prize' && prizeInput.trim()) {
        setPrizePool([...prizePool, prizeInput.trim()]);
        setPrizeInput('');
      } else if (type === 'raffle' && raffleInput.trim()) {
        setRaffleItems([...raffleItems, raffleInput.trim()]);
        setRaffleInput('');
      }
    }
  };

  const removeTag = (index: number, type: 'prize' | 'raffle') => {
    if (type === 'prize') setPrizePool(prizePool.filter((_, i) => i !== index));
    if (type === 'raffle') setRaffleItems(raffleItems.filter((_, i) => i !== index));
  };

  // 🔥 FINAL EXECUTION: UPGRADED TO HARNESS STORAGE UPLOADS & PARTNER OWNERSHIP
  const confirmAndLaunch = async () => {
    if (!eventName.trim()) {
      alert("❌ Tournament Name is required before broadcasting.");
      return;
    }
    
    setIsSubmitting(true);
    
    // Generates a bulletproof, non-empty Document reference matching full system specifications
    const customDocId = `${eventName.toUpperCase().replace(/\s+/g, '_')}_${Date.now().toString().slice(-4)}`;
    const auth = getAuth();
    const activePartnerUid = auth.currentUser?.uid || "UNKNOWN_PARTNER";

    try {
      let coverMediaUrl = "";

      // Perform genuine Firebase Storage allocation if an image binary exists
      if (coverFile) {
        const fileExtension = coverFile.name.split('.').pop();
        const storagePath = `tournaments/${Date.now()}_generated.${fileExtension}`;
        // Import dynamically to handle variable modular configurations safely
        const { ref: storageRef, uploadBytes: storageUpload, getDownloadURL: storageUrlFetch } = await import('firebase/storage');
        const targetRef = storageRef(storage, storagePath);
        await storageUpload(targetRef, coverFile);
        coverMediaUrl = await storageUrlFetch(targetRef);
      }

      // Payload engineered to strictly pass schema requirements without triggering rule rejections
      await setDoc(doc(db, 'tournaments', customDocId), {
        name: eventName,
        courseId: courseId,
        date: eventDate || new Date().toISOString().split('T')[0],
        time: startTime,
        format: matchFormat,
        maxPlayers: Number(maxPlayers) || 144, // Defaults to a standard full field if left blank
        entryFeeFiat: Number(entryFee) || 0,
        currency: currency,
        paymentGateway: 'Direct QR',
        agenda: {
          prizePool: prizePool,
          raffleItems: raffleItems,
          includesDinner: includesDinner
        },
        status: 'registration_open',
        displayState: 'leaderboard',
        createdAt: new Date().toISOString(),
        
        // Ownership references matching visual unified management rules
        hostUid: activePartnerUid,
        imageUrl: coverMediaUrl,
        bankDetails: bankDetails || "",
        location: "Pattaya",
        
        // 🔥 MOBILE FEED UPGRADE: Critical Flags for DiscoveryFeed Visibility
        itemType: 'tournament',
        tag: 'TOURNAMENT',
        isBroadcast: true,
        media_url: coverMediaUrl, // Mobile feed strictly looks for media_url
        adHeadline: eventName, // Fallback for CRM pipeline if needed
        adDescription: salesPitch
      });

      alert(`✅ SYSTEM CONFIRM: ${eventName} has been broadcast to all regional players!`);
      
      // Clean up local forms gracefully
      setEventName(''); setEntryFee(''); setEventDate(''); 
      setPrizePool([]); setRaffleItems([]); setIncludesDinner(false);
      setBankDetails(''); setSalesPitch(''); setCoverFile(null);
    } catch (error: any) {
      console.error("Genesis Launch System Collapse:", error);
      alert(`❌ Broadcast Denied: ${error.message || "Schema authorization rule failure"}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ padding: '20px', color: '#fff', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <h2 style={{ color: '#D4AF37', letterSpacing: '2px', marginBottom: '30px' }}>
        📅 EVENT GENESIS CONSOLE
      </h2>

      {/* MASTER SPLIT-SCREEN LAYOUT */}
      <div style={{ display: 'flex', gap: '40px', alignItems: 'flex-start' }}>
        
        {/* ========================================== */}
        {/* LEFT COLUMN: THE DATA FORM                 */}
        {/* ========================================== */}
        <div style={{ flex: 1, background: '#111', padding: '30px', borderRadius: '12px', border: '1px solid #333' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* ROW 1: Name & Course */}
            <div style={{ display: 'flex', gap: '20px' }}>
              <div style={{ flex: 2 }}>
                <label style={{ display: 'block', color: '#888', marginBottom: '8px', fontWeight: 'bold' }}>Tournament Name</label>
                <input 
                  type="text" value={eventName} onChange={(e) => setEventName(e.target.value)}
                  placeholder="e.g., Pattaya Open 2026"
                  style={{ width: '100%', padding: '12px', background: '#222', border: '1px solid #444', color: '#fff', borderRadius: '6px' }}
                />
              </div>
              <div style={{ flex: 1, position: 'relative' }}>
                <label style={{ display: 'block', color: '#888', marginBottom: '8px', fontWeight: 'bold' }}>Host Course (Search)</label>
                <input 
                  type="text" 
                  value={courseSearch} 
                  onChange={(e) => {
                    setCourseSearch(e.target.value);
                    setShowCourseDropdown(true);
                  }}
                  onFocus={() => setShowCourseDropdown(true)}
                  placeholder="Type to search courses..."
                  style={{ width: '100%', padding: '12px', background: '#222', border: '1px solid #444', color: '#fff', borderRadius: '6px' }}
                />
                {showCourseDropdown && courseSearch.length > 1 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#222', border: '1px solid #444', maxHeight: '200px', overflowY: 'auto', zIndex: 50, borderRadius: '6px', marginTop: '4px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
                    {availableCourses
                      .filter(c => (c.clubName || c.name || '').toLowerCase().includes(courseSearch.toLowerCase()))
                      .slice(0, 50) // Limit results for performance
                      .map(course => (
                        <div 
                          key={course.id} 
                          onClick={() => {
                            setCourseId(course.id);
                            setCourseSearch(course.clubName || course.name);
                            setShowCourseDropdown(false);
                          }}
                          style={{ padding: '10px 12px', color: '#fff', cursor: 'pointer', borderBottom: '1px solid #333' }}
                          onMouseOver={(e) => e.currentTarget.style.background = '#333'}
                          onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                          {course.clubName || course.name}
                        </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ROW 2: Date, Time & Format */}
            <div style={{ display: 'flex', gap: '20px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', color: '#888', marginBottom: '8px', fontWeight: 'bold' }}>Event Date</label>
                <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} style={{ width: '100%', padding: '12px', background: '#222', border: '1px solid #444', color: '#fff', borderRadius: '6px', colorScheme: 'dark' }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', color: '#888', marginBottom: '8px', fontWeight: 'bold' }}>Shotgun Time</label>
                <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} style={{ width: '100%', padding: '12px', background: '#222', border: '1px solid #444', color: '#fff', borderRadius: '6px', colorScheme: 'dark' }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', color: '#888', marginBottom: '8px', fontWeight: 'bold' }}>Match Format</label>
                <select value={matchFormat} onChange={(e) => setMatchFormat(e.target.value)} style={{ width: '100%', padding: '12px', background: '#222', border: '1px solid #444', color: '#fff', borderRadius: '6px' }}>
                  <option value="Stroke Play (Net)">Stroke Play (Net)</option>
                  <option value="System 36">System 36</option>
                  <option value="4-Player Scramble">4-Player Scramble</option>
                  <option value="Stableford">Stableford</option>
                </select>
              </div>
              <div style={{ flex: 0.5 }}>
                <label style={{ display: 'block', color: '#888', marginBottom: '8px', fontWeight: 'bold' }}>Max Players</label>
                <input type="number" value={maxPlayers} onChange={(e) => setMaxPlayers(e.target.value)} placeholder="144" style={{ width: '100%', padding: '12px', background: '#222', border: '1px solid #444', color: '#fff', borderRadius: '6px' }} />
              </div>
            </div>

            <hr style={{ borderColor: '#333', margin: '10px 0' }} />

            {/* ROW 3: Dynamic Tags for Perks & Agenda */}
            <div style={{ display: 'flex', gap: '20px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label style={{ color: '#888', fontWeight: 'bold' }}>Skill Prize Pool (Press Enter)</label>
                  <button type="button" onClick={() => setIsCalcOpen(true)} style={{ background: '#3a2a00', color: '#D4AF37', border: '1px solid #D4AF37', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>
                    🧮 ESTIMATOR
                  </button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '12px', background: '#222', border: '1px solid #444', borderRadius: '6px', minHeight: '45px' }}>
                  {prizePool.map((tag, idx) => (
                    <span key={idx} style={{ background: '#3a2a00', color: '#D4AF37', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', display: 'flex', alignItems: 'center', border: '1px solid #D4AF37' }}>
                      {tag} <span onClick={() => removeTag(idx, 'prize')} style={{ marginLeft: '6px', cursor: 'pointer', color: '#ff4444' }}>✖</span>
                    </span>
                  ))}
                  <input type="text" value={prizeInput} onChange={(e) => setPrizeInput(e.target.value)} onKeyDown={(e) => handleAddTag(e, 'prize')} placeholder="e.g., Titleist Driver" style={{ flex: 1, background: 'transparent', border: 'none', color: '#fff', outline: 'none', minWidth: '150px' }} />
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', color: '#888', marginBottom: '8px', fontWeight: 'bold' }}>Raffle Pool (Press Enter)</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '12px', background: '#222', border: '1px solid #444', borderRadius: '6px', minHeight: '45px' }}>
                  {raffleItems.map((tag, idx) => (
                    <span key={idx} style={{ background: '#2a104a', color: '#b67aef', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', display: 'flex', alignItems: 'center', border: '1px solid #8A2BE2' }}>
                      {tag} <span onClick={() => removeTag(idx, 'raffle')} style={{ marginLeft: '6px', cursor: 'pointer', color: '#ff4444' }}>✖</span>
                    </span>
                  ))}
                  <input type="text" value={raffleInput} onChange={(e) => setRaffleInput(e.target.value)} onKeyDown={(e) => handleAddTag(e, 'raffle')} placeholder="e.g., ProV1 Balls" style={{ flex: 1, background: 'transparent', border: 'none', color: '#fff', outline: 'none', minWidth: '150px' }} />
                </div>
              </div>
            </div>

            {/* ROW 4: Media & Marketing */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label style={{ display: 'block', color: '#888', marginBottom: '8px', fontWeight: 'bold' }}>Cover Media (Upload Photo)</label>
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={(e) => setCoverFile(e.target.files?.[0] || null)} 
                  style={{ width: '100%', padding: '10px', background: '#222', border: '1px solid #444', color: '#fff', borderRadius: '6px', cursor: 'pointer' }} 
                />
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label style={{ color: '#888', fontWeight: 'bold' }}>Event Sales Pitch</label>
                  <button type="button" onClick={handleAIPitch} disabled={isGeneratingAI} style={{ background: '#1E88E5', color: '#fff', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                    {isGeneratingAI ? '✨ GENERATING...' : '✨ AI SUGGESTION'}
                  </button>
                </div>
                <textarea value={salesPitch} onChange={(e) => setSalesPitch(e.target.value)} placeholder="Write a compelling description to attract players..." style={{ width: '100%', padding: '12px', background: '#222', border: '1px solid #444', color: '#fff', borderRadius: '6px', minHeight: '80px', resize: 'vertical' }} />
              </div>
            </div>

            {/* ROW 5: Fee & Dinner */}
            <div style={{ display: 'flex', gap: '20px', alignItems: 'center', marginTop: '10px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', color: '#888', marginBottom: '8px', fontWeight: 'bold' }}>Entry Fee & Currency</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input type="number" value={entryFee} onChange={(e) => setEntryFee(e.target.value)} placeholder="e.g., 3500" style={{ flex: 2, padding: '12px', background: '#222', border: '1px solid #D4AF37', color: '#fff', borderRadius: '6px' }} />
                  <select value={currency} onChange={(e) => setCurrency(e.target.value)} style={{ flex: 1, padding: '12px', background: '#222', border: '1px solid #D4AF37', color: '#fff', borderRadius: '6px' }}>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GBP">GBP (£)</option>
                    <option value="THB">THB (฿)</option>
                    <option value="AUD">AUD ($)</option>
                    <option value="SGD">SGD ($)</option>
                  </select>
                </div>
              </div>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px', paddingTop: '20px' }}>
                <input type="checkbox" id="dinnerCheck" checked={includesDinner} onChange={(e) => setIncludesDinner(e.target.checked)} style={{ width: '20px', height: '20px', cursor: 'pointer' }} />
                <label htmlFor="dinnerCheck" style={{ color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}>Includes Clubhouse Dinner Banquet</label>
              </div>
            </div>

            {/* 🔥 NEW ROW 6: Manual Payment Routing */}
            <div style={{ background: '#1a1a1a', padding: '20px', borderRadius: '8px', borderLeft: '4px solid #44ff44', marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <h4 style={{ margin: 0, color: '#44ff44', letterSpacing: '1px' }}>🏦 DIRECT PAYMENT ROUTING</h4>
              <p style={{ margin: 0, color: '#888', fontSize: '13px' }}>Upload your Payment QR (PromptPay, Venmo, WeChat, etc). Mobile users scan and pay you directly.</p>
              
              <div style={{ display: 'flex', gap: '20px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', color: '#ccc', marginBottom: '8px', fontSize: '13px', fontWeight: 'bold' }}>Direct Payment QR Image</label>
                  <input type="file" accept="image/*" onChange={(e) => setQrFile(e.target.files?.[0] || null)} style={{ width: '100%', padding: '8px', background: '#222', border: '1px solid #444', color: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', color: '#ccc', marginBottom: '8px', fontSize: '13px', fontWeight: 'bold' }}>Bank Account Details</label>
                  <textarea value={bankDetails} onChange={(e) => setBankDetails(e.target.value)} placeholder="e.g., SCB 123-456-7890 (James Suh)" style={{ width: '100%', padding: '10px', background: '#222', border: '1px solid #444', color: '#fff', borderRadius: '6px', minHeight: '40px', fontSize: '12px', resize: 'vertical' }} />
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* ========================================== */}
        {/* RIGHT COLUMN: LIVE MOBILE SIMULATOR        */}
        {/* ========================================== */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'sticky', top: '20px' }}>
          
          {/* THE PHONE CASING (iPhone Pro proportions) */}
          <div style={{ width: '375px', height: '812px', backgroundColor: '#0A0A0A', borderRadius: '40px', border: '12px solid #222', overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative', boxShadow: '0 30px 60px rgba(0,0,0,0.8)' }}>
            
            {/* FULLSCREEN MEDIA BACKGROUND */}
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: '#1a1a1a',
              backgroundImage: previewMediaUrl ? `url(${previewMediaUrl})` : 'linear-gradient(135deg, #1E88E5 0%, #8A2BE2 100%)',
              backgroundSize: 'cover', backgroundPosition: 'center', zIndex: 0
            }} />

            {/* TOP HEADER OVERLAY (COURSE BADGE) */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '150px', background: 'linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, transparent 100%)', zIndex: 1, padding: '50px 20px 0 20px' }}>
              <div style={{ backgroundColor: 'rgba(212,175,55,0.2)', color: '#D4AF37', padding: '6px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 'bold', display: 'inline-block', marginBottom: '8px', border: '1px solid #D4AF37' }}>
                📍 {availableCourses.find(c => c.id === courseId)?.clubName || availableCourses.find(c => c.id === courseId)?.name || 'Course Selected'}
              </div>
              <h2 style={{ margin: 0, color: '#fff', fontSize: '26px', textShadow: '0 2px 10px rgba(0,0,0,0.8)', fontWeight: '900' }}>{eventName || 'Tournament Name'}</h2>
            </div>

            {/* BOTTOM BROADCAST CARD (Cloned precisely from MasterAlbumManager.tsx) */}
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, maxHeight: '65%', backgroundColor: 'rgba(18,18,18,0.85)', borderTopLeftRadius: '24px', borderTopRightRadius: '24px', padding: '25px 20px 35px 20px', zIndex: 20, display: 'flex', flexDirection: 'column' }}>
              
              {/* SCROLLABLE TEXT CONTAINER */}
              <div style={{ flexShrink: 1, overflowY: 'auto', marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 15, paddingBottom: 15, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <span style={{ color: '#D4AF37', fontWeight: 'bold', fontSize: '14px', letterSpacing: '1px' }}>📅 {eventDate || 'YYYY-MM-DD'}</span>
                  <span style={{ color: '#D4AF37', fontWeight: 'bold', fontSize: '14px', letterSpacing: '1px' }}>⏰ {startTime || '00:00'}</span>
                </div>
                <p style={{ color: '#FFF', fontSize: '15px', lineHeight: '22px', margin: '0 0 20px 0' }}>
                  {salesPitch || "No description provided. Add a sales pitch to excite your audience!"}
                </p>
                {/* NATIVE "JOIN TOURNAMENT" BUTTON */}
              <button style={{ width: '100%', padding: '18px', backgroundColor: '#44ff44', color: '#000', border: 'none', borderRadius: '30px', fontWeight: '900', fontSize: '16px', cursor: 'default', boxShadow: '0 4px 15px rgba(68,255,68,0.2)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                <span>{qrFile || bankDetails ? 'VIEW PAYMENT INFO & JOIN' : 'JOIN TOURNAMENT'} • {entryFee || '0'} {currency}</span>
              </button>
                {(prizePool.length > 0 || raffleItems.length > 0) && (
                  <div style={{ display: 'flex', gap: '10px' }}>
                    {prizePool.length > 0 && (
                      <div style={{ flex: 1, backgroundColor: 'rgba(212,175,55,0.1)', padding: '12px', borderRadius: '12px', border: '1px solid rgba(212,175,55,0.3)' }}>
                        <strong style={{ color: '#D4AF37', fontSize: '11px', display: 'block', marginBottom: '8px', letterSpacing: '1px' }}>🏆 SKILL PRIZES</strong>
                        {prizePool.map((p, i) => <div key={i} style={{ color: '#fff', fontSize: '12px', marginBottom: '4px' }}>• {p}</div>)}
                      </div>
                    )}
                    {raffleItems.length > 0 && (
                      <div style={{ flex: 1, backgroundColor: 'rgba(138,43,226,0.1)', padding: '12px', borderRadius: '12px', border: '1px solid rgba(138,43,226,0.3)' }}>
                        <strong style={{ color: '#b67aef', fontSize: '11px', display: 'block', marginBottom: '8px', letterSpacing: '1px' }}>🎁 RAFFLE POOL</strong>
                        {raffleItems.map((r, i) => <div key={i} style={{ color: '#fff', fontSize: '12px', marginBottom: '4px' }}>• {r}</div>)}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 🔥 INJECTED: VIRAL QR REFERRAL ENGINE */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px', padding: '15px', backgroundColor: 'rgba(212,175,55,0.1)', borderRadius: '16px', border: '1px solid rgba(212,175,55,0.3)', marginBottom: '20px' }}>
                <div style={{ padding: '8px', backgroundColor: '#fff', borderRadius: '8px', display: 'flex' }}>
                  <QRCode value={referralDeepLink} size={64} bgColor="#ffffff" fgColor="#000000" level="Q" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: '#D4AF37', fontSize: '12px', fontWeight: '900', marginBottom: '4px', letterSpacing: '0.5px' }}>SCAN TO REGISTER</div>
                  <div style={{ color: '#aaa', fontSize: '11px', lineHeight: '1.4' }}>New to Golfriend? Scan to download the app and secure your tee time.</div>
                </div>
              </div>

              <div style={{ color: '#aaa', fontSize: '13px', marginBottom: '20px', lineHeight: '20px' }}>
                  <div>⛳ Format: <span style={{ color: '#fff' }}>{matchFormat}</span></div>
                  <div>👥 Capacity: <span style={{ color: '#fff' }}>{maxPlayers || '144'} Players</span></div>
                  {includesDinner && <div>🍽️ Perk: <span style={{ color: '#fff' }}>Dinner Included</span></div>}
                </div>
            </div>
          </div>

          {/* MASTER LAUNCH BUTTON */}
          <button 
            onClick={confirmAndLaunch} 
            disabled={isSubmitting} 
            style={{ width: '100%', padding: '20px', marginTop: '20px', backgroundColor: '#D4AF37', color: '#000', border: 'none', borderRadius: '12px', fontWeight: '900', fontSize: '18px', cursor: isSubmitting ? 'not-allowed' : 'pointer', textTransform: 'uppercase', letterSpacing: '1px' }}
          >
            {isSubmitting ? 'LAUNCHING TO MOBILE...' : '🚀 CONFIRM & BROADCAST'}
          </button>
          
        </div>
      </div>

      {/* 🔥 THE PRIZE CALCULATOR POPUP */}
      {isCalcOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: '#111', width: '500px', padding: '30px', borderRadius: '16px', border: '1px solid #D4AF37', boxShadow: '0 10px 40px rgba(0,0,0,0.9)' }}>
            <h3 style={{ color: '#D4AF37', marginTop: 0, borderBottom: '1px solid #333', paddingBottom: '10px' }}>🧮 Prize Pool Estimator</h3>
            
            <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ color: '#888', fontSize: '12px' }}>Players</label>
                <input type="number" value={calcPlayers} onChange={e => setCalcPlayers(Number(e.target.value))} style={{ width: '100%', padding: '8px', background: '#222', color: '#fff', border: '1px solid #444', borderRadius: '4px' }} />
              </div>
              <div style={{ flex: 1.5 }}>
                <label style={{ color: '#888', fontSize: '12px' }}>Green Fee Cost (Per Pax)</label>
                <input type="number" value={calcGreenFee} onChange={e => setCalcGreenFee(Number(e.target.value))} style={{ width: '100%', padding: '8px', background: '#222', color: '#fff', border: '1px solid #444', borderRadius: '4px' }} />
              </div>
              <div style={{ flex: 1.5 }}>
                <label style={{ color: '#888', fontSize: '12px' }}>F&B Cost (Per Pax)</label>
                <input type="number" value={calcFnB} onChange={e => setCalcFnB(Number(e.target.value))} style={{ width: '100%', padding: '8px', background: '#222', color: '#fff', border: '1px solid #444', borderRadius: '4px' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ color: '#888', fontSize: '12px' }}>Organizer Margin (%)</label>
                <input type="number" value={calcCut} onChange={e => setCalcCut(Number(e.target.value))} style={{ width: '100%', padding: '8px', background: '#222', color: '#fff', border: '1px solid #444', borderRadius: '4px' }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ color: '#888', fontSize: '12px' }}>Skill Split (%)</label>
                <input type="number" value={calcSkillSplit} onChange={e => setCalcSkillSplit(Number(e.target.value))} style={{ width: '100%', padding: '8px', background: '#222', color: '#fff', border: '1px solid #444', borderRadius: '4px' }} />
              </div>
            </div>

            {/* THE MATH */}
            <div style={{ background: '#1a1a1a', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
              {(() => {
                const gross = calcPlayers * (Number(entryFee) || 0);
                const totalCosts = calcPlayers * (calcGreenFee + calcFnB);
                const netRevenue = gross - totalCosts;
                const orgTake = netRevenue > 0 ? netRevenue * (calcCut / 100) : 0;
                const totalPrize = netRevenue > 0 ? netRevenue - orgTake : 0;
                
                const skillTotal = totalPrize * (calcSkillSplit / 100);
                const raffleTotal = totalPrize - skillTotal;
                
                return (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#fff', marginBottom: '5px', fontSize: '13px' }}>
                      <span>Gross Revenue:</span> <strong>{gross.toLocaleString()}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#ff4444', marginBottom: '5px', fontSize: '13px' }}>
                      <span>Minus Hard Costs (Course/Food):</span> <strong>-{totalCosts.toLocaleString()}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#aaa', marginBottom: '15px', fontSize: '13px' }}>
                      <span>Minus Organizer Margin:</span> <strong>-{orgTake.toLocaleString()}</strong>
                    </div>
                    <hr style={{ borderColor: '#333' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#44ff44', marginTop: '10px', marginBottom: '10px', fontSize: '14px', fontWeight: 'bold' }}>
                      <span>TRUE PRIZE POOL:</span> <span>{totalPrize.toLocaleString()}</span>
                    </div>
                    
                    <div style={{ color: '#D4AF37', marginTop: '10px', fontSize: '13px' }}>1st Place (50%): <strong>{(skillTotal * 0.5).toLocaleString()}</strong></div>
                    <div style={{ color: '#D4AF37', fontSize: '13px' }}>2nd Place (30%): <strong>{(skillTotal * 0.3).toLocaleString()}</strong></div>
                    <div style={{ color: '#D4AF37', fontSize: '13px', marginBottom: '10px' }}>3rd Place (20%): <strong>{(skillTotal * 0.2).toLocaleString()}</strong></div>
                    <div style={{ color: '#b67aef', fontSize: '13px' }}>Raffle Pool: <strong>{raffleTotal.toLocaleString()}</strong></div>
                    
                    <button 
                      onClick={() => {
                        setPrizePool([`1st Place: ${currency} ${(skillTotal * 0.5).toLocaleString()}`, `2nd Place: ${currency} ${(skillTotal * 0.3).toLocaleString()}`, `3rd Place: ${currency} ${(skillTotal * 0.2).toLocaleString()}`]);
                        setRaffleItems([`Raffle Pool: ${currency} ${raffleTotal.toLocaleString()}`]);
                        setIsCalcOpen(false);
                      }}
                      style={{ width: '100%', padding: '12px', marginTop: '20px', background: '#D4AF37', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                      APPLY TO FORM
                    </button>
                  </>
                );
              })()}
            </div>
            
            <button onClick={() => setIsCalcOpen(false)} style={{ width: '100%', padding: '10px', background: 'transparent', color: '#888', border: 'none', cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}