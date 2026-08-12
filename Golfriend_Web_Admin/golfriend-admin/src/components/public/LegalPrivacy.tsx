import React, { useState } from 'react';

// ─────────────────────────────────────────────────────────────
// LegalPrivacy — Golfriend's own privacy + terms pages.
// Generic, readable placeholder copy. No fake registration numbers,
// no impersonated third parties. Clearly the app's own content.
// EN/TH toggle to match the rest of the public surface.
// ─────────────────────────────────────────────────────────────

type Lang = 'en' | 'th';

const theme = {
  bg: '#0a0a0a',
  panel: '#121212',
  border: '#222',
  gold: '#d4af37',
  text: '#eee',
  muted: '#888',
};

export default function LegalPrivacy() {
  const [lang, setLang] = useState<Lang>('en');
  const [tab, setTab] = useState<'privacy' | 'terms'>('privacy');
  const c = COPY[lang];

  return (
    <div style={styles.page}>
      <div style={styles.inner}>
        <div style={styles.headerRow}>
          <h1 style={styles.heading}>{c.title}</h1>
          <div style={styles.langToggle}>
            {(['en', 'th'] as Lang[]).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                style={{ ...styles.langBtn, ...(lang === l ? styles.langBtnActive : {}) }}
                aria-pressed={lang === l}
              >
                {l === 'en' ? 'EN' : 'ไทย'}
              </button>
            ))}
          </div>
        </div>

        <div style={styles.tabs}>
          <button
            style={{ ...styles.tab, ...(tab === 'privacy' ? styles.tabActive : {}) }}
            onClick={() => setTab('privacy')}
          >
            {c.privacyTab}
          </button>
          <button
            style={{ ...styles.tab, ...(tab === 'terms' ? styles.tabActive : {}) }}
            onClick={() => setTab('terms')}
          >
            {c.termsTab}
          </button>
        </div>

        <p style={styles.updated}>{c.lastUpdated}</p>

        {(tab === 'privacy' ? c.privacy : c.terms).map((sec, i) => (
          <section key={i} style={styles.section}>
            <h2 style={styles.h2}>{sec.h}</h2>
            <p style={styles.body}>{sec.p}</p>
          </section>
        ))}
      </div>
    </div>
  );
}

interface Sec {
  h: string;
  p: string;
}

