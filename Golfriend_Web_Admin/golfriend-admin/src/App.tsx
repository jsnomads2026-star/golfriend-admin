import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebaseConfig';
import LandingPage from './components/public/LandingPage';
import SmallBusinessDashboard from './components/B2B/SmallBusinessDashboard';
import EnterpriseDashboard from './components/B2B/EnterpriseDashboard';
import B2BStorefront from './components/public/B2BStorefront';
import PhotoValidator from './components/admin/PhotoValidator';
import CentralBankMonitor from './components/admin/CentralBankMonitor';
import EscrowWatchtower from './components/admin/EscrowWatchtower';
import ManualOverride from './components/admin/ManualOverride';
import FiatLedger from './components/admin/FiatLedger';
import CourseSeeder from './components/CourseSeeder';
import TournamentManager from './components/admin/TournamentManager'; 
import TournamentTV from './components/admin/TournamentTV'; 
import EventGenesisConsole from './components/admin/EventGenesisConsole';
import SponsorOnboardingWizard from './components/admin/sponsors/SponsorOnboardingWizard';
import SponsorDashboard from './components/admin/sponsors/SponsorDashboard';
import LiveAutomationLog from './components/admin/LiveAutomationLog';
import SupportModerationHub from './components/admin/SupportModerationHub';
import PartnerVault from './components/admin/PartnerVault';
import B2BPartners from './components/B2B/B2BPartners';
import HRManagement from './components/admin/HRManagement'; // 🔥 HR & Staff

