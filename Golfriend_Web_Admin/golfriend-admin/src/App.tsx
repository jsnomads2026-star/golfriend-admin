import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from './firebaseConfig';
import { resolvePortalAccess, STATE_COPY } from './auth/roleJourney.js';
import { useT } from './i18n/hooks.ts';
import { ACCESS_STATES } from './i18n/partner/accessStates.ts';
import SmallBusinessDashboard from './components/B2B/SmallBusinessDashboard';
import CourseAvailabilityV2 from './components/B2B/CourseAvailabilityV2';
import PlayBookingLifecycleV2 from './components/B2B/PlayBookingLifecycleV2';
import BookingOperationsReportV2 from './components/B2B/BookingOperationsReportV2';
import BookingProviderPublicationV2 from './components/B2B/BookingProviderPublicationV2';
import EnterpriseDashboard from './components/B2B/EnterpriseDashboard';
import PolicyUnavailable from './components/common/PolicyUnavailable';
// Quarantined economy/settlement consoles removed from active navigation (their
// Cloud Functions are quarantined fail-closed): PhotoValidator, CentralBankMonitor,
// EscrowWatchtower, ManualOverride, FiatLedger — replaced by PolicyUnavailable.
// See docs/V2_CALLABLE_AUTHORITY_CLASSIFICATION.md.
import CourseSeeder from './components/CourseSeeder';
import TeeTimeInventory from './components/admin/TeeTimeInventory'; // ⛳ Tee-time inventory management
import CourseSyncConsole from './components/admin/CourseSyncConsole'; // 🛰️ Server-side Golf-API sync
import CourseTeeSheet from './components/B2B/CourseTeeSheet'; // 🔥 B2B flight sheet (check-in control quarantined)
// TournamentManager removed from navigation (manageTournamentOps unresolved — fail-closed).
import TournamentTV from './components/admin/TournamentTV';
import EventGenesisConsole from './components/admin/EventGenesisConsole';
// SponsorOnboardingWizard QUARANTINED (dead code w/ client ledger writes) — not routed.
import SponsorDashboard from './components/admin/sponsors/SponsorDashboard';
import LiveAutomationLog from './components/admin/LiveAutomationLog';
import SupportModerationHub from './components/admin/SupportModerationHub';
import PartnerVault from './components/admin/PartnerVault';
// B2BPartners removed from navigation (adminManagePartner quarantined — fail-closed).
import HRManagement from './components/admin/HRManagement'; // 🔥 HR & Staff
import BookingOversight from './components/admin/BookingOversight'; // 📖 Booking oversight + refund/escalation
import PartnerIngestion from './components/admin/PartnerIngestion'; // 📥 Partner application ingestion queue
import BookingAudit from './components/admin/BookingAudit'; // 🧾 Booking audit trail (read-only)

