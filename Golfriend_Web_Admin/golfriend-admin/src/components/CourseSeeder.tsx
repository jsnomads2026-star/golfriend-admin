import { useState, useEffect } from 'react';
import { doc, setDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';

// PRE-VERIFIED GPS DATA FOR PATTAYA MVP LAUNCH
const PATTAYA_HARDCODED_MVP = [
  { courseID: "siam-old-01", clubID: "siam-cc", clubName: "Siam Country Club", name: "Old Course", lat: 12.9175, lng: 100.9572 },
  { courseID: "chee-chan-01", clubID: "chee-chan", clubName: "Chee Chan Golf Resort", name: "Championship Layout", lat: 12.7843, lng: 100.9545 },
  { courseID: "laem-chabang-01", clubID: "laem-chabang", clubName: "Laem Chabang Int.", name: "Mountain & Lake", lat: 13.0641, lng: 101.0375 },
  { courseID: "burapha-01", clubID: "burapha", clubName: "Burapha Golf Resort", name: "East Course (A/B)", lat: 13.0485, lng: 101.0423 },
  { courseID: "phoenix-gold-01", clubID: "phoenix-gold", clubName: "Phoenix Gold Golf", name: "Mountain & Ocean", lat: 12.8312, lng: 100.9421 }
];

export default function CourseSeeder() {
  const [logs, setLogs] = useState<string[]>([]);
  const [isSeeding, setIsSeeding] = useState(false);
  const [securedCourses, setSecuredCourses] = useState<any[]>([]);
  const [vaultSearch, setVaultSearch] = useState(""); // 🔥 NEW: Live Search Filter

  // 🔥 THE VAULT RADAR ENGINE
  const fetchVault = async () => {
    try {
      const snapshot = await getDocs(collection(db, "courses"));
      const courses = snapshot.docs.map(doc => doc.data());
      setSecuredCourses(courses);
    } catch (error) {
      console.error("Vault fetch error:", error);
    }
  };

  // Run once when dashboard opens
  useEffect(() => {
    fetchVault();
  }, []);
  const [apiSearchId, setApiSearchId] = useState("");
  const GOLF_API_KEY = "442abb61-136f-4fd0-b812-e38aac503266"; // 🔥 FIX: Restored the missing '61'

  const addLog = (message: string) => {
    setLogs((prev) => [...prev, message]);
  };

  // 🔥 THE TWO-STEP SNIPER ENGINE
  const fetchLiveCourse = async () => {
    if (!apiSearchId) return addLog("❌ Please enter a Club or Course ID.");
    setIsSeeding(true);
    addLog(`\n🎯 SNIPER LOCKED: Initiating Two-Step Intercept for ID: ${apiSearchId}`);
    
    try {
      const headers = { 'Authorization': 'Bearer ' + GOLF_API_KEY };

      // --- PING 1: The Macro Shell ---
      addLog(`📡 PING 1: Fetching Macro Shell data...`);
      const shellRes = await fetch(`https://www.golfapi.io/api/v2.3/courses/${apiSearchId}`, { headers });
      if (!shellRes.ok) throw new Error(`Network rejected Ping 1: ${shellRes.status}`);
      const shellData = await shellRes.json();
      const shell = shellData.data || shellData;

      // --- PING 2: The Micro GPS Grid ---
      addLog(`📡 PING 2: Fetching Micro GPS Coordinates (Bunkers, Water, Greens)...`);
      const coordRes = await fetch(`https://www.golfapi.io/api/v2.3/coordinates/${apiSearchId}`, { headers });
      if (!coordRes.ok) throw new Error(`Network rejected Ping 2: ${coordRes.status}`);
      const coordData = await coordRes.json();
      const gpsGrid = coordData.data || coordData; 

      // --- THE MERGE ---
      addLog(`🧬 MERGING DATA: Stitching Shell and GPS Grid together...`);
      const mergedCourse = {
        courseID: apiSearchId,
        clubName: shell.clubName || shell.name || "Unknown Club",
        address: shell.address || "Unknown",
        city: shell.city || "Unknown",
        state: shell.state || "Unknown",
        country: shell.country || "Unknown",
        latitude: parseFloat(shell.latitude) || 0,
        longitude: parseFloat(shell.longitude) || 0,
        holes: shell.holes || 18,
        // ⛳ NEW: Injecting the detailed GPS mapping
        greenCoordinates: gpsGrid.greens || [],
        bunkerCoordinates: gpsGrid.bunkers || [],
        waterCoordinates: gpsGrid.water || [],
        apiImported: true,
        cachedAt: new Date().toISOString(),
        isActive: true
      };

      await setDoc(doc(db, "courses", apiSearchId), mergedCourse);
      addLog(`⛳ SUCCESS: ${mergedCourse.clubName} is fully armed and operational!`);

    } catch (error: any) {
      addLog(`❌ SNIPER MISFIRE: ${error.message}`);
    } finally {
      setIsSeeding(false);
      setApiSearchId("");
    }
  };

  // 🔥 THE RECON DRONE (Costs 0.1 Ping)
  const launchReconDrone = async () => {
    setIsSeeding(true);
    addLog(`\n🚁 LAUNCHING RECON DRONE: Sweeping Pattaya Region...`);
    
    try {
      const headers = { 'Authorization': 'Bearer ' + GOLF_API_KEY };
      // 🔥 FIX: The radar must sweep the CLUBS endpoint, not courses
      const res = await fetch(`https://www.golfapi.io/api/v2.3/clubs?lat=12.9236&lng=100.8825`, { headers });
      
      if (!res.ok) {
        throw new Error(`${res.status} (If 401 persists, the Trial Tier strictly blocks searches)`);
      }
      
      const data = await res.json();
      const clubsArray = data.clubs || [];
      addLog(`✅ RECON SUCCESS: Found ${clubsArray.length} clubs. (Cost: 0.1 Ping)`);
      
      // Extract the individual courses nested inside each club
      clubsArray.slice(0, 10).forEach((club: any) => {
        const courses = club.courses || [];
        courses.forEach((c: any) => {
          addLog(`📌 ID: ${c.courseID} | Name: ${club.clubName} - ${c.courseName}`);
        });
      });
      
      console.log("⛳ FULL RECON DATA:", clubsArray);
    } catch (error: any) {
      addLog(`❌ DRONE CRASHED: ${error.message}`);
    } finally {
      setIsSeeding(false);
    }
  };

  const executeBypassSequence = async () => {
    setIsSeeding(true);
    addLog("🚀 INITIALIZING HARD-CODED FIREBASE BYPASS...");

    for (const course of PATTAYA_HARDCODED_MVP) {
      addLog(`\n📍 Injecting data for: ${course.clubName} - ${course.name}...`);

      try {
        await setDoc(doc(db, "courses", course.courseID), {
          courseID: course.courseID,
          clubID: course.clubID,
          clubName: course.clubName,
          name: course.name,
          address: "Pattaya, Chon Buri",
          city: "Pattaya",
          country: "Thailand",
          latitude: course.lat,
          longitude: course.lng,
          holes: 18,
          greenCoordinates: [], // 🔥 SHIELD: Prevents radar crash
          bunkerCoordinates: [], // 🔥 SHIELD: Prevents radar crash
          waterCoordinates: [], // 🔥 SHIELD: Prevents radar crash
          apiImported: false,
          cachedAt: new Date().toISOString(),
          isActive: true
        });

        addLog(`  ✅ SUCCESS: Database locked.`);
      } catch (error) {
        addLog(`  ❌ FAILED: Firebase Error - ${error}`);
      }

      // Artificial delay for UI effect
      await new Promise((resolve) => setTimeout(resolve, 600));
    }

    addLog("\n🏁 BYPASS COMPLETE. Your Firebase MVP Database is fully seeded!");
    await fetchVault(); // 🔥 Auto-refresh inventory
    setIsSeeding(false);
  };

  return (
    <div style={{ padding: '20px', border: '1px solid #333', borderRadius: '8px', margin: '20px', backgroundColor: '#1e1e1e', color: '#fff' }}>
      <h2 style={{ color: '#d4af37', marginTop: 0 }}>Golfriend Local Injector</h2>
      <p style={{ fontSize: '14px', color: '#aaa' }}>Target: Firebase Direct Write Bypass & Live API Engine</p>
      
      {/* 🔥 THE LIVE API CONTROL CONSOLE */}
      <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: 'rgba(212, 175, 55, 0.1)', border: '1px solid #d4af37', borderRadius: '5px' }}>
        <h3 style={{ marginTop: 0, color: '#d4af37', fontSize: '16px' }}>Live Golf API Integrator</h3>
        <input 
          type="text" 
          placeholder="Enter Course ID (e.g. 012141520658891108829)" 
          value={apiSearchId}
          onChange={(e) => setApiSearchId(e.target.value)}
          style={{ padding: '10px', width: '280px', marginRight: '10px', borderRadius: '4px', border: '1px solid #555', backgroundColor: '#333', color: '#fff' }}
        />
        <button 
          onClick={fetchLiveCourse} 
          disabled={isSeeding} 
          style={{ backgroundColor: isSeeding ? '#555' : '#4CAF50', color: '#fff', padding: '10px 20px', fontWeight: 'bold', border: 'none', borderRadius: '5px', cursor: isSeeding ? 'not-allowed' : 'pointer' }}
        >
          FETCH & INJECT
        </button>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <button 
          onClick={launchReconDrone} 
          disabled={isSeeding}
          style={{ backgroundColor: isSeeding ? '#555' : '#1E88E5', color: '#fff', padding: '10px 20px', fontWeight: 'bold', border: 'none', borderRadius: '5px', cursor: isSeeding ? 'not-allowed' : 'pointer', marginRight: '10px' }}
        >
          {isSeeding ? "SWEEPING..." : "🚁 LAUNCH RECON DRONE (0.1 Ping)"}
        </button>
      </div>

      <button 
        onClick={executeBypassSequence} 
        disabled={isSeeding}
        style={{ 
          backgroundColor: isSeeding ? '#555' : '#d4af37', 
          color: '#000', 
          padding: '10px 20px', 
          fontWeight: 'bold', 
          border: 'none', 
          borderRadius: '5px',
          cursor: isSeeding ? 'not-allowed' : 'pointer'
        }}
      >
        {isSeeding ? "INJECTING..." : "FORCE INJECT MVP DATA"}
      </button>

      {/* 🔥 UPGRADED VAULT INVENTORY (SCALABLE) */}
      <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#111', border: '1px solid #444', borderRadius: '5px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h3 style={{ margin: 0, color: '#4CAF50', fontSize: '16px' }}>🔐 Secured Courses ({securedCourses.length})</h3>
          <input 
            type="text" 
            placeholder="Search Vault..." 
            value={vaultSearch}
            onChange={(e) => setVaultSearch(e.target.value)}
            style={{ padding: '8px', borderRadius: '4px', border: '1px solid #555', backgroundColor: '#222', color: '#fff', width: '250px' }}
          />
        </div>
        
        {/* 📜 Scrollable window limits height so 10,000 courses don't stretch the page forever */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', maxHeight: '250px', overflowY: 'auto', paddingRight: '5px' }}>
          {securedCourses
            .filter(c => (c.clubName || c.name || "").toLowerCase().includes(vaultSearch.toLowerCase()) || c.courseID.includes(vaultSearch))
            .map((c, i) => (
            <div key={i} style={{ padding: '5px 10px', backgroundColor: '#222', border: '1px solid #555', borderRadius: '4px', fontSize: '12px', display: 'flex', alignItems: 'center' }}>
              {/* 🔢 The numbering system you requested */}
              <span style={{ color: '#888', marginRight: '8px', fontWeight: 'bold' }}>#{i + 1}</span>
              <span style={{ color: '#d4af37', fontWeight: 'bold', marginRight: '5px' }}>{c.clubName || c.name}</span> 
              <span style={{ color: '#666' }}>| {c.courseID}</span>
            </div>
          ))}
          {securedCourses.length === 0 && <span style={{ color: '#555', fontSize: '12px' }}>Vault is empty.</span>}
        </div>
      </div>

      <div style={{ marginTop: '20px', padding: '10px', backgroundColor: '#000', borderRadius: '5px', maxHeight: '400px', overflowY: 'auto', fontFamily: 'monospace', fontSize: '12px' }}>
        {logs.length === 0 ? <span style={{ color: '#555' }}>Awaiting command...</span> : null}
        {logs.map((log, index) => (
          <div key={index} style={{ whiteSpace: 'pre-wrap', marginBottom: '4px' }}>{log}</div>
        ))}
      </div>
    </div>
  );
}