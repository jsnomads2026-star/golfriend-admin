// ==========================================
// FILE: src/components/admin/sponsors/SponsorDashboard.tsx
// THE B2B AD HUB MVP
// ==========================================
import { useState, useEffect, useMemo } from 'react';
import { db, storage, auth } from '../../../firebaseConfig';
import { collection, addDoc, onSnapshot, doc, deleteDoc, updateDoc, serverTimestamp, query, where, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

export default function SponsorDashboard() {
  const [unifiedItems, setUnifiedItems] = useState<any[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // Mobile Preview State
  const [previewCampaign, setPreviewCampaign] = useState<any | null>(null);

  // 🔥 CONCIERGE BUILDER TOGGLE STATE
  const [showBuilder, setShowBuilder] = useState(false);

  // 🔥 DIRECTOR'S FILTER STATE
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>('ALL');
  
  // 🔥 1. MASTER LISTENER (UNIFIED INVENTORY + GOD MODE)
  useEffect(() => {
    if (!auth.currentUser) return;
    const uid = auth.currentUser.uid;
    let unsubCamps = () => {};
    let unsubTours = () => {};

    getDoc(doc(db, 'admin_users', uid)).then((adminSnap) => {
      const isDirector = adminSnap.exists() && adminSnap.data().role === 'Director'; 
      
      // Director sees all campaigns/tournaments. Partner sees only theirs.
      // Schema aligned to match the new B2B Partner Dashboard standards.
      const qCampaigns = isDirector ? query(collection(db, 'campaigns')) : query(collection(db, 'campaigns'), where('partnerUid', '==', uid));
      const qTournaments = isDirector ? query(collection(db, 'tournaments')) : query(collection(db, 'tournaments'), where('hostUid', '==', uid));

      let campaignsData: any[] = [];
      let tournamentsData: any[] = [];

      const getMs = (dateVal: any) => {
        if (!dateVal) return 0;
        if (typeof dateVal.toMillis === 'function') return dateVal.toMillis();
        if (typeof dateVal.seconds === 'number') return dateVal.seconds * 1000;
        const parsed = new Date(dateVal).getTime();
        return isNaN(parsed) ? 0 : parsed;
      };

      const mergeAndSort = (camps: any[], tours: any[]) => {
        const merged = [...camps, ...tours];
        merged.sort((a, b) => getMs(b.createdAt) - getMs(a.createdAt));
        setUnifiedItems(merged);
      };

      unsubCamps = onSnapshot(qCampaigns, (snapshot) => {
        campaignsData = snapshot.docs.map(doc => ({ id: doc.id, itemType: 'ad', ...doc.data() }));
        mergeAndSort(campaignsData, tournamentsData);
      });

      unsubTours = onSnapshot(qTournaments, (snapshot) => {
        tournamentsData = snapshot.docs.map(doc => ({ id: doc.id, itemType: 'tournament', ...doc.data() }));
        mergeAndSort(campaignsData, tournamentsData);
      });
    });

    return () => {
      unsubCamps();
      unsubTours();
    };
  }, []);

  // 🔥 DIRECTOR'S ANALYTICS & FILTER ENGINE
  const uniquePartners = useMemo(() => {
    const partners = new Map();
    unifiedItems.forEach(item => {
      if (item.partnerUid) partners.set(item.partnerUid, item.sponsorName || item.partnerUid);
      else if (item.hostUid) partners.set(item.hostUid, item.hostUid);
    });
    return Array.from(partners.entries());
  }, [unifiedItems]);

  const filteredItems = useMemo(() => {
    if (selectedPartnerId === 'ALL') return unifiedItems;
    return unifiedItems.filter(item => item.partnerUid === selectedPartnerId || item.hostUid === selectedPartnerId);
  }, [unifiedItems, selectedPartnerId]);

  const platformStats = useMemo(() => {
    const activeBroadcasts = filteredItems.filter(item => item.status === 'active' || item.status === 'registration_open').length;
    const totalImpressions = filteredItems.reduce((sum, item) => sum + (item.impressions || 0), 0);
    const totalClicks = filteredItems.reduce((sum, item) => sum + (item.clicks || 0), 0);
    const avgCtr = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(1) : '0.0';
    return { activeBroadcasts, totalImpressions, avgCtr };
  }, [filteredItems]);

  // 🔥 UNIFIED ACTIONS (ADS & TOURNAMENTS)
  const handleToggleStatus = async (id: string, currentStatus: string, itemType: 'ad' | 'tournament') => {
    const targetCollection = itemType === 'ad' ? 'campaigns' : 'tournaments';
    const newStatus = currentStatus === 'active' || currentStatus === 'registration_open' ? 'paused' : (itemType === 'tournament' ? 'registration_open' : 'active');
    try {
      await updateDoc(doc(db, targetCollection, id), { status: newStatus, updatedAt: serverTimestamp() });
    } catch (error) {
      console.error("Status update error:", error);
      alert("Failed to update execution status.");
    }
  };

  const handleUnifiedDelete = async (id: string, itemType: 'ad' | 'tournament') => {
    if (!window.confirm(`Are you sure you want to delete this ${itemType}? This cannot be undone.`)) return;
    const targetCollection = itemType === 'ad' ? 'campaigns' : 'tournaments';
    try {
      await deleteDoc(doc(db, targetCollection, id));
    } catch (error) {
      console.error("Delete error:", error);
      alert("Failed to delete selected asset.");
    }
  };

  // Temporary elevation script removed.

  // CRM State (Internal)
  const [sponsorName, setSponsorName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactAddress, setContactAddress] = useState("");

  // Ad State (Public Gallery)
  const [adHeadline, setAdHeadline] = useState("");
  const [adDescription, setAdDescription] = useState(""); // 🔥 The Sales Pitch
  const [buttonText, setButtonText] = useState("");       // 🔥 Custom CTA
  const [campaignType, setCampaignType] = useState("brand_commercial");
  const [destinationUrl, setDestinationUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  
  // 🔥 Course Promo Specific State
  const [courseLocation, setCourseLocation] = useState("");
  const [weekdayRate, setWeekdayRate] = useState("");
  const [weekendRate, setWeekendRate] = useState("");
  const [promoRate, setPromoRate] = useState("");
  const [promoName, setPromoName] = useState("");
  const [validPeriod, setValidPeriod] = useState("");
  const [twilightRate, setTwilightRate] = useState("");
  const [courseName, setCourseName] = useState("");
  const [bookingPhone, setBookingPhone] = useState("");

  // (Duplicate sync listener removed to prevent redundant database reads)

  // 🔥 2. LAUNCH NEW CAMPAIGN (WITH FILE UPLOAD)
  const handleLaunchCampaign = async () => {
    if (!sponsorName || !contactName || !adHeadline || !imageFile) {
      alert("Please complete all required fields and select an image file.");
      return;
    }
    
    setIsProcessing(true);
    try {
      // 1. Upload Image to Storage Bucket
      const imageRef = ref(storage, `sponsor_campaigns/${Date.now()}_${imageFile.name}`);
      const uploadResult = await uploadBytes(imageRef, imageFile);
      const publicImageUrl = await getDownloadURL(uploadResult.ref);

      // 2. Save Combined CRM & Ad Data to Firestore
      await addDoc(collection(db, 'campaigns'), {
        // CRM Data (Hidden from mobile)
        partnerUid: auth.currentUser?.uid || 'UNKNOWN_PARTNER', // 🔥 ALIGNED WITH PARTNER SCHEMA
        sponsorName,
        contactName,
        contactPhone,
        contactAddress,
        // Public Ad Data (Broadcast to mobile)
        adHeadline,
        adDescription, 
        buttonText: buttonText || (campaignType === 'course_promo' ? 'BOOK TEE TIME' : 'CLAIM OFFER'), 
        campaignType,
        imageUrl: publicImageUrl,
        destinationUrl,
        
        // 🔥 MOBILE FEED FLAGS (CRITICAL FOR DISCOVERY FEED VISIBILITY)
        tag: 'SPONSOR',
        isSponsorAd: true,
        isBroadcast: true,
        media_type: 'image',
        media_url: publicImageUrl, // Mobile expects media_url instead of imageUrl
        photo_url: publicImageUrl, // Mobile avatar fallback
        authorNickname: sponsorName || 'Enterprise Partner',
        
        // 🔥 Course & Tournament Specific Data
        courseLocation: (campaignType === 'course_promo' || campaignType === 'tournament_promo') ? courseLocation : null,
        weekdayRate: campaignType === 'course_promo' ? weekdayRate : null,
        weekendRate: campaignType === 'course_promo' ? weekendRate : null,
        promoRate: (campaignType === 'course_promo' || campaignType === 'tournament_promo') ? promoRate : null,
        promoName: (campaignType === 'course_promo' || campaignType === 'tournament_promo') ? promoName : null,
        validPeriod: (campaignType === 'course_promo' || campaignType === 'tournament_promo') ? validPeriod : null,
        twilightRate: campaignType === 'course_promo' ? twilightRate : null,
        courseName: (campaignType === 'course_promo' || campaignType === 'tournament_promo') ? courseName : null,
        bookingPhone: (campaignType === 'course_promo' || campaignType === 'tournament_promo') ? bookingPhone : null,
        status: 'active', // 🔥 Changed from 'draft' to 'active' so it goes live instantly
        clicks: 0,
        impressions: 0,
        createdAt: serverTimestamp()
      });

      alert("✅ Campaign Launched! The physical file is hosted and the ad is broadcasting.");
      setSponsorName(""); setContactName(""); setContactPhone(""); setContactAddress("");
      setAdHeadline(""); setDestinationUrl(""); setImageFile(null);
    } catch (error: any) {
      alert("Launch Error: " + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // 🔥 3. KILL CAMPAIGN
  
  return (
    <div style={{ padding: '24px', backgroundColor: '#121212', minHeight: '100vh', color: '#fff', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #333', paddingBottom: '12px', marginBottom: '24px' }}>
        <div>
          <h2 style={{ color: '#D4AF37', margin: '0 0 8px 0' }}>📢 COMMERCIAL AD HUB (DIRECTOR)</h2>
          <p style={{ color: '#aaa', fontSize: '14px', margin: 0 }}>Manage B2B sponsor campaigns, digital real estate, and targeted mobile broadcasts.</p>
        </div>
        {/* 🔥 THE DIRECTOR'S FILTER */}
        <select 
          value={selectedPartnerId} 
          onChange={(e) => setSelectedPartnerId(e.target.value)}
          style={{ padding: '10px 16px', backgroundColor: '#1e1e1e', color: '#D4AF37', border: '1px solid #D4AF37', borderRadius: '8px', fontWeight: 'bold', outline: 'none', cursor: 'pointer' }}
        >
          <option value="ALL">🌐 ALL PLATFORM PARTNERS</option>
          {uniquePartners.map(([uid, name]) => (
            <option key={uid} value={uid}>Partner: {name}</option>
          ))}
        </select>
      </div>

      {/* 🔥 STATE-DRIVEN ANALYTICS ROW */}
      <div style={{ display: 'flex', gap: '20px', marginBottom: '30px' }}>
        <div style={{ flex: 1, backgroundColor: '#1e1e1e', padding: '20px', borderRadius: '8px', border: '1px solid #333' }}>
          <div style={{ color: '#888', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '8px' }}>Active Broadcasts</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ color: '#4CAF50', fontSize: '28px', fontWeight: '900' }}>{platformStats.activeBroadcasts}</span>
            <span style={{ color: '#555', fontSize: '14px' }}>{selectedPartnerId === 'ALL' ? 'platform wide' : 'partner active'}</span>
          </div>
        </div>
        <div style={{ flex: 1, backgroundColor: '#1e1e1e', padding: '20px', borderRadius: '8px', border: '1px solid #333' }}>
          <div style={{ color: '#888', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '8px' }}>Total Impressions</div>
          <div style={{ color: '#fff', fontSize: '28px', fontWeight: '900' }}>{platformStats.totalImpressions.toLocaleString()}</div>
          <div style={{ color: '#555', fontSize: '11px', marginTop: '4px' }}>{selectedPartnerId === 'ALL' ? 'Global platform reach' : 'Targeted audience reach'}</div>
        </div>
        <div style={{ flex: 1, backgroundColor: '#1e1e1e', padding: '20px', borderRadius: '8px', border: '1px solid #333' }}>
          <div style={{ color: '#888', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '8px' }}>Avg. Click-Through</div>
          <div style={{ color: '#fff', fontSize: '28px', fontWeight: '900' }}>{platformStats.avgCtr}%</div>
          <div style={{ color: '#555', fontSize: '11px', marginTop: '4px' }}>Audience engagement rate</div>
        </div>
      </div>

      {/* ========================================== */}
      {/* SECTION 1: MASTER MARKETING INVENTORY (UNIFIED AUDIT LEDGER) */}
      {/* ========================================== */}
      <div style={{ marginBottom: '40px', backgroundColor: '#111', padding: '24px', borderRadius: '8px', border: '1px solid #333' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0, color: '#fff', fontSize: '16px' }}>Master Marketing Inventory</h3>
          <span style={{ color: '#666', fontSize: '12px' }}>Unified broadcast management for Ads & Tournaments</span>
        </div>
        
        {unifiedItems.length === 0 ? (
          <p style={{ color: '#888' }}>No campaigns or tournaments found.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', padding: '10px 15px', color: '#888', fontSize: '12px', borderBottom: '1px solid #333', fontWeight: 'bold' }}>
              <div style={{ flex: 2 }}>MARKETING BROADCAST</div>
              <div style={{ flex: 1 }}>LOCATION</div>
              <div style={{ flex: 1, textAlign: 'center' }}>TYPE</div>
              <div style={{ flex: 1, textAlign: 'center' }}>STATUS</div>
            <div style={{ flex: 1, textAlign: 'center' }}>PUBLISHER & STATS</div>
            <div style={{ flex: 1, textAlign: 'right' }}>ACTIONS</div>
          </div>
          {filteredItems.map((item) => {
              const isTournament = item.itemType === 'tournament';
              const displayTitle = isTournament ? item.name : (item.adHeadline || item.headline);
              const displaySub = isTournament ? '⛳ Tournament Announcement' : item.sponsorName;
              const displayStatus = item.status === 'active' || item.status === 'registration_open' ? 'active' : (item.status === 'draft' ? 'draft' : 'paused');
              const displayLoc = item.courseLocation || item.location || 'Platform Wide';

              return (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', padding: '15px', backgroundColor: '#1a1a1a', borderRadius: '6px', border: '1px solid #222' }}>
                  <div style={{ flex: 2, display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <div style={{ width: '60px', height: '40px', backgroundColor: '#222', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: '1px solid #333' }}>
                      {item.imageUrl || item.previewMediaUrl ? (
                        <img src={item.imageUrl || item.previewMediaUrl} alt="media" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : <span style={{ fontSize: '16px' }}>{isTournament ? '🏆' : '📢'}</span>}
                    </div>
                    <div>
                      <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '14px' }}>{displayTitle || 'Untitled'}</div>
                      <div style={{ color: '#aaa', fontSize: '12px' }}>{displaySub}</div>
                    </div>
                  </div>
                  <div style={{ flex: 1, color: '#888', fontSize: '13px' }}>{displayLoc}</div>
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <span style={{ fontSize: '11px', fontWeight: 'bold', color: isTournament ? '#8A2BE2' : '#1E88E5', letterSpacing: '0.5px' }}>
                      {item.itemType.toUpperCase()}
                    </span>
                  </div>
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', backgroundColor: displayStatus === 'active' ? 'rgba(76, 175, 80, 0.1)' : 'rgba(255, 193, 7, 0.1)', color: displayStatus === 'active' ? '#4CAF50' : '#FFC107', textTransform: 'uppercase' }}>
                      {displayStatus}
                    </span>
                  </div>
                  <div style={{ flex: 1, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ color: '#D4AF37', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px' }}>{item.sponsorName || item.hostUid?.substring(0,8) || 'ADMIN'}</span>
                    <span style={{ color: '#888', fontSize: '10px' }}>👁 {item.impressions || 0} | 🎯 {item.clicks || 0}</span>
                  </div>
                  <div style={{ flex: 1, textAlign: 'right' }}>
                     {!isTournament && <button onClick={() => setPreviewCampaign(item)} style={{ background: 'transparent', border: 'none', color: '#2196F3', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>[Preview]</button>}
                     <button onClick={() => handleToggleStatus(item.id, item.status, item.itemType)} style={{ background: 'transparent', border: 'none', color: displayStatus === 'active' ? '#FFC107' : '#4CAF50', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', marginLeft: '10px' }}>
                       [{displayStatus === 'active' ? 'Pause' : 'Publish'}]
                     </button>
                     <button onClick={() => handleUnifiedDelete(item.id, item.itemType)} style={{ background: 'transparent', border: 'none', color: '#ff4444', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', marginLeft: '10px' }}>[Delete]</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ========================================== */}
      {/* CONCIERGE CAMPAIGN BUILDER TOGGLE */}
      {/* ========================================== */}
      <div style={{ textAlign: 'center', marginBottom: showBuilder ? '24px' : '40px' }}>
        <button 
          onClick={() => setShowBuilder(!showBuilder)}
          style={{ backgroundColor: showBuilder ? '#333' : '#2196F3', color: '#fff', padding: '14px 28px', borderRadius: '24px', border: 'none', fontWeight: '900', cursor: 'pointer', fontSize: '13px', letterSpacing: '1px', boxShadow: showBuilder ? 'none' : '0 4px 12px rgba(33, 150, 243, 0.3)' }}
        >
          {showBuilder ? '✕ CLOSE CONCIERGE BUILDER' : '+ LAUNCH CONCIERGE CAMPAIGN'}
        </button>
      </div>

      {/* ========================================== */}
      {/* SECTION 2: CONCIERGE LAUNCHPAD (HIDDEN BY DEFAULT) */}
      {/* ========================================== */}
      {showBuilder && (
        <div style={{ display: 'flex', gap: '40px', alignItems: 'flex-start', flexWrap: 'wrap', paddingBottom: '40px', borderBottom: '1px solid #333' }}>
          
          {/* LEFT COLUMN: THE INPUT FORM */}
          <div style={{ flex: '1 1 500px', maxWidth: '700px', backgroundColor: '#1e1e1e', padding: '24px', borderRadius: '8px', border: '1px solid #333' }}>
            <h3 style={{ color: '#D4AF37', marginTop: 0, marginBottom: '15px', fontSize: '16px' }}>1. Internal CRM (Hidden from App)</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '30px' }}>
              <input type="text" placeholder="Sponsor / Entity Name *" value={sponsorName} onChange={(e) => setSponsorName(e.target.value)} style={styles.input} />
              <input type="text" placeholder="Contact Person *" value={contactName} onChange={(e) => setContactName(e.target.value)} style={styles.input} />
              <input type="text" placeholder="Contact Phone" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} style={styles.input} />
              <input type="text" placeholder="Billing Address" value={contactAddress} onChange={(e) => setContactAddress(e.target.value)} style={styles.input} />
            </div>

            <h3 style={{ color: '#D4AF37', marginTop: 0, marginBottom: '15px', fontSize: '16px' }}>2. Public Gallery Ad (Broadcast to Players)</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <select value={campaignType} onChange={(e) => setCampaignType(e.target.value)} style={styles.input}>
                <option value="brand_commercial">Ad Type: Brand Commercial (Retail/Gear)</option>
                <option value="course_promo">Ad Type: Golf Course Promo (Tee Times)</option>
                <option value="tournament_promo">Ad Type: Tournament Promo (Event Engine)</option>
              </select>
              <input type="text" placeholder="Ad Headline (e.g., 20% Off Pro V1s Today!) *" value={adHeadline} onChange={(e) => setAdHeadline(e.target.value)} style={styles.input} />
              
              <div style={{ position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '8px' }}>
                  <label style={{ fontSize: '12px', color: '#888' }}>Sales Pitch / Ad Copy</label>
                  <button type="button" onClick={() => alert('AI Suggester Engine connecting...')} style={{ backgroundColor: '#2196F3', color: '#fff', border: 'none', borderRadius: '4px', padding: '4px 8px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}>✨ AI SUGGESTION</button>
                </div>
                <textarea placeholder="Write a compelling description to attract players..." value={adDescription} onChange={(e) => setAdDescription(e.target.value)} style={{...styles.input, minHeight: '80px', resize: 'vertical', fontFamily: 'sans-serif'}} />
              </div>
              
              {(campaignType === 'course_promo' || campaignType === 'tournament_promo') && (
                <div style={{ backgroundColor: '#111', padding: '16px', borderRadius: '8px', border: '1px solid #333', marginTop: '15px', marginBottom: '15px' }}>
                  <h4 style={{ color: '#D4AF37', margin: '0 0 12px 0', fontSize: '13px', textTransform: 'uppercase' }}>{campaignType === 'course_promo' ? 'Course Details' : 'Tournament Details'}</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                    <input type="text" placeholder="Course Name" value={courseName} onChange={(e) => setCourseName(e.target.value)} style={styles.input} />
                    <input type="text" placeholder="Contact Phone" value={bookingPhone} onChange={(e) => setBookingPhone(e.target.value)} style={styles.input} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                    <input type="text" placeholder="Location" value={courseLocation} onChange={(e) => setCourseLocation(e.target.value)} style={styles.input} />
                    <input type="text" placeholder="Valid Period" value={validPeriod} onChange={(e) => setValidPeriod(e.target.value)} style={styles.input} />
                  </div>
                  {campaignType === 'course_promo' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                      <input type="text" placeholder="Weekday" value={weekdayRate} onChange={(e) => setWeekdayRate(e.target.value)} style={styles.input} />
                      <input type="text" placeholder="Weekend" value={weekendRate} onChange={(e) => setWeekendRate(e.target.value)} style={styles.input} />
                      <input type="text" placeholder="Twilight" value={twilightRate} onChange={(e) => setTwilightRate(e.target.value)} style={styles.input} />
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px' }}>
                    <input type="text" placeholder="Promo/Tournament Name" value={promoName} onChange={(e) => setPromoName(e.target.value)} style={styles.input} />
                    <input type="text" placeholder="Rate/Fee" value={promoRate} onChange={(e) => setPromoRate(e.target.value)} style={styles.input} />
                  </div>
                </div>
              )}
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <input type="text" placeholder="Button CTA" value={buttonText} onChange={(e) => setButtonText(e.target.value)} style={styles.input} />
                <input type="text" placeholder="Destination URL" value={destinationUrl} onChange={(e) => setDestinationUrl(e.target.value)} style={styles.input} />
              </div>
              
              <div style={{ border: '1px dashed #555', padding: '16px', borderRadius: '4px', backgroundColor: '#111' }}>
                <label style={{ display: 'block', marginBottom: '8px', color: '#888', fontSize: '14px' }}>Upload Ad Creative *</label>
                <input type="file" accept="image/*" onChange={(e) => { if(e.target.files) setImageFile(e.target.files[0]) }} style={{ color: '#fff' }} />
              </div>
              <button onClick={handleLaunchCampaign} disabled={isProcessing} style={{...styles.btnPrimary, opacity: isProcessing ? 0.7 : 1, marginTop: '20px'}}>
                {isProcessing ? 'PUBLISHING...' : 'PUBLISH CAMPAIGN ➔'}
              </button>
            </div>
          </div>

          {/* RIGHT COLUMN: PREMIUM MOBILE SIMULATOR */}
          <div style={{ flex: '0 0 320px', margin: '0 auto', backgroundColor: '#0f0f0f', borderRadius: '36px', border: '8px solid #1a1a1a', overflow: 'hidden', position: 'relative', boxShadow: '0px 20px 40px rgba(0,0,0,0.8)' }}>
            <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: '120px', height: '24px', backgroundColor: '#1a1a1a', borderBottomLeftRadius: '16px', borderBottomRightRadius: '16px', zIndex: 10 }}></div>
            
            <div style={{ height: '350px', position: 'relative', background: 'linear-gradient(180deg, #1A2980 0%, #26D0CE 100%)' }}>
              <img src={imageFile ? URL.createObjectURL(imageFile) : ""} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: imageFile ? 1 : 0 }} />
              {!imageFile && ( <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: '#fff', fontWeight: 'bold', fontSize: '20px', textAlign: 'center', width: '100%' }}>Ad Headline</div> )}
            </div>
            
            <div style={{ padding: '24px', backgroundColor: '#111' }}>
              <div style={{ display: 'inline-block', backgroundColor: 'rgba(255,255,255,0.1)', padding: '4px 10px', borderRadius: '12px', color: '#fff', fontSize: '10px', fontWeight: 'bold', marginBottom: '12px' }}>
                {campaignType === 'course_promo' ? '★ SPONSORED COURSE' : campaignType === 'tournament_promo' ? '🏆 UPCOMING TOURNAMENT' : '★ SPONSORED PARTNER'}
              </div>
              <h2 style={{ color: '#fff', fontSize: '18px', margin: '0 0 8px 0', lineHeight: '1.2' }}>{adHeadline || "Your Headline Here"}</h2>
              
              <div style={{ display: 'flex', gap: '10px', color: '#aaa', fontSize: '11px', marginBottom: '12px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>📅 Limited Time Offer</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#D4AF37' }}>📢 Broadcast</span>
              </div>
              <p style={{ color: '#888', fontSize: '12px', margin: '0 0 8px 0' }}>{sponsorName || "Sponsor Name"}</p>
              <p style={{ color: '#ccc', fontSize: '13px', margin: '0 0 24px 0', lineHeight: '1.4', minHeight: '40px' }}>{adDescription || "No description provided."}</p>
              <button style={{ width: '100%', padding: '14px', backgroundColor: '#4CAF50', color: '#fff', border: 'none', borderRadius: '24px', fontWeight: 'bold', fontSize: '14px', cursor: 'default' }}>
                {buttonText || (campaignType === 'course_promo' ? 'BOOK A TEE TIME' : 'CLAIM OFFER')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* SECTION 3: PREMIUM CAMPAIGN PREVIEW MODAL */}
      {/* ========================================== */}
      {previewCampaign && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}>
          
          <button onClick={() => setPreviewCampaign(null)} style={{ position: 'absolute', top: '24px', right: '32px', backgroundColor: 'transparent', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '24px', fontWeight: 'bold' }}>✕</button>

          <div style={{ width: '100%', maxWidth: '320px', backgroundColor: '#0f0f0f', borderRadius: '36px', border: '8px solid #1a1a1a', overflow: 'hidden', position: 'relative', boxShadow: '0px 20px 40px rgba(0,0,0,0.8)' }}>
            <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: '120px', height: '24px', backgroundColor: '#1a1a1a', borderBottomLeftRadius: '16px', borderBottomRightRadius: '16px', zIndex: 10 }}></div>
            
            <div style={{ height: '350px', position: 'relative', background: 'linear-gradient(180deg, #1A2980 0%, #26D0CE 100%)' }}>
              <img src={previewCampaign.imageUrl || previewCampaign.previewMediaUrl} alt="Ad Creative" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            
            <div style={{ padding: '24px', backgroundColor: '#111' }}>
              <div style={{ display: 'inline-block', backgroundColor: 'rgba(255,255,255,0.1)', padding: '4px 10px', borderRadius: '12px', color: '#fff', fontSize: '10px', fontWeight: 'bold', marginBottom: '12px' }}>
                {previewCampaign.campaignType === 'course_promo' ? '★ SPONSORED COURSE' : previewCampaign.itemType === 'tournament' ? '🏆 TOURNAMENT' : '★ SPONSORED PARTNER'}
              </div>
              <h2 style={{ color: '#fff', fontSize: '18px', margin: '0 0 8px 0', lineHeight: '1.2' }}>
                {previewCampaign.adHeadline || previewCampaign.name || previewCampaign.title}
              </h2>
              <div style={{ display: 'flex', gap: '10px', color: '#aaa', fontSize: '11px', marginBottom: '12px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>📅 Limited Time Offer</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#D4AF37' }}>📢 Broadcast</span>
              </div>
              <p style={{ color: '#888', fontSize: '12px', margin: '0 0 8px 0' }}>{previewCampaign.sponsorName || previewCampaign.hostUid?.substring(0,8) || "Sponsor"}</p>
              <p style={{ color: '#ccc', fontSize: '13px', margin: '0 0 24px 0', lineHeight: '1.4', minHeight: '40px' }}>
                {previewCampaign.adDescription || previewCampaign.description || "No description provided."}
              </p>
              <button style={{ width: '100%', padding: '14px', backgroundColor: '#4CAF50', color: '#fff', border: 'none', borderRadius: '24px', fontWeight: 'bold', fontSize: '14px', cursor: 'default' }}>
                {previewCampaign.buttonText || (previewCampaign.campaignType === 'course_promo' ? 'BOOK A TEE TIME' : previewCampaign.itemType === 'tournament' ? 'JOIN TOURNAMENT' : 'CLAIM OFFER')}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

const styles = {
  input: { padding: '12px', borderRadius: '4px', border: '1px solid #444', backgroundColor: '#111', color: '#fff', width: '100%', boxSizing: 'border-box' as const, fontSize: '14px' },
  btnPrimary: { padding: '16px', backgroundColor: '#D4AF37', color: '#000', fontWeight: '900', border: 'none', borderRadius: '4px', marginTop: '10px', fontSize: '14px', letterSpacing: '1px', cursor: 'pointer' }
};