const COPY: Record<Lang, {
  title: string;
  privacyTab: string;
  termsTab: string;
  lastUpdated: string;
  privacy: Sec[];
  terms: Sec[];
}> = {
  en: {
    title: 'Legal & Privacy',
    privacyTab: 'Privacy Policy',
    termsTab: 'Terms of Service',
    lastUpdated: 'Last updated: 11 August 2026',
    privacy: [
      {
        h: 'Overview',
        p: 'This summary explains what Golfriend collects and why. Golfriend is a golf matchmaking and tee-time platform. We aim to collect only what is needed to run the service and to keep your information secure.',
      },
      {
        h: 'What we collect',
        p: 'Account details you provide (such as your name and contact info), your golf profile and preferences, tee-time booking requests, and basic device and usage data that helps us operate and improve the app.',
      },
      {
        h: 'How we use it',
        p: 'To create matches, process tee-time booking requests with partner courses, keep the community safe through our reliability and verification systems, and provide support. We do not sell your personal data.',
      },
      {
        h: 'Sharing',
        p: 'When you request a tee-time, the relevant booking details are shared with the partner course so it can confirm your reservation. We share data with service providers only as needed to run Golfriend, under appropriate safeguards.',
      },
      {
        h: 'Your choices',
        p: 'You can review and update your profile, and request access to or deletion of your account data from within the Golfriend app. Contact us any time using the details on the Support page.',
      },
      {
        h: 'Data security',
        p: 'We use reasonable technical and organizational measures to protect your information. No system is perfectly secure, so we encourage strong account practices such as keeping your login credentials private.',
      },
    ],
    terms: [
      {
        h: 'Acceptance',
        p: 'By using Golfriend you agree to these terms. If you do not agree, please do not use the service. These terms are a plain-language summary of the agreement between you and Golfriend.',
      },
      {
        h: 'Your account',
        p: 'You are responsible for the activity on your account and for keeping your credentials secure. You must provide accurate information and use Golfriend in line with community and safety guidelines.',
      },
      {
        h: 'Bookings',
        p: 'Tee-time booking requests are submitted to partner courses and are confirmed at the course’s discretion. A request marked "awaiting course confirmation" is not a guaranteed reservation until the course confirms it.',
      },
      {
        h: 'Chips & payments',
        p: 'Some features and bookings may use in-app chips. Chip balances and holds are managed by Golfriend’s systems, not by manual client actions. Applicable fees, if any, are shown before you confirm.',
      },
      {
        h: 'Acceptable use',
        p: 'Do not misuse the service, attempt to disrupt it, or use it for unlawful or harmful activity. We may suspend accounts that violate these terms or our community guidelines.',
      },
      {
        h: 'Changes',
        p: 'We may update these terms as the service evolves. We will make reasonable efforts to communicate material changes. Continued use after an update means you accept the revised terms.',
      },
    ],
  },
  th: {
    title: 'กฎหมายและความเป็นส่วนตัว',
    privacyTab: 'นโยบายความเป็นส่วนตัว',
    termsTab: 'ข้อกำหนดการใช้งาน',
    lastUpdated: 'อัปเดตล่าสุด: 11 สิงหาคม 2569',
    privacy: [
      {
        h: 'ภาพรวม',
        p: 'สรุปนี้อธิบายว่า Golfriend เก็บข้อมูลอะไรและเพราะเหตุใด Golfriend เป็นแพลตฟอร์มจับคู่กอล์ฟและจองเวลาออกรอบ เรามุ่งเก็บเฉพาะข้อมูลที่จำเป็นต่อการให้บริการและรักษาความปลอดภัยของข้อมูลคุณ',
      },
      {
        h: 'ข้อมูลที่เราเก็บ',
        p: 'ข้อมูลบัญชีที่คุณให้ (เช่น ชื่อและข้อมูลติดต่อ) โปรไฟล์และความชอบด้านกอล์ฟ คำขอจองเวลาออกรอบ และข้อมูลอุปกรณ์และการใช้งานพื้นฐานที่ช่วยให้เราดำเนินการและปรับปรุงแอป',
      },
      {
        h: 'วิธีที่เราใช้ข้อมูล',
        p: 'เพื่อสร้างการจับคู่ ดำเนินการคำขอจองกับสนามพันธมิตร ดูแลชุมชนให้ปลอดภัยผ่านระบบความน่าเชื่อถือและการยืนยันตัวตน และให้การสนับสนุน เราไม่ขายข้อมูลส่วนบุคคลของคุณ',
      },
      {
        h: 'การเปิดเผยข้อมูล',
        p: 'เมื่อคุณขอจองเวลาออกรอบ รายละเอียดที่เกี่ยวข้องจะถูกส่งให้สนามพันธมิตรเพื่อยืนยันการจอง เราเปิดเผยข้อมูลแก่ผู้ให้บริการเท่าที่จำเป็นในการดำเนินงานภายใต้มาตรการคุ้มครองที่เหมาะสม',
      },
      {
        h: 'ทางเลือกของคุณ',
        p: 'คุณสามารถตรวจสอบและอัปเดตโปรไฟล์ และขอเข้าถึงหรือลบข้อมูลบัญชีได้จากภายในแอป Golfriend ติดต่อเราได้ตลอดเวลาผ่านช่องทางในหน้าสนับสนุน',
      },
      {
        h: 'ความปลอดภัยของข้อมูล',
        p: 'เราใช้มาตรการทางเทคนิคและองค์กรที่เหมาะสมเพื่อปกป้องข้อมูลของคุณ ไม่มีระบบใดปลอดภัยสมบูรณ์ เราจึงแนะนำให้รักษาข้อมูลเข้าสู่ระบบเป็นความลับ',
      },
    ],
    terms: [
      {
        h: 'การยอมรับ',
        p: 'เมื่อใช้ Golfriend ถือว่าคุณยอมรับข้อกำหนดเหล่านี้ หากไม่ยอมรับโปรดงดใช้บริการ ข้อกำหนดนี้เป็นสรุปด้วยภาษาที่เข้าใจง่ายของข้อตกลงระหว่างคุณกับ Golfriend',
      },
      {
        h: 'บัญชีของคุณ',
        p: 'คุณรับผิดชอบต่อกิจกรรมในบัญชีและการรักษาข้อมูลเข้าสู่ระบบ คุณต้องให้ข้อมูลที่ถูกต้องและใช้ Golfriend ตามแนวทางของชุมชนและความปลอดภัย',
      },
      {
        h: 'การจอง',
        p: 'คำขอจองเวลาออกรอบจะถูกส่งไปยังสนามพันธมิตรและยืนยันตามดุลยพินิจของสนาม คำขอที่ระบุว่า “รอสนามยืนยัน” ยังไม่ถือเป็นการจองที่รับประกันจนกว่าสนามจะยืนยัน',
      },
      {
        h: 'ชิปและการชำระเงิน',
        p: 'บางฟีเจอร์และการจองอาจใช้ชิปในแอป ยอดและการกันชิปจัดการโดยระบบของ Golfriend ไม่ใช่การกระทำด้วยตนเองฝั่งไคลเอนต์ ค่าธรรมเนียม (ถ้ามี) จะแสดงก่อนยืนยัน',
      },
      {
        h: 'การใช้งานที่ยอมรับได้',
        p: 'ห้ามใช้บริการในทางที่ผิด รบกวนระบบ หรือใช้เพื่อกิจกรรมที่ผิดกฎหมายหรือเป็นอันตราย เราอาจระงับบัญชีที่ละเมิดข้อกำหนดหรือแนวทางชุมชน',
      },
      {
        h: 'การเปลี่ยนแปลง',
        p: 'เราอาจปรับปรุงข้อกำหนดเมื่อบริการพัฒนาขึ้น เราจะพยายามแจ้งการเปลี่ยนแปลงที่สำคัญ การใช้งานต่อหลังอัปเดตถือว่าคุณยอมรับข้อกำหนดที่แก้ไข',
      },
    ],
  },
};

