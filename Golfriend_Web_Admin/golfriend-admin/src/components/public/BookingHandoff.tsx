import React, { useState } from 'react';
import { getAuth } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import type { Lang } from './CourseInfo';

// ─────────────────────────────────────────────────────────────
// BookingHandoff — booking request/handoff for a selected tee-time.
//
// Rules honored:
//  • NOT signed in  → do NOT attempt to book. Show a clear
//    "sign in / continue in the Golfriend app" handoff. The player
//    app owns account/login.
//  • Signed in      → call requestBooking({ slotId }) and show the
//    returned localized status (userStatusKey booking_pending).
//  • NEVER write booking/wallet state directly from the client.
// ─────────────────────────────────────────────────────────────

export interface PublicSlot {
  id: string;
  courseId: string;
  courseName: string;
  date: string;
  time: string;
  capacity: number;
  bookedCount: number;
  priceChips: number;
  status: string;
}

const DICT: Record<Lang, Record<string, string>> = {
  en: {
    title: 'Request this tee-time',
    when: 'When',
    price: 'Price',
    chips: 'chips',
    free: 'Free',
    signInTitle: 'Sign in to book',
    signInBody:
      'Booking a tee-time requires your Golfriend player account. Continue in the Golfriend app to sign in and complete this request — your wallet and bookings live there.',
    continueApp: 'Continue in the Golfriend app',
    requestBtn: 'Request booking',
    requesting: 'Requesting…',
    booking_pending: 'Requested — awaiting course confirmation',
    errorGeneric: 'Could not complete the request. Please try again.',
    back: '← Back',
  },
  th: {
    title: 'ขอจองเวลาออกรอบนี้',
    when: 'เวลา',
    price: 'ราคา',
    chips: 'ชิป',
    free: 'ฟรี',
    signInTitle: 'เข้าสู่ระบบเพื่อจอง',
    signInBody:
      'การจองเวลาออกรอบต้องใช้บัญชีผู้เล่น Golfriend ของคุณ กรุณาดำเนินการต่อในแอป Golfriend เพื่อเข้าสู่ระบบและจองให้เสร็จสิ้น — กระเป๋าเงินและการจองของคุณอยู่ที่นั่น',
    continueApp: 'ดำเนินการต่อในแอป Golfriend',
    requestBtn: 'ขอจอง',
    requesting: 'กำลังส่งคำขอ…',
    booking_pending: 'ส่งคำขอแล้ว — รอสนามยืนยัน',
    errorGeneric: 'ไม่สามารถดำเนินการได้ กรุณาลองใหม่อีกครั้ง',
    back: '← ย้อนกลับ',
  },
};

const theme = {
  panel: '#121212',
  border: '#222',
  gold: '#d4af37',
  text: '#eee',
  muted: '#888',
  danger: '#e06c6c',
};

interface Props {
  slot: PublicSlot;
  lang: Lang;
  onBack?: () => void;
}

type Phase = 'idle' | 'requesting' | 'pending' | 'error';

