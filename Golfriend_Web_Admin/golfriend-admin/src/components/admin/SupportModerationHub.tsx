import { useState, useEffect } from 'react';
import { db } from '../../firebaseConfig';
import { collection, doc, updateDoc, serverTimestamp, onSnapshot, writeBatch, increment, addDoc, query, where, getDoc } from 'firebase/firestore';

export default function SupportModerationHub() {
  // --- STATE: SCHEMA #18 TICKETS ---
  const [tickets, setTickets] = useState<any[]>([]);
  const [activeTicket, setActiveTicket] = useState<any | null>(null);
  const [adminReply, setAdminReply] = useState("");
  // --- STATE: STRIKE MODERATION ---
  const [strikeReason, setStrikeReason] = useState("");
  const [penalizedUsers, setPenalizedUsers] = useState<any[]>([]);

  // 🔥 WIRE THE BLACKLIST LEDGER
  useEffect(() => {
    // Listen for users who are banned OR have a dropping reliability score
    const q = query(collection(db, 'users'), where('reliability_score', '<', 90));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      // 🔥 TS FIX: Explicitly cast to 'any' to bypass strict typing
      const fetchedUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      
      // Sort so banned users are at the top, followed by lowest scores
      fetchedUsers.sort((a: any, b: any) => {
        if (a.isBanned && !b.isBanned) return -1;
        if (!a.isBanned && b.isBanned) return 1;
        return (a.reliability_score || 0) - (b.reliability_score || 0);
      });
      
      setPenalizedUsers(fetchedUsers);
    });
    return () => unsubscribe();
  }, []);

  // 🔥 WIRE THE INBOX LISTENER (SCHEMA #18)
  
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'supportTickets'), (snapshot) => {
      const fetchedTickets = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTickets(fetchedTickets);
    });
    return () => unsubscribe();
  }, []);

  // 🔥 TACTICAL EXECUTION PROTOCOLS
  const executeReply = async () => {
    if (!activeTicket || !adminReply.trim()) return alert("Enter a reply.");
    await updateDoc(doc(db, 'supportTickets', activeTicket.id), {
      status: 'resolved',
      adminReply,
      resolvedAt: serverTimestamp()
    });
    setAdminReply("");
    setActiveTicket(null);
  };

  const executeStrike = async (tier: 1 | 2 | 3) => {
    if (!activeTicket || !strikeReason.trim()) return alert("Audit Reason is strictly required.");
    
    const targetUserId = activeTicket.reportedUserId || activeTicket.senderId; 
    if (!targetUserId) return alert("Error: No target user ID found on this ticket.");

    const batch = writeBatch(db);

    // 1. 🔥 ENFORCE THE PENALTY ON THE USER PROFILE
    const userRef = doc(db, 'users', targetUserId);
    
    if (tier === 1) {
      batch.update(userRef, { 
        reliability_score: increment(-15),
        isVerified: false, 
        behavior_badge: 'Warning: Policy Violation'
      });
    } else if (tier === 2) {
      batch.update(userRef, { 
        reliability_score: increment(-25),
        isVerified: false,
        behavior_badge: 'Suspended: Unreliable'
      });
    } else if (tier === 3) {
      // 🔥 THE ZERO TOLERANCE HAMMER & ANTI-EVASION LOCK
      batch.update(userRef, { 
        reliability_score: 0,
        isVerified: false,
        isBanned: true, 
        behavior_badge: 'Banned: Zero Tolerance'
      });

      // Harvest identifiers for the Blacklist
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const uData = userSnap.data();
        const blacklistRef = doc(db, 'blacklist', targetUserId);
        batch.set(blacklistRef, {
          uid: targetUserId,
          email: uData.email || 'NOT_CAPTURED',
          phone: uData.phone_number || 'NOT_CAPTURED',
          deviceId: uData.fcm_token || 'NOT_CAPTURED',
          reason: strikeReason,
          bannedAt: serverTimestamp()
        });
      }
    }

    // 2. Log the strike to the ticket & close it
    const ticketRef = doc(db, 'supportTickets', activeTicket.id);
    batch.update(ticketRef, {
      status: 'closed_with_strike',
      strikeTier: tier,
      strikeReason,
      resolvedAt: serverTimestamp()
    });

    // 3. Fire the Central Bank Audit Receipt
    const txRef = doc(collection(db, 'transactions'));
    batch.set(txRef, {
      userId: targetUserId,
      title: `ToS STRIKE TIER ${tier}: ${strikeReason.trim()}`,
      amount: 0, 
      type: 'TOS_PENALTY',
      status: 'completed',
      enforcedBy: 'DIRECTOR_CONSOLE',
      createdAt: serverTimestamp()
    });

    await batch.commit();

    setStrikeReason("");
    setActiveTicket(null);
    alert(`Tier ${tier} Strike successfully executed against user.`);
  };

  // 🧠 AI PRE-READ SCANNER
  const renderAIAnalyzedMessage = (text: string) => {
    if (!text) return 'No message provided by user.';
    
    // Define high-risk context for the scanner to flag instantly
    const keywords = /no-show|scam|fake|harassment|abuse|stole|escrow|inappropriate/gi;
    const parts = text.split(keywords);
    const matches = text.match(keywords) || [];
    
    return parts.map((part, i) => (
      <span key={i}>
        {part}
        {matches[i] && (
          <span style={{ color: '#ff4444', fontWeight: '900', backgroundColor: 'rgba(255,0,0,0.15)', padding: '2px 4px', borderRadius: '4px', border: '1px solid rgba(255,68,68,0.5)' }}>
            {matches[i].toUpperCase()}
          </span>
        )}
      </span>
    ));
  };

  // 🔥 SYSTEMATIC TEST PROTOCOL
  const simulateInboundTicket = async () => {
    await addDoc(collection(db, 'supportTickets'), {
      status: 'open',
      nickname: 'System_Test_User',
      subject: 'UI/UX Verification Ticket',
      message: 'This is an auto-generated test ticket to verify the Strike Hub UI and database routing. The system is online and ready.',
      reportedUserId: 'SIMULATED_UID_999',
      createdAt: serverTimestamp()
    });
  };

  return (
    <div style={{ padding: '24px', backgroundColor: '#121212', minHeight: '100vh', color: '#fff', fontFamily: 'sans-serif' }}>
      <h2 style={{ color: '#d4af37', borderBottom: '1px solid #333', paddingBottom: '12px' }}>
        🛡️ SUPPORT & STRIKE MODERATION HUB
      </h2>

      <div style={{ display: 'flex', gap: '20px', marginTop: '20px', minHeight: '70vh' }}>
        
        {/* ========================================== */}
        {/* LEFT COLUMN: TICKET INBOX */}
        {/* ========================================== */}
        <div style={{ flex: 1, backgroundColor: '#1e1e1e', borderRadius: '8px', border: '1px solid #333', padding: '15px', overflowY: 'auto', maxHeight: '75vh' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h3 style={{ margin: 0, color: '#888' }}>Open Tickets (Schema #18)</h3>
            <span style={{ fontSize: '10px', color: '#4CAF50', backgroundColor: '#112211', padding: '4px 8px', borderRadius: '4px', border: '1px solid #4CAF50', fontWeight: 'bold', letterSpacing: '1px' }}>
              🟢 LISTENING
            </span>
          </div>
          
          {tickets.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', backgroundColor: '#111', borderRadius: '8px', border: '1px dashed #333' }}>
              <div style={{ fontSize: '32px', marginBottom: '10px' }}>📡</div>
              <h4 style={{ color: '#aaa', margin: '0 0 10px 0' }}>System is Online</h4>
              <p style={{ color: '#555', fontSize: '12px', marginBottom: '25px', lineHeight: '1.5' }}>
                The hub is actively listening for incoming user reports from the mobile app.
              </p>
              <button 
                onClick={simulateInboundTicket}
                style={{ padding: '10px 20px', backgroundColor: '#1a1a00', color: '#D4AF37', border: '1px solid #D4AF37', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
              >
                + INJECT TEST TICKET
              </button>
            </div>
          ) : (
            tickets.map(ticket => (
              <div 
                key={ticket.id} 
                onClick={() => setActiveTicket(ticket)}
                style={{ padding: '12px', backgroundColor: activeTicket?.id === ticket.id ? '#333' : '#222', marginBottom: '10px', borderRadius: '4px', cursor: 'pointer', borderLeft: ticket.status === 'open' ? '4px solid #ff4444' : '4px solid #4CAF50' }}
              >
                <strong style={{ color: '#fff' }}>{ticket.nickname || 'Unknown Player'}</strong>
                <div style={{ fontSize: '12px', color: '#aaa', marginTop: '4px' }}>Subject: {ticket.subject || 'General Inquiry'}</div>
              </div>
            ))
          )}
        </div>

        {/* ========================================== */}
        {/* RIGHT COLUMN: ACTIVE TICKET & TACTICAL CONTROLS */}
        {/* ========================================== */}
        <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: '15px' }}>
          
          {/* COMMUNICATION PORTAL */}
          <div style={{ flex: 1, backgroundColor: '#1e1e1e', borderRadius: '8px', border: '1px solid #333', padding: '20px' }}>
            <h3 style={{ margin: '0 0 15px 0', color: '#D4AF37' }}>Communication Portal</h3>
            {!activeTicket ? (
              <p style={{ color: '#555', fontSize: '14px' }}>Select a ticket from the inbox to view details.</p>
            ) : (
              <>
                <div style={{ padding: '15px', backgroundColor: '#111', borderRadius: '4px', marginBottom: '15px', fontSize: '14px', color: '#ccc', border: '1px solid #222' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <strong style={{ color: '#fff' }}>User Message:</strong>
                    <span style={{ fontSize: '10px', color: '#D4AF37', backgroundColor: 'rgba(212,175,55,0.1)', padding: '4px 8px', borderRadius: '4px', border: '1px solid #D4AF37', fontWeight: 'bold' }}>
                      🧠 AI THREAT SCANNER ACTIVE
                    </span>
                  </div>
                  <div style={{ lineHeight: '1.6' }}>
                    {renderAIAnalyzedMessage(activeTicket.message)}
                  </div>
                </div>
                <textarea placeholder="Type admin response here... (Fires Cloud Function to user's email)" value={adminReply} onChange={(e) => setAdminReply(e.target.value)} style={{...styles.input, height: '100px'}} />
                <button onClick={executeReply} style={{...styles.btnAction, backgroundColor: '#1E88E5', color: '#fff'}}>SEND SECURE EMAIL RESPONSE</button>
              </>
            )}
          </div>

          {/* STRIKE MODERATION CONTROLS */}
          <div style={{ backgroundColor: '#2a1215', borderRadius: '8px', border: '1px solid #ff4444', padding: '20px' }}>
            <h3 style={{ margin: '0 0 15px 0', color: '#ff4444' }}>Tactical Strike Controls</h3>
            {!activeTicket ? (
              <p style={{ color: '#aa5555', fontSize: '14px' }}>Select a ticket to access disciplinary overrides.</p>
            ) : (
              <>
                <input type="text" placeholder="Audit Reason (e.g. No-Show, Harassment)" value={strikeReason} onChange={(e) => setStrikeReason(e.target.value)} style={styles.input} />
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => executeStrike(1)} style={{...styles.btnAction, backgroundColor: '#ff9800', color: '#000', flex: 1, fontSize: '12px'}}>TIER 1 (-15 & STRIP BADGE)</button>
                  <button onClick={() => executeStrike(2)} style={{...styles.btnAction, backgroundColor: '#e65100', color: '#fff', flex: 1, fontSize: '12px'}}>TIER 2 (-25 SUSPENSION)</button>
                  <button onClick={() => executeStrike(3)} style={{...styles.btnAction, backgroundColor: '#8B0000', color: '#fff', flex: 1, fontSize: '12px'}}>TIER 3 (PERMA-BAN)</button>
                </div>
              </>
            )}
          </div>

        </div>
      </div>

      {/* ========================================== */}
      {/* THE BLACKLIST LEDGER */}
      {/* ========================================== */}
      <div style={{ marginTop: '30px', backgroundColor: '#1e1e1e', borderRadius: '8px', border: '1px solid #333', padding: '20px' }}>
        <h3 style={{ margin: '0 0 15px 0', color: '#ff4444', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Ionicons name="skull" size={20} color="#ff4444" /> 
          Penalized & Banned Users Ledger
        </h3>
        
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
            <thead>
              <tr style={{ backgroundColor: '#111', borderBottom: '2px solid #333' }}>
                <th style={{ padding: '12px', color: '#888' }}>User</th>
                <th style={{ padding: '12px', color: '#888' }}>Reliability</th>
                <th style={{ padding: '12px', color: '#888' }}>Status Badge</th>
                <th style={{ padding: '12px', color: '#888' }}>Captured Email</th>
                <th style={{ padding: '12px', color: '#888' }}>Captured Phone</th>
                <th style={{ padding: '12px', color: '#888' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {penalizedUsers.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: '20px', textAlign: 'center', color: '#555' }}>No penalized users found.</td></tr>
              ) : (
                penalizedUsers.map(u => (
                  <tr key={u.id} style={{ borderBottom: '1px solid #222', backgroundColor: u.isBanned ? 'rgba(255,0,0,0.05)' : 'transparent' }}>
                    <td style={{ padding: '12px', color: '#fff', fontWeight: 'bold' }}>{u.nickname || 'Unknown'} <span style={{fontSize: '10px', color: '#666', display: 'block'}}>{u.id}</span></td>
                    <td style={{ padding: '12px', color: u.reliability_score < 75 ? '#ff4444' : '#ff9800', fontWeight: '900' }}>{u.reliability_score || 0}</td>
                    <td style={{ padding: '12px' }}>
                      <span style={{ padding: '4px 8px', borderRadius: '4px', backgroundColor: '#111', border: `1px solid ${u.isBanned ? '#ff4444' : '#ff9800'}`, color: u.isBanned ? '#ff4444' : '#ff9800', fontSize: '11px' }}>
                        {u.behavior_badge || 'No Badge'}
                      </span>
                    </td>
                    <td style={{ padding: '12px', color: '#aaa', fontFamily: 'monospace' }}>{u.email || '---'}</td>
                    <td style={{ padding: '12px', color: '#aaa', fontFamily: 'monospace' }}>{u.phone_number || '---'}</td>
                    <td style={{ padding: '12px' }}>
                       {/* Future expansion: Unban button can be wired here */}
                       <button style={{ padding: '6px 12px', backgroundColor: '#333', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'not-allowed', fontSize: '10px' }}>LOCKED</button>
                    </td>
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

// Fallback mock for Ionicons if not imported at top
const Ionicons = ({name, size, color}: any) => <span style={{fontSize: size, color}}>{name === 'skull' ? '☠️' : ''}</span>;

const styles = {
  input: { padding: '10px', borderRadius: '4px', border: '1px solid #555', backgroundColor: '#222', color: '#fff', width: '100%', boxSizing: 'border-box' as const, marginBottom: '10px' },
  btnAction: { padding: '10px 15px', fontWeight: 'bold', border: 'none', borderRadius: '4px', cursor: 'pointer', width: '100%' }
};