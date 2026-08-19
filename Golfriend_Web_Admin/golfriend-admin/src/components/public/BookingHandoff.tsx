import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getAuth } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import { db } from '../../firebaseConfig';

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

type Lang = 'en' | 'th' | 'ko' | 'ja' | 'zh' | 'es' | 'fr' | 'de';

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
    requestBtnAria: 'Request this booking',
    requesting: 'Requesting…',
    booking_pending: 'Requested — awaiting course confirmation',
    booking_cancelled: 'Booking cancelled — the seat has been released',
    cancelBtn: 'Cancel booking',
    cancelBtnAria: 'Cancel this booking request',
    cancelling: 'Cancelling…',
    messageTitle: 'Message the course',
    messagePlaceholder: 'Write a message to the course…',
    messageInputAria: 'Message input for course',
    sendBtn: 'Send',
    sendBtnAria: 'Send message',
    sending: 'Sending…',
    noMessages: 'No messages yet.',
    you: 'You',
    course: 'Course',
    errorGeneric: 'Could not complete the request. Please try again.',
    back: '← Back',
    backAria: 'Return',
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
    requestBtnAria: 'ส่งคำขอจองนี้',
    requesting: 'กำลังส่งคำขอ…',
    booking_pending: 'ส่งคำขอแล้ว — รอสนามยืนยัน',
    booking_cancelled: 'ยกเลิกการจองแล้ว — คืนที่นั่งเรียบร้อย',
    cancelBtn: 'ยกเลิกการจอง',
    cancelBtnAria: 'ยกเลิกคำขอจองนี้',
    cancelling: 'กำลังยกเลิก…',
    messageTitle: 'ส่งข้อความถึงสนาม',
    messagePlaceholder: 'เขียนข้อความถึงสนาม…',
    messageInputAria: 'ช่องป้อนข้อความสำหรับส่งถึงสนาม',
    sendBtn: 'ส่ง',
    sendBtnAria: 'ส่งข้อความ',
    sending: 'กำลังส่ง…',
    noMessages: 'ยังไม่มีข้อความ',
    you: 'คุณ',
    course: 'สนาม',
    errorGeneric: 'ไม่สามารถดำเนินการได้ กรุณาลองใหม่อีกครั้ง',
    back: '← ย้อนกลับ',
    backAria: 'กลับ',
  },
  ko: {
    title: '이 티타임을 요청하기',
    when: '날짜/시간',
    seatsLeft: '남은 좌석',
    signInTitle: '예약하려면 로그인 필요',
    signInBody:
      '티타임 예약은 Golfriend 플레이어 계정이 필요합니다. Golfriend 앱에서 로그인하고 이 요청을 완료하세요. 예약은 해당 앱에서 관리됩니다.',
    continueApp: 'Golfriend 앱에서 계속',
    requestBtn: '요청',
    requestBtnAria: '이 예약을 요청',
    requesting: '요청 중…',
    booking_pending: '요청됨 — 코스 확인 대기',
    booking_cancelled: '예약이 취소되었습니다. 좌석이 반환되었습니다.',
    cancelBtn: '예약 취소',
    cancelBtnAria: '이 예약을 취소',
    cancelling: '취소 중…',
    messageTitle: '코스에 메시지 보내기',
    messagePlaceholder: '코스에 보낼 메시지를 입력하세요…',
    messageInputAria: '코스 메시지 입력',
    sendBtn: '전송',
    sendBtnAria: '메시지 전송',
    sending: '전송 중…',
    noMessages: '아직 메시지가 없습니다.',
    you: '본인',
    course: '코스',
    errorGeneric: '요청을 완료할 수 없습니다. 다시 시도해 주세요.',
    back: '← 뒤로',
    backAria: '돌아가기',
  },
  ja: {
    title: 'このティータイムをリクエスト',
    when: '日時',
    seatsLeft: '残り席',
    signInTitle: '予約するにはサインイン',
    signInBody:
      'ティータイムを予約するにはGolfriendのプレイヤーアカウントが必要です。継続してサインインしこのリクエストを完了するにはGolfriendアプリを開いてください。予約情報はそちらで管理されます。',
    continueApp: 'Golfriendアプリで続行',
    requestBtn: 'リクエスト',
    requestBtnAria: 'この予約をリクエスト',
    requesting: 'リクエスト中…',
    booking_pending: 'リクエスト送信済み — コースの確認待ち',
    booking_cancelled: '予約がキャンセルされました — 席が解放されました',
    cancelBtn: '予約をキャンセル',
    cancelBtnAria: 'この予約をキャンセル',
    cancelling: 'キャンセル中…',
    messageTitle: 'コースにメッセージ',
    messagePlaceholder: 'コースへメッセージを書く…',
    messageInputAria: 'コース送信用のメッセージ入力',
    sendBtn: '送信',
    sendBtnAria: 'メッセージを送信',
    sending: '送信中…',
    noMessages: 'まだメッセージはありません。',
    you: 'あなた',
    course: 'コース',
    errorGeneric: 'リクエストを完了できません。再試行してください。',
    back: '← 戻る',
    backAria: '戻る',
  },
  zh: {
    title: '请求此时间段',
    when: '时间',
    seatsLeft: '剩余席位',
    signInTitle: '请先登录以预订',
    signInBody:
      '预订时间段需要您的 Golfriend 玩家账号。请在 Golfriend 应用中登录并完成此请求，您的预订记录保留在该应用中。',
    continueApp: '在 Golfriend 应用中继续',
    requestBtn: '请求',
    requestBtnAria: '请求此预订',
    requesting: '请求中…',
    booking_pending: '请求已提交 — 等待球场确认',
    booking_cancelled: '预订已取消 — 座位已释放',
    cancelBtn: '取消预订',
    cancelBtnAria: '取消此预订',
    cancelling: '取消中…',
    messageTitle: '给球场发消息',
    messagePlaceholder: '写给球场的消息…',
    messageInputAria: '球场消息输入',
    sendBtn: '发送',
    sendBtnAria: '发送消息',
    sending: '发送中…',
    noMessages: '尚无消息。',
    you: '你',
    course: '球场',
    errorGeneric: '无法完成请求，请重试。',
    back: '← 返回',
    backAria: '返回',
  },
  es: {
    title: 'Solicitar este horario',
    when: 'Cuándo',
    seatsLeft: 'Plazas restantes',
    signInTitle: 'Inicia sesión para reservar',
    signInBody:
      'Reservar un horario requiere tu cuenta de jugador Golfriend. Continúa en la app de Golfriend para iniciar sesión y completar esta solicitud; tus reservas están allí.',
    continueApp: 'Continuar en la app de Golfriend',
    requestBtn: 'Solicitar',
    requestBtnAria: 'Solicitar esta reserva',
    requesting: 'Solicitando…',
    booking_pending: 'Solicitud enviada — pendiente de confirmación del campo',
    booking_cancelled: 'Reserva cancelada — el asiento fue liberado',
    cancelBtn: 'Cancelar reserva',
    cancelBtnAria: 'Cancelar esta reserva',
    cancelling: 'Cancelando…',
    messageTitle: 'Enviar mensaje al campo',
    messagePlaceholder: 'Escribe un mensaje al campo…',
    messageInputAria: 'Entrada de mensaje al campo',
    sendBtn: 'Enviar',
    sendBtnAria: 'Enviar mensaje',
    sending: 'Enviando…',
    noMessages: 'Aún no hay mensajes.',
    you: 'Tú',
    course: 'Campo',
    errorGeneric: 'No se pudo completar la solicitud. Intenta nuevamente.',
    back: '← Volver',
    backAria: 'Volver',
  },
  fr: {
    title: 'Demander ce créneau',
    when: 'Quand',
    seatsLeft: 'places restantes',
    signInTitle: 'Connectez-vous pour réserver',
    signInBody:
      'La réservation d’un départ nécessite votre compte joueur Golfriend. Continuez dans l’application Golfriend pour vous connecter et finaliser cette demande — vos réservations y sont stockées.',
    continueApp: 'Continuer dans l\'application Golfriend',
    requestBtn: 'Demander',
    requestBtnAria: 'Demander cette réservation',
    requesting: 'Demande en cours…',
    booking_pending: 'Demandé — en attente de confirmation du parcours',
    booking_cancelled: 'Réservation annulée — la place a été libérée',
    cancelBtn: 'Annuler la réservation',
    cancelBtnAria: 'Annuler cette réservation',
    cancelling: 'Annulation…',
    messageTitle: 'Envoyer un message au parcours',
    messagePlaceholder: 'Écris un message au parcours…',
    messageInputAria: 'Champ de message au parcours',
    sendBtn: 'Envoyer',
    sendBtnAria: 'Envoyer le message',
    sending: 'Envoi…',
    noMessages: 'Aucun message pour le moment.',
    you: 'Vous',
    course: 'Parcours',
    errorGeneric: 'Impossible de terminer la demande. Réessayez.',
    back: '← Retour',
    backAria: 'Retour',
  },
  de: {
    title: 'Diese Tischnummer anfragen',
    when: 'Wann',
    seatsLeft: 'freie Plätze',
    signInTitle: 'Zum Buchen anmelden',
    signInBody:
      'Für eine Tischebuchung ist Ihr Golfriend-Spieleraccount erforderlich. Bitte fahren Sie in der Golfriend-App fort, um sich anzumelden und diese Anfrage abzuschließen — Ihre Buchungen liegen dort.',
    continueApp: 'In der Golfriend-App fortfahren',
    requestBtn: 'Anfragen',
    requestBtnAria: 'Diese Buchung anfragen',
    requesting: 'Anfrage läuft…',
    booking_pending: 'Angefragt — auf Bestätigung des Kurses warten',
    booking_cancelled: 'Buchung storniert — der Platz wurde freigegeben',
    cancelBtn: 'Buchung stornieren',
    cancelBtnAria: 'Diese Buchung stornieren',
    cancelling: 'Wird storniert…',
    messageTitle: 'Nachricht an Kurs senden',
    messagePlaceholder: 'Nachricht an den Kurs schreiben…',
    messageInputAria: 'Nachrichteneingabe für Kurs',
    sendBtn: 'Senden',
    sendBtnAria: 'Nachricht senden',
    sending: 'Wird gesendet…',
    noMessages: 'Noch keine Nachrichten.',
    you: 'Sie',
    course: 'Kurs',
    errorGeneric: 'Vorgang konnte nicht abgeschlossen werden. Bitte erneut versuchen.',
    back: '← Zurück',
    backAria: 'Zurück',
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

export default function BookingHandoff({ slot, lang, onBack }: Props) {
  const t = (k: string) => DICT[lang][k] ?? k;
  const [phase, setPhase] = useState<Phase>('idle');
  const [errorMsg, setErrorMsg] = useState<string>('');

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
        <button
          style={styles.backBtn}
          onClick={onBack}
          aria-label={t('backAria')}
        >
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
          <div style={styles.appBadge} aria-label={t('continueApp')}>
            {t('continueApp')}
          </div>
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
          aria-label={t('requestBtnAria')}
        >
          {phase === 'requesting' ? t('requesting') : t('requestBtn')}
        </button>
      )}

      {phase === 'pending' && (
        <div style={styles.pending}>✓ {t('booking_pending')}</div>
      )}

      {phase === 'cancelled' && (
        <div style={styles.cancelled}>{t('booking_cancelled')}</div>
      )}

      {/* Active booking → cancel + live message thread */}
      {hasActiveBooking && bookingId && (
        <ActiveBooking
          bookingId={bookingId}
          uid={uid}
          lang={lang}
          onCancelled={() => setPhase('cancelled')}
        />
      )}

      {phase === 'error' && errorMsg && (
        <div style={styles.error}>{errorMsg}</div>
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
    setErrorMsg('');
    try {
      const fn = httpsCallable(getFunctions(), 'cancelBooking');
      await fn({ bookingId });
      onCancelled();
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message?: string }).message)
          : t('errorGeneric');
      setErrorMsg(message || t('errorGeneric'));
    } finally {
      setCancelling(false);
    }
  };

  const handleSend = async () => {
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    setErrorMsg('');
    try {
      const fn = httpsCallable(getFunctions(), 'sendBookingMessage');
      await fn({ bookingId, text });
      setDraft(''); // thread updates live via onSnapshot
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message?: string }).message)
          : t('errorGeneric');
      setErrorMsg(message || t('errorGeneric'));
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
        aria-label={t('cancelBtnAria')}
      >
        {cancelling ? t('cancelling') : t('cancelBtn')}
      </button>

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
            aria-label={t('messageInputAria')}
          />
          <button
            style={{
              ...styles.sendBtn,
              ...(sending || !draft.trim() ? styles.sendBtnBusy : {}),
            }}
            onClick={handleSend}
            disabled={sending || !draft.trim()}
            aria-label={t('sendBtnAria')}
          >
            {sending ? t('sending') : t('sendBtn')}
          </button>
        </div>
      </div>

      {errorMsg && <div style={styles.error}>{errorMsg}</div>}
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
  },
};
