

import { useState, useEffect } from 'react';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, setPersistence, browserSessionPersistence } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebaseConfig';

export default function B2BStorefront() {
  const [user, setUser] = useState<any>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSignUp, setIsSignUp] = useState(true);
  const [pendingTier, setPendingTier] = useState<string | null>(null);
  const [pendingCycle, setPendingCycle] = useState<string | null>(null);

  // 📡 Listen for Auth changes to auto-forward to Stripe once a UID is minted
  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // 🛡️ SMART ROUTER: Check if they are ALREADY a paid partner first
        try {
          let partnerDoc = await getDoc(doc(db, 'b2b_partners', currentUser.uid));
          
          // 🔍 FALLBACK LOOKUP: Check email if webhook bypassed UID creation
          if (!partnerDoc.exists() && currentUser.email) {
            partnerDoc = await getDoc(doc(db, 'b2b_partners', currentUser.email));
            if (!partnerDoc.exists()) {
              const capitalizedEmail = currentUser.email.charAt(0).toUpperCase() + currentUser.email.slice(1);
              partnerDoc = await getDoc(doc(db, 'b2b_partners', capitalizedEmail));
            }
          }

          if (partnerDoc.exists()) {
            // If they exist in the database, bypass Stripe entirely
            window.location.href = '/partner';
            return;
          }
        } catch (error) {
          console.error("Storefront DB Check Error:", error);
        }

        // 💳 If they are NOT a partner, and clicked a tier button, send to Stripe
        if (pendingTier && pendingCycle) {
          routeToStripe(currentUser.uid, pendingTier, pendingCycle);
        }
      }
    });
    return () => unsubscribe();
  }, [pendingTier, pendingCycle]);

  const routeToStripe = (uid: string, tier: string, cycle: string) => {
    // 🔗 Master Router mapping to all 6 specific Stripe Payment Links
    const STRIPE_LINKS: Record<string, Record<string, string>> = {
      'Small Business': {
        'monthly': 'https://buy.stripe.com/test_aFa6oI4OKdUa3ecfOQ6Na03',
        '6_months': 'https://buy.stripe.com/test_4gw00c0yuaHYcOMfOQ6Na04',
        '1_year': 'https://buy.stripe.com/test_3cTdtAa2GcGYe820fOQ6Na05'
      },
      'Enterprise': {
        'monthly': 'https://buy.stripe.com/test_bJe28s2GC4jA5mkauw6Na06',
        '6_months': 'https://buy.stripe.com/test_9B028s95017ocOMfOQ6Na07',
        '1_year': 'https://buy.stripe.com/test_5kQdRa5SOdUag0YbyA6Na08'
      }
    };

    const safeTier = (tier === 'Enterprise' || tier === 'Service Promotion') ? 'Enterprise' : 'Small Business';
    const targetUrl = STRIPE_LINKS[safeTier][cycle] || STRIPE_LINKS['Small Business']['monthly'];

    // 🔗 Binds the newly minted Firebase UID to the appropriate Stripe session
    window.location.href = `${targetUrl}?client_reference_id=${uid}`;
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 🛑 TRAP PREVENTION: If they try to sign up without a tier selected, stop them!
    if (isSignUp && !pendingTier) {
      alert("Please click 'Cancel' and select a specific subscription plan from the storefront first.");
      return;
    }

    const auth = getAuth();
    try {
      // 🔒 STRICT PERSISTENCE: Session dies immediately if browser is closed
      await setPersistence(auth, browserSessionPersistence);
      if (isSignUp) {
        // 🛡️ MINT AUTH ONLY: We create the login credentials, but NO database profile.
        // The actual B2B profile will be created securely by the Stripe Webhook AFTER payment.
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (error: any) {
      console.error("Auth Error", error);
      alert(error.message); 
    }
  };

  const handleSubscribe = (tierName: string, cycle: string) => {
    if (user) {
      routeToStripe(user.uid, tierName, cycle);
    } else {
      setPendingTier(tierName);
      setPendingCycle(cycle);
      setShowAuth(true); // Triggers the Auth Interceptor
    }
  };

  if (showAuth) {
    return (
      <div style={{...styles.container, display: 'flex', justifyContent: 'center', alignItems: 'center', flexDirection: 'column'}}>
        <div style={styles.priceCard}>
          <h2 style={styles.title}>{isSignUp ? 'CREATE ACCOUNT' : 'PARTNER LOGIN'}</h2>
          <p style={styles.subtitle}>Securely authenticate to process your {pendingTier} license.</p>
          
          <form onSubmit={handleAuthSubmit} style={{display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '24px'}}>
            <input 
              id="b2b_partner_email"
              name="b2b_partner_email"
              type="email" 
              placeholder="Business Email" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)}
              style={{padding: '12px', backgroundColor: '#0a0a0a', border: '1px solid #333', color: 'white', borderRadius: '6px'}}
              required
              autoComplete="new-password"
            />
            <div style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
              <input 
                id="b2b_partner_password"
                name="b2b_partner_password"
                type={showPassword ? "text" : "password"} 
                placeholder="Secure Password" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)}
                style={{padding: '12px', backgroundColor: '#0a0a0a', border: '1px solid #333', color: 'white', borderRadius: '6px', paddingRight: '40px'}}
                required
                autoComplete="new-password"
              />
              <button 
                type="button" 
                onClick={() => setShowPassword(!showPassword)}
                style={{ position: 'absolute', right: '12px', top: '12px', background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '16px' }}
              >
                {showPassword ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>
            <button type="submit" style={{...styles.ctaButton, backgroundColor: '#d4af37', color: '#000'}}>
              {isSignUp ? 'REGISTER & CONTINUE TO SECURE CHECKOUT' : 'LOGIN & CONTINUE'}
            </button>
          </form>
          
          <button 
            onClick={() => setIsSignUp(!isSignUp)} 
            style={{marginTop: '16px', background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '13px'}}
          >
            {isSignUp ? 'Already have an account? Log In' : 'Need an account? Sign Up'}
          </button>
          <button 
            onClick={() => setShowAuth(false)} 
            style={{marginTop: '12px', background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer', fontSize: '13px'}}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

 
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <a href="/" style={styles.backLink}>← Back to Golfriend Global</a>
        {/* 🔥 THE SECRET DOOR: Double-click to instantly teleport to the Admin God-Mode login */}
        <h1 
          style={{...styles.title, cursor: 'default', userSelect: 'none'}} 
          onDoubleClick={() => window.location.href = '/portal'}
        >
          GOLFRIEND B2B COMMERCE
        </h1>
        <p style={styles.subtitle}>Partner with the world's premier matchmaking platform. Mint chips, manage ad inventory, and access commercial analytics.</p>
        
        {/* 🔥 GRACEFUL SESSION MANAGER */}
        {user && (
          <div style={{ display: 'inline-block', backgroundColor: '#111', border: '1px solid #333', padding: '8px 16px', borderRadius: '20px', marginTop: '16px', fontSize: '12px', color: '#888' }}>
            Securely authenticated as <span style={{ color: '#d4af37', fontWeight: 'bold', margin: '0 8px' }}>{user.email}</span>
            <button 
              onClick={() => getAuth().signOut()} 
              style={{ background: 'none', border: 'none', color: '#ff4444', textDecoration: 'underline', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
            >
              Sign out to change accounts
            </button>
          </div>
        )}
      </div>

      <div style={styles.pricingGrid}>
        {/* Tier 1: Small Business */}
        <div style={styles.priceCard}>
          <div style={styles.tierName}>SMALL BUSINESS LICENSE</div>
          <div style={styles.price}>$199<span style={styles.period}>/mo</span></div>
          <ul style={styles.bulletList}>
            <li>Deploy targeted campaigns on the Sponsor Ad Hub</li>
            <li>Real-time engagement telemetry logs</li>
            <li>Standard Operator Presence</li>
          </ul>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: 'auto' }}>
            <button style={{...styles.ctaButton, backgroundColor: '#d4af37', color: '#000', padding: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px'}} onClick={() => handleSubscribe('Small Business', 'monthly')}>
              <span>Monthly</span>
              <span style={{ fontSize: '12px', opacity: 0.8, fontWeight: 'normal' }}>$199</span>
            </button>
            <button style={{...styles.ctaButton, backgroundColor: '#1a1a1a', border: '1px solid #d4af37', color: '#d4af37', padding: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px'}} onClick={() => handleSubscribe('Small Business', '6_months')}>
              <span>6 Months</span>
              <span style={{ fontSize: '12px', opacity: 0.8, fontWeight: 'normal' }}>$1,074</span>
            </button>
            <button style={{...styles.ctaButton, backgroundColor: '#1a1a1a', border: '1px solid #d4af37', color: '#d4af37', padding: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px'}} onClick={() => handleSubscribe('Small Business', '1_year')}>
              <span>1 Year</span>
              <span style={{ fontSize: '12px', opacity: 0.8, fontWeight: 'normal' }}>$1,910</span>
            </button>
          </div>
        </div>

        {/* Tier 2: Enterprise */}
        <div style={styles.priceCard}>
          <div style={styles.tierName}>ENTERPRISE PROMOTION</div>
          <div style={styles.price}>$499<span style={styles.period}>/mo</span></div>
          <ul style={styles.bulletList}>
            <li>Promote commercial gear, tee times, or course services</li>
            <li>Deploy targeted localized commercials to verified players</li>
            <li>1 Verified Enterprise Behavior Badge</li>
          </ul>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: 'auto' }}>
            <button style={{...styles.ctaButton, backgroundColor: '#d4af37', color: '#000', padding: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px'}} onClick={() => handleSubscribe('Enterprise', 'monthly')}>
              <span>Monthly</span>
              <span style={{ fontSize: '12px', opacity: 0.8, fontWeight: 'normal' }}>$499</span>
            </button>
            <button style={{...styles.ctaButton, backgroundColor: '#1a1a1a', border: '1px solid #d4af37', color: '#d4af37', padding: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px'}} onClick={() => handleSubscribe('Enterprise', '6_months')}>
              <span>6 Months</span>
              <span style={{ fontSize: '12px', opacity: 0.8, fontWeight: 'normal' }}>$2,694</span>
            </button>
            <button style={{...styles.ctaButton, backgroundColor: '#1a1a1a', border: '1px solid #d4af37', color: '#d4af37', padding: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px'}} onClick={() => handleSubscribe('Enterprise', '1_year')}>
              <span>1 Year</span>
              <span style={{ fontSize: '12px', opacity: 0.8, fontWeight: 'normal' }}>$4,790</span>
            </button>
          </div>
        </div>
      </div>

      {/* 🔥 MOVED: EXISTING PARTNER LOGIN */}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: '48px' }}>
        <button 
          onClick={() => { setIsSignUp(false); setPendingTier(null); setShowAuth(true); }}
          style={{padding: '12px 24px', backgroundColor: 'transparent', color: '#888', border: '1px solid #333', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold'}}
        >
          Existing Partner Login
        </button>
      </div>

    </div>
  );
}

const styles = {
  container: { backgroundColor: '#0a0a0a', color: 'white', minHeight: '100vh', fontFamily: 'sans-serif', padding: '40px 20px' },
  header: { textAlign: 'center' as const, marginBottom: '48px' },
  backLink: { color: '#888', textDecoration: 'none', fontSize: '13px', display: 'block', marginBottom: '16px' },
  title: { color: '#white', fontSize: '32px', letterSpacing: '1px', margin: '0 0 12px 0' },
  subtitle: { color: '#666', fontSize: '15px', maxWidth: '600px', margin: '0 auto', lineHeight: '1.5' },
  pricingGrid: { display: 'flex', gap: '24px', maxWidth: '800px', margin: '0 auto', flexWrap: 'wrap' as const, justifyContent: 'center' },
  priceCard: { flex: '1 1 340px', backgroundColor: '#121212', border: '1px solid #222', padding: '32px', borderRadius: '16px', display: 'flex', flexDirection: 'column' as const },
  tierName: { fontSize: '12px', fontWeight: '900' as const, letterSpacing: '1.5px', color: '#888', marginBottom: '16px' },
  price: { fontSize: '40px', fontWeight: 'bold' as const, marginBottom: '24px' },
  period: { fontSize: '16px', color: '#666', fontWeight: 'normal' as const },
  bulletList: { listStyleType: 'none' as const, padding: 0, margin: '0 0 32px 0', display: 'flex', flexDirection: 'column' as const, gap: '12px', fontSize: '14px', color: '#aaa' },
  ctaButton: { width: '100%', padding: '14px', backgroundColor: '#1a1a1a', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold' as const, cursor: 'pointer', marginTop: 'auto' as const }
};