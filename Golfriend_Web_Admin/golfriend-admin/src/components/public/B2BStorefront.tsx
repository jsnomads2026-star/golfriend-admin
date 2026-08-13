import { useEffect, useState } from 'react';
import { browserSessionPersistence, getAuth, onAuthStateChanged, setPersistence, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { V2Theme } from '../../theme/v2Theme';
import { useT } from '../../i18n/hooks.ts';
import { SIGN_IN } from '../../i18n/partner/signIn.ts';

// Retained for a future separately approved financial slice. No current UI or
// lifecycle path calls this router.
function _preservedRouteToStripe_doNotCall(uid: string, tier: string, cycle: string) {
  const links: Record<string, Record<string, string>> = {
    'Small Business': { monthly: 'https://buy.stripe.com/test_aFa6oI4OKdUa3ecfOQ6Na03', '6_months': 'https://buy.stripe.com/test_4gw00c0yuaHYcOMfOQ6Na04', '1_year': 'https://buy.stripe.com/test_3cTdtAa2GcGYe820fOQ6Na05' },
    Enterprise: { monthly: 'https://buy.stripe.com/test_bJe28s2GC4jA5mkauw6Na06', '6_months': 'https://buy.stripe.com/test_9B028s95017ocOMfOQ6Na07', '1_year': 'https://buy.stripe.com/test_5kQdRa5SOdUag0YbyA6Na08' },
  };
  const safeTier = tier === 'Enterprise' ? 'Enterprise' : 'Small Business';
  window.location.href = `${links[safeTier]?.[cycle] ?? links['Small Business'].monthly}?client_reference_id=${uid}`;
}
void _preservedRouteToStripe_doNotCall;

function SubscriptionUnavailable() {
  const t = useT(SIGN_IN);
  return <div role="status" aria-live="polite" data-policy-unavailable="non-financial-precommission" style={styles.unavailable}>
    <strong style={{ color: V2Theme.gold }}>{t('precommission')}</strong>
    <span>{t('subsUnavailable')}</span>
  </div>;
}

export default function B2BStorefront() {
  const t = useT(SIGN_IN);
  const [showAuth, setShowAuth] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authFailed, setAuthFailed] = useState(false);
  useEffect(() => onAuthStateChanged(getAuth(), async (user) => {
    if (!user) return;
    try { if ((await getDoc(doc(db, 'b2b_partners', user.uid))).exists()) window.location.href = '/partner'; }
    catch { /* Remain fail-closed on the storefront. */ }
  }), []);
  const signIn = async (event: React.FormEvent) => {
    event.preventDefault(); setAuthFailed(false);
    try { await setPersistence(getAuth(), browserSessionPersistence); await signInWithEmailAndPassword(getAuth(), email, password); }
    catch { setAuthFailed(true); }
  };
  const tiers: Array<{ key: string; label: string }> = [
    { key: 'operator', label: t('tierOperator') },
    { key: 'enterprise', label: t('tierEnterprise') },
  ];
  if (showAuth) return <main style={styles.container}><section style={styles.card} aria-labelledby="partner-login-title">
    <p style={{ color: V2Theme.gold, fontWeight: 800 }}>GOLFRIEND</p><h1 id="partner-login-title">{t('loginTitle')}</h1>
    <form onSubmit={signIn} aria-label={t('formAria')} style={styles.form}>
      <label>{t('emailLabel')}<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="username" /></label>
      <label>{t('passwordLabel')}<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" /></label>
      {authFailed && <p role="alert" style={{ color: V2Theme.errorRed }}>{t('signInFailed')}</p>}<button type="submit">{t('logIn')}</button>
    </form><button type="button" onClick={() => setShowAuth(false)}>{t('backToInfo')}</button>
  </section></main>;
  return <main style={styles.container}>
    <header style={styles.header}><a href="/">{t('backToGolfriend')}</a><h1>{t('portalTitle')}</h1></header>
    <section style={styles.grid} aria-label={t('tiersAria')}>{tiers.map((tier) => <article key={tier.key} style={styles.card}><h2>{tier.label}</h2><p>{t('tierBlurb')}</p><SubscriptionUnavailable /></article>)}</section>
    <button type="button" onClick={() => setShowAuth(true)}>{t('existingLogin')}</button>
  </main>;
}

const styles: Record<string, React.CSSProperties> = {
  container: { minHeight: '100vh', padding: '40px 20px', background: V2Theme.surfaceDark, color: V2Theme.warmWhite, fontFamily: V2Theme.fontFamily },
  header: { maxWidth: 860, margin: '0 auto 32px', display: 'grid', gap: 20 },
  grid: { maxWidth: 860, margin: '0 auto 32px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 24 },
  card: { padding: 28, background: V2Theme.surfacePanel, border: `1px solid ${V2Theme.surfaceBorder}`, borderRadius: V2Theme.radiusLg },
  unavailable: { marginTop: 24, padding: 16, display: 'grid', gap: 6, background: V2Theme.surfaceCard, borderRadius: V2Theme.radiusMd },
  form: { display: 'grid', gap: 16, margin: '20px 0' },
};
