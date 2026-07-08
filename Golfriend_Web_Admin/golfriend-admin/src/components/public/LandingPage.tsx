

export default function LandingPage() {
  return (
    <div style={styles.container}>
      {/* ⛳ BRANDING ANIMATION: React Native Physics Translation */}
      <style>
        {`
          /* Mimics Animated.spring(tension: 40, friction: 3) from -100px */
          @keyframes springDrop {
            0% { transform: translateY(-100px); opacity: 0; }
            10% { transform: translateY(-100px); opacity: 0; } /* Micro-delay for page load */
            15% { opacity: 1; }
            35% { transform: translateY(8px); }   /* Overshoot 1 */
            55% { transform: translateY(-40px); } /* Heavy Bounce Up */
            70% { transform: translateY(4px); }   /* Overshoot 2 */
            85% { transform: translateY(-15px); } /* Minor Bounce Up */
            95% { transform: translateY(2px); }   /* Micro Overshoot */
            100% { transform: translateY(0); opacity: 1; } /* Settled */
          }
          .anim-o {
            display: inline-block;
            /* 1.4s duration matches the slow tension of 40 */
            animation: springDrop 1.4s linear forwards; 
            color: #D4AF37; /* Matches the Posh Gold ring from the mobile app */
            text-shadow: 0px 3px 8px rgba(212, 175, 55, 0.9);
          }
        `}
      </style>

      {/* Hero Section */}
      <header style={styles.hero}>
        {/* 🔥 THE SECRET DOOR: Double-click to instantly teleport to the Admin God-Mode login */}
        <h1 
          style={{ ...styles.logo, cursor: 'default', userSelect: 'none' }}
          onDoubleClick={() => window.location.href = '/admin'}
        >
          G<span className="anim-o">O</span>LFRIEND
        </h1>
        <p style={styles.tagline}>The Global Matchmaking Platform for High-Quality Golf Profiles</p>
        <p style={styles.subTagline}>Connecting people worldwide based on verified verification systems and real-time community engagement.</p>
        
        {/* App Store Links */}
        <div style={styles.badgeContainer}>
          <div style={styles.mockBadge}>Download on the App Store</div>
          <div style={styles.mockBadge}>Get it on Google Play</div>
        </div>
      </header>

      {/* Feature Section */}
      <section style={styles.features}>
        <div style={styles.card}>
          <h3>🛡️ Reliability System</h3>
          <p>Every profile features a live Star Rating Display, a curated Behavior Badge, and automated Photo Validator quality controls.</p>
        </div>
        <div style={styles.card}>
          <h3>✨ Freemium Model</h3>
          <p>Free entry access to explore exceptional profiles, with smooth premium tiering for messaging, bookings, and exclusive elite matches.</p>
        </div>
        <div style={styles.card}>
          <h3>🤝 B2B Commercial Portals</h3>
          <p>Are you a golf club, sponsor, or vendor? Navigate to our partner portal to claim premium inventory and engage our community.</p>
          <a href="/storefront" style={styles.partnerLink}>Explore Partner Plans →</a>
        </div>
      </section>
    </div>
  );
}

const styles = {
  container: { backgroundColor: '#0a0a0a', color: 'white', minHeight: '100vh', fontFamily: 'sans-serif', padding: '40px 20px' },
  hero: { textAlign: 'center' as const, padding: '60px 20px', maxWidth: '800px', margin: '0 auto' },
  logo: { 
    color: '#FFFFFF', 
    fontSize: '48px', 
    fontWeight: '900' as const, 
    fontStyle: 'italic' as const, 
    letterSpacing: '6px', 
    textShadow: '0px 3px 8px rgba(212, 175, 55, 0.9)',
    margin: '0 0 16px 0' 
  },
  tagline: { fontSize: '20px', fontWeight: 'bold' as const, color: '#eee', marginBottom: '12px' },
  subTagline: { fontSize: '15px', color: '#888', lineHeight: '1.6', marginBottom: '32px' },
  badgeContainer: { display: 'flex', gap: '16px', justifyContent: 'center' },
  mockBadge: { backgroundColor: '#121212', border: '1px solid #333', padding: '12px 24px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' as const, fontSize: '14px', color: '#d4af37' },
  features: { display: 'flex', gap: '24px', maxWidth: '1000px', margin: '40px auto 0 auto', flexWrap: 'wrap' as const },
  card: { flex: '1 1 300px', backgroundColor: '#121212', border: '1px solid #222', padding: '24px', borderRadius: '12px', textAlign: 'left' as const },
  partnerLink: { display: 'inline-block', marginTop: '16px', color: '#d4af37', textDecoration: 'none', fontWeight: 'bold' as const, fontSize: '13px' }
};