const styles: Record<string, React.CSSProperties> = {
  page: {
    backgroundColor: theme.bg,
    color: theme.text,
    minHeight: '100vh',
    fontFamily: 'sans-serif',
    padding: '40px 20px',
  },
  inner: { maxWidth: '760px', margin: '0 auto' },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '16px',
    flexWrap: 'wrap',
  },
  heading: { margin: 0, fontSize: '30px', fontWeight: 900, color: '#fff' },
  langToggle: { display: 'flex', gap: '6px' },
  langBtn: {
    background: 'transparent',
    border: `1px solid ${theme.border}`,
    color: theme.muted,
    padding: '6px 12px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: '12px',
  },
  langBtnActive: { borderColor: theme.gold, color: theme.gold },
  tabs: { display: 'flex', gap: '8px', marginTop: '24px', borderBottom: `1px solid ${theme.border}` },
  tab: {
    background: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    color: theme.muted,
    padding: '10px 4px',
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: '15px',
  },
  tabActive: { color: theme.gold, borderBottom: `2px solid ${theme.gold}` },
  updated: { color: theme.muted, fontSize: '13px', marginTop: '16px' },
  section: { marginTop: '24px' },
  h2: { fontSize: '18px', fontWeight: 800, color: '#fff', margin: '0 0 8px 0' },
  body: { color: theme.text, fontSize: '15px', lineHeight: 1.7, margin: 0 },
};
