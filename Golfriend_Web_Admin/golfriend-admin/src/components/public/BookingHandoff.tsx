import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getAuth } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import { db, functions } from '../../firebaseConfig';
import type { Lang } from './CourseInfo';

// ─────────────────────────────────────────────────────────────
// BookingHandoff — NON-FINANCIAL booking request/handoff for a
// selected tee-time.
//
// Rules honored:
//  • NOT signed in  → do NOT attempt to book. Show a clear
//    "sign in / continue in the Golfriend app" handoff. The player
//    app owns account/login.
//  • Signed in      → call requestBooking({ slotId }) and show the
//    returned localized status (userStatusKey booking_pending).
//  • With an active booking → offer Cancel (cancelBooking) and a
//    live message thread (bookings/{id}/messages + sendBookingMessage).
//  • NEVER write booking/wallet state directly from the client.
//  • No price / chip / fiat display anywhere.
// ─────────────────────────────────────────────────────────────

export interface PublicSlot {
  id: string;
  courseId: string;
  courseName: string;
  date: string;
  time: string;
  capacity: number;
  bookedCount: number;
  status: string;
}

interface BookingMessage {
  id: string;
  senderUid?: string;
  senderRole?: string;
  text?: string;
  createdAt?: { seconds?: number } | null;
}

