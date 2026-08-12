// ==========================================
// FILE: src/components/admin/booking/BookingMessageComposer.tsx
// C2B — Eight-locale message template selector and sender.
//
// Honest backend posture:
//   - Draft/copy/export is always available.
//   - The sendBookingMessage callable is invoked only when the booking is
//     in an active state (pending or confirmed). Rejected/cancelled bookings
//     surface a clear "sending unavailable" notice; copy remains available.
//   - No fabricated backend confirmation. All callable errors are surfaced.
// ==========================================
import { useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { V2Theme } from '../../../theme/v2Theme';
import type { BookingRowSlim } from './BookingDetailPanel';

// ── Locale definitions ──────────────────────────────────────────────────────

export const LOCALES = ['en', 'th', 'ko', 'ja', 'zh', 'es', 'fr', 'de'] as const;
export type Locale = typeof LOCALES[number];

const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  th: 'ภาษาไทย',
  ko: '한국어',
  ja: '日本語',
  zh: '中文',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
};

// ── Template definitions (5 categories × 8 locales) ──────────────────────

export type TemplateKey = 'confirmed' | 'pending' | 'rejected' | 'cancelled' | 'info_needed';

const TEMPLATE_LABELS: Record<TemplateKey, string> = {
  confirmed:  'Booking confirmed',
  pending:    'Awaiting confirmation',
  rejected:   'Booking not accepted',
  cancelled:  'Booking cancelled',
  info_needed:'Additional info needed',
};

