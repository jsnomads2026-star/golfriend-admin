import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { getAuth, signInWithEmailAndPassword, sendPasswordResetEmail, onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db, APP_CHECK_ACTIVE } from './firebaseConfig';
import { resolvePortalAccess, adminAccessPresentation, STATE_COPY } from './auth/roleJourney.js';
import { FOUNDER_ACCESS } from './i18n/admin/founderAccess.ts';
import { useT } from './i18n/hooks.ts';
import { ACCESS_STATES } from './i18n/partner/accessStates.ts';
import SmallBusinessDashboard from './components/B2B/SmallBusinessDashboard';
import PartnerApplicationJourney from './components/B2B/PartnerApplicationJourney';
import PartnerInvitationAcceptance from './components/B2B/PartnerInvitationAcceptance';
import { partnerApplicationService } from './components/B2B/partnerApplicationService';
import { resolveApplicantAccess } from './auth/roleJourney.js';
import { applicantCopy, type ApplicantView } from './i18n/partner/applicant';
import { useLocale } from './i18n/hooks.ts';
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
import TournamentGovernancePanel from './components/B2B/TournamentGovernancePanel';
import EventGenesisConsole from './components/admin/EventGenesisConsole';
// SponsorOnboardingWizard QUARANTINED (dead code w/ client ledger writes) — not routed.
import SponsorDashboard from './components/admin/sponsors/SponsorDashboard';
import LiveAutomationLog from './components/admin/LiveAutomationLog';
import SupportModerationHub from './components/admin/SupportModerationHub';
import DirectorModeration from './components/admin/DirectorModeration';
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
import OemShopAdmin from './components/admin/v2/OemShopAdmin';
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

        {/* Applicant zone. A third authority zone: it can render an application, and it can
            never render the Portal. Portal entry comes only from the server-owned partner
            document written by the approval transaction. */}
        <Route path="/apply/small-business" element={<ApplicantZone intent="small_business" />} />
        <Route path="/apply/enterprise" element={<ApplicantZone intent="enterprise" />} />
        <Route path="/apply/status" element={<ApplicantZone view="status" />} />
        <Route path="/apply/:applicationId/documents" element={<ApplicantZone view="documents" />} />
        <Route path="/apply/:applicationId/agreement" element={<ApplicantZone view="agreement" />} />
        <Route path="/apply/:applicationId/review" element={<ApplicantZone view="review" />} />
        <Route path="/invitation/accept" element={<InvitationAcceptanceRoute />} />

        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

function ApplicantZone({ intent = null, view = 'application' }: { intent?: 'small_business' | 'enterprise' | null; view?: ApplicantView }) {
  const { applicationId } = useParams();
  return <Applicant intent={intent} view={view} requestedApplicationId={applicationId ?? null} />;
}

function InvitationAcceptanceRoute() {
  // The token is validated by the server and is single-use and expiring. No email or URL
  // field on this page grants authority; it only carries the opaque token to the callable.
  //
  // Wrapped in the shared landmark structure: mounted bare it rendered no <main> and no
  // level-1 heading, so a screen-reader user had no page landmark to navigate to.
  const copy = applicantCopy(useLocale());
  return (
    <main id="main" className="applicant-zone" aria-labelledby="invitation-heading">
      <h1 id="invitation-heading" className="sr-only">{copy.invitation}</h1>
      <PartnerInvitationAcceptance />
    </main>
  );
}