const DICT: Record<Lang, Record<string, string>> = {
  en: {
    title: 'Request this tee-time',
    when: 'When',
    seatsLeft: 'Seats left',
    signInTitle: 'Sign in to book',
    signInBody:
      'Booking a tee-time requires your Golfriend player account. Continue in the Golfriend app to sign in and complete this request — your bookings live there.',
    continueApp: 'Continue in the Golfriend app',
    requestBtn: 'Request booking',
    requesting: 'Requesting…',
    booking_pending: 'Requested — awaiting course confirmation',
    booking_cancelled: 'Booking cancelled — the seat has been released',
    cancelBtn: 'Cancel booking',
    cancelling: 'Cancelling…',
    messageTitle: 'Message the course',
    messagePlaceholder: 'Write a message to the course…',
    sendBtn: 'Send',
    sending: 'Sending…',
    noMessages: 'No messages yet.',
    you: 'You',
    course: 'Course',
    errorGeneric: 'Could not complete the request. Please try again.',
    retryRequest: 'Retry request',
    retryCancel: 'Retry cancel',
    retrySend: 'Retry send',
    back: '← Back',
  },
  th: {
    title: 'ขอจองเวลาออกรอบนี้',
    when: 'เวลา',
    seatsLeft: 'ที่นั่งเหลือ',
    signInTitle: 'เข้าสู่ระบบเพื่อจอง',
    signInBody:
      'การจองเวลาออกรอบต้องใช้บัญชีผู้เล่น Golfriend ของคุณ กรุณาดำเนินการต่อในแอป Golfriend เพื่อเข้าสู่ระบบและจองให้เสร็จสิ้น — การจองของคุณอยู่ที่นั่น',
    continueApp: 'ดำเนินการต่อในแอป Golfriend',
    requestBtn: 'ขอจอง',
    requesting: 'กำลังส่งคำขอ…',
    booking_pending: 'ส่งคำขอแล้ว — รอสนามยืนยัน',
    booking_cancelled: 'ยกเลิกการจองแล้ว — คืนที่นั่งเรียบร้อย',
    cancelBtn: 'ยกเลิกการจอง',
    cancelling: 'กำลังยกเลิก…',
    messageTitle: 'ส่งข้อความถึงสนาม',
    messagePlaceholder: 'เขียนข้อความถึงสนาม…',
    sendBtn: 'ส่ง',
    sending: 'กำลังส่ง…',
    noMessages: 'ยังไม่มีข้อความ',
    you: 'คุณ',
    course: 'สนาม',
    errorGeneric: 'ไม่สามารถดำเนินการได้ กรุณาลองใหม่อีกครั้ง',
    retryRequest: 'ลองใหม่อีกครั้งเพื่อขอจอง',
    retryCancel: 'ลองใหม่อีกครั้งเพื่อยกเลิก',
    retrySend: 'ลองใหม่อีกครั้งเพื่อส่ง',
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

type Phase = 'idle' | 'requesting' | 'pending' | 'cancelled' | 'error';

type FailureAction = 'request' | 'cancel' | 'send' | null;

export default function BookingHandoff({ slot, lang, onBack }: Props) {
  const t = (k: string) => DICT[lang][k] ?? k;
  const [phase, setPhase] = useState<Phase>('idle');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [failureAction, setFailureAction] = useState<FailureAction>(null);
  const [statusMsg, setStatusMsg] = useState<string>('');

  const user = getAuth().currentUser;
  const signedIn = !!user;
  const uid = user?.uid || null;

  // Deterministic booking id for this player + slot.
  const bookingId = uid ? `${slot.id}__${uid}` : null;

  // The booking is "active" once we have requested it in this session
  // (pending). Cancel/messaging are offered while active.
  const hasActiveBooking = signedIn && phase === 'pending';

  const seatsLeft = Number(slot.capacity || 0) - Number(slot.bookedCount || 0);

  const handleRequest = async () => {
    if (!signedIn) return; // guard: never book without an authenticated user
    setPhase('requesting');
    setErrorMsg('');
    setFailureAction(null);
    setStatusMsg(t('requesting'));
    try {
      const fn = httpsCallable(functions, 'requestBooking');
      const res = await fn({ slotId: slot.id });
      const data = (res.data || {}) as { success?: boolean; status?: string };
      if (data.success && data.status === 'pending') {
        setPhase('pending');
        setStatusMsg(t('booking_pending'));
      } else {
        setPhase('error');
        setFailureAction('request');
        setStatusMsg('');
        setErrorMsg(t('errorGeneric'));
      }
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message?: string }).message)
          : t('errorGeneric');
      setPhase('error');
      setFailureAction('request');
      setStatusMsg('');
      setErrorMsg(message || t('errorGeneric'));
    }
  };

  const requestRetryLabel = t('retryRequest');
  const requestAriaRetryLabel = `${requestRetryLabel} ${slot.courseName || slot.courseId}`;

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
        <span style={styles.metaLabel}>{t('seatsLeft')}</span>
        <span style={styles.metaValue}>{seatsLeft}</span>
      </div>

      {/* Not signed in → handoff, no booking attempt */}
      {!signedIn && (
        <div style={styles.handoff}>
          <p style={styles.handoffTitle}>{t('signInTitle')}</p>
          <p style={styles.handoffBody}>{t('signInBody')}</p>
          <div style={styles.appBadge}>{t('continueApp')}</div>
        </div>
      )}

      {/* Signed in, no active booking yet → real callable */}
      {signedIn && phase !== 'pending' && phase !== 'cancelled' && (
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

      {statusMsg && (
        <p role="status" aria-live="polite" style={styles.statusRow}>
          {statusMsg}
        </p>
      )}

      {phase === 'pending' && (
        <div role="status" aria-live="polite" style={styles.pending}>
          ✓ {t('booking_pending')}
        </div>
      )}

      {phase === 'cancelled' && (
        <div role="status" aria-live="polite" style={styles.cancelled}>
          {t('booking_cancelled')}
        </div>
      )}

      {/* Active booking → cancel + live message thread */}
      {hasActiveBooking && bookingId && (
        <ActiveBooking
          bookingId={bookingId}
          uid={uid}
          lang={lang}
          onCancelled={() => {
            setPhase('cancelled');
            setStatusMsg(t('booking_cancelled'));
          }}
        />
      )}

      {phase === 'error' && errorMsg && (
        <div style={styles.error} role="alert" aria-live="assertive">
          {errorMsg}
          {failureAction === 'request' && (
            <button
              type="button"
              onClick={handleRequest}
              aria-label={requestAriaRetryLabel}
              style={styles.retryBtn}
            >
              {requestRetryLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ActiveBooking — cancel button + live message thread for an
// existing booking. Reads bookings/{id}/messages live; writes
// only via callables (cancelBooking / sendBookingMessage).
// ─────────────────────────────────────────────────────────────
function ActiveBooking({
  bookingId,
  uid,
  lang,
  onCancelled,
}: {
  bookingId: string;
  uid: string | null;
  lang: Lang;
  onCancelled: () => void;
}) {
  const t = (k: string) => DICT[lang][k] ?? k;
  const [messages, setMessages] = useState<BookingMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [failureAction, setFailureAction] = useState<FailureAction>(null);
  const [statusMsg, setStatusMsg] = useState<string>('');
  const threadRef = useRef<HTMLDivElement | null>(null);

  // Live thread stream (read-only) ordered by createdAt.
  useEffect(() => {
    const q = query(
      collection(db, 'bookings', bookingId, 'messages'),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: BookingMessage[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<BookingMessage, 'id'>),
        }));
        setMessages(list);
      },
      () => {
        /* thread read errors are non-fatal to the booking */
      }
    );
    return () => unsub();
  }, [bookingId]);

  // Keep the thread scrolled to the latest message.
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const handleCancel = async () => {
    setCancelling(true);
    setFailureAction(null);
    setErrorMsg('');
    setStatusMsg(t('cancelling'));
    try {
      const fn = httpsCallable(functions, 'cancelBooking');
      await fn({ bookingId });
      setStatusMsg(t('booking_cancelled'));
      onCancelled();
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message?: string }).message)
          : t('errorGeneric');
      setFailureAction('cancel');
      setErrorMsg(message || t('errorGeneric'));
      setStatusMsg('');
    } finally {
      setCancelling(false);
    }
  };

  const handleSend = async () => {
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    setFailureAction(null);
    setErrorMsg('');
    setStatusMsg(t('sending'));
    try {
      const fn = httpsCallable(functions, 'sendBookingMessage');
      await fn({ bookingId, text });
      setStatusMsg('');
      setDraft(''); // thread updates live via onSnapshot
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message?: string }).message)
          : t('errorGeneric');
      setFailureAction('send');
      setErrorMsg(message || t('errorGeneric'));
      setStatusMsg('');
    } finally {
      setSending(false);
    }
  };

  const orderedMessages = useMemo(() => messages, [messages]);

  return (
    <div style={styles.active}>
      <button
        style={{
          ...styles.cancelBtn,
          ...(cancelling ? styles.cancelBtnBusy : {}),
        }}
        onClick={handleCancel}
        disabled={cancelling}
      >
        {cancelling ? t('cancelling') : t('cancelBtn')}
      </button>
      {statusMsg && !failureAction && statusMsg === t('cancelling') && (
        <p role="status" aria-live="polite" style={styles.statusRow}>
          {statusMsg}
        </p>
      )}

      <div style={styles.messageBox}>
        <p style={styles.messageTitle}>{t('messageTitle')}</p>
        <div style={styles.thread} ref={threadRef}>
          {orderedMessages.length === 0 ? (
            <p style={styles.noMessages}>{t('noMessages')}</p>
          ) : (
            orderedMessages.map((m) => {
              const mine = !!uid && m.senderUid === uid;
              const who = mine
                ? t('you')
                : m.senderRole === 'course'
                ? t('course')
                : m.senderRole || t('course');
              return (
                <div
                  key={m.id}
                  style={{
                    ...styles.msg,
                    ...(mine ? styles.msgMine : styles.msgTheirs),
                  }}
                >
                  <span style={styles.msgWho}>{who}</span>
                  <span style={styles.msgText}>{m.text}</span>
                </div>
              );
            })
          )}
        </div>
        <div style={styles.composer}>
          <input
            style={styles.input}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !sending) handleSend();
            }}
            placeholder={t('messagePlaceholder')}
            aria-label={t('messageTitle')}
          />
          <button
            style={{
              ...styles.sendBtn,
              ...(sending || !draft.trim() ? styles.sendBtnBusy : {}),
            }}
            onClick={handleSend}
            disabled={sending || !draft.trim()}
          >
            {sending ? t('sending') : t('sendBtn')}
          </button>
        </div>
        {statusMsg && !errorMsg && statusMsg !== t('cancelling') && (
          <p role="status" aria-live="polite" style={styles.statusRow}>
            {statusMsg}
          </p>
        )}
      </div>

      {errorMsg && <div style={styles.error} role="alert" aria-live="assertive">
        {errorMsg}
        {failureAction === 'cancel' && (
          <button
            type="button"
            onClick={handleCancel}
            aria-label={t('retryCancel')}
            style={styles.retryBtn}
          >
            {t('retryCancel')}
          </button>
        )}
        {failureAction === 'send' && (
          <button
            type="button"
            onClick={handleSend}
            aria-label={t('retrySend')}
            style={styles.retryBtn}
          >
            {t('retrySend')}
          </button>
        )}
      </div>}
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
  cancelled: {
    marginTop: '20px',
    padding: '14px',
    borderRadius: '8px',
    border: `1px solid ${theme.muted}`,
    color: theme.muted,
    fontWeight: 700,
    textAlign: 'center',
  },
  active: { marginTop: '20px' },
  cancelBtn: {
    width: '100%',
    background: 'transparent',
    border: `1px solid ${theme.danger}`,
    color: theme.danger,
    padding: '12px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: '14px',
  },
  cancelBtnBusy: { opacity: 0.6, cursor: 'default' },
  messageBox: {
    marginTop: '20px',
    padding: '16px',
    borderRadius: '10px',
    border: `1px solid ${theme.border}`,
    background: '#0f0f0f',
  },
  messageTitle: { margin: '0 0 12px 0', fontWeight: 700, color: '#fff', fontSize: '14px' },
  thread: {
    maxHeight: '200px',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginBottom: '12px',
  },
  noMessages: { color: theme.muted, fontSize: '13px', margin: 0 },
  msg: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    padding: '8px 10px',
    borderRadius: '8px',
    maxWidth: '85%',
  },
  msgMine: {
    alignSelf: 'flex-end',
    background: '#1a1a1a',
    border: `1px solid ${theme.gold}`,
  },
  msgTheirs: {
    alignSelf: 'flex-start',
    background: '#161616',
    border: `1px solid ${theme.border}`,
  },
  msgWho: { color: theme.muted, fontSize: '11px', fontWeight: 700 },
  msgText: { color: theme.text, fontSize: '14px', lineHeight: 1.4 },
  composer: { display: 'flex', gap: '8px' },
  input: {
    flex: 1,
    background: '#0a0a0a',
    border: `1px solid ${theme.border}`,
    color: theme.text,
    padding: '10px 12px',
    borderRadius: '8px',
    fontSize: '14px',
    fontFamily: 'sans-serif',
  },
  sendBtn: {
    background: theme.gold,
    border: 'none',
    color: '#0a0a0a',
    padding: '10px 16px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 800,
    fontSize: '14px',
  },
  sendBtnBusy: { opacity: 0.6, cursor: 'default' },
  error: {
    marginTop: '16px',
    padding: '12px',
    borderRadius: '8px',
    border: `1px solid ${theme.danger}`,
    color: theme.danger,
    fontSize: '14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  statusRow: {
    marginTop: '8px',
    color: theme.text,
    fontSize: '14px',
    fontWeight: 600,
    textAlign: 'center',
  },
  retryBtn: {
    alignSelf: 'flex-start',
    background: 'transparent',
    border: `1px solid ${theme.danger}`,
    color: theme.danger,
    borderRadius: '8px',
    padding: '10px 12px',
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: '13px',
  },
};