// Placeholder tokens: {courseName}, {date}, {time}, {playerName}
export const MESSAGE_TEMPLATES: Record<TemplateKey, Record<Locale, string>> = {
  confirmed: {
    en: 'Your booking at {courseName} on {date} at {time} is confirmed. Please arrive 15 minutes before your tee time. We look forward to seeing you.',
    th: 'การจองของคุณที่ {courseName} วันที่ {date} เวลา {time} ได้รับการยืนยันแล้ว กรุณาเดินทางมาถึงก่อนเวลาออกรอบ 15 นาที ยินดีต้อนรับ',
    ko: '{courseName}의 {date} {time} 예약이 확정되었습니다. 티오프 15분 전에 도착해 주세요. 만나 뵙기를 기대합니다.',
    ja: '{courseName} の {date} {time} のご予約が確定しました。スタート時間の15分前にお越しください。お待ちしております。',
    zh: '您在 {courseName} 于 {date} {time} 的预订已确认。请在开球时间前15分钟到达。期待您的光临。',
    es: 'Su reserva en {courseName} el {date} a las {time} ha sido confirmada. Por favor llegue 15 minutos antes de su hora de salida. Le esperamos.',
    fr: 'Votre réservation au {courseName} le {date} à {time} est confirmée. Veuillez arriver 15 minutes avant votre départ. Au plaisir de vous accueillir.',
    de: 'Ihre Reservierung bei {courseName} am {date} um {time} Uhr ist bestätigt. Bitte erscheinen Sie 15 Minuten vor Ihrem Abschlag. Wir freuen uns auf Sie.',
  },
  pending: {
    en: 'Thank you for your booking request at {courseName} on {date} at {time}. Your request is under review and we will notify you of the decision shortly.',
    th: 'ขอบคุณสำหรับคำขอจองที่ {courseName} วันที่ {date} เวลา {time} คำขอของคุณอยู่ระหว่างการพิจารณา เราจะแจ้งผลให้ทราบในเร็วๆ นี้',
    ko: '{courseName}의 {date} {time} 예약 요청에 감사드립니다. 검토 중이며 곧 결과를 알려드리겠습니다.',
    ja: '{courseName} の {date} {time} へのご予約リクエストをいただきありがとうございます。現在確認中です。近日中にご連絡いたします。',
    zh: '感谢您在 {courseName} 于 {date} {time} 的预订申请。您的申请正在审核中，我们将尽快通知您结果。',
    es: 'Gracias por su solicitud de reserva en {courseName} el {date} a las {time}. Está siendo revisada y le notificaremos pronto.',
    fr: "Merci pour votre demande de réservation au {courseName} le {date} à {time}. Elle est en cours d'examen et nous vous informerons prochainement.",
    de: 'Vielen Dank für Ihre Buchungsanfrage bei {courseName} am {date} um {time} Uhr. Ihre Anfrage wird geprüft und wir werden Sie in Kürze über die Entscheidung informieren.',
  },
  rejected: {
    en: 'We regret that your booking request at {courseName} on {date} at {time} could not be accommodated at this time. We invite you to try a different time slot or contact us for assistance.',
    th: 'เราขออภัยที่ไม่สามารถรองรับคำขอจองที่ {courseName} วันที่ {date} เวลา {time} ได้ในขณะนี้ ขอเชิญคุณลองเวลาอื่นหรือติดต่อเราเพื่อขอความช่วยเหลือ',
    ko: '{courseName}의 {date} {time} 예약 요청을 수용하지 못해 죄송합니다. 다른 시간대를 시도하시거나 저희에게 문의해 주세요.',
    ja: '{courseName} の {date} {time} のご予約リクエストにお応えすることができませんでした。別の時間帯をお試しいただくか、お気軽にお問い合わせください。',
    zh: '很遗憾，您在 {courseName} 于 {date} {time} 的预订申请目前无法受理。我们邀请您尝试其他时间段或联系我们寻求帮助。',
    es: 'Lamentamos no poder aceptar su solicitud de reserva en {courseName} el {date} a las {time}. Le invitamos a intentar otro horario o contactarnos.',
    fr: "Nous regrettons de ne pas avoir pu honorer votre demande de réservation au {courseName} le {date} à {time}. Nous vous invitons à essayer un autre créneau ou à nous contacter.",
    de: 'Wir bedauern, dass Ihre Buchungsanfrage bei {courseName} am {date} um {time} Uhr derzeit nicht berücksichtigt werden konnte. Bitte versuchen Sie es mit einem anderen Zeitfenster oder kontaktieren Sie uns.',
  },
  cancelled: {
    en: 'Your booking at {courseName} on {date} at {time} has been cancelled. Your seat has been released. For further assistance, please contact the golf course directly.',
    th: 'การจองของคุณที่ {courseName} วันที่ {date} เวลา {time} ถูกยกเลิกแล้ว ที่นั่งของคุณได้รับการปล่อยแล้ว หากต้องการความช่วยเหลือเพิ่มเติม กรุณาติดต่อสนามกอล์ฟโดยตรง',
    ko: '{courseName}의 {date} {time} 예약이 취소되었습니다. 자리가 해제되었습니다. 추가 도움이 필요하시면 골프장에 직접 문의해 주세요.',
    ja: '{courseName} の {date} {time} のご予約がキャンセルされました。お席は解放されました。詳細はコースに直接お問い合わせください。',
    zh: '您在 {courseName} 于 {date} {time} 的预订已取消，您的位置已被释放。如需进一步帮助，请直接联系球场。',
    es: 'Su reserva en {courseName} el {date} a las {time} ha sido cancelada. Su plaza ha sido liberada. Para más ayuda, contacte directamente al campo de golf.',
    fr: 'Votre réservation au {courseName} le {date} à {time} a été annulée. Votre place a été libérée. Pour toute aide supplémentaire, contactez directement le parcours.',
    de: 'Ihre Reservierung bei {courseName} am {date} um {time} Uhr wurde storniert. Ihr Platz wurde freigegeben. Für weitere Fragen wenden Sie sich bitte direkt an den Golfplatz.',
  },
  info_needed: {
    en: 'To complete your booking at {courseName} for {date} at {time}, we need some additional information. Please reply with your handicap index and a contact phone number at your earliest convenience.',
    th: 'เพื่อดำเนินการจองที่ {courseName} วันที่ {date} เวลา {time} ให้สมบูรณ์ เราต้องการข้อมูลเพิ่มเติม กรุณาตอบกลับพร้อมระบุ Handicap Index และเบอร์โทรศัพท์ของคุณ',
    ko: '{courseName}의 {date} {time} 예약을 완료하려면 추가 정보가 필요합니다. 핸디캡 인덱스와 연락처 전화번호를 최대한 빨리 회신해 주세요.',
    ja: '{courseName} の {date} {time} のご予約を完了するために、追加情報が必要です。ハンディキャップインデックスと連絡先電話番号を折り返しご返信ください。',
    zh: '为完成您在 {courseName} 于 {date} {time} 的预订，我们需要一些额外信息。请回复您的差点指数和联系电话，以便我们尽快处理。',
    es: 'Para completar su reserva en {courseName} el {date} a las {time}, necesitamos información adicional. Por favor responda con su índice de hándicap y un teléfono de contacto.',
    fr: "Pour finaliser votre réservation au {courseName} le {date} à {time}, nous avons besoin d'informations complémentaires. Veuillez répondre avec votre indice de handicap et un numéro de téléphone.",
    de: 'Um Ihre Buchung bei {courseName} für den {date} um {time} Uhr abzuschließen, benötigen wir einige zusätzliche Informationen. Bitte antworten Sie mit Ihrem Handicap-Index und einer Kontakttelefonnummer.',
  },
};

function fillTemplate(template: string, booking: BookingRowSlim): string {
  return template
    .replace(/{courseName}/g, booking.courseName)
    .replace(/{date}/g, booking.date)
    .replace(/{time}/g, booking.time)
    .replace(/{playerName}/g, booking.playerName);
}

