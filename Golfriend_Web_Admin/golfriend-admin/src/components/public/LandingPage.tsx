
import { useMemo } from 'react';

type Lang = 'en' | 'th' | 'ko' | 'ja' | 'zh' | 'es' | 'fr' | 'de';

const COPY: Record<Lang, {
  tagline: string;
  subTagline: string;
  appStoreBadge: string;
  googlePlayBadge: string;
  reliabilityTitle: string;
  reliabilityBody: string;
  freemiumTitle: string;
  freemiumBody: string;
  b2bTitle: string;
  b2bBody: string;
  partnerPlans: string;
}> = {
  en: {
    tagline: 'The Global Matchmaking Platform for High-Quality Golf Profiles',
    subTagline:
      'Connecting people worldwide based on verified verification systems and real-time community engagement.',
    appStoreBadge: 'Download on the App Store',
    googlePlayBadge: 'Get it on Google Play',
    reliabilityTitle: '🛡️ Reliability System',
    reliabilityBody:
      'Every profile features a live Star Rating Display, a curated Behavior Badge, and automated Photo Validator quality controls.',
    freemiumTitle: '✨ Freemium Model',
    freemiumBody:
      'Free entry access to explore exceptional profiles, with smooth premium tiering for messaging, bookings, and exclusive elite matches.',
    b2bTitle: '🤝 B2B Commercial Portals',
    b2bBody:
      'Are you a golf club, sponsor, or vendor? Navigate to our partner portal to claim premium inventory and engage our community.',
    partnerPlans: 'Explore Partner Plans →',
  },
  th: {
    tagline: 'แพลตฟอร์มจับคู่คุณภาพสูงสุดสำหรับโปรไฟล์กอล์ฟทั่วโลก',
    subTagline:
      'เชื่อมผู้คนทั่วโลกด้วยระบบยืนยันตัวตนที่ผ่านการตรวจสอบและการมีส่วนร่วมในชุมชนแบบเรียลไทม์',
    appStoreBadge: 'ดาวน์โหลดบน App Store',
    googlePlayBadge: 'รับใน Google Play',
    reliabilityTitle: '🛡️ ระบบความน่าเชื่อถือ',
    reliabilityBody:
      'โปรไฟล์ทุกโปรไฟล์มีการแสดงผลดาวแบบสด, ป้ายพฤติกรรมที่คัดสรร และการควบคุมคุณภาพด้วย Photo Validator อัตโนมัติ',
    freemiumTitle: '✨ โมเดลฟรีมีมูลค่าสูง',
    freemiumBody:
      'เข้าใช้งานฟรีเพื่อสำรวจโปรไฟล์ที่ยอดเยี่ยม พร้อมการอัปเกรดพรีเมียมที่ลื่นไหลสำหรับข้อความ การจอง และแมตช์ระดับพิเศษ',
    b2bTitle: '🤝 พอร์ทัลธุรกิจ B2B',
    b2bBody:
      'คุณเป็นสโมสรผู้เล่น สปอนเซอร์ หรือผู้จำหน่ายหรือไม่ ไปที่ Partner Portal เพื่อรับสต๊อกพรีเมียมและเชื่อมต่อกับชุมชนของเรา',
    partnerPlans: 'ดูแผนส่วนร่วมสำหรับพาร์ทเนอร์ →',
  },
  ko: {
    tagline: '고품질 골프 프로필을 위한 글로벌 매칭 플랫폼',
    subTagline:
      '검증된 인증 시스템과 실시간 커뮤니티 참여를 기반으로 전 세계 사람들을 연결합니다.',
    appStoreBadge: '앱 스토어에서 다운로드',
    googlePlayBadge: 'Google Play에서 받기',
    reliabilityTitle: '🛡️ 신뢰성 시스템',
    reliabilityBody:
      '모든 프로필은 실시간 별점 표시, 큐레이팅된 행동 배지, 자동 Photo Validator 품질 제어를 제공합니다.',
    freemiumTitle: '✨ 프리미엄 모델',
    freemiumBody:
      '메시지, 예약, 그리고 엘리트 전용 경기 매칭에 대한 원활한 프리미엄 등급 업그레이드와 함께 우수한 프로필 탐색을 무료로 시작하세요.',
    b2bTitle: '🤝 B2B 상업 포털',
    b2bBody:
      '골프장, 스폰서, 벤더이신가요? 파트너 포털로 이동해 프리미엄 인벤토리를 확보하고 커뮤니티와 연결해 보세요.',
    partnerPlans: '파트너 플랜 보기 →',
  },
  ja: {
    tagline: '高品質ゴルフプロフィールのためのグローバル・マッチング・プラットフォーム',
    subTagline:
      '認証済みの本人確認システムとリアルタイムコミュニティエンゲージメントに基づき、世界中の人々をつなぎます。',
    appStoreBadge: 'App Storeからダウンロード',
    googlePlayBadge: 'Google Playで手に入れる',
    reliabilityTitle: '🛡️ 信頼性システム',
    reliabilityBody:
      'すべてのプロフィールはライブのスター評価表示、厳選された行動バッジ、および自動Photo Validator品質コントロールを備えます。',
    freemiumTitle: '✨ フリーミアムモデル',
    freemiumBody:
      '無料で優れたプロフィールを探索でき、メッセージ・予約・限定エリートマッチ向けのスムーズなプレミアム階層化が提供されます。',
    b2bTitle: '🤝 B2B商用ポータル',
    b2bBody:
      'ゴルフクラブ、スポンサー、またはベンダーのいずれかですか？ パートナーポータルへ移動してプレミアム在庫を確保し、コミュニティに参加しましょう。',
    partnerPlans: 'パートナープランを見る →',
  },
  zh: {
    tagline: '高品質高爾夫球員檔案的全球配對平台',
    subTagline: '基於已驗證的驗證系統與即時社群參與，連接全世界的人。',
    appStoreBadge: '在 App Store 下載',
    googlePlayBadge: '在 Google Play 取得',
    reliabilityTitle: '🛡️ 可靠性系統',
    reliabilityBody: '每個檔案都提供即時星級顯示、精選行為徽章與自動 Photo Validator 品質控制。',
    freemiumTitle: '✨ 免費增值模式',
    freemiumBody: '可免費探索優質檔案，並提供訊息、預約、精英限定配對的平順升級方案。',
    b2bTitle: '🤝 B2B 商務入口',
    b2bBody: '您是高爾夫球場、贊助商或供應商嗎？ 前往合作夥伴入口索取高品質名額並加入我們的社群。',
    partnerPlans: '查看合作夥伴方案 →',
  },
  es: {
    tagline: 'La plataforma global de emparejamiento para perfiles de golf de alta calidad',
    subTagline:
      'Conectamos a personas de todo el mundo con sistemas de verificación verificados y participación comunitaria en tiempo real.',
    appStoreBadge: 'Descargar en App Store',
    googlePlayBadge: 'Consíguelo en Google Play',
    reliabilityTitle: '🛡️ Sistema de confiabilidad',
    reliabilityBody:
      'Cada perfil muestra una calificación en estrellas en vivo, una insignia de conducta curada y controles de calidad automáticos de Photo Validator.',
    freemiumTitle: '✨ Modelo freemium',
    freemiumBody:
      'Acceso de entrada gratuito para explorar perfiles excepcionales, con escalado premium fluido para mensajería, reservas y partidos exclusivos de élite.',
    b2bTitle: '🤝 Portales comerciales B2B',
    b2bBody:
      '¿Eres un club de golf, patrocinador o proveedor? Ve a nuestro portal de socios para reclamar inventario premium y activar tu comunidad.',
    partnerPlans: 'Ver planes para socios →',
  },
  fr: {
    tagline: 'La plateforme de mise en relation pour profils de golf haut de gamme',
    subTagline:
      'Nous connectons des personnes dans le monde entier grâce à des systèmes de vérification authentifiés et à l’engagement communautaire en temps réel.',
    appStoreBadge: 'Télécharger sur l’App Store',
    googlePlayBadge: 'Obtenir sur Google Play',
    reliabilityTitle: '🛡️ Système de fiabilité',
    reliabilityBody:
      'Chaque profil affiche un classement par étoiles en direct, un badge de comportement sélectionné et des contrôles qualité automatiques du Photo Validator.',
    freemiumTitle: '✨ Modèle freemium',
    freemiumBody:
      'Accès gratuit à l’exploration de profils d’exception, avec une montée en premier plan fluide pour la messagerie, les réservations et les matchs élites exclusifs.',
    b2bTitle: '🤝 Portails commerciaux B2B',
    b2bBody:
      'Vous êtes club de golf, sponsor ou fournisseur ? Rendez-vous sur notre portail partenaire pour obtenir un inventaire premium et rejoindre la communauté.',
    partnerPlans: 'Voir les offres partenaires →',
  },
  de: {
    tagline: 'Die globale Matching-Plattform für Golfprofile hoher Qualität',
    subTagline:
      'Wir verbinden Menschen weltweit über verifizierte Überprüfungssysteme und Echtzeit-Community-Engagement.',
    appStoreBadge: 'Im App Store herunterladen',
    googlePlayBadge: 'Bei Google Play holen',
    reliabilityTitle: '🛡️ Zuverlässigkeitssystem',
    reliabilityBody:
      'Jedes Profil bietet eine Live-Sternebewertung, ein kuratiertes Verhaltensabzeichen und automatisierte Qualitätskontrollen durch Photo Validator.',
    freemiumTitle: '✨ Freemium-Modell',
    freemiumBody:
      'Kostenloser Zugang, um hochwertige Profile zu entdecken, mit nahtlosem Premium-Tuning für Nachrichten, Buchungen und exklusive Elite-Matches.',
    b2bTitle: '🤝 B2B-Geschäftsportale',
    b2bBody:
      'Sind Sie ein Golfclub, Sponsor oder Anbieter? Besuchen Sie unser Partner-Portal, um Premium-Bestände zu erhalten und unsere Community zu nutzen.',
    partnerPlans: 'Partner-Angebote anzeigen →',
  },
};

