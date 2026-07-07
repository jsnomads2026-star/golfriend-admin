import { useState, useEffect, useMemo } from 'react';
import { doc, setDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';

export default function CourseSeeder() {
  const [logs, setLogs] = useState<string[]>([]);
  const [isSeeding, setIsSeeding] = useState(false);
  const [isHealing, setIsHealing] = useState(false);
  const [securedCourses, setSecuredCourses] = useState<any[]>([]);
  const [vaultSearch, setVaultSearch] = useState(""); // 🔥 NEW: Live Search Filter
  const [manualGpsInputs, setManualGpsInputs] = useState<Record<string, string>>({}); // 🔥 Surgical Input State

  // 🔥 SURGICAL OVERRIDE: Fixes a specific quarantined course
  const handleSurgicalOverride = async (course: any) => {
    const coords = manualGpsInputs[course.courseID];
    if (!coords || !coords.includes(',')) return alert("❌ Please enter valid coordinates (e.g., 13.75, 100.50)");
    
    const [latStr, lngStr] = coords.split(',');
    const exactLat = parseFloat(latStr.trim());
    const exactLng = parseFloat(lngStr.trim());

    try {
      const healedData = {
        latitude: exactLat, longitude: exactLng, lat: exactLat, lng: exactLng,
        requiresManualGPS: false, // 🔥 Lifts the quarantine!
        lastHealAttempt: new Date().toISOString()
      };
      
      await setDoc(doc(db, "courses", course.courseID), healedData, { merge: true });
      
      setSecuredCourses(prev => prev.map(c => 
        c.courseID === course.courseID ? { ...c, ...healedData } : c
      ));
      addLog(`✅ SURGICAL OVERRIDE: Rescued ${course.clubName || course.name}`);
      
      // Clear the input box
      setManualGpsInputs(prev => ({...prev, [course.courseID]: ""}));
    } catch (error) {
      alert("❌ Failed to save manual override.");
    }
  };

  // 🧮 SYSTEM HEALTH HUB MATH
  const systemHealth = useMemo(() => {
    const total = securedCourses.length;
    if (total === 0) return { broken: 0, healthRate: 100, lastHeal: "Never" };
    
    const broken = securedCourses.filter((c: any) => 
      c.requiresManualGPS !== true && // 🔥 Don't count quarantined courses as actively "broken"
      (!c.latitude || c.latitude === 0 || !c.lat || c.lat === 0)
    ).length;
    
    const healthRate = Math.round(((total - broken) / total) * 100);
    
    let latestTime = 0;
    let latestStr = "Never";
    securedCourses.forEach((c: any) => {
      if (c.cachedAt) {
        const ms = Date.parse(c.cachedAt);
        if (!isNaN(ms) && ms > latestTime) {
          latestTime = ms;
          latestStr = new Date(ms).toLocaleString();
        }
      }
    });
    
    return { broken, healthRate, lastHeal: latestStr };
  }, [securedCourses]);

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
  const [scanRadius, setScanRadius] = useState("50"); // 🔥 DEFAULT 50KM REGIONAL SCAN
  const [isMassRescuing, setIsMassRescuing] = useState(false);
  const GOLF_API_KEY = "442abb61-136f-4fd0-b812-e38aac503266"; // 🔥 FIX: Restored the missing '61'

  const addLog = (message: string) => {
    setLogs((prev) => [...prev, message]);
  };

  // 🔥 THE TRUE AUTO-HEALER (Option A)
  const healBrokenVault = async () => {
    const brokenCourses = securedCourses.filter((c: any) => 
      c.requiresManualGPS !== true && // 🔥 Skip quarantined courses
      (!c.latitude || c.latitude === 0 || !c.lat || c.lat === 0)
    );

    if (brokenCourses.length === 0) {
      return addLog("✅ VAULT IS FULLY HEALED. No broken coordinates found.");
    }

    setIsHealing(true);
    addLog(`\n🛠️ INITIATING MASS AUTO-HEAL: Targeting ${brokenCourses.length} broken courses...`);

    const headers = { 'Authorization': 'Bearer ' + GOLF_API_KEY };
    let fixedCount = 0;

    for (let i = 0; i < brokenCourses.length; i++) {
      const c = brokenCourses[i];
      // 🔥 THE ID FIX: Safely checks multiple schema variations
      const courseId = c.courseID || c.id || c.course_id; 
      
      if (!courseId || courseId === "unknown") {
        addLog(`⏭️ Skipping [${i + 1}/${brokenCourses.length}] ${c.clubName || c.name}: Invalid ID.`);
        continue;
      }

      try {
        addLog(`   🧰 Healing [${i + 1}/${brokenCourses.length}]: ${c.clubName || c.name}...`);
        
        let exactLat = 0;
        let exactLng = 0;
        
        const shellRes = await fetch(`https://www.golfapi.io/api/v2.3/courses/${courseId}`, { headers });
        
        // 🔐 QUOTA SAFETY VALVE: Stop the loop immediately if subscription limits are hit
        if (shellRes.status === 429 || shellRes.status === 403) {
          addLog(`🛑 SYSTEM HALTED: GolfAPI subscription quota reached or restricted (Status: ${shellRes.status}).`);
          alert("GolfAPI Subscription Limit Reached! Loop halted safely to protect remaining vault documents.");
          break;
        }

        if (shellRes.ok) {
          const shellData = await shellRes.json();
          const shell = shellData.data || shellData;
          if (shell.latitude && shell.longitude) {
            exactLat = parseFloat(shell.latitude);
            exactLng = parseFloat(shell.longitude);
          }
        }

        // 🔥 THE SIAM COUNTRY CLUB FIX: If top-level GPS is 0, steal it from the Greens Vector Grid!
        if (exactLat === 0 || exactLng === 0) {
          const coordRes = await fetch(`https://www.golfapi.io/api/v2.3/coordinates/${courseId}`, { headers });
          if (coordRes.ok) {
            const coordData = await coordRes.json();
            const gpsGrid = coordData.data || coordData;
            if (gpsGrid.greens && gpsGrid.greens.length > 0) {
              exactLat = parseFloat(gpsGrid.greens[0].latitude);
              exactLng = parseFloat(gpsGrid.greens[0].longitude);
              addLog(`   🧩 Extracted fallback GPS from Hole 1 Green Vectors`);
            }
          }
        }

        if (exactLat !== 0 && exactLng !== 0) {
          const healedData = {
            latitude: exactLat,
            longitude: exactLng,
            lat: exactLat,
            lng: exactLng,
            cachedAt: new Date().toISOString()
          };

          await setDoc(doc(db, "courses", courseId), healedData, { merge: true });
          fixedCount++;

          // 🔥 LIVE UI UPDATE: Visually drop the broken count instantly
          setSecuredCourses(prev => prev.map(course => 
            course.courseID === courseId ? { ...course, ...healedData } : course
          ));
          
          addLog(`   ✅ Fixed: Injected [${exactLat}, ${exactLng}]`);
        } else {
          // 🛑 QUARANTINE: Mark as un-healable
          await setDoc(doc(db, "courses", courseId), { requiresManualGPS: true }, { merge: true });
          setSecuredCourses(prev => prev.map(course => 
            course.courseID === courseId ? { ...course, requiresManualGPS: true } : course
          ));
          addLog(`   🛑 QUARANTINED: GolfAPI lacks GPS data for this course.`);
        }
      } catch (error) {
        // Also quarantine on hard crash
        await setDoc(doc(db, "courses", courseId), { requiresManualGPS: true }, { merge: true });
        setSecuredCourses(prev => prev.map(course => 
          course.courseID === courseId ? { ...course, requiresManualGPS: true } : course
        ));
        addLog(`   ⚠️ Error & Quarantined ${c.clubName}: ${error}`);
      }

      // Strict 1.5s throttle to prevent CORS/Rate Limits
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    addLog(`\n🎉 AUTO-HEAL COMPLETE: Successfully repaired ${fixedCount} courses!`);
    setIsHealing(false);
  };

  // 🔥 THE GOOGLE MAPS MASS AUTO-RESCUE ENGINE
  const executeMassRescue = async () => {
    const quarantined = securedCourses.filter((c: any) => c.requiresManualGPS === true);
    if (quarantined.length === 0) return addLog("✅ Quarantine Ward is empty.");
    
    setIsMassRescuing(true);
    addLog(`\n🚁 INITIATING MASS AUTO-RESCUE: Targeting ${quarantined.length} quarantined courses...`);

    let rescuedCount = 0;

    for (let i = 0; i < quarantined.length; i++) {
      const c = quarantined[i];
      const searchQuery = encodeURIComponent(`${c.clubName || c.name} golf course ${c.country || ''}`);
      
      try {
        addLog(`   🚑 Rescuing [${i + 1}/${quarantined.length}]: ${c.clubName || c.name}...`);
        
        const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${searchQuery}&key=AIzaSyAl9S1rKMJXm5m-7L4zFlztcZWjGhINBgM`);
        const data = await res.json();

        if (data.status === "OK" && data.results.length > 0) {
          const { lat, lng } = data.results[0].geometry.location;
          
          const healedData = {
            latitude: lat, longitude: lng, lat: lat, lng: lng,
            requiresManualGPS: false,
            lastHealAttempt: new Date().toISOString()
          };

          await setDoc(doc(db, "courses", c.courseID), healedData, { merge: true });
          
          setSecuredCourses(prev => prev.map(course => 
            course.courseID === c.courseID ? { ...course, ...healedData } : course
          ));
          
          rescuedCount++;
          addLog(`   ✅ Success: Injected [${lat.toFixed(4)}, ${lng.toFixed(4)}]`);
        } else {
          addLog(`   ⚠️ Failed: Google Maps could not find a match (${data.status}).`);
        }
      } catch (error) {
        addLog(`   ❌ Error: Geocoding API request failed.`);
      }

      // 🏎️ Throttle: 200ms delay safely handles 5 courses per second.
      await new Promise(resolve => setTimeout(resolve, 200)); 
    }

    addLog(`\n🎉 MASS RESCUE COMPLETE: Escorted ${rescuedCount} courses out of quarantine!`);
    setIsMassRescuing(false);
  };

  // 🔥 THE MASS REGIONAL FETCH ENGINE (RADIUS SCANNER)
  // 🔥 THE MASS REGIONAL FETCH ENGINE (RADIUS SCANNER)
  const fetchLiveCourse = async () => {
    if (!apiSearchId || !apiSearchId.includes(',')) {
      return addLog("❌ Please enter valid GPS coordinates (e.g., 12.9236, 100.8825 for Pattaya).");
    }
    
    setIsSeeding(true);
    const [lat, lng] = apiSearchId.split(',').map(coord => coord.trim());
    const radius = parseInt(scanRadius) || 50;
    addLog(`\n🎯 REGIONAL RADAR LOCKED: Sweeping ${radius}km radius around [Lat: ${lat}, Lng: ${lng}]`);
    
    try {
      const headers = { 'Authorization': 'Bearer ' + GOLF_API_KEY };

      // --- PING 1: The Regional Club Extraction ---
      addLog(`📡 PING: Executing Mass Regional Fetch...`);
      const shellRes = await fetch(`https://www.golfapi.io/api/v2.3/clubs?lat=${lat}&lng=${lng}&radius=${radius}`, { headers });
      if (!shellRes.ok) throw new Error(`Network rejected Ping: ${shellRes.status}`);
      
      const shellData = await shellRes.json();
      const clubsArray = shellData.clubs || shellData.data || [];
      
      if (clubsArray.length === 0) {
         addLog(`❌ No clubs found near these coordinates.`);
         return;
      }

      addLog(`🧬 EXTRACTING DATA: Found ${clubsArray.length} clubs. Processing courses...`);
      
      // --- THE BULK INJECTION LOOP ---
      let injectedCount = 0;
      for (const club of clubsArray) {
        const courses = club.courses || [];
        
        for (const c of courses) {
          const courseId = c.courseID || c.id || "unknown";
          if (courseId === "unknown") continue;

          let exactLat = parseFloat(club.latitude) || 0;
          let exactLng = parseFloat(club.longitude) || 0;

          // 🔥 TS FIX: Explicitly type the arrays
          let greenGrid: any[] = [];
          let bunkerGrid: any[] = [];
          let waterGrid: any[] = [];
          let courseHoles: any[] = []; 

          try {
            addLog(`   📍 Pinging API for precise GPS & Grids: ${c.courseName || c.name}...`);
            
            // 1. Get the exact top-level coordinates & hole metadata
            const courseRes = await fetch(`https://www.golfapi.io/api/v2.3/courses/${courseId}`, { headers });
            if (courseRes.ok) {
              const courseData = await courseRes.json();
              const coursePayload = courseData.data || courseData;
              if (coursePayload.latitude && coursePayload.longitude) {
                exactLat = parseFloat(coursePayload.latitude);
                exactLng = parseFloat(coursePayload.longitude);
              }
              // Extract the actual hole array (pars, stroke index, etc.)
              if (Array.isArray(coursePayload.holes)) {
                courseHoles = coursePayload.holes;
              } else if (Array.isArray(c.holes)) {
                courseHoles = c.holes;
              }
            }

            // 2. Get the detailed vector grids
            const coordRes = await fetch(`https://www.golfapi.io/api/v2.3/coordinates/${courseId}`, { headers });
            if (coordRes.ok) {
              const coordData = await coordRes.json();
              const gpsGrid = coordData.data || coordData;
              greenGrid = gpsGrid.greens || [];
              bunkerGrid = gpsGrid.bunkers || [];
              waterGrid = gpsGrid.water || [];
            }
            
            // 3. 🔥 THE STITCH: Fuse the Green GPS coordinates directly into the Holes array
            if (courseHoles.length > 0 && greenGrid.length > 0) {
              courseHoles = courseHoles.map((hole: any) => {
                const matchingGreen = greenGrid.find((g: any) => Number(g.holeNumber) === Number(hole.holeNumber || hole.hole || hole.num));
                return {
                  ...hole,
                  green_gps: matchingGreen ? { lat: parseFloat(matchingGreen.latitude), lng: parseFloat(matchingGreen.longitude) } : null
                };
              });
            } else if (courseHoles.length === 0) {
              // 🛟 Failsafe Generator if the API completely omits the holes array
              courseHoles = Array.from({ length: 18 }, (_, i) => ({
                num: i + 1,
                par: 4,
                holeNumber: i + 1,
                strokeIndex: i + 1
              }));
            }
          } catch (apiErr) {
            console.error("GolfAPI Fetch error:", apiErr);
          }

          const mergedCourse = {
            courseID: courseId,
            clubID: club.clubID || club.id || "unknown",
            clubName: club.clubName || club.name || "Unknown Club",
            name: c.courseName || c.name || "Main Course",
            address: club.address || "Unknown",
            city: club.city || "Unknown",
            state: club.state || "Unknown",
            country: club.country || "Unknown",
            latitude: exactLat,
            longitude: exactLng,
            lat: exactLat,
            lng: exactLng,
            holes: courseHoles, // 🔥 THE FIX: Saving the fully stitched Object Array
            greenCoordinates: greenGrid,
            bunkerCoordinates: bunkerGrid,
            waterCoordinates: waterGrid,
            apiImported: true,
            cachedAt: new Date().toISOString(),
            isActive: true,
            requiresManualGPS: false 
          };

          // Inject to Firebase using merge to safely overwrite bad data
          await setDoc(doc(db, "courses", mergedCourse.courseID), mergedCourse, { merge: true });
          injectedCount++;
          
          // 1.5-second throttle to prevent GolfAPI rate limiting
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      }

      addLog(`⛳ SUCCESS: ${injectedCount} global courses armed and operational!`);
      await fetchVault(); // Refresh inventory instantly

    } catch (error: any) {
      addLog(`❌ RADAR MISFIRE: ${error.message}`);
    } finally {
      setIsSeeding(false);
      setApiSearchId("");
    }
  };
  

  return (
    <div style={{ padding: '20px', border: '1px solid #333', borderRadius: '8px', margin: '20px', backgroundColor: '#1e1e1e', color: '#fff' }}>
      <h2 style={{ color: '#d4af37', marginTop: 0 }}>Golfriend Local Injector</h2>
      <p style={{ fontSize: '14px', color: '#aaa' }}>Target: Firebase Direct Write Bypass & Live API Engine</p>
      
      {/* 📊 SYSTEM HEALTH MONITOR HUD */}
      <div style={{ display: 'flex', gap: '15px', marginBottom: '20px', marginTop: '15px' }}>
        <div style={{ flex: 1, padding: '15px', backgroundColor: '#111', border: '1px solid #333', borderRadius: '6px', textAlign: 'center', position: 'relative' }}>
          <div style={{ fontSize: '12px', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Broken Coordinates</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: systemHealth.broken > 0 ? '#ff4444' : '#4CAF50', marginTop: '5px' }}>{systemHealth.broken}</div>
          
          {/* 🔥 THE NEW TRIGGER BUTTON */}
          {systemHealth.broken > 0 && (
            <button 
              onClick={healBrokenVault} 
              disabled={isHealing || isSeeding}
              style={{ marginTop: '10px', backgroundColor: isHealing ? '#555' : '#ff4444', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: (isHealing || isSeeding) ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: 'bold', letterSpacing: '1px' }}
            >
              {isHealing ? 'HEALING IN PROGRESS...' : 'HEAL VAULT NOW'}
            </button>
          )}
        </div>
        <div style={{ flex: 1, padding: '15px', backgroundColor: '#111', border: '1px solid #333', borderRadius: '6px', textAlign: 'center' }}>
          <div style={{ fontSize: '12px', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Vault Integrity</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: systemHealth.healthRate >= 90 ? '#4CAF50' : '#ff8c00', marginTop: '5px' }}>{systemHealth.healthRate}%</div>
        </div>
        <div style={{ flex: 1, padding: '15px', backgroundColor: '#111', border: '1px solid #333', borderRadius: '6px', textAlign: 'center' }}>
          <div style={{ fontSize: '12px', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Last Cloud Auto-Heal</div>
          <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#1E88E5', marginTop: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{systemHealth.lastHeal}</div>
        </div>
      </div>
      
      {/* 🔥 THE MASS REGIONAL FETCH CONSOLE */}
      <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: 'rgba(212, 175, 55, 0.1)', border: '1px solid #d4af37', borderRadius: '5px' }}>
        <h3 style={{ marginTop: 0, color: '#d4af37', fontSize: '16px' }}>Mass Regional Fetch Engine</h3>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <input 
            type="text" 
            placeholder="Center GPS (e.g. 12.9236, 100.8825)" 
            value={apiSearchId}
            onChange={(e) => setApiSearchId(e.target.value)}
            style={{ padding: '10px', width: '280px', borderRadius: '4px', border: '1px solid #555', backgroundColor: '#333', color: '#fff' }}
          />
          <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#333', border: '1px solid #555', borderRadius: '4px', padding: '0 10px' }}>
            <span style={{ color: '#aaa', fontSize: '12px', fontWeight: 'bold' }}>RADIUS:</span>
            <input 
              type="number" 
              value={scanRadius}
              onChange={(e) => setScanRadius(e.target.value)}
              style={{ padding: '10px 5px', width: '60px', border: 'none', backgroundColor: 'transparent', color: '#fff', outline: 'none', textAlign: 'center' }}
            />
            <span style={{ color: '#aaa', fontSize: '12px', fontWeight: 'bold' }}>KM</span>
          </div>
          <button 
            onClick={fetchLiveCourse} 
            disabled={isSeeding} 
            style={{ backgroundColor: isSeeding ? '#555' : '#D4AF37', color: '#000', padding: '10px 20px', fontWeight: '900', border: 'none', borderRadius: '5px', cursor: isSeeding ? 'not-allowed' : 'pointer' }}
          >
            {isSeeding ? 'SWEEPING REGION...' : 'EXECUTE REGIONAL SCAN'}
          </button>
        </div>
      </div>

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
            // 🔥 THE FIX: Added a fallback string (c.courseID || "") to prevent null crashes
            .filter(c => (c.clubName || c.name || "").toLowerCase().includes(vaultSearch.toLowerCase()) || (c.courseID || "").includes(vaultSearch))
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

      {/* 🔥 THE QUARANTINE WARD (MANUAL OVERRIDE ZONE) */}
      <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#2a0a0a', border: '1px solid #ff4444', borderRadius: '5px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <div>
            <h3 style={{ margin: '0 0 5px 0', color: '#ff4444', fontSize: '16px' }}>
              🚨 Quarantine Ward ({securedCourses.filter((c: any) => c.requiresManualGPS === true).length})
            </h3>
            <p style={{ fontSize: '12px', color: '#aaa', margin: 0 }}>
              These courses have no API data. Use the Mass Rescue engine or fix them manually.
            </p>
          </div>
          {securedCourses.filter((c: any) => c.requiresManualGPS === true).length > 0 && (
            <button 
              onClick={executeMassRescue}
              disabled={isMassRescuing || isSeeding || isHealing}
              style={{ backgroundColor: isMassRescuing ? '#555' : '#1E88E5', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '4px', cursor: (isMassRescuing || isSeeding || isHealing) ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '12px' }}
            >
              {isMassRescuing ? '🚁 RESCUING COURSES...' : '🚁 MASS AUTO-RESCUE'}
            </button>
          )}
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '250px', overflowY: 'auto', paddingRight: '5px' }}>
          {securedCourses.filter((c: any) => c.requiresManualGPS === true).map((c, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', backgroundColor: '#111', border: '1px solid #333', borderRadius: '4px' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ color: '#d4af37', fontWeight: 'bold', fontSize: '14px' }}>{c.clubName || c.name}</span>
                <span style={{ color: '#666', fontSize: '11px' }}>ID: {c.courseID} | {c.country || 'Unknown'}</span>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                {/* 🔥 THE 1-CLICK MAPS SEARCH */}
                <a 
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((c.clubName || c.name) + ' golf ' + (c.country || ''))}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ backgroundColor: '#1E88E5', color: '#fff', padding: '6px 12px', borderRadius: '4px', textDecoration: 'none', fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center' }}
                >
                  🗺️ MAPS
                </a>
                <input 
                  type="text" 
                  placeholder="e.g. 10.8315, 106.6663" 
                  value={manualGpsInputs[c.courseID] || ""}
                  onChange={(e) => setManualGpsInputs({...manualGpsInputs, [c.courseID]: e.target.value})}
                  style={{ padding: '6px', borderRadius: '4px', border: '1px solid #555', backgroundColor: '#222', color: '#fff', width: '200px', fontSize: '12px' }}
                />
                <button 
                  onClick={() => handleSurgicalOverride(c)}
                  style={{ backgroundColor: '#1c3a21', color: '#44ff66', border: '1px solid #44ff66', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}
                >
                  SAVE & RESCUE
                </button>
              </div>
            </div>
          ))}
          {securedCourses.filter((c: any) => c.requiresManualGPS === true).length === 0 && (
             <span style={{ color: '#4CAF50', fontSize: '12px', fontWeight: 'bold' }}>All clear. No quarantined courses.</span>
          )}
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