const ACTIVE_STATUSES = new Set(['pending', 'confirmed']);

interface Props {
  booking: BookingRowSlim;
  onDismiss: () => void;
}

export default function BookingMessageComposer({ booking, onDismiss }: Props) {
  const [locale, setLocale] = useState<Locale>('en');
  const [templateKey, setTemplateKey] = useState<TemplateKey>('confirmed');
  const [sendState, setSendState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [sendError, setSendError] = useState('');
  const [copied, setCopied] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  const canSend = ACTIVE_STATUSES.has(booking.status);
  const draftText = fillTemplate(MESSAGE_TEMPLATES[templateKey][locale], booking);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(draftText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback: select text for manual copy
      const el = document.getElementById('c2b-message-preview');
      if (el) { window.getSelection()?.selectAllChildren(el); }
    }
  };

  const handleDownload = () => {
    const blob = new Blob([draftText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `booking-message-${booking.id.slice(0, 8)}-${locale}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 2500);
  };

  const handleSend = async () => {
    if (!canSend) return;
    setSendState('sending');
    setSendError('');
    try {
      const fn = httpsCallable(getFunctions(), 'sendBookingMessage');
      const res: any = await fn({ bookingId: booking.id, text: draftText });
      if (!res?.data?.success) throw new Error('The server did not confirm the message.');
      setSendState('sent');
    } catch (e: any) {
      setSendError(e?.message || 'Message could not be sent. Use Copy to share it through another channel.');
      setSendState('error');
    }
  };

  if (sendState === 'sent') {
    return (
      <div
        role="status"
        aria-live="polite"
        style={{
          padding: '16px', borderRadius: V2Theme.radiusMd,
          backgroundColor: `${V2Theme.successGreen}18`,
          border: `1px solid ${V2Theme.successGreen}44`,
          color: V2Theme.successGreen, fontSize: '14px', fontWeight: 600,
        }}
      >
        ✓ Message sent to the booking thread.
        <button
          onClick={() => { setSendState('idle'); }}
          style={{ marginLeft: '12px', background: 'none', border: 'none', color: V2Theme.gold, cursor: 'pointer', fontWeight: 700, fontSize: '13px' }}
        >
          Send another
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontFamily: V2Theme.fontFamily }}>

      {/* ── Locale selector ── */}
      <div>
        <label style={fieldLabel} htmlFor="c2b-locale-select">Language</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }} role="group" aria-label="Select message language">
          {LOCALES.map((l) => (
            <button
              key={l}
              onClick={() => setLocale(l)}
              aria-pressed={locale === l}
              style={{
                padding: '5px 11px',
                borderRadius: V2Theme.radiusPill,
                border: `1px solid ${locale === l ? V2Theme.gold : V2Theme.surfaceBorder}`,
                backgroundColor: locale === l ? `${V2Theme.gold}22` : 'transparent',
                color: locale === l ? V2Theme.gold : V2Theme.surfaceTextMuted,
                fontSize: '12px', fontWeight: 700,
                cursor: 'pointer',
                minHeight: '32px',
              }}
            >
              {LOCALE_LABELS[l]}
            </button>
          ))}
        </div>
      </div>

      {/* ── Template selector ── */}
      <div>
        <label style={fieldLabel} htmlFor="c2b-template-select">Template</label>
        <select
          id="c2b-template-select"
          value={templateKey}
          onChange={(e) => setTemplateKey(e.target.value as TemplateKey)}
          aria-label="Select message template"
          style={{
            width: '100%',
            padding: '9px 12px',
            backgroundColor: V2Theme.surfaceCard,
            border: `1px solid ${V2Theme.surfaceBorder}`,
            color: V2Theme.warmWhite,
            borderRadius: V2Theme.radiusMd,
            fontFamily: V2Theme.fontFamily,
            fontSize: '13px',
            boxSizing: 'border-box' as const,
          }}
        >
          {(Object.keys(TEMPLATE_LABELS) as TemplateKey[]).map((k) => (
            <option key={k} value={k}>{TEMPLATE_LABELS[k]}</option>
          ))}
        </select>
      </div>

      {/* ── Message preview ── */}
      <div>
        <p style={{ ...fieldLabel, marginBottom: '6px' }}>Preview</p>
        <div
          id="c2b-message-preview"
          dir="ltr"
          aria-label="Message preview"
          aria-readonly="true"
          tabIndex={0}
          style={{
            padding: '12px 14px',
            backgroundColor: V2Theme.surfacePanel,
            border: `1px solid ${V2Theme.surfaceBorder}`,
            borderRadius: V2Theme.radiusMd,
            fontSize: '14px',
            color: V2Theme.warmWhite,
            lineHeight: 1.65,
            minHeight: '80px',
            userSelect: 'text',
            fontFamily: V2Theme.fontFamily,
            textAlign: 'left',
          }}
        >
          {draftText}
        </div>
      </div>

      {/* ── Send availability notice ── */}
      {!canSend && (
        <div
          role="status"
          aria-live="polite"
          data-c2b-send-unavailable="true"
          style={{
            padding: '10px 14px',
            backgroundColor: `${V2Theme.surfaceMuted}18`,
            border: `1px solid ${V2Theme.surfaceBorder}`,
            borderRadius: V2Theme.radiusMd,
            fontSize: '12px',
            color: V2Theme.surfaceTextMuted,
            lineHeight: 1.5,
          }}
        >
          <strong style={{ color: V2Theme.warningAmber }}>Sending unavailable</strong>
          {' '}Direct send is only available for active bookings (pending or confirmed). This booking is <strong>{booking.status}</strong>. Use <strong>Copy</strong> or <strong>Export</strong> to share the message through another channel.
        </div>
      )}

      {/* ── Error notice with explicit retry ── */}
      {sendState === 'error' && (
        <div role="alert" style={{ padding: '10px 14px', backgroundColor: `${V2Theme.errorRed}18`, border: `1px solid ${V2Theme.errorRed}44`, borderRadius: V2Theme.radiusMd, fontSize: '12px', color: V2Theme.errorRed, display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span>⚠️ {sendError}</span>
          <button
            onClick={() => setSendState('idle')}
            aria-label="Try sending again"
            style={{ background: 'none', border: `1px solid ${V2Theme.errorRed}`, color: V2Theme.errorRed, borderRadius: V2Theme.radiusMd, padding: '3px 10px', cursor: 'pointer', fontWeight: 700, fontSize: '11px', whiteSpace: 'nowrap' }}
          >
            Try again
          </button>
        </div>
      )}

      {/* ── Actions ── */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          onClick={handleCopy}
          aria-label="Copy message to clipboard"
          style={actionButton(copied ? V2Theme.successGreen : V2Theme.surfaceText, false)}
        >
          {copied ? '✓ Copied' : '📋 Copy'}
        </button>

        <button
          onClick={handleDownload}
          aria-label="Export message as text file"
          style={actionButton(downloaded ? V2Theme.successGreen : V2Theme.surfaceText, false)}
        >
          {downloaded ? '✓ Downloaded' : '⬇ Export .txt'}
        </button>

        <button
          onClick={handleSend}
          disabled={!canSend || sendState === 'sending'}
          aria-label={canSend ? 'Send message via platform' : 'Sending unavailable for this booking status'}
          aria-disabled={!canSend}
          style={actionButton(V2Theme.gold, !canSend || sendState === 'sending')}
        >
          {sendState === 'sending' ? '…' : '✉️ Send via Platform'}
        </button>

        <button
          onClick={onDismiss}
          aria-label="Dismiss composer"
          style={{ ...actionButton(V2Theme.surfaceMuted, false), marginLeft: 'auto' }}
        >
          Dismiss
        </button>
      </div>

      {/* ── Third-party disclaimer ── */}
      <p
        data-c2b-disclaimer="true"
        style={{
          fontSize: '11px',
          color: V2Theme.surfaceMuted,
          lineHeight: 1.55,
          margin: 0,
          borderTop: `1px solid ${V2Theme.surfaceBorder}`,
          paddingTop: '10px',
        }}
      >
        Golfriend facilitates communication between golfers and golf courses.
        Golfriend does not sell tee times, process payments, or guarantee
        availability. All tee times are managed by the respective golf course.
      </p>
    </div>
  );
}

const fieldLabel: React.CSSProperties = {
  display: 'block',
  fontSize: '11px',
  fontWeight: 700,
  color: V2Theme.surfaceTextMuted,
  letterSpacing: '0.5px',
  textTransform: 'uppercase',
  marginBottom: '6px',
};

const actionButton = (color: string, disabled: boolean): React.CSSProperties => ({
  padding: '8px 16px',
  minHeight: '40px',
  borderRadius: V2Theme.radiusMd,
  border: `1px solid ${disabled ? V2Theme.surfaceBorder : color + '88'}`,
  backgroundColor: disabled ? 'transparent' : `${color}18`,
  color: disabled ? V2Theme.surfaceMuted : color,
  fontWeight: 700,
  fontSize: '12px',
  cursor: disabled ? 'not-allowed' : 'pointer',
  fontFamily: V2Theme.fontFamily,
  whiteSpace: 'nowrap' as const,
  opacity: disabled ? 0.6 : 1,
});
