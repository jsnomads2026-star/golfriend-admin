import { useEffect, useState } from 'react';
import { browserSessionPersistence, getAuth, onAuthStateChanged, setPersistence, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { V2Theme } from '../../theme/v2Theme';

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
  return <div role="status" aria-live="polite" data-policy-unavailable="non-financial-precommission" style={styles.unavailable}>
    <strong style={{ color: V2Theme.gold }}>Pre-commission build</strong>
    <span>New partner subscriptions are unavailable. Existing partner access is provisioned server-side.</span>
  </div>;
}

export default function B2BStorefront() {
  const [showAuth, setShowAuth] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  useEffect(() => onAuthStateChanged(getAuth(), async (user) => {
    if (!user) return;
    try { if ((await getDoc(doc(db, 'b2b_partners', user.uid))).exists()) window.location.href = '/partner'; }
    catch { /* Remain fail-closed on the storefront. */ }
  }), []);
  const signIn = async (event: React.FormEvent) => {
    event.preventDefault(); setAuthError('');
    try { await setPersistence(getAuth(), browserSessionPersistence); await signInWithEmailAndPassword(getAuth(), email, password); }
    catch { setAuthError('Sign-in failed. Check your credentials and try again.'); }
  };
  if (showAuth) return <main style={styles.container}><section style={styles.card} aria-labelledby="partner-login-title">
    <p style={{ color: V2Theme.gold, fontWeight: 800 }}>GOLFRIEND</p><h1 id="partner-login-title">Partner login</h1>
    <form onSubmit={signIn} aria-label="Partner sign-in" style={styles.form}>
      <label>Business email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="username" /></label>
      <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" /></label>
      {authError && <p role="alert" style={{ color: V2Theme.errorRed }}>{authError}</p>}<button type="submit">Log in</button>
    </form><button type="button" onClick={() => setShowAuth(false)}>Back to partner information</button>
  </section></main>;
  return <main style={styles.container}>
    <header style={styles.header}><a href="/">Back to Golfriend</a><h1>Golfriend Partner Portal</h1></header>
    <section style={styles.grid} aria-label="Partner tiers">{['Golf operator partner', 'Enterprise partner'].map((tier) => <article key={tier} style={styles.card}><h2>{tier}</h2><p>Course operations, booking support, localized communication, and reporting tools.</p><SubscriptionUnavailable /></article>)}</section>
    <button type="button" onClick={() => setShowAuth(true)}>Existing partner — log in</button>
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
