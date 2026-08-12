import React, { useState } from 'react';

// ─────────────────────────────────────────────────────────────
// SupportPage — support/contact + FAQ for the public web surface.
// Generic, honest copy. Support email is Golfriend's own address.
// EN/TH toggle. No fake third parties.
// ─────────────────────────────────────────────────────────────

type Lang = 'en' | 'th';

const SUPPORT_EMAIL = 'support@golfriend.app';

const theme = {
  bg: '#0a0a0a',
  panel: '#121212',
  border: '#222',
  gold: '#d4af37',
  text: '#eee',
  muted: '#888',
};

export default function SupportPage() {
  const [lang, setLang] = useState<Lang>('en');
  const [open, setOpen] = useState<number | null>(0);
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

        <p style={styles.lead}>{c.lead}</p>

        <div style={styles.contactCard}>
          <h2 style={styles.h2}>{c.contactTitle}</h2>
          <p style={styles.body}>{c.contactBody}</p>
          <a href={`mailto:${SUPPORT_EMAIL}`} style={styles.mailBtn}>
            {SUPPORT_EMAIL}
          </a>
          <p style={styles.hours}>{c.hours}</p>
        </div>

        <h2 style={{ ...styles.h2, marginTop: '36px' }}>{c.faqTitle}</h2>
        <div style={styles.faqList}>
          {c.faqs.map((f, i) => {
            const isOpen = open === i;
            return (
              <div key={i} style={styles.faqItem}>
                <button
                  style={styles.faqQ}
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                >
                  <span>{f.q}</span>
                  <span style={styles.chev}>{isOpen ? '−' : '+'}</span>
                </button>
                {isOpen && <p style={styles.faqA}>{f.a}</p>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const COPY: Record<Lang, {
  title: string;
  lead: string;
  contactTitle: string;
  contactBody: string;
  hours: string;
  faqTitle: string;
  faqs: { q: string; a: string }[];
}> = {
  en: {
    title: 'Support',
    lead: 'Need a hand with Golfriend? Browse the FAQ below or reach our team directly.',
    contactTitle: 'Contact us',
    contactBody:
      'Email our support team and we’ll get back to you. Please include your account email and a short description of the issue so we can help faster.',
    hours: 'We aim to respond within 1–2 business days (Indochina Time, based in Pattaya, Thailand).',
    faqTitle: 'Frequently asked questions',
    faqs: [
      {
        q: 'How do I book a tee-time?',
        a: 'Browse courses on the Discover page, open a course to see its open tee-times, then send a booking request. You’ll sign in through the Golfriend app to complete it.',
      },
      {
        q: 'Why does it say "awaiting course confirmation"?',
        a: 'Your request has been sent to the course. The course reviews and confirms availability, after which your booking status updates. It is not guaranteed until the course confirms.',
      },
      {
        q: 'Do I need an account to book?',
        a: 'Yes. Booking requires a Golfriend player account, which lives in the Golfriend app. You can browse courses and tee-times on the web without signing in.',
      },
      {
        q: 'What are chips?',
        a: 'Chips are Golfriend’s in-app balance used for some features and bookings. Balances and holds are managed securely by our systems — never edited manually from the app.',
      },
      {
        q: 'How do I update or delete my data?',
        a: 'You can review and update your profile in the Golfriend app, and request access to or deletion of your account data. Contact support if you need help.',
      },
    ],
  },
  th: {
    title: 'สนับสนุน',
    lead: 'ต้องการความช่วยเหลือเกี่ยวกับ Golfriend? ดูคำถามที่พบบ่อยด้านล่าง หรือติดต่อทีมงานของเราโดยตรง',
    contactTitle: 'ติดต่อเรา',
    contactBody:
      'ส่งอีเมลถึงทีมสนับสนุนของเรา แล้วเราจะติดต่อกลับ กรุณาระบุอีเมลบัญชีของคุณและอธิบายปัญหาสั้น ๆ เพื่อให้เราช่วยได้เร็วขึ้น',
    hours: 'เรามุ่งตอบกลับภายใน 1–2 วันทำการ (เวลาอินโดจีน สำนักงานอยู่ที่พัทยา ประเทศไทย)',
    faqTitle: 'คำถามที่พบบ่อย',
    faqs: [
      {
        q: 'จองเวลาออกรอบอย่างไร?',
        a: 'เรียกดูสนามในหน้าค้นหา เปิดสนามเพื่อดูเวลาออกรอบที่ว่าง แล้วส่งคำขอจอง คุณจะเข้าสู่ระบบผ่านแอป Golfriend เพื่อทำรายการให้เสร็จ',
      },
      {
        q: 'ทำไมขึ้นว่า “รอสนามยืนยัน”?',
        a: 'คำขอของคุณถูกส่งไปยังสนามแล้ว สนามจะตรวจสอบและยืนยันความว่าง จากนั้นสถานะการจองจะอัปเดต การจองยังไม่รับประกันจนกว่าสนามจะยืนยัน',
      },
      {
        q: 'ต้องมีบัญชีเพื่อจองหรือไม่?',
        a: 'ใช่ การจองต้องใช้บัญชีผู้เล่น Golfriend ซึ่งอยู่ในแอป Golfriend คุณสามารถเรียกดูสนามและเวลาออกรอบบนเว็บได้โดยไม่ต้องเข้าสู่ระบบ',
      },
      {
        q: 'ชิปคืออะไร?',
        a: 'ชิปคือยอดคงเหลือในแอป Golfriend ที่ใช้กับบางฟีเจอร์และการจอง ยอดและการกันชิปจัดการอย่างปลอดภัยโดยระบบของเรา ไม่มีการแก้ไขด้วยตนเองจากแอป',
      },
      {
        q: 'อัปเดตหรือลบข้อมูลของฉันอย่างไร?',
        a: 'คุณสามารถตรวจสอบและอัปเดตโปรไฟล์ในแอป Golfriend และขอเข้าถึงหรือลบข้อมูลบัญชีได้ ติดต่อฝ่ายสนับสนุนหากต้องการความช่วยเหลือ',
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
  lead: { color: theme.muted, fontSize: '16px', lineHeight: 1.6, marginTop: '16px' },
  contactCard: {
    marginTop: '24px',
    backgroundColor: theme.panel,
    border: `1px solid ${theme.border}`,
    borderRadius: '12px',
    padding: '24px',
  },
  h2: { fontSize: '20px', fontWeight: 800, color: '#fff', margin: '0 0 10px 0' },
  body: { color: theme.text, fontSize: '15px', lineHeight: 1.7, margin: '0 0 16px 0' },
  mailBtn: {
    display: 'inline-block',
    backgroundColor: '#0a0a0a',
    border: `1px solid ${theme.gold}`,
    color: theme.gold,
    padding: '12px 20px',
    borderRadius: '8px',
    fontWeight: 700,
    fontSize: '15px',
    textDecoration: 'none',
  },
  hours: { color: theme.muted, fontSize: '13px', marginTop: '14px', marginBottom: 0 },
  faqList: { marginTop: '12px' },
  faqItem: { borderBottom: `1px solid ${theme.border}` },
  faqQ: {
    width: '100%',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    background: 'transparent',
    border: 'none',
    color: theme.text,
    padding: '16px 0',
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: '16px',
    textAlign: 'left',
  },
  chev: { color: theme.gold, fontSize: '20px', lineHeight: 1 },
  faqA: { color: theme.muted, fontSize: '15px', lineHeight: 1.7, margin: '0 0 16px 0' },
};