// ---- Applicant zone -------------------------------------------------------------
// Renders an application and NEVER the Portal. Portal readiness is a server fact read from
// b2b_partners/{uid}; an approved application alone does not open the Portal, so the two are
// resolved separately and only `portalReady` offers the entry link.
function Applicant({ intent, view, requestedApplicationId }: { intent: 'small_business' | 'enterprise' | null; view: ApplicantView; requestedApplicationId: string | null }) {
  const copy = applicantCopy(useLocale());
  const isOnline = useOnlineStatus();
  const [user, setUser] = useState<any>(null);
  const [authPending, setAuthPending] = useState(true);
  const [applicationDoc, setApplicationDoc] = useState<any>(null);
  const [partnerDoc, setPartnerDoc] = useState<any>(null);
  const [roleLoading, setRoleLoading] = useState(false);
  const [resolveError, setResolveError] = useState(false);

  useEffect(() => onAuthStateChanged(getAuth(), (next) => { setUser(next); setAuthPending(false); }), []);

  useEffect(() => {
    if (!user?.uid) { setApplicationDoc(null); setPartnerDoc(null); return; }
    let active = true;
    setRoleLoading(true); setResolveError(false);
    (async () => {
      try {
        const [view, partner] = await Promise.all([
          partnerApplicationService.load().catch(() => null),
          getDoc(doc(db, 'b2b_partners', user.uid)).then((s) => (s.exists() ? s.data() : null)).catch(() => null),
        ]);
        if (!active) return;
        // The callable returns a VIEW envelope; the resolver wants the application document
        // itself. Passing the envelope made every application look like a fresh draft, so a
        // submitted or information-needed application still rendered as "ready".
        const application = view?.application ?? null;
        setApplicationDoc(application ? {...application, id: application.applicationId} : null);
        setPartnerDoc(partner ?? null);
      } catch {
        if (active) setResolveError(true);   // never surface a raw provider error
      } finally {
        if (active) setRoleLoading(false);
      }
    })();
    return () => { active = false; };
  }, [user?.uid]);

  const access = resolveApplicantAccess({
    authPending, user, roleLoading, resolveError,
    applicationDoc, partnerDoc, requestedApplicationId,
    // Contact verification is the server's gate for saving/submitting; the client mirrors it
    // only to render honestly.
    identityVerified: user ? user.emailVerified === true : null,
  });

  const heading = intent === 'enterprise' ? copy.enterprise : intent === 'small_business' ? copy.smallBusiness : copy[view === 'status' ? 'status' : view === 'documents' ? 'documents' : view === 'agreement' ? 'agreement' : view === 'review' ? 'review' : 'status'];

  const message =
    !isOnline ? copy.offline :
    access.state === 'auth_pending' || access.state === 'role_resolving' ? copy.loading :
    access.state === 'signed_out' ? copy.signInRequired :
    access.state === 'verification_required' ? copy.verifyRequired :
    access.state === 'error' ? copy.error :
    access.state === 'submitted' ? copy.submitted :
    access.state === 'information_needed' ? copy.informationNeeded :
    access.state === 'rejected' ? copy.rejected :
    access.state === 'suspended' ? copy.suspended :
    access.state === 'approved' ? copy.approved :
    access.state === 'ready' ? copy.ready : copy.unknown;

  const liveRole = access.state === 'error' || access.state === 'rejected' || access.state === 'suspended' ? 'alert' : 'status';

  return (
    <main id="main" className="applicant-zone" aria-labelledby="applicant-heading">
      <h1 id="applicant-heading">{heading}</h1>
      {intent ? <p className="applicant-boundary" role="note">{copy.notAuthority}</p> : null}
      <p role={liveRole} aria-live="polite">{message}</p>
      <p className="applicant-legal">{copy.legalPending}</p>
      {access.portalReady ? <a className="applicant-portal" href="/portal">{copy.enterPortal}</a> : null}
      {['ready', 'submitted', 'information_needed', 'rejected', 'approved'].includes(access.state)
        ? <PartnerApplicationJourney view={view} onSignOut={() => { void signOut(getAuth()); }} />
        : null}
    </main>
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
  const [resolveError, setResolveError] = useState<string | null>(null);   // safe boundary code

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
  const [recoveryNotice, setRecoveryNotice] = useState<'sent' | 'unavailable' | null>(null);
  const t = useT(ACCESS_STATES);
  const ft = useT(FOUNDER_ACCESS as unknown as Record<string, Record<string, string>>);

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
      setResolveError(null);
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
            setResolveError(null);
            setAdminData(next.exists() ? next.data() : null);
          }, (error) => {
            setAdminData(null);
            setResolveError(`ADMIN_PROFILE_${String(error.code || 'UNKNOWN').replace(/[^A-Z0-9_-]/gi, '_').toUpperCase()}`);
          });
        } else {
          // Exact authenticated-UID lookup only. The route may narrow organization scope,
          // but cannot select or grant an organization.
          const partnerRef = doc(db, 'b2b_partners', currentUser.uid);
          const partnerDoc = await getDoc(partnerRef);
          setPartnerData(partnerDoc.exists() ? partnerDoc.data() : null);
          stopRoleWatch = onSnapshot(partnerRef, (next) => {
            setResolveError(null);
            setPartnerData(next.exists() ? next.data() : null);
          }, (error) => {
            setPartnerData(null);
            setResolveError(`PARTNER_PROFILE_${String(error.code || 'UNKNOWN').replace(/[^A-Z0-9_-]/gi, '_').toUpperCase()}`);
          });
        }
      } catch (error: any) {
        // Never surface raw provider errors — set the honest 'error' state.
        setResolveError(`ADMIN_PROFILE_${String(error?.code || 'UNKNOWN').replace(/[^A-Z0-9_-]/gi, '_').toUpperCase()}`);
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
    setRecoveryNotice(null);
    try {
      await signInWithEmailAndPassword(getAuth(), email, password);
    } catch {
      // Honest, provider-error-free copy.
      setAuthFailed(true);
    }
  };

  // Recovery uses the standard Firebase Auth reset mail. The SAME neutral notice is
  // shown whether or not the address resolves to an account, so this form cannot be
  // used to enumerate staff accounts. Recovery restores a password; it never grants
  // authority — that still comes only from an active admin_users record.
  const handleRecovery = async () => {
    setAuthFailed(false);
    const address = email.trim();
    if (!address) { setRecoveryNotice('unavailable'); return; }
    try {
      await sendPasswordResetEmail(getAuth(), address);
      setRecoveryNotice('sent');
    } catch {
      setRecoveryNotice('sent');
    }
  };

  // ---- Server-owned access derivation (single source of truth) ----
  const access = resolvePortalAccess({
    mode, authPending: isAuthLoading, user, roleLoading, resolveError: Boolean(resolveError),
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
            <button type="button" onClick={() => { void handleRecovery(); }} aria-label={ft('forgotPassword')}
              style={{padding: '8px', background: 'none', border: 'none', color: '#d4af37', fontSize: '12px', textDecoration: 'underline', cursor: 'pointer'}}>
              {ft('forgotPassword')}
            </button>
            <p style={{color: '#888', fontSize: '11px', textAlign: 'center', margin: 0}}>{ft('recoveryPrompt')}</p>
            {recoveryNotice && (
              <p role="status" aria-live="polite" style={{color: '#8fd18f', fontSize: '12px', textAlign: 'center', margin: 0}}>
                {recoveryNotice === 'sent' ? ft('recoverySent') : ft('recoveryUnavailable')}
              </p>
            )}
          </form>
        </div>
      </div>
    );
  }

  // A correctly authenticated user with NO server-owned admin_users record is in the
  // founder/staff bootstrap state, not a rejection: their access is pending an
  // administrator binding their UID. This carries exactly the same (zero) privilege as
  // any other denial — it changes only what the person is told.
  if (adminAccessPresentation(access) === 'access_pending') {
    return (
      <div style={{...styles.masterContainer, justifyContent: 'center', alignItems: 'center', flexDirection: 'column'}}
        role="status" aria-live="polite">
        <h1 style={{...styles.logo, color: '#d4af37'}}>{ft('accessPendingTitle')}</h1>
        <p style={{color: '#ccc', maxWidth: '420px', textAlign: 'center', lineHeight: 1.5}}>{ft('accessPendingDetail')}</p>
        <button onClick={executeSecureLogout}
          style={{marginTop: '16px', padding: '12px 24px', backgroundColor: '#333', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer'}}>
          {t('signOut')}
        </button>
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
        {access.state === 'error' && resolveError && <code style={{color: '#ffb4a9', marginBottom: '12px'}}>{resolveError}</code>}
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
    // Reported from the actual attestation state of this build (see firebaseConfig.ts).
    // False means "no provider installed" — surfaces that require attestation disable
    // themselves rather than issuing calls the server would reject.
    appCheck: APP_CHECK_ACTIVE,
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
    {activeArea === 'shop' && <OemShopAdmin isDirector={adminData?.role === 'Director'} />}
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
        {activeTab === 'tournaments' && <TournamentGovernancePanel admin />}
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
        {activeTab === 'support' && <><DirectorModeration /><SupportModerationHub /></>}
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