export default function BookingHandoff({ slot, lang, onBack }: Props) {
  const t = (k: string) => DICT[lang][k] ?? k;
  const [phase, setPhase] = useState<Phase>('idle');
  const [errorMsg, setErrorMsg] = useState<string>('');

  const user = getAuth().currentUser;
  const signedIn = !!user;

  const priceText =
    slot.priceChips > 0 ? `${slot.priceChips} ${t('chips')}` : t('free');

  const handleRequest = async () => {
    if (!signedIn) return; // guard: never book without an authenticated user
    setPhase('requesting');
    setErrorMsg('');
    try {
      const fn = httpsCallable(getFunctions(), 'requestBooking');
      const res = await fn({ slotId: slot.id });
      const data = (res.data || {}) as { success?: boolean; status?: string };
      if (data.success && data.status === 'pending') {
        setPhase('pending');
      } else {
        setPhase('error');
        setErrorMsg(t('errorGeneric'));
      }
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message?: string }).message)
          : t('errorGeneric');
      setPhase('error');
      setErrorMsg(message || t('errorGeneric'));
    }
  };

  return (
    <div style={styles.card}>
      {onBack && (
        <button style={styles.backBtn} onClick={onBack}>
          {t('back')}
        </button>
      )}

      <h3 style={styles.title}>{t('title')}</h3>
      <p style={styles.course}>{slot.courseName || slot.courseId}</p>

      <div style={styles.metaRow}>
        <span style={styles.metaLabel}>{t('when')}</span>
        <span style={styles.metaValue}>
          {slot.date} · {slot.time}
        </span>
      </div>
      <div style={styles.metaRow}>
        <span style={styles.metaLabel}>{t('price')}</span>
        <span style={styles.metaValue}>{priceText}</span>
      </div>

      {/* Not signed in → handoff, no booking attempt */}
      {!signedIn && (
        <div style={styles.handoff}>
          <p style={styles.handoffTitle}>{t('signInTitle')}</p>
          <p style={styles.handoffBody}>{t('signInBody')}</p>
          <div style={styles.appBadge}>{t('continueApp')}</div>
        </div>
      )}

      {/* Signed in → real callable */}
      {signedIn && phase !== 'pending' && (
        <button
          style={{
            ...styles.requestBtn,
            ...(phase === 'requesting' ? styles.requestBtnBusy : {}),
          }}
          onClick={handleRequest}
          disabled={phase === 'requesting'}
        >
          {phase === 'requesting' ? t('requesting') : t('requestBtn')}
        </button>
      )}

      {phase === 'pending' && (
        <div style={styles.pending}>✓ {t('booking_pending')}</div>
      )}

      {phase === 'error' && errorMsg && (
        <div style={styles.error}>{errorMsg}</div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    backgroundColor: theme.panel,
    border: `1px solid ${theme.border}`,
    borderRadius: '12px',
    padding: '24px',
    color: theme.text,
    fontFamily: 'sans-serif',
    maxWidth: '520px',
  },
  backBtn: {
    background: 'transparent',
    border: 'none',
    color: theme.muted,
    cursor: 'pointer',
    fontSize: '13px',
    padding: 0,
    marginBottom: '12px',
  },
  title: { margin: '0 0 4px 0', fontSize: '20px', fontWeight: 800, color: '#fff' },
  course: { margin: '0 0 16px 0', color: theme.gold, fontWeight: 700 },
  metaRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 0',
    borderBottom: `1px solid ${theme.border}`,
  },
  metaLabel: { color: theme.muted, fontSize: '14px' },
  metaValue: { color: theme.text, fontSize: '14px', fontWeight: 600 },
  handoff: {
    marginTop: '20px',
    padding: '16px',
    borderRadius: '10px',
    border: `1px solid ${theme.border}`,
    background: '#0f0f0f',
  },
  handoffTitle: { margin: '0 0 8px 0', fontWeight: 700, color: '#fff' },
  handoffBody: { margin: '0 0 16px 0', color: theme.muted, fontSize: '14px', lineHeight: 1.6 },
  appBadge: {
    display: 'inline-block',
    backgroundColor: '#0a0a0a',
    border: `1px solid ${theme.gold}`,
    color: theme.gold,
    padding: '12px 20px',
    borderRadius: '8px',
    fontWeight: 700,
    fontSize: '14px',
  },
  requestBtn: {
    marginTop: '20px',
    width: '100%',
    background: theme.gold,
    border: 'none',
    color: '#0a0a0a',
    padding: '14px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 800,
    fontSize: '15px',
  },
  requestBtnBusy: { opacity: 0.6, cursor: 'default' },
  pending: {
    marginTop: '20px',
    padding: '14px',
    borderRadius: '8px',
    border: `1px solid ${theme.gold}`,
    color: theme.gold,
    fontWeight: 700,
    textAlign: 'center',
  },
  error: {
    marginTop: '16px',
    padding: '12px',
    borderRadius: '8px',
    border: `1px solid ${theme.danger}`,
    color: theme.danger,
    fontSize: '14px',
  },
};