// 🔥 B2B COMMERCE (OEM) COMPONENTS
import VendorControlSystem from './components/admin/oem/VendorControlSystem';
import OemProductForge from './components/admin/oem/OemProductForge';
// OrderFulfillmentHub removed from navigation (updateFulfillmentOrder quarantined — fail-closed).
import BuyerCustomerCRM from './components/admin/oem/BuyerCustomerCRM';
import V2AdminShell from './components/admin/v2/V2AdminShell';
import V2AdminOverview from './components/admin/v2/V2AdminOverview';
import V2AdminReports from './components/admin/v2/V2AdminReports';
import V2CourseOperations from './components/admin/v2/V2CourseOperations';
import V2MarketingLibrary from './components/admin/v2/V2MarketingLibrary';
import V2PartnerOperations from './components/admin/v2/V2PartnerOperations';
import V2PartnerApplications from './components/admin/v2/V2PartnerApplications';
import V2PartnerAuthority from './components/admin/v2/V2PartnerAuthority';
import V2EnterpriseMemberRequests from './components/admin/v2/V2EnterpriseMemberRequests';
import V2SmallBusinessReview from './components/admin/v2/V2SmallBusinessReview';
import V2SmallBusinessReadiness from './components/admin/v2/V2SmallBusinessReadiness';
import V2CountryUserAnalytics from './components/admin/v2/V2CountryUserAnalytics';
import V2TeeEconomyAnalytics from './components/admin/v2/V2TeeEconomyAnalytics';
import V2CourseAcquisition from './components/admin/v2/V2CourseAcquisition';
import V2AcquisitionReport from './components/admin/v2/V2AcquisitionReport';
import AdminTrialDecisions from './components/admin/v2/AdminTrialDecisions';
import EconomyMasterControl from './components/admin/v2/EconomyMasterControl';
import { isAdminArea, type AdminArea } from './components/admin/v2/adminNavigation';
import { AdminIdentityContext, type AdminIdentity } from './components/admin/v2/AdminIdentityContext';
import { useOnlineStatus } from './components/admin/v2/useOnlineStatus';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard mode="admin" />} />
        <Route path="/admin" element={<Dashboard mode="admin" />} />
        <Route path="/admin/*" element={<Dashboard mode="admin" />} />
        <Route path="/portal" element={<Dashboard mode="partner" />} />
        <Route path="/portal/:organizationId/*" element={<ScopedPartnerPortal />} />
        <Route path="/portal/*" element={<Dashboard mode="partner" />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

function ScopedPartnerPortal() {
  const { organizationId } = useParams();
  return <Dashboard mode="partner" requestedOrganizationId={organizationId ?? null} />;
}

// Bounded client session: auto sign-out after inactivity (defence-in-depth; the
// server is the authority). Applies to any authorized portal session.
const SESSION_IDLE_MS = 30 * 60 * 1000;

function Dashboard({ mode, requestedOrganizationId = null }: { mode: 'admin' | 'partner'; requestedOrganizationId?: string | null }) {
  const [user, setUser] = useState<any>(null);
  const [partnerData, setPartnerData] = useState<any>(null); // b2b_partners/{...}
  const [adminData, setAdminData] = useState<any>(null);     // admin_users/{uid}
  const isOnline = useOnlineStatus();
  const [isAuthLoading, setIsAuthLoading] = useState(true);  // auth_pending
  const [roleLoading, setRoleLoading] = useState(false);     // role_resolving
  const [resolveError, setResolveError] = useState(false);   // error (honest UI)

  const executeSecureLogout = async () => {
    try {
      await signOut(getAuth());
      window.location.href = mode === 'partner' ? '/storefront' : '/admin';
    } catch {
      window.location.href = mode === 'partner' ? '/storefront' : '/admin';
    }
  };

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authFailed, setAuthFailed] = useState(false);
  const t = useT(ACCESS_STATES);

  const [activeTab, setActiveTab] = useState<'photos' | 'escrow' | 'ledger' | 'fiat' | 'bank' | 'courses' | 'teetimes' | 'coursesync' | 'teesheet' | 'tournaments' | 'genesis' | 'sponsor' | 'adhub' | 'automation' | 'support' | 'bookingoversight' | 'bookingaudit' | 'vault' | 'vendors' | 'forge' | 'fulfillment' | 'crm' | 'b2b' | 'hr'>('courses');
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedArea = searchParams.get('area');
  const activeArea: AdminArea = isAdminArea(requestedArea) ? requestedArea : 'overview';
  const setActiveArea = (area: AdminArea) => setSearchParams(area === 'overview' ? {} : { area });

  // CORE AUTH LISTENER — access is derived ONLY from server-owned role docs.
  useEffect(() => {
    const auth = getAuth();
    let stopRoleWatch: (() => void) | null = null;
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      stopRoleWatch?.();
      stopRoleWatch = null;
      setUser(currentUser);
      setResolveError(false);
      setAdminData(null);
      setPartnerData(null);

      if (!currentUser) { setIsAuthLoading(false); setRoleLoading(false); return; }

      setIsAuthLoading(false);
      setRoleLoading(true); // role_resolving
      try {
        if (mode === 'admin') {
          // Server-owned admin authorization: admin_users/{uid}. No email/God-Mode literal.
          const snap = await getDoc(doc(db, 'admin_users', currentUser.uid));
          setAdminData(snap.exists() ? snap.data() : null);
          // Keep the rendered console bound to current server authority. A removal,
          // suspension, expiry or role mutation is reflected immediately; callable
          // authorization still re-checks the same server record on every operation.
          stopRoleWatch = onSnapshot(doc(db, 'admin_users', currentUser.uid), (next) => {
            setResolveError(false);
            setAdminData(next.exists() ? next.data() : null);
          }, () => {
            setAdminData(null);
            setResolveError(true);
          });
        } else {
          // Exact authenticated-UID lookup only. The route may narrow organization scope,
          // but cannot select or grant an organization.
          const partnerRef = doc(db, 'b2b_partners', currentUser.uid);
          const partnerDoc = await getDoc(partnerRef);
          setPartnerData(partnerDoc.exists() ? partnerDoc.data() : null);
          stopRoleWatch = onSnapshot(partnerRef, (next) => {
            setResolveError(false);
            setPartnerData(next.exists() ? next.data() : null);
          }, () => {
            setPartnerData(null);
            setResolveError(true);
          });
        }
      } catch {
        // Never surface raw provider errors — set the honest 'error' state.
        setResolveError(true);
      } finally {
        setRoleLoading(false);
      }
    });
    return () => { stopRoleWatch?.(); unsubscribe(); };
  }, [mode]);

  // Bounded inactivity sign-out for any authenticated session.
  useEffect(() => {
    if (!user) return;
    let t: ReturnType<typeof setTimeout>;
    const reset = () => { clearTimeout(t); t = setTimeout(() => { executeSecureLogout(); }, SESSION_IDLE_MS); };
    const evts = ['mousemove', 'keydown', 'click', 'scroll'];
    reset();
    evts.forEach((e) => window.addEventListener(e, reset));
    return () => { clearTimeout(t); evts.forEach((e) => window.removeEventListener(e, reset)); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthFailed(false);
    try {
      await signInWithEmailAndPassword(getAuth(), email, password);
    } catch {
      // Honest, provider-error-free copy.
      setAuthFailed(true);
    }
  };

  // ---- Server-owned access derivation (single source of truth) ----
  const access = resolvePortalAccess({
    mode, authPending: isAuthLoading, user, roleLoading, resolveError,
    adminDoc: adminData, partnerDoc: partnerData, requestedOrganizationId,
  });

  // Quarantined TV display: NEVER an unauthenticated bypass — only an authorized
  // admin/staff session may open it (was: rendered before any auth check).
  const isTvMode = new URLSearchParams(window.location.search).get('tv') === 'true';
  if (isTvMode) {
    if (access.state === 'authorized' && access.surface === 'admin') return <TournamentTV />;
    // otherwise fall through to the normal state screens (no bypass).
  }

  // Authorized partner → the role-appropriate portal (surface derived server-side).
  if (access.state === 'authorized' && mode === 'partner') {
    return access.surface === 'enterprise'
      ? <EnterpriseDashboard partnerData={partnerData} />
      : <SmallBusinessDashboard partnerData={partnerData} />;
  }

  // Signed-out: admin shows the login form; partner routes to the public storefront.
  if (access.state === 'signed_out') {
    if (mode === 'partner') { window.location.href = '/storefront'; return null; }
    return (
      <div style={{...styles.masterContainer, justifyContent: 'center', alignItems: 'center', flexDirection: 'column'}} role="main">
        <div style={{backgroundColor: '#121212', padding: '40px', borderRadius: '12px', border: '1px solid #333', width: '340px'}}>
          <h1 style={styles.logo}>{t('adminTitle')}</h1>
          <form onSubmit={handleLogin} style={{display: 'flex', flexDirection: 'column', gap: '16px'}} aria-label={t('adminAria')}>
            <input id="admin_email" name="admin_email" type="email" placeholder={t('email')} aria-label={t('email')}
              value={email} onChange={(e) => setEmail(e.target.value)}
              style={{padding: '12px', backgroundColor: '#0a0a0a', border: '1px solid #333', color: 'white', borderRadius: '6px'}} autoComplete="username" />
            <input id="admin_password" name="admin_password" type="password" placeholder={t('password')} aria-label={t('password')}
              value={password} onChange={(e) => setPassword(e.target.value)}
              style={{padding: '12px', backgroundColor: '#0a0a0a', border: '1px solid #333', color: 'white', borderRadius: '6px'}} autoComplete="current-password" />
            {authFailed && <p role="alert" style={{color: '#ff4444', fontSize: '12px', textAlign: 'center', margin: 0}}>{t('signInFailed')}</p>}
            <button type="submit" style={{padding: '12px', backgroundColor: '#d4af37', color: '#000', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer'}}>
              {t('adminSignIn')}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Loading / role-resolving / error / unauthorized / suspended → honest state screens.
  if (access.state !== 'authorized') {
    const copy = STATE_COPY[access.state] || STATE_COPY.error;
    const isBusy = access.state === 'auth_pending' || access.state === 'role_resolving';
    const isError = copy.tone === 'error';
    return (
      <div style={{...styles.masterContainer, justifyContent: 'center', alignItems: 'center', flexDirection: 'column'}}
        role={isError ? 'alert' : 'status'} aria-live={isError ? 'assertive' : 'polite'} aria-busy={isBusy}>
        <h1 style={{...styles.logo, color: isError ? '#ff4444' : '#d4af37'}}>{t(access.state)}</h1>
        {(access.state === 'unauthorized' || access.state === 'suspended' || access.state === 'error') && (
          <button onClick={executeSecureLogout}
            style={{marginTop: '16px', padding: '12px 24px', backgroundColor: '#ff4444', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer'}}>
            {mode === 'partner' ? t('returnStorefront') : t('signOut')}
          </button>
        )}
      </div>
    );
  }

  // The governing authority for every V2 admin surface. Any change here — sign-out,
  // suspension, a role or status change, going offline — disposes cached content that was
  // authorized for the previous authority.
  const adminIdentity: AdminIdentity = {
    uid: user?.uid ?? null,
    role: adminData?.role ?? null,
    status: adminData?.status ?? null,
    scope: null,
    requestVersion: null,
    // App Check is not provisioned in this repository, so this is UNKNOWN (null) rather
    // than claimed as verified. Reporting true would assert an attestation that does not
    // exist; reporting false would disable every surface.
    appCheck: null,
    online: isOnline,
  };

  return <AdminIdentityContext.Provider value={adminIdentity}>
    <V2AdminShell activeArea={activeArea} onAreaChange={setActiveArea} onSignOut={executeSecureLogout}>
    {activeArea === 'overview' && <V2AdminOverview onOpen={setActiveArea} />}
    {activeArea === 'courses' && <V2CourseOperations />}
    {activeArea === 'courses' && <CourseAvailabilityV2 admin />}
    {activeArea === 'bookings' && <><PlayBookingLifecycleV2 admin /><BookingOperationsReportV2 admin /><BookingProviderPublicationV2 admin /><BookingOversight /><BookingAudit /><SupportModerationHub /></>}
    {activeArea === 'partners' && <V2PartnerApplications />}
    {activeArea === 'partners' && <V2PartnerAuthority />}
    {activeArea === 'analytics' && <V2CountryUserAnalytics />}
    {activeArea === 'tee-analytics' && <V2TeeEconomyAnalytics />}
    {activeArea === 'partners' && <V2PartnerOperations />}
    {activeArea === 'partners' && <V2EnterpriseMemberRequests />}
    {activeArea === 'partners' && <V2SmallBusinessReview />}
    {activeArea === 'partners' && <V2SmallBusinessReadiness />}
    {activeArea === 'partners' && <V2CourseAcquisition />}
    {activeArea === 'partners' && <AdminTrialDecisions />}
    {activeArea === 'partners' && <PartnerIngestion />}
    {activeArea === 'marketing' && <V2MarketingLibrary />}
    {activeArea === 'advertising' && <SponsorDashboard />}
    {activeArea === 'exchange' && <><VendorControlSystem /><OemProductForge /><BuyerCustomerCRM /></>}
    {activeArea === 'reports' && <V2AdminReports />}
    {activeArea === 'reports' && <V2AcquisitionReport />}
    {activeArea === 'economy' && <EconomyMasterControl />}
    </V2AdminShell>
  </AdminIdentityContext.Provider>;

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
          <button style={{...styles.navBtn, ...(activeTab === 'bookingoversight' ? styles.activeBtn : {})}} onClick={() => setActiveTab('bookingoversight')}>📖 Booking Oversight</button>
          <button style={{...styles.navBtn, ...(activeTab === 'bookingaudit' ? styles.activeBtn : {})}} onClick={() => setActiveTab('bookingaudit')}>🧾 Booking Audit</button>
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
          <button style={{...styles.navBtn, ...(activeTab === 'teetimes' ? styles.activeBtn : {})}} onClick={() => setActiveTab('teetimes')}>🕐 Tee-Time Inventory</button>
          <button style={{...styles.navBtn, ...(activeTab === 'coursesync' ? styles.activeBtn : {})}} onClick={() => setActiveTab('coursesync')}>🛰️ Course Sync</button>
          <button style={{...styles.navBtn, ...(activeTab === 'teesheet' ? styles.activeBtn : {})}} onClick={() => setActiveTab('teesheet')}>📋 Tee Sheet</button>
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
        {/* Quarantined economy/settlement consoles → honest unavailable state (no callable). */}
        {activeTab === 'photos' && <PolicyUnavailable feature="Photo Validation (chip-coupled)" category="prohibited-financial" callable="resolvePhotoValidation" />}
        {activeTab === 'escrow' && <PolicyUnavailable feature="Escrow Locks" category="prohibited-financial" callable="resolveEscrow" />}
        {activeTab === 'fiat' && <PolicyUnavailable feature="Fiat Revenue Ledger" category="prohibited-financial" callable="logPlatformExpense" />}
        {activeTab === 'ledger' && <PolicyUnavailable feature="Manual Wallet Override" category="prohibited-financial" callable="adminOverrideUser" />}
        {activeTab === 'bank' && <PolicyUnavailable feature="Central Bank Monitor" category="prohibited-financial" callable="adminOverrideUser" />}

        {/* 🔥 RENDER THE ENGINE */}
        {activeTab === 'courses' && <CourseSeeder />}
        {activeTab === 'teetimes' && <TeeTimeInventory />}
        {activeTab === 'coursesync' && <CourseSyncConsole />}
        {activeTab === 'teesheet' && <CourseTeeSheet />}
        {activeTab === 'tournaments' && <PolicyUnavailable feature="Tournament Operations" category="unresolved-policy" callable="manageTournamentOps" />}
        {activeTab === 'genesis' && <EventGenesisConsole />}

        {/* 🔥 RENDER OEM HUB */}
        {activeTab === 'vendors' && <VendorControlSystem />}
        {activeTab === 'adhub' && <SponsorDashboard />}
        {activeTab === 'forge' && <OemProductForge />}
        {activeTab === 'fulfillment' && <PolicyUnavailable feature="Order Fulfillment" category="prohibited-financial" callable="updateFulfillmentOrder" />}
        {activeTab === 'crm' && <BuyerCustomerCRM />}

        {/* B2B partner wallet/tier command center → unavailable (adminManagePartner quarantined). */}
        {activeTab === 'b2b' && <PolicyUnavailable feature="B2B Partner Wallet/Tier" category="prohibited-financial" callable="adminManagePartner" />}

        {/* 🔥 RENDER SYSTEM VAULT */}
        {activeTab === 'vault' && <PartnerVault />}
        {activeTab === 'automation' && <LiveAutomationLog />}
        {activeTab === 'support' && <SupportModerationHub />}
        {activeTab === 'bookingoversight' && <BookingOversight />}
        {activeTab === 'bookingaudit' && <BookingAudit />}
        {activeTab === 'hr' && <HRManagement />}
        {/* SponsorOnboardingWizard removed from routing (quarantined dead code). */}
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
