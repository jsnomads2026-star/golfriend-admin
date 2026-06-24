import React, { useState } from 'react';
import { db } from '../../firebaseConfig';
import { doc, setDoc } from 'firebase/firestore';

export default function EventGenesisConsole() {
  // Core Details
  const [eventName, setEventName] = useState('');
  const [courseId, setCourseId] = useState('PATTAYA_COUNTRY_CLUB');
  const [eventDate, setEventDate] = useState('');
  const [startTime, setStartTime] = useState('08:00');
  const [matchFormat, setMatchFormat] = useState('Stroke Play (Net)');
  const [entryFee, setEntryFee] = useState('');
  
  // Perks & Agenda
  const [prizePool, setPrizePool] = useState('');
  const [raffleItems, setRaffleItems] = useState('');
  const [includesDinner, setIncludesDinner] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventName || !entryFee || !eventDate || !startTime) {
      alert("Please fill out all mandatory fields (Name, Date, Time, Fee).");
      return;
    }

    setIsSubmitting(true);
    
    // Generate a clean Firestore Document ID (e.g., "PATTAYA_OPEN_2026")
    const docId = eventName.toUpperCase().replace(/\s+/g, '_');
    
    try {
      await setDoc(doc(db, 'tournaments', docId), {
        name: eventName,
        courseId: courseId,
        date: eventDate,
        time: startTime,
        format: matchFormat,
        entryFeeFiat: Number(entryFee),
        currency: 'THB',
        paymentGateway: 'PromptPay',
        agenda: {
          prizePool: prizePool,
          raffleItems: raffleItems,
          includesDinner: includesDinner
        },
        status: 'registration_open',
        displayState: 'leaderboard',
        createdAt: new Date().toISOString()
      });
      
      alert(`✅ Event Created: ${eventName} is now live and accepting PromptPay registrations!`);
      
      // Reset the form
      setEventName(''); setEntryFee(''); setEventDate(''); 
      setPrizePool(''); setRaffleItems(''); setIncludesDinner(false);
    } catch (error) {
      console.error("Genesis Error:", error);
      alert("Failed to initialize tournament. Check console logs.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ padding: '20px', color: '#fff' }}>
      <h2 style={{ color: '#D4AF37', letterSpacing: '2px', marginBottom: '30px' }}>
        📅 EVENT GENESIS CONSOLE
      </h2>

      <div style={{ background: '#111', padding: '30px', borderRadius: '12px', maxWidth: '800px', border: '1px solid #333' }}>
        <form onSubmit={handleCreateEvent} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
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
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', color: '#888', marginBottom: '8px', fontWeight: 'bold' }}>Host Course Location</label>
              <select 
                value={courseId} onChange={(e) => setCourseId(e.target.value)}
                style={{ width: '100%', padding: '12px', background: '#222', border: '1px solid #444', color: '#fff', borderRadius: '6px' }}
              >
                <option value="PATTAYA_COUNTRY_CLUB">Pattaya Country Club</option>
                <option value="SIAM_COUNTRY_CLUB">Siam Country Club</option>
                <option value="CHEE_CHAN_GOLF">Chee Chan Golf Resort</option>
                <option value="LAEM_CHABANG">Laem Chabang International</option>
              </select>
            </div>
          </div>

          {/* ROW 2: Date, Time & Format */}
          <div style={{ display: 'flex', gap: '20px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', color: '#888', marginBottom: '8px', fontWeight: 'bold' }}>Event Date</label>
              <input 
                type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)}
                style={{ width: '100%', padding: '12px', background: '#222', border: '1px solid #444', color: '#fff', borderRadius: '6px', colorScheme: 'dark' }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', color: '#888', marginBottom: '8px', fontWeight: 'bold' }}>Shotgun Time</label>
              <input 
                type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)}
                style={{ width: '100%', padding: '12px', background: '#222', border: '1px solid #444', color: '#fff', borderRadius: '6px', colorScheme: 'dark' }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', color: '#888', marginBottom: '8px', fontWeight: 'bold' }}>Match Format</label>
              <select 
                value={matchFormat} onChange={(e) => setMatchFormat(e.target.value)}
                style={{ width: '100%', padding: '12px', background: '#222', border: '1px solid #444', color: '#fff', borderRadius: '6px' }}
              >
                <option value="Stroke Play (Net)">Stroke Play (Net)</option>
                <option value="System 36">System 36</option>
                <option value="4-Player Scramble">4-Player Scramble</option>
                <option value="Stableford">Stableford</option>
              </select>
            </div>
          </div>

          <hr style={{ borderColor: '#333', margin: '10px 0' }} />

          {/* ROW 3: Perks & Agenda */}
          <div style={{ display: 'flex', gap: '20px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', color: '#888', marginBottom: '8px', fontWeight: 'bold' }}>Skill Prize Pool</label>
              <input 
                type="text" value={prizePool} onChange={(e) => setPrizePool(e.target.value)}
                placeholder="e.g., Titleist Driver, 10k THB"
                style={{ width: '100%', padding: '12px', background: '#222', border: '1px solid #444', color: '#fff', borderRadius: '6px' }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', color: '#888', marginBottom: '8px', fontWeight: 'bold' }}>Raffle Pool</label>
              <input 
                type="text" value={raffleItems} onChange={(e) => setRaffleItems(e.target.value)}
                placeholder="e.g., ProV1 Balls, OEM Caps"
                style={{ width: '100%', padding: '12px', background: '#222', border: '1px solid #444', color: '#fff', borderRadius: '6px' }}
              />
            </div>
          </div>

          {/* ROW 4: Fee & Dinner */}
          <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', color: '#888', marginBottom: '8px', fontWeight: 'bold' }}>Fiat Entry Fee (THB)</label>
              <input 
                type="number" value={entryFee} onChange={(e) => setEntryFee(e.target.value)}
                placeholder="e.g., 3500"
                style={{ width: '100%', padding: '12px', background: '#222', border: '1px solid #D4AF37', color: '#fff', borderRadius: '6px' }}
              />
            </div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px', paddingTop: '20px' }}>
              <input 
                type="checkbox" id="dinnerCheck" checked={includesDinner} onChange={(e) => setIncludesDinner(e.target.checked)}
                style={{ width: '20px', height: '20px', cursor: 'pointer' }}
              />
              <label htmlFor="dinnerCheck" style={{ color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}>
                Includes Clubhouse Dinner Banquet
              </label>
            </div>
          </div>

          <div style={{ background: '#1a1a1a', padding: '15px', borderRadius: '6px', borderLeft: '4px solid #8A2BE2', marginTop: '10px' }}>
            <span style={{ color: '#ccc', fontSize: '0.9rem' }}>
              <strong>Gateway Lock:</strong> Setting a fiat entry fee will bypass the Apple/Google chip economy and route users directly to the Stripe/PromptPay native checkout flow.
            </span>
          </div>

          <button 
            type="submit" 
            disabled={isSubmitting}
            style={{ 
              padding: '15px', backgroundColor: isSubmitting ? '#555' : '#D4AF37', color: '#000',
              border: 'none', borderRadius: '8px', fontWeight: '900', cursor: isSubmitting ? 'not-allowed' : 'pointer', marginTop: '10px', fontSize: '1.1rem' 
            }}
          >
            {isSubmitting ? 'INITIALIZING...' : '⚡ GENERATE TOURNAMENT'}
          </button>
        </form>
      </div>
    </div>
  );
}