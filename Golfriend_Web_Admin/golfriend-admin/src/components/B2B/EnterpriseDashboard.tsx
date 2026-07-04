// ==========================================
// FILE: src/components/B2B/HostDashboard599.tsx
// ==========================================
import { useState, useEffect, useRef } from 'react';
import { getAuth, signOut } from 'firebase/auth';
import { collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, onSnapshot, query, where } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../../firebaseConfig';

import TournamentManager from '../admin/TournamentManager';
import TournamentTV from '../admin/TournamentTV';
import RaffleEngine from '../admin/RaffleEngine';
import EventGenesisConsole from '../admin/EventGenesisConsole';
import AdLeadsInbox from './AdLeadsInbox'; 

const MasterInventory = ({ onLaunchClick, onEditClick, isLimitReached, partnerUid }: { onLaunchClick: () => void, onEditClick: (item: any) => void, isLimitReached: boolean, partnerUid: string }) => {
  const [unifiedItems, setUnifiedItems] = useState<any[]>([]);

  useEffect(() => {
    if (!partnerUid || partnerUid === "UNKNOWN_USER") return;

    // Stream both campaigns and tournaments hosted by this partner
    const qCampaigns = query(collection(db, 'campaigns'), where('partnerUid', '==', partnerUid));
    const qTournaments = query(collection(db, 'tournaments'), where('hostUid', '==', partnerUid));

    let campaignsData: any[] = [];
    let tournamentsData: any[] = [];

    const mergeAndSort = (camps: any[], tours: any[]) => {
  const merged = [...camps, ...tours];
  
  // Helper to safely extract milliseconds regardless of data type
  const getMs = (dateVal: any) => {
    if (!dateVal) return 0;
    if (typeof dateVal.toMillis === 'function') return dateVal.toMillis();
    if (typeof dateVal.seconds === 'number') return dateVal.seconds * 1000;
    const parsed = new Date(dateVal).getTime();
    return isNaN(parsed) ? 0 : parsed;
  };

  merged.sort((a, b) => getMs(b.createdAt) - getMs(a.createdAt));
  setUnifiedItems(merged);
};

    const unsubCampaigns = onSnapshot(qCampaigns, (snapshot) => {
      campaignsData = snapshot.docs.map(doc => ({ id: doc.id, itemType: 'ad', ...doc.data() }));
      mergeAndSort(campaignsData, tournamentsData);
    });

    const unsubTournaments = onSnapshot(qTournaments, (snapshot) => {
      tournamentsData = snapshot.docs.map(doc => ({ id: doc.id, itemType: 'tournament', ...doc.data() }));
      mergeAndSort(campaignsData, tournamentsData);
    });

    return () => {
      unsubCampaigns();
      unsubTournaments();
    };
  }, [partnerUid]);

  const handleToggleStatus = async (id: string, currentStatus: string, itemType: 'ad' | 'tournament') => {
    const targetCollection = itemType === 'ad' ? 'campaigns' : 'tournaments';
    const newStatus = currentStatus === 'active' || currentStatus === 'registration_open' ? 'paused' : (itemType === 'tournament' ? 'registration_open' : 'active');
    try {
      await updateDoc(doc(db, targetCollection, id), {
        status: newStatus,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error("Status update error:", error);
      alert("Failed to update execution status.");
    }
  };

  const handleDelete = async (id: string, itemType: 'ad' | 'tournament', imageUrl?: string) => {
    if (!window.confirm(`Are you sure you want to delete this ${itemType}? This cannot be undone.`)) return;
    const targetCollection = itemType === 'ad' ? 'campaigns' : 'tournaments';
    try {
      await deleteDoc(doc(db, targetCollection, id));
      if (imageUrl && imageUrl.startsWith('http')) {
        const imageRef = ref(storage, imageUrl);
        await deleteObject(imageRef).catch(e => console.log("Storage cleanup skipped:", e.message));
      }
    } catch (error) {
      console.error("Delete error:", error);
      alert("Failed to delete selected asset.");
    }
  };

  return (
    <div style={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '8px', padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h3 style={{ margin: 0, color: '#fff', fontSize: '16px' }}>Master Marketing Inventory</h3>
        <span style={{ color: '#666', fontSize: '12px' }}>Unified broadcast management for Ads & Tournaments</span>
      </div>
      
      {unifiedItems.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', border: '1px dashed #333', borderRadius: '6px', backgroundColor: '#0a0a0a' }}>
          <div style={{ fontSize: '32px', marginBottom: '10px' }}>📦</div>
          <div style={{ color: '#aaa', fontSize: '14px', marginBottom: '15px' }}>Your unified marketing ledger is completely empty.</div>
          <button onClick={onLaunchClick} disabled={isLimitReached} style={{ backgroundColor: 'transparent', color: '#d4af37', border: '1px solid #d4af37', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
            Build First Asset
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', padding: '10px 15px', color: '#888', fontSize: '12px', borderBottom: '1px solid #333', fontWeight: 'bold' }}>
            <div style={{ flex: 2 }}>MARKETING BROADCAST</div>
            <div style={{ flex: 1 }}>LOCATION</div>
            <div style={{ flex: 1, textAlign: 'center' }}>TYPE</div>
            <div style={{ flex: 1, textAlign: 'center' }}>STATUS</div>
            <div style={{ flex: 1, textAlign: 'right' }}>ACTIONS</div>
          </div>
          {unifiedItems.map((item) => {
            const isTournament = item.itemType === 'tournament';
            const displayTitle = isTournament ? item.name : item.headline;
            const displaySub = isTournament ? '⛳ Tournament Announcement' : item.sponsorName;
            const displayStatus = item.status === 'active' || item.status === 'registration_open' ? 'active' : 'paused';

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
                <div style={{ flex: 1, color: '#888', fontSize: '13px' }}>{item.location || 'Pattaya'}</div>
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
                <div style={{ flex: 1, textAlign: 'right' }}>
                   <button onClick={() => handleToggleStatus(item.id, item.status, item.itemType)} style={{ background: 'transparent', border: 'none', color: displayStatus === 'active' ? '#FFC107' : '#4CAF50', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                     [{displayStatus === 'active' ? 'Pause' : 'Publish'}]
                   </button>
                   {/* Edit disabled for tournaments temporarily until dual-modal forms are unified */}
                   {!isTournament && <button onClick={() => onEditClick(item)} style={{ background: 'transparent', border: 'none', color: '#1E88E5', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', marginLeft: '10px' }}>[Edit]</button>}
                   <button onClick={() => handleDelete(item.id, item.itemType, item.imageUrl)} style={{ background: 'transparent', border: 'none', color: '#ff4444', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', marginLeft: '10px' }}>[Delete]</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const AdHub = ({ isMasterHost, partnerUid }: { isMasterHost: boolean, partnerUid: string }) => {
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [headline, setHeadline] = useState("");
  const [sponsorName, setSponsorName] = useState("");
  const [location, setLocation] = useState(""); 
  const [salesPitch, setSalesPitch] = useState("");
  const [ctaText, setCtaText] = useState("");
  const [destinationUrl, setDestinationUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const maxCampaigns = isMasterHost ? 5 : 3;
  const [activeAdsCount, setActiveAdsCount] = useState(0); 
  
  useEffect(() => {
    if (!partnerUid || partnerUid === "UNKNOWN_USER") return;
    
    // Explicitly counts only documents in the campaign (Ad) collection to protect unlimited tournaments
    const q = query(collection(db, 'campaigns'), where('partnerUid', '==', partnerUid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setActiveAdsCount(snapshot.size); 
    });
    return () => unsubscribe();
  }, [partnerUid]);

  const isLimitReached = activeAdsCount >= maxCampaigns;

  const openBuilderForEdit = (camp: any) => {
    setEditingId(camp.id);
    setHeadline(camp.headline || "");
    setSponsorName(camp.sponsorName || "");
    setLocation(camp.location || "");
    setSalesPitch(camp.salesPitch || "");
    setCtaText(camp.ctaText || "");
    setDestinationUrl(camp.destinationUrl || "");
    setImagePreview(camp.imageUrl || null);
    setImageFile(null); 
    setShowBuilder(true);
  };

  const resetAndOpenBuilder = () => {
    setEditingId(null);
    setHeadline("");
    setSponsorName("");
    setLocation("");
    setSalesPitch("");
    setCtaText("");
    setDestinationUrl("");
    setImagePreview(null);
    setImageFile(null);
    setShowBuilder(true);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleSave = async (targetStatus: 'draft' | 'active') => {
    if (!headline || !sponsorName || (!imageFile && !imagePreview)) {
      alert("❌ Please provide a Sponsor Name, Headline, and Image.");
      return;
    }
    if (!partnerUid || partnerUid === "UNKNOWN_USER") {
      alert("❌ Authentication error: Missing Partner UID.");
      return;
    }

    setIsSaving(true);
    try {
      let finalImageUrl = imagePreview; 

      if (imageFile) {
        const storageRef = ref(storage, `sponsor_campaigns/${Date.now()}_${imageFile.name}`);
        await uploadBytes(storageRef, imageFile);
        finalImageUrl = await getDownloadURL(storageRef);
      }

      const payload = {
        partnerUid, 
        sponsorName: sponsorName || "",
        headline: headline || "",
        location: location || "",
        salesPitch: salesPitch || "",
        ctaText: ctaText || "CLAIM OFFER",
        destinationUrl: destinationUrl || "",
        imageUrl: finalImageUrl || "",
        status: targetStatus,
        updatedAt: serverTimestamp()
      };

      if (editingId) {
        await updateDoc(doc(db, "campaigns", editingId), payload);
        alert("✅ Campaign updated successfully!");
      } else {
        await addDoc(collection(db, "campaigns"), { ...payload, createdAt: serverTimestamp() });
        alert("✅ Campaign successfully saved to drafts!");
      }
      
      setShowBuilder(false);
    } catch (error: any) {
      console.error("Upload Error:", error);
      alert(`❌ Failed to save campaign: ${error.message || "Unknown error"}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAiSuggest = async () => {
    if (!headline || !sponsorName) return alert("❌ Please provide a Sponsor Name and Headline first.");
    setIsGenerating(true);
    setTimeout(() => {
      setSalesPitch(`Don't miss out on ${headline}! Join ${sponsorName} today and elevate your game with exclusive member benefits.`);
      setIsGenerating(false);
    }, 1500);
  };

  return (
    <div style={{ padding: '20px', color: '#fff', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <div>
          <h2 style={{ color: '#d4af37', margin: 0, letterSpacing: '1px' }}>Sponsor Ad Hub</h2>
          <p style={{ color: '#888', fontSize: '14px', marginTop: '5px' }}>Manage B2B sponsor campaigns, digital real estate, and targeted mobile broadcasts.</p>
        </div>
        <button 
          onClick={resetAndOpenBuilder} 
          disabled={isLimitReached}
          style={{ backgroundColor: isLimitReached ? '#333' : '#d4af37', color: isLimitReached ? '#888' : '#000', padding: '10px 24px', border: isLimitReached ? '1px solid #555' : 'none', borderRadius: '4px', fontWeight: 'bold', cursor: isLimitReached ? 'not-allowed' : 'pointer', fontSize: '14px' }}
        >
          {isLimitReached ? '🚫 LIMIT REACHED' : '+ CREATE CAMPAIGN'}
        </button>
      </div>

      {showBuilder && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(5px)' }}>
          <div style={{ backgroundColor: '#111', border: '1px solid #d4af37', borderRadius: '12px', width: '1100px', height: '880px', maxHeight: '95vh', display: 'flex', position: 'relative', overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
            
            <button onClick={() => setShowBuilder(false)} style={{ position: 'absolute', top: '15px', right: '20px', background: 'transparent', color: '#888', border: 'none', fontSize: '24px', cursor: 'pointer', zIndex: 10 }}>✖</button>

            <div style={{ flex: 1.2, padding: '40px', borderRight: '1px solid #333', overflowY: 'auto' }}>
              <h3 style={{ color: '#d4af37', margin: '0 0 25px 0', fontSize: '20px' }}>{editingId ? "Edit Gallery Ad" : "Public Gallery Ad"}</h3>
              
              <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', color: '#888', fontSize: '12px', marginBottom: '8px' }}>Sponsor / Entity Name *</label>
                  <input type="text" value={sponsorName} placeholder="e.g., Sports Bar" onChange={(e) => setSponsorName(e.target.value)} style={{ width: '100%', padding: '12px', backgroundColor: '#0a0a0a', border: '1px solid #333', color: '#fff', borderRadius: '4px' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', color: '#888', fontSize: '12px', marginBottom: '8px' }}>Location / Area</label>
                  <input type="text" value={location} placeholder="e.g., Pattaya City" onChange={(e) => setLocation(e.target.value)} style={{ width: '100%', padding: '12px', backgroundColor: '#0a0a0a', border: '1px solid #333', color: '#fff', borderRadius: '4px' }} />
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', color: '#888', fontSize: '12px', marginBottom: '8px' }}>Ad Headline *</label>
                <input type="text" value={headline} placeholder="e.g., Dinner coupon 20% off!" onChange={(e) => setHeadline(e.target.value)} style={{ width: '100%', padding: '12px', backgroundColor: '#0a0a0a', border: '1px solid #333', color: '#fff', borderRadius: '4px' }} />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label style={{ color: '#888', fontSize: '12px' }}>Sales Pitch / Ad Copy</label>
                  <button onClick={handleAiSuggest} disabled={isGenerating} style={{ backgroundColor: '#1E88E5', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '4px', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold' }}>
                    {isGenerating ? 'GENERATING...' : '✨ AI SUGGESTION'}
                  </button>
                </div>
                <textarea value={salesPitch} placeholder="Write a compelling description to attract players..." onChange={(e) => setSalesPitch(e.target.value)} style={{ width: '100%', padding: '12px', backgroundColor: '#0a0a0a', border: '1px solid #333', color: '#fff', borderRadius: '4px', minHeight: '100px', fontFamily: 'inherit' }} />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', color: '#888', fontSize: '12px', marginBottom: '8px' }}>Button CTA</label>
                  <input type="text" value={ctaText} placeholder="e.g., BOOK A TABLE" onChange={(e) => setCtaText(e.target.value)} style={{ width: '100%', padding: '12px', backgroundColor: '#0a0a0a', border: '1px solid #333', color: '#fff', borderRadius: '4px' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', color: '#888', fontSize: '12px', marginBottom: '8px' }}>Destination / Booking URL</label>
                  <input type="text" value={destinationUrl} placeholder="https://" onChange={(e) => setDestinationUrl(e.target.value)} style={{ width: '100%', padding: '12px', backgroundColor: '#0a0a0a', border: '1px solid #333', color: '#fff', borderRadius: '4px' }} />
                  <div style={{ color: '#666', fontSize: '10px', marginTop: '6px' }}>Use https:// for websites or tel: for phone numbers.</div>
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', color: '#888', fontSize: '12px', marginBottom: '8px' }}>Upload Ad Creative / Image *</label>
                <input type="file" accept="image/*" ref={fileInputRef} style={{ display: 'none' }} onChange={handleImageSelect} />
                <div onClick={() => fileInputRef.current?.click()} style={{ border: '1px dashed #555', padding: '20px', textAlign: 'center', borderRadius: '4px', backgroundColor: '#0a0a0a', cursor: 'pointer', transition: '0.2s' }}>
                  <span style={{ color: imagePreview ? '#4CAF50' : '#aaa', fontSize: '14px', fontWeight: 'bold' }}>
                    {imagePreview ? '✅ Image Selected - Click to change' : 'Click to upload high-res banner'}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button onClick={() => handleSave('draft')} disabled={isSaving} style={{ flex: 1, padding: '15px', backgroundColor: isSaving ? '#555' : '#333', color: '#fff', border: '1px solid #555', borderRadius: '4px', fontWeight: 'bold', cursor: isSaving ? 'not-allowed' : 'pointer', fontSize: '12px' }}>
                  SAVE AS DRAFT
                </button>
                <button onClick={() => handleSave('active')} disabled={isSaving} style={{ flex: 2, padding: '15px', backgroundColor: isSaving ? '#555' : '#d4af37', color: '#000', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: isSaving ? 'not-allowed' : 'pointer', fontSize: '14px' }}>
                  {isSaving ? "SAVING..." : "🚀 PUBLISH CAMPAIGN"}
                </button>
              </div>
            </div>

            <div style={{ flex: 1, backgroundColor: '#050505', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px' }}>
              <div style={{ width: '320px', height: '600px', borderRadius: '36px', border: '10px solid #111', position: 'relative', overflow: 'hidden', backgroundColor: '#1a1a1a', display: 'flex', flexDirection: 'column' }}>
                
                <div style={{ height: '55%', position: 'relative', background: 'linear-gradient(180deg, #1E88E5 0%, #0a0a0a 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {imagePreview ? (
                    <img src={imagePreview} alt="Ad Creative" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ color: '#fff', fontSize: '24px', fontWeight: 'bold', textAlign: 'center', padding: '20px' }}>{headline || "Ad Headline"}</span>
                  )}
                  <div style={{ position: 'absolute', top: '20px', left: '50%', transform: 'translateX(-50%)', backgroundColor: 'rgba(0,0,0,0.6)', padding: '6px 12px', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: '#d4af37', fontSize: '10px' }}>★</span>
                    <span style={{ color: '#fff', fontSize: '10px', fontWeight: 'bold' }}>{sponsorName || "Sponsor Name"}</span>
                  </div>
                </div>
                
                <div style={{ flex: 1, backgroundColor: '#111', padding: '20px', borderTopLeftRadius: '20px', borderTopRightRadius: '20px', marginTop: '-20px', zIndex: 2, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <div style={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}>📅 Limited Time Offer</div>
                    <div style={{ color: '#d4af37', fontSize: '12px' }}>📢 Broadcast</div>
                  </div>
                  
                  <div style={{ color: '#888', fontSize: '12px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span>{sponsorName || "Sponsor Name"}</span>
                    {location && <><span>•</span> <span style={{ color: '#1E88E5' }}>📍 {location}</span></>}
                  </div>

                  <p style={{ color: '#aaa', fontSize: '13px', lineHeight: '1.4', flex: 1, overflow: 'hidden' }}>
                    {salesPitch || "No description provided."}
                  </p>
                  
                  <button style={{ width: '100%', padding: '14px', backgroundColor: '#4CAF50', color: '#fff', border: 'none', borderRadius: '24px', fontWeight: 'bold', fontSize: '14px', marginTop: '10px' }}>
                    {ctaText || "CLAIM OFFER"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '20px', marginBottom: '30px' }}>
        <div style={{ flex: 1, backgroundColor: '#111', border: '1px solid #333', borderRadius: '8px', padding: '20px' }}>
          <div style={{ color: '#aaa', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px' }}>Active Campaigns</div>
          <div style={{ color: isLimitReached ? '#ff4444' : '#4CAF50', fontSize: '28px', fontWeight: 'bold', marginTop: '10px' }}>
            {activeAdsCount} <span style={{ color: '#666', fontSize: '18px' }}>/ {maxCampaigns}</span>
          </div>
          <div style={{ color: '#555', fontSize: '11px', marginTop: '5px' }}>
            Allowed in {isMasterHost ? 'Enterprise ($499)' : 'Small Business ($199)'} Tier
          </div>
        </div>
        <div style={{ flex: 1, backgroundColor: '#111', border: '1px solid #333', borderRadius: '8px', padding: '20px' }}>
          <div style={{ color: '#aaa', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px' }}>Total Impressions</div>
          <div style={{ color: '#fff', fontSize: '28px', fontWeight: 'bold', marginTop: '10px' }}>0</div>
          <div style={{ color: '#555', fontSize: '11px', marginTop: '5px' }}>Last 30 days</div>
        </div>
        <div style={{ flex: 1, backgroundColor: '#111', border: '1px solid #333', borderRadius: '8px', padding: '20px' }}>
          <div style={{ color: '#aaa', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px' }}>Avg. Click-Through</div>
          <div style={{ color: '#fff', fontSize: '28px', fontWeight: 'bold', marginTop: '10px' }}>0.0%</div>
          <div style={{ color: '#555', fontSize: '11px', marginTop: '5px' }}>Platform Average: 2.4%</div>
        </div>
      </div>

      <MasterInventory onLaunchClick={resetAndOpenBuilder} onEditClick={openBuilderForEdit} isLimitReached={isLimitReached} partnerUid={partnerUid} />
    </div>
  );
};

import WalletSettings from './WalletSettings';

const INACTIVITY_TIMEOUT = 30 * 60 * 1000; 

interface PartnerDashboardProps {
  partnerData: {
    uid?: string;
    email: string;
    tier: string; 
    sponsorCredits?: number;
  };
}

export default function EnterpriseDashboard({ partnerData }: PartnerDashboardProps) {
  const [activeTab, setActiveTab] = useState<'genesis' | 'tournaments' | 'adhub' | 'wallet' | 'tv' | 'raffle' | 'crm'>('adhub');
  const [liveTier, setLiveTier] = useState<string>(partnerData?.tier || 'basic_operator');
  const [dbCredits, setDbCredits] = useState<number | null>(null); // 🔥 FIX: Track if DB explicitly overrides credits
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const authUid = getAuth().currentUser?.uid || partnerData?.uid || "UNKNOWN_USER";

  useEffect(() => {
    if (!authUid || authUid === "UNKNOWN_USER") return;
    
    // 🔥 THE FIX: The upgraded webhook writes to the UID, so the dashboard MUST read from the UID!
    const docRef = doc(db, 'b2b_partners', authUid);
    const unsubscribe = onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.tier) setLiveTier(data.tier);
        if (data.sponsorCredits !== undefined) setDbCredits(data.sponsorCredits);
      } else {
        console.warn(`Database document for UID ${authUid} not found. Awaiting webhook sync.`);
      }
    });
    return () => unsubscribe();
  }, [authUid]);

  // 🔥 TRUE TIER EVALUATION
  const isMasterHost = liveTier === 'enterprise' || 
                       liveTier === 'Enterprise' || 
                       liveTier === 'master_host' || 
                       liveTier === 'Product & Service Promotion'; // Kept for legacy partners

  // 🔥 CREDIT MATH FIX: If DB has no credits field, dynamically assign based on Tier
  const displayCredits = dbCredits !== null ? dbCredits : (isMasterHost ? 6000 : 3000);

  const executeSecureLogout = async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    try {
      await signOut(getAuth());
      window.location.href = '/partners'; 
    } catch (error) {
      console.error("🚨 Failed to terminate session:", error);
    }
  };

  const resetTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(executeSecureLogout, INACTIVITY_TIMEOUT);
  };

  useEffect(() => {
    const events = ['mousemove', 'keydown', 'click', 'scroll'];
    resetTimer(); 
    events.forEach(event => window.addEventListener(event, resetTimer));
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      events.forEach(event => window.removeEventListener(event, resetTimer));
    };
  }, []);

  return (
    <div style={styles.masterContainer}>
      <div style={styles.sidebar}>
        <div style={styles.headerBlock}>
          <h1 style={styles.logo}>GOLFRIEND B2B</h1>
          <p style={styles.tierBadge}>
            {isMasterHost ? '💎 ENTERPRISE OPERATOR' : '🤝 SMALL BUSINESS'}
          </p>
          <p style={styles.creditBalance}>{displayCredits.toLocaleString()} Credits</p>
        </div>
        
        <div style={styles.sectionHeader}>CORE OPERATIONS</div>
        <button style={{...styles.navBtn, ...(activeTab === 'genesis' ? styles.activeBtn : {})}} onClick={() => setActiveTab('genesis')}>
          🏗️ Event Genesis
        </button>
        <button style={{...styles.navBtn, ...(activeTab === 'tournaments' ? styles.activeBtn : {})}} onClick={() => setActiveTab('tournaments')}>
          🏆 Tournament Manager
        </button>
        <button style={{...styles.navBtn, ...(activeTab === 'adhub' ? styles.activeBtn : {})}} onClick={() => setActiveTab('adhub')}>
          📢 Sponsor Ad Hub
        </button>

        <div style={styles.sectionHeader}>ENTERPRISE TOOLS</div>
        <button 
          style={{...styles.navBtn, ...(activeTab === 'tv' ? styles.activeBtn : {}), opacity: isMasterHost ? 1 : 0.4}} 
          onClick={() => isMasterHost && setActiveTab('tv')}
          disabled={!isMasterHost}
        >
          📺 Tournament TV {!isMasterHost && '🔒'}
        </button>
        <button 
          style={{...styles.navBtn, ...(activeTab === 'raffle' ? styles.activeBtn : {}), opacity: isMasterHost ? 1 : 0.4}} 
          onClick={() => isMasterHost && setActiveTab('raffle')}
          disabled={!isMasterHost}
        >
          🎟️ Automated Raffle {!isMasterHost && '🔒'}
        </button>
        <button 
          style={{...styles.navBtn, ...(activeTab === 'crm' ? styles.activeBtn : {}), opacity: isMasterHost ? 1 : 0.4}} 
          onClick={() => isMasterHost && setActiveTab('crm')}
          disabled={!isMasterHost}
        >
          👥 Buyer CRM {!isMasterHost && '🔒'}
        </button>

        <div style={styles.sectionHeader}>ACCOUNT</div>
        <button style={{...styles.navBtn, ...(activeTab === 'wallet' ? styles.activeBtn : {})}} onClick={() => setActiveTab('wallet')}>
          💳 Wallet & Billing
        </button>
        
        <button style={{...styles.navBtn, color: '#ff4444', marginTop: 'auto'}} onClick={executeSecureLogout}>
          🚪 Secure Logout
        </button>
      </div>

      <div style={styles.content}>
        {activeTab === 'genesis' && <EventGenesisConsole />}
        {/* @ts-ignore */}
        {activeTab === 'tournaments' && <TournamentManager tournamentId="PUI_SPORTS_BAR_0007" isPremium={isMasterHost} />}
        {activeTab === 'adhub' && <AdHub isMasterHost={isMasterHost} partnerUid={authUid} />}
        {activeTab === 'wallet' && <WalletSettings partnerUid={authUid} />}
        {activeTab === 'tv' && <TournamentTV />}
        {activeTab === 'raffle' && <RaffleEngine />}
        {activeTab === 'crm' && <AdLeadsInbox partnerUid={authUid} />}
      </div>
    </div>
  );
}

const styles = {
  masterContainer: { display: 'flex', minHeight: '100vh', backgroundColor: '#0a0a0a', color: 'white', fontFamily: 'sans-serif' },
  sidebar: { width: '260px', backgroundColor: '#121212', padding: '24px 16px', borderRight: '1px solid #333', display: 'flex', flexDirection: 'column' as const },
  headerBlock: { borderBottom: '1px solid #222', paddingBottom: '20px', marginBottom: '20px', textAlign: 'center' as const },
  logo: { color: '#d4af37', fontSize: '20px', margin: '0 0 8px 0', letterSpacing: '1px', fontWeight: '900' },
  tierBadge: { color: '#888', fontSize: '11px', margin: '0 0 8px 0', letterSpacing: '1.5px', fontWeight: 'bold' },
  creditBalance: { color: '#4CAF50', fontSize: '14px', margin: 0, fontWeight: 'bold' },
  content: { flex: 1, padding: '40px', overflowY: 'auto' as const },
  navBtn: { 
    display: 'block', width: '100%', padding: '12px 16px', marginBottom: '6px', 
    backgroundColor: 'transparent', color: '#888', border: '1px solid transparent', 
    textAlign: 'left' as const, cursor: 'pointer', borderRadius: '8px', fontSize: '14px', fontWeight: 'bold' as const, transition: 'all 0.2s ease'
  },
  activeBtn: { backgroundColor: '#1a1a1a', color: '#d4af37', border: '1px solid #333' },
  sectionHeader: { color: '#555', fontSize: '11px', fontWeight: '900' as const, letterSpacing: '1px', marginBottom: '12px', marginTop: '24px', textTransform: 'uppercase' as const, paddingLeft: '8px' },
  placeholder: { color: '#666', border: '1px dashed #333', padding: '40px', textAlign: 'center' as const, borderRadius: '12px', fontSize: '18px' }
};