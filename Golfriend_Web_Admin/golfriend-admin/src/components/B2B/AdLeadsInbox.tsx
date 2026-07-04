import { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, orderBy, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../firebaseConfig';

interface AdLeadsInboxProps {
  partnerUid: string;
}

export default function AdLeadsInbox({ partnerUid }: AdLeadsInboxProps) {
  const [leads, setLeads] = useState<any[]>([]);
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  // --- WEB ATTACHMENT PIPELINE ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedLead) return;

    setIsUploading(true);
    try {
      // 1. Determine Payload Type
      const fileExtension = file.name.split('.').pop()?.toLowerCase();
      const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExtension || '');
      const messageType = isImage ? 'image' : 'file';

      // 2. Upload to the exact path the Mobile App uses
      const storageRef = ref(storage, `chat_media/${selectedLead.id}/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const publicUrl = await getDownloadURL(storageRef);

      // 3. Write the exact payload structure the Mobile App expects
      await addDoc(collection(db, 'chats', selectedLead.id, 'messages'), {
        type: messageType,
        text: isImage ? "📷 Image" : `📎 ${file.name}`,
        imageUrl: isImage ? publicUrl : null,
        fileUrl: !isImage ? publicUrl : null,
        fileName: !isImage ? file.name : null,
        senderId: partnerUid,
        senderNickname: 'Enterprise Partner', 
        photo_url: 'https://via.placeholder.com/150', 
        createdAt: serverTimestamp()
      });

      // 4. Trigger the Mobile Notification Dot
      await updateDoc(doc(db, 'chats', selectedLead.id), {
        lastMessageText: isImage ? "📷 Sent an image" : `📎 Sent a file`,
        lastMessageTime: serverTimestamp(),
        unreadBy: [selectedLead.golferId],
        clearedBy: []
      });

    } catch (error) {
      console.error("File upload failed:", error);
      alert("Failed to upload attachment. Check your connection.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = ''; // Reset the input
    }
  };

  // 1. Stream the Master 'chats' Collection for this Partner
  useEffect(() => {
    if (!partnerUid || partnerUid === "UNKNOWN_USER") return;
    
    // We look for any chat where the business partner is a participant
    const q = query(
      collection(db, 'chats'), 
      where('participants', 'array-contains', partnerUid)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const chatThreads = snapshot.docs.map(doc => {
        const data = doc.data();
        // Identify the golfer (the other participant)
        const golferId = data.participants?.find((id: string) => id !== partnerUid);
        const details = data.participantDetails?.[golferId] || {};
        
        return { 
          id: doc.id, 
          golferId,
          golferName: details.nickname || data.name || 'Anonymous Golfer',
          golferPhoto: details.photo_url || 'https://via.placeholder.com/50',
          ...data 
        };
      });
      
      // Sort by the mobile app's time schema
      chatThreads.sort((a: any, b: any) => {
        const timeA = a.lastMessageTime?.seconds || a.createdAt?.seconds || 0;
        const timeB = b.lastMessageTime?.seconds || b.createdAt?.seconds || 0;
        return timeB - timeA;
      });
      
      setLeads(chatThreads);
    });
    
    return () => unsubscribe();
  }, [partnerUid]);

  // 2. Stream the Subcollection Messages exactly like ChatThreadModal.tsx
  useEffect(() => {
    if (!selectedLead) return;
    
    // Clear old messages instantly to prevent bleeding
    setMessages([]);

    const q = query(
      collection(db, 'chats', selectedLead.id, 'messages'), 
      orderBy('createdAt', 'asc') // Mobile renders inverted, Web renders standard top-to-bottom
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    });
    
    return () => unsubscribe();
  }, [selectedLead]);

  // 3. Write Messages & Update the Thread Meta (Mobile Compatibility)
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedLead) return;

    const payloadText = newMessage.trim();
    setNewMessage(""); // Optimistic UI clear

    try {
      // Step A: Write to the nested subcollection exactly like Mobile
      await addDoc(collection(db, 'chats', selectedLead.id, 'messages'), {
        type: 'text',
        text: payloadText,
        senderId: partnerUid,
        senderNickname: 'Enterprise Partner', // Fallback, could pull from auth.currentUser.displayName
        photo_url: 'https://via.placeholder.com/150', // Replace with business logo later
        createdAt: serverTimestamp()
      });

      // Step B: Update the Thread Meta so the Golfer's mobile Mailbox gets the red unread dot
      await updateDoc(doc(db, 'chats', selectedLead.id), {
        lastMessageText: payloadText,
        lastMessageTime: serverTimestamp(),
        unreadBy: [selectedLead.golferId], // Give the golfer a red dot
        clearedBy: [] // Un-hide it if the golfer swiped to hide it earlier
      });
      
    } catch (error) {
      console.error("Failed to send message:", error);
      alert("Message failed to send. Check console.");
    }
  };

  return (
    <div style={{ display: 'flex', height: '75vh', backgroundColor: '#111', border: '1px solid #333', borderRadius: '12px', overflow: 'hidden', color: '#fff' }}>
      
      {/* LEFT PANEL: The Leads Rolodex */}
      <div style={{ width: '320px', borderRight: '1px solid #333', display: 'flex', flexDirection: 'column', backgroundColor: '#0a0a0a' }}>
        <div style={{ padding: '20px', borderBottom: '1px solid #222' }}>
          <h3 style={{ margin: 0, color: '#d4af37', fontSize: '16px', letterSpacing: '1px' }}>Ad Leads & Inbox</h3>
          <p style={{ margin: '5px 0 0 0', color: '#666', fontSize: '12px' }}>Golfers who claimed your offers</p>
        </div>
        
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {leads.length === 0 ? (
            <div style={{ padding: '30px 20px', textAlign: 'center', color: '#555', fontSize: '13px' }}>
              No active leads. When a golfer claims an ad, their chat thread will appear here.
            </div>
          ) : (
            leads.map(lead => (
              <div 
                key={lead.id} 
                onClick={() => setSelectedLead(lead)}
                style={{ padding: '15px 20px', borderBottom: '1px solid #222', cursor: 'pointer', backgroundColor: selectedLead?.id === lead.id ? '#1a1a1a' : 'transparent', transition: '0.2s' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <img src={lead.golferPhoto} alt="Avatar" style={{ width: '24px', height: '24px', borderRadius: '12px', border: '1px solid #333' }} />
                    <span style={{ fontWeight: 'bold', fontSize: '14px', color: selectedLead?.id === lead.id ? '#d4af37' : '#fff' }}>{lead.golferName}</span>
                  </div>
                </div>
                <div style={{ fontSize: '12px', color: (lead.unreadBy || []).includes(partnerUid) ? '#d4af37' : '#888', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: '6px' }}>
                  {lead.lastMessageText || 'New Connection'}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* RIGHT PANEL: The Communication Engine */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#121212' }}>
        {!selectedLead ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', flexDirection: 'column' }}>
            <span style={{ fontSize: '40px', marginBottom: '15px' }}>📬</span>
            <span>Select a conversation to initiate secure communication.</span>
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div style={{ padding: '20px', borderBottom: '1px solid #222', backgroundColor: '#0a0a0a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <img src={selectedLead.golferPhoto} alt="Avatar" style={{ width: '40px', height: '40px', borderRadius: '20px', border: '1px solid #333' }} />
                <div>
                  <h4 style={{ margin: 0, fontSize: '16px', color: '#fff' }}>{selectedLead.golferName}</h4>
                  <div style={{ fontSize: '12px', color: '#4CAF50', marginTop: '4px' }}>Lead Origin: {selectedLead.adHeadline || 'Sponsor Ad'}</div>
                </div>
              </div>
              <span style={{ padding: '4px 8px', backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: '4px', fontSize: '11px', color: '#888' }}>MOBILE ENCRYPTED</span>
            </div>

            {/* Messages Area */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div style={{ textAlign: 'center', margin: '10px 0 20px 0' }}>
                <span style={{ backgroundColor: '#1a1a1a', padding: '6px 12px', borderRadius: '12px', fontSize: '11px', color: '#666' }}>
                  Secure connection established. The golfer will receive notifications on their mobile device.
                </span>
              </div>
              
              {messages.map(msg => {
                const isBusiness = msg.senderId === partnerUid;
                return (
                  <div key={msg.id} style={{ display: 'flex', justifyContent: isBusiness ? 'flex-end' : 'flex-start' }}>
                    <div style={{ maxWidth: '70%', padding: '12px 16px', borderRadius: '16px', borderBottomRightRadius: isBusiness ? '4px' : '16px', borderBottomLeftRadius: !isBusiness ? '4px' : '16px', backgroundColor: isBusiness ? '#d4af37' : '#222', color: isBusiness ? '#000' : '#fff', fontSize: '14px', lineHeight: '1.4', overflow: 'hidden' }}>
                      
                      {/* TEXT, PITCHES, & SYSTEM MESSAGES */}
                      {(!msg.type || msg.type === 'text' || msg.type === 'game_invitation' || msg.type === 'pitch') && (
                        <span>{msg.text || msg.content || "Message"}</span>
                      )}

                      {/* IMAGES */}
                      {msg.type === 'image' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <img src={msg.imageUrl || msg.content} alt="Attachment" style={{ width: '100%', borderRadius: '8px', maxHeight: '200px', objectFit: 'cover', border: isBusiness ? '1px solid #b8962e' : '1px solid #444' }} />
                          {msg.text && <span style={{ fontSize: '12px', opacity: 0.8 }}>{msg.text}</span>}
                        </div>
                      )}

                      {/* AUDIO MEMOS */}
                      {msg.type === 'audio' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 'bold' }}>🎤 Voice Memo</span>
                          <audio controls src={msg.audioUrl || msg.content} style={{ height: '32px', maxWidth: '220px', outline: 'none' }} />
                        </div>
                      )}

                      {/* FILES, LOCATIONS, & CONTACTS */}
                      {(msg.type === 'file' || msg.type === 'location' || msg.type === 'contact') && (
                        <a href={msg.fileUrl || msg.content || '#'} target="_blank" rel="noreferrer" style={{ color: isBusiness ? '#000' : '#d4af37', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}>
                          <span style={{ fontSize: '18px' }}>{msg.type === 'file' ? '📎' : msg.type === 'location' ? '📍' : '👤'}</span>
                          {msg.fileName || msg.text || `View ${msg.type}`}
                        </a>
                      )}

                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Engine */}
            <div style={{ padding: '20px', borderTop: '1px solid #222', backgroundColor: '#0a0a0a' }}>
              {isUploading ? (
                <div style={{ textAlign: 'center', padding: '14px', color: '#d4af37', fontSize: '14px', fontWeight: 'bold', letterSpacing: '1px' }}>
                  Securing and uploading file...
                </div>
              ) : (
                <form onSubmit={handleSendMessage} style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    style={{ display: 'none' }} 
                    onChange={handleFileUpload}
                  />
                  <button 
                    type="button" 
                    onClick={() => fileInputRef.current?.click()}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '24px', color: '#d4af37', padding: '0 5px' }}
                    title="Attach File"
                  >
                    📎
                  </button>
                  <input 
                    type="text" 
                    value={newMessage} 
                    onChange={(e) => setNewMessage(e.target.value)} 
                    placeholder={`Message ${selectedLead.golferName}...`}
                    style={{ flex: 1, padding: '14px', backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: '24px', color: '#fff', outline: 'none' }}
                  />
                  <button type="submit" disabled={!newMessage.trim()} style={{ padding: '0 24px', height: '46px', backgroundColor: newMessage.trim() ? '#4CAF50' : '#333', color: '#fff', border: 'none', borderRadius: '24px', fontWeight: 'bold', cursor: newMessage.trim() ? 'pointer' : 'not-allowed', transition: '0.2s' }}>
                    SEND
                  </button>
                </form>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}