function resolveLocale(): Lang {
  if (typeof navigator === 'undefined') return 'en';
  const language = (navigator.language || 'en').toLowerCase();
  const base = language.split('-')[0];
  if ((Object.keys(COPY) as Lang[]).includes(base as Lang)) return base as Lang;
  if (base === 'zh' || language.startsWith('zh')) return 'zh';
  return 'en';
}

export default function LandingPage() {
  const t = useMemo(() => COPY[resolveLocale()], []);

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
        <p style={styles.tagline}>{t.tagline}</p>
        <p style={styles.subTagline}>{t.subTagline}</p>
        
        {/* App Store Links */}
        <div style={styles.badgeContainer}>
          <div style={styles.mockBadge} aria-label={t.appStoreBadge}>
            {t.appStoreBadge}
          </div>
          <div style={styles.mockBadge} aria-label={t.googlePlayBadge}>
            {t.googlePlayBadge}
          </div>
        </div>
      </header>

      {/* Feature Section */}
      <section style={styles.features}>
        <div style={styles.card}>
          <h3>{t.reliabilityTitle}</h3>
          <p>{t.reliabilityBody}</p>
        </div>
        <div style={styles.card}>
          <h3>{t.freemiumTitle}</h3>
          <p>{t.freemiumBody}</p>
        </div>
        <div style={styles.card}>
          <h3>{t.b2bTitle}</h3>
          <p>{t.b2bBody}</p>
          <a href="/storefront" style={styles.partnerLink} aria-label={t.partnerPlans}>
            {t.partnerPlans}
          </a>
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