// 🔥 B2B COMMERCE (OEM) COMPONENTS
import VendorControlSystem from './components/admin/oem/VendorControlSystem';
import OemProductForge from './components/admin/oem/OemProductForge';
import OrderFulfillmentHub from './components/admin/oem/OrderFulfillmentHub';
import BuyerCustomerCRM from './components/admin/oem/BuyerCustomerCRM';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* PUBLIC ARENA */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/storefront" element={<B2BStorefront />} />
        
        {/* SECURE ISOLATED DASHBOARDS */}
        <Route path="/partner" element={<Dashboard mode="partner" />} />
        <Route path="/admin" element={<Dashboard mode="admin" />} />
        
        {/* CATCH-ALL: Redirects unknown links to the landing page */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

function Dashboard({ mode }: { mode: 'admin' | 'partner' }) {
  const [user, setUser] = useState<any>(null);
  const [partnerData, setPartnerData] = useState<any>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  // 🔥 MANUAL LOGOUT: Admin God-Mode
  const executeSecureLogout = async () => {
    console.log("🚪 Executing Secure Logout...");
    try {
      await signOut(getAuth());
      window.location.href = '/';
    } catch (error) {
      console.error("🚨 Failed to terminate session:", error);
    }
  };
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  const [activeTab, setActiveTab] = useState<'photos' | 'escrow' | 'ledger' | 'fiat' | 'bank' | 'courses' | 'tournaments' | 'genesis' | 'sponsor' | 'adhub' | 'automation' | 'support' | 'vault' | 'vendors' | 'forge' | 'fulfillment' | 'crm' | 'b2b' | 'hr'>('courses');

  // 🔥 CORE AUTHENTICATION LISTENERtiveTab] = useState<'photos' | 'escrow' | 'ledger' | 'fiat' | 'bank' | 'courses' | 'tournaments' | 'genesis' | 'sponsor' | 'adhub' | 'automation' | 'support' | 'vault' | 'vendors' | 'forge' | 'fulfillment' | 'crm' | 'b2b' | 'hr'>('courses');

  // 🔥 CORE AUTHENTICATION LISTENER
  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
      if (currentUser) {
        try {
          // 🔒 Check if the logged-in user is a B2B Commercial Partner
          let partnerDoc = null;
          let retries = 3; // Will check 3 times

          // ⏳ WEBHOOK BUFFER: Retries the database check to give Stripe time to write the data
          while (retries > 0) {
            partnerDoc = await getDoc(doc(db, 'b2b_partners', currentUser.uid));
            
            if (!partnerDoc.exists() && currentUser.email) {
              partnerDoc = await getDoc(doc(db, 'b2b_partners', currentUser.email));
              if (!partnerDoc.exists()) {
                const capitalizedEmail = currentUser.email.charAt(0).toUpperCase() + currentUser.email.slice(1);
                partnerDoc = await getDoc(doc(db, 'b2b_partners', capitalizedEmail));
              }
            }

            if (partnerDoc && partnerDoc.exists()) {
              break; // Found it! Exit the loop.
            }

            // Wait 1.5 seconds before checking again
            await new Promise(resolve => setTimeout(resolve, 1500));
            retries--;
          }

          if (partnerDoc && partnerDoc.exists()) {
            setPartnerData(partnerDoc.data());
          } else {
            setPartnerData(null);
          }
        } catch (error) {
          console.error("🚨 Failed to verify B2B Partner status:", error);
          setPartnerData(null);
        }
      } else {
        setPartnerData(null);
      }
      
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      await signInWithEmailAndPassword(getAuth(), email, password);
    } catch (error: any) {
      setAuthError('INVALID MASTER CREDENTIALS');
    }
  };

  // 🔥 TV MODE BYPASS: Checks the URL to see if it should hijack the screen
  const isTvMode = new URLSearchParams(window.location.search).get('tv') === 'true';

  if (isTvMode) {
    return <TournamentTV />;
  }

  // 🔥 SECURE B2B GATEWAY: Routes commercial partners to their isolated UI
  if (mode === 'partner') {
    if (user && partnerData) {
      const isMasterHost = 
        partnerData.tier === 'enterprise' || 
        partnerData.tier === 'Enterprise' || 
        partnerData.tier === 'master_host' || 
        partnerData.tier === 'Product & Service Promotion';

      return isMasterHost ? (
        <EnterpriseDashboard partnerData={partnerData} />
      ) : (
        <SmallBusinessDashboard partnerData={partnerData} />
      );
    }

    if (user && !partnerData && !isAuthLoading) {
      return (
        <div style={{...styles.masterContainer, justifyContent: 'center', alignItems: 'center', flexDirection: 'column'}}>
          <h1 style={styles.logo}>B2B PROFILE NOT FOUND</h1>
          <p style={{color: '#888', marginBottom: '24px'}}>We could not locate an active commercial license for this account.</p>
          <button onClick={executeSecureLogout} style={{padding: '12px 24px', backgroundColor: '#ff4444', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer'}}>
            Return to Storefront
          </button>
        </div>
      );
    }
  }

  // 🔥 STRICT ADMIN LOCK: Prevents unauthorized access to God-Mode
  if (mode === 'admin' && user && user.email !== 'admin@golfriend.co') {
    return (
      <div style={{...styles.masterContainer, justifyContent: 'center', alignItems: 'center', flexDirection: 'column'}}>
        <h1 style={styles.logo}>UNAUTHORIZED GOD-MODE ACCESS</h1>
        <p style={{color: '#ff4444', marginBottom: '24px'}}>CRITICAL SECURITY: This account is not an authorized Director.</p>
        <button onClick={executeSecureLogout} style={{padding: '12px 24px', backgroundColor: '#ff4444', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer'}}>
          Force Logout
        </button>
      </div>
    );
  }

  // 🔥 SECURE GATE: Loading State
  if (isAuthLoading) {
    return (
      <div style={{...styles.masterContainer, justifyContent: 'center', alignItems: 'center'}}>
        <h1 style={styles.logo}>SECURE CONNECTION ESTABLISHING...</h1>
      </div>
    );
  }

  // 🔥 SECURE GATE: Login Lock
  if (!user) {
    if (mode === 'partner') {
      window.location.href = '/storefront';
      return null;
    }
    
    return (
      <div style={{...styles.masterContainer, justifyContent: 'center', alignItems: 'center', flexDirection: 'column'}}>
        <div style={{backgroundColor: '#121212', padding: '40px', borderRadius: '12px', border: '1px solid #333', width: '340px'}}>
          <h1 style={styles.logo}>GOLFRIEND GOD-MODE</h1>
          <form onSubmit={handleLogin} style={{display: 'flex', flexDirection: 'column', gap: '16px'}}>
            <input 
              id="godmode_admin_email"
              name="godmode_admin_email"
              type="email" 
              placeholder="Master Email" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)}
              style={{padding: '12px', backgroundColor: '#0a0a0a', border: '1px solid #333', color: 'white', borderRadius: '6px'}}
              autoComplete="new-password"
            />
            <input 
              id="godmode_admin_password"
              name="godmode_admin_password"
              type="password" 
              placeholder="Master Password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)}
              style={{padding: '12px', backgroundColor: '#0a0a0a', border: '1px solid #333', color: 'white', borderRadius: '6px'}}
              autoComplete="new-password"
            />
            {authError && <p style={{color: '#ff4444', fontSize: '12px', textAlign: 'center', margin: 0}}>{authError}</p>}
            <button type="submit" style={{padding: '12px', backgroundColor: '#d4af37', color: '#000', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer'}}>
              INITIALIZE
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.masterContainer}>
      {/* Sidebar Navigation */}
      <div style={styles.sidebar}>
        <h1 style={styles.logo}>GOLFRIEND ADMIN</h1>
        
        <div style={styles.sectionHeader}>USER GOVERNANCE</div>
        <div style={styles.navGrid}>
          <button style={{...styles.navBtn, ...(activeTab === 'hr' ? styles.activeBtn : {})}} onClick={() => setActiveTab('hr')}>👔 HR & Staff</button>
          <button style={{...styles.navBtn, ...(activeTab === 'photos' ? styles.activeBtn : {})}} onClick={() => setActiveTab('photos')}>📷 Photos</button>
          <button style={{...styles.navBtn, ...(activeTab === 'support' ? styles.activeBtn : {})}} onClick={() => setActiveTab('support')}>🛡️ Support</button>
        </div>

        <div style={styles.sectionHeader}>CENTRAL ECONOMY</div>
        <div style={styles.navGrid}>
          <button style={{...styles.navBtn, ...(activeTab === 'bank' ? styles.activeBtn : {})}} onClick={() => setActiveTab('bank')}>🏦 Central Bank</button>
          <button style={{...styles.navBtn, ...(activeTab === 'fiat' ? styles.activeBtn : {})}} onClick={() => setActiveTab('fiat')}>💵 Fiat Revenue</button>
          <button style={{...styles.navBtn, ...(activeTab === 'escrow' ? styles.activeBtn : {})}} onClick={() => setActiveTab('escrow')}>🔒 Escrow Locks</button>
        </div>

        <div style={styles.sectionHeader}>EVENT ENGINE</div>
        <div style={styles.navGrid}>
          <button style={{...styles.navBtn, ...(activeTab === 'courses' ? styles.activeBtn : {})}} onClick={() => setActiveTab('courses')}>⛳ Core Seeder</button>
          <button style={{...styles.navBtn, ...(activeTab === 'tournaments' ? styles.activeBtn : {})}} onClick={() => setActiveTab('tournaments')}>🏆 Tournaments</button>
          <button style={{...styles.navBtn, ...(activeTab === 'genesis' ? styles.activeBtn : {})}} onClick={() => setActiveTab('genesis')}>📅 Event Genesis</button>
        </div>

        <div style={styles.sectionHeader}>B2B & SPONSORS</div>
        <div style={styles.navGrid}>
          <button style={{...styles.navBtn, ...(activeTab === 'b2b' ? styles.activeBtn : {})}} onClick={() => setActiveTab('b2b')}>🤝 Partners</button>
          <button style={{...styles.navBtn, ...(activeTab === 'adhub' ? styles.activeBtn : {})}} onClick={() => setActiveTab('adhub')}>📢 Ad Hub</button>
        </div>

        <div style={styles.sectionHeader}>GOLFRIEND OEM</div>
        <div style={styles.navGrid}>
          <button style={{...styles.navBtn, ...(activeTab === 'vendors' ? styles.activeBtn : {})}} onClick={() => setActiveTab('vendors')}>🏭 Vendor CRM</button>
          <button style={{...styles.navBtn, ...(activeTab === 'forge' ? styles.activeBtn : {})}} onClick={() => setActiveTab('forge')}>⚒️ Product Forge</button>
          <button style={{...styles.navBtn, ...(activeTab === 'fulfillment' ? styles.activeBtn : {})}} onClick={() => setActiveTab('fulfillment')}>🚚 Fulfillment</button>
          <button style={{...styles.navBtn, ...(activeTab === 'crm' ? styles.activeBtn : {})}} onClick={() => setActiveTab('crm')}>👥 Buyer CRM</button>
        </div>

        <div style={styles.sectionHeader}>SYSTEM & VAULT</div>
        <div style={styles.navGrid}>
          <button style={{...styles.navBtn, ...(activeTab === 'vault' ? styles.activeBtn : {})}} onClick={() => setActiveTab('vault')}>🗄️ Partner Vault</button>
          <button style={{...styles.navBtn, ...(activeTab === 'automation' ? styles.activeBtn : {})}} onClick={() => setActiveTab('automation')}>📡 Automation</button>
        </div>

        <div style={{marginTop: 'auto', paddingTop: '16px'}}>
          <button style={{...styles.navBtn, color: '#ff4444', backgroundColor: '#1a0000', border: '1px solid #330000', textAlign: 'center'}} onClick={executeSecureLogout}>
            🚪 SECURE LOGOUT
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div style={styles.content}>
        {activeTab === 'photos' && <PhotoValidator />}
        {activeTab === 'escrow' && <EscrowWatchtower />}
        {activeTab === 'fiat' && <FiatLedger />}
        {activeTab === 'ledger' && <ManualOverride />}
        {activeTab === 'bank' && <CentralBankMonitor />}
        
        {/* 🔥 RENDER THE ENGINE */}
        {activeTab === 'courses' && <CourseSeeder />}
        {activeTab === 'tournaments' && <TournamentManager />}
        {activeTab === 'genesis' && <EventGenesisConsole />}
        
        {/* 🔥 RENDER OEM HUB */}
        {activeTab === 'vendors' && <VendorControlSystem />}
        {activeTab === 'adhub' && <SponsorDashboard />}
        {activeTab === 'forge' && <OemProductForge />}
        {activeTab === 'fulfillment' && <OrderFulfillmentHub />}
        {activeTab === 'crm' && <BuyerCustomerCRM />}

        {/* 🔥 RENDER B2B PARTNERS */}
        {activeTab === 'b2b' && <B2BPartners />}

        {/* 🔥 RENDER SYSTEM VAULT */}
        {activeTab === 'vault' && <PartnerVault />}
        {activeTab === 'automation' && <LiveAutomationLog />}
        {activeTab === 'support' && <SupportModerationHub />}
        {activeTab === 'hr' && <HRManagement />}
        
        {/* Legacy component kept alive in code, hidden from sidebar UI */}
        {activeTab === 'sponsor' && <SponsorOnboardingWizard />}
      </div>
    </div>
  );
}

const styles = {
  masterContainer: { display: 'flex', minHeight: '100vh', backgroundColor: '#0a0a0a', color: 'white', fontFamily: 'sans-serif' },
  sidebar: { width: '380px', backgroundColor: '#121212', padding: '16px', borderRight: '1px solid #333', display: 'flex', flexDirection: 'column' as const },
  logo: { color: '#d4af37', fontSize: '18px', marginBottom: '20px', letterSpacing: '1px', textAlign: 'center' as const, borderBottom: '1px solid #222', paddingBottom: '16px' },
  content: { flex: 1, overflowY: 'auto' as const },
  navGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '4px' },
  navBtn: { 
    width: '100%', padding: '8px', backgroundColor: 'transparent', color: '#888', 
    border: '1px solid transparent', textAlign: 'left' as const, cursor: 'pointer', 
    borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' as const, transition: 'all 0.2s ease',
    whiteSpace: 'nowrap' as const, overflow: 'hidden' as const, textOverflow: 'ellipsis' as const
  },
  activeBtn: { backgroundColor: '#1a1a1a', color: '#d4af37', border: '1px solid #333' },
  sectionHeader: { color: '#555', fontSize: '10px', fontWeight: '900' as const, letterSpacing: '1px', marginBottom: '8px', marginTop: '12px', textTransform: 'uppercase' as const, borderBottom: '1px solid #222', paddingBottom: '4px' }
};