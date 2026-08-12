// ==========================================
// FILE: src/components/admin/booking/BookingDetailPanel.tsx
// C2B — Booking communications panel for admin.
// READ-ONLY: streams audit history and message thread from Firestore.
// Opens BookingMessageComposer for drafting/sending/copying messages.
// No client writes; all sends go through the sendBookingMessage callable.
// ==========================================
import { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { db } from '../../../firebaseConfig';
import { V2Theme } from '../../../theme/v2Theme';
import { V2Badge } from '../../../theme/v2Primitives';
import BookingMessageComposer from './BookingMessageComposer';

export interface BookingRowSlim {
  id: string;
  courseName: string;
  courseId: string;
  date: string;
  time: string;
  playerName: string;
  playerUid: string;
  status: string;
}

interface AuditEvent {
  id: string;
  action: string;
  byRole: string;
  at: any;
}

interface Message {
  id: string;
  senderRole: string;
  text: string;
  createdAt: any;
}

function fmtTs(at: any): string {
  try {
    if (at?.toDate) return at.toDate().toLocaleString();
    if (at?.seconds) return new Date(at.seconds * 1000).toLocaleString();
  } catch { /* ignore */ }
  return '—';
}

interface Props {
  booking: BookingRowSlim;
  onClose: () => void;
}

export default function BookingDetailPanel({ booking, onClose }: Props) {
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [auditErr, setAuditErr] = useState(false);
  const [msgErr, setMsgErr] = useState(false);
  const [showComposer, setShowComposer] = useState(false);
  const threadEnd = useRef<HTMLDivElement>(null);

  // Stream audit history for this booking (newest-first, bounded 50).
  useEffect(() => {
    setAuditErr(false);
    const q = query(
      collection(db, 'booking_audit'),
      where('bookingId', '==', booking.id),
      orderBy('at', 'desc'),
    );
    const unsub = onSnapshot(q,
      (snap) => setAudit(snap.docs.slice(0, 50).map((d) => {
        const a = d.data() as any;
        return { id: d.id, action: a.action || 'unknown', byRole: a.byRole || '', at: a.at } as AuditEvent;
      })),
      () => setAuditErr(true),
    );
    return () => unsub();
  }, [booking.id]);

  // Stream message thread for this booking (oldest-first).
  useEffect(() => {
    setMsgErr(false);
    const q = query(
      collection(db, 'booking_messages'),
      where('bookingId', '==', booking.id),
      orderBy('createdAt', 'asc'),
    );
    const unsub = onSnapshot(q,
      (snap) => setMessages(snap.docs.map((d) => {
        const m = d.data() as any;
        return {
          id: d.id,
          senderRole: m.senderRole || 'unknown',
          text: m.text || '',
          createdAt: m.createdAt,
        } as Message;
      })),
      () => setMsgErr(true),
    );
    return () => unsub();
  }, [booking.id]);

  // Scroll thread to bottom when new messages arrive.
  useEffect(() => {
    threadEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Escape key closes the panel.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Booking details — ${booking.courseName} ${booking.date}`}
      style={{
        position: 'fixed', inset: 0, zIndex: 900,
        backgroundColor: 'rgba(0,0,0,0.75)',
        display: 'flex', justifyContent: 'flex-end',
        fontFamily: V2Theme.fontFamily,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Side panel — slides from right */}
      <div
        role="document"
        style={{
          width: '100%', maxWidth: '620px',
          backgroundColor: V2Theme.surfaceDark,
          borderLeft: `1px solid ${V2Theme.surfaceBorder}`,
          display: 'flex', flexDirection: 'column',
          overflowY: 'auto',
          maxHeight: '100vh',
        }}
      >
        {/* ── Header ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: `1px solid ${V2Theme.surfaceBorder}`,
          position: 'sticky', top: 0, backgroundColor: V2Theme.surfaceDark, zIndex: 1,
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: V2Theme.warmWhite }}>
              Booking Communications
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: V2Theme.surfaceTextMuted }}>
              {booking.courseName} · {booking.date} {booking.time}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close booking communications panel"
            style={{
              background: 'none', border: 'none', color: V2Theme.surfaceTextMuted,
              cursor: 'pointer', fontSize: '22px', lineHeight: 1,
              minWidth: '44px', minHeight: '44px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: V2Theme.radiusSm,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* ── Booking metadata ── */}
          <section aria-label="Booking details">
            <h3 style={sectionHeading}>Booking Details</h3>
            <div style={metaGrid}>
              <MetaRow label="Booking ID" value={<code style={{ fontFamily: V2Theme.fontMono, fontSize: '11px', color: V2Theme.surfaceText }}>{booking.id}</code>} />
              <MetaRow label="Player" value={booking.playerName} />
              <MetaRow label="Player UID" value={<code style={{ fontFamily: V2Theme.fontMono, fontSize: '11px', color: V2Theme.surfaceTextMuted }}>{booking.playerUid}</code>} />
              <MetaRow label="Course" value={booking.courseName} />
              <MetaRow label="Date" value={booking.date} />
              <MetaRow label="Time" value={<strong style={{ color: V2Theme.warmWhite }}>{booking.time}</strong>} />
              <MetaRow label="Status" value={<V2Badge status={booking.status} />} />
            </div>
          </section>

          {/* ── Disclaimer ── */}
          <aside
            aria-label="Third-party booking disclaimer"
            data-c2b-disclaimer="true"
            style={{
              padding: '12px 14px',
              backgroundColor: `${V2Theme.warningAmber}12`,
              border: `1px solid ${V2Theme.warningAmber}44`,
              borderRadius: V2Theme.radiusMd,
              fontSize: '12px',
              color: V2Theme.surfaceTextMuted,
              lineHeight: 1.6,
            }}
          >
            <strong style={{ color: V2Theme.warningAmber }}>ℹ️ Third-party notice</strong>
            {' '}Golfriend facilitates communication between golfers and golf courses.
            Golfriend does not sell tee times, process payments, or guarantee
            availability. All bookings are subject to the golf course's own terms
            and conditions.
          </aside>

          {/* ── Status history ── */}
          <section aria-label="Booking status history">
            <h3 style={sectionHeading}>Status History</h3>
            {auditErr ? (
              <p role="alert" style={{ color: V2Theme.errorRed, fontSize: '13px' }}>
                Could not load status history (staff access required).
              </p>
            ) : audit.length === 0 ? (
              <p style={{ color: V2Theme.surfaceMuted, fontSize: '13px' }} aria-live="polite">
                No recorded state changes yet.
              </p>
            ) : (
              <ol
                reversed
                aria-label="Status change timeline"
                style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '6px' }}
              >
                {audit.map((ev) => (
                  <li key={ev.id} style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '8px 12px',
                    backgroundColor: V2Theme.surfacePanel,
                    border: `1px solid ${V2Theme.surfaceBorder}`,
                    borderRadius: V2Theme.radiusMd,
                    fontSize: '12px',
                  }}>
                    <V2Badge status={ev.action} label={ev.action} />
                    <span style={{ color: V2Theme.surfaceTextMuted, flex: 1 }}>
                      by <strong style={{ color: V2Theme.surfaceText }}>{ev.byRole || '—'}</strong>
                    </span>
                    <span style={{ color: V2Theme.surfaceMuted, fontFamily: V2Theme.fontMono, fontSize: '11px', whiteSpace: 'nowrap' }}>
                      {fmtTs(ev.at)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {/* ── Message thread ── */}
          <section aria-label="Booking message thread">
            <h3 style={sectionHeading}>Messages</h3>
            {msgErr ? (
              <p role="alert" style={{ color: V2Theme.errorRed, fontSize: '13px' }}>
                Could not load messages (staff access required).
              </p>
            ) : messages.length === 0 ? (
              <p style={{ color: V2Theme.surfaceMuted, fontSize: '13px' }} aria-live="polite">
                No messages yet.
              </p>
            ) : (
              <div
                aria-label="Message thread"
                style={{
                  display: 'flex', flexDirection: 'column', gap: '8px',
                  maxHeight: '220px', overflowY: 'auto',
                  padding: '4px',
                  scrollbarWidth: 'thin',
                }}
              >
                {messages.map((m) => {
                  const isStaff = m.senderRole === 'staff';
                  return (
                    <div
                      key={m.id}
                      style={{
                        alignSelf: isStaff ? 'flex-end' : 'flex-start',
                        maxWidth: '80%',
                        backgroundColor: isStaff ? `${V2Theme.gold}20` : V2Theme.surfacePanel,
                        border: `1px solid ${isStaff ? V2Theme.gold + '44' : V2Theme.surfaceBorder}`,
                        borderRadius: V2Theme.radiusMd,
                        padding: '8px 12px',
                      }}
                    >
                      <div style={{ fontSize: '10px', color: V2Theme.surfaceTextMuted, marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {m.senderRole}
                      </div>
                      <div style={{ fontSize: '13px', color: V2Theme.warmWhite, lineHeight: 1.5 }}>{m.text}</div>
                    </div>
                  );
                })}
                <div ref={threadEnd} />
              </div>
            )}
          </section>

          {/* ── Message Composer ── */}
          <section aria-label="Draft and send message">
            <h3 style={sectionHeading}>Compose Message</h3>
            {showComposer ? (
              <BookingMessageComposer
                booking={booking}
                onDismiss={() => setShowComposer(false)}
              />
            ) : (
              <button
                onClick={() => setShowComposer(true)}
                aria-label="Open message composer"
                style={{
                  padding: '10px 20px',
                  minHeight: '44px',
                  backgroundColor: V2Theme.fairway,
                  color: V2Theme.warmWhite,
                  border: 'none',
                  borderRadius: V2Theme.radiusMd,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: V2Theme.fontFamily,
                  fontSize: '14px',
                }}
              >
                ✉️ Open Message Composer
              </button>
            )}
          </section>

        </div>
      </div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: '12px', padding: '6px 0', borderBottom: `1px solid ${V2Theme.surfaceBorder}44` }}>
      <span style={{ width: '90px', flexShrink: 0, fontSize: '12px', color: V2Theme.surfaceTextMuted, fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: '13px', color: V2Theme.surfaceText }}>{value}</span>
    </div>
  );
}

const sectionHeading: React.CSSProperties = {
  margin: '0 0 10px 0',
  fontSize: '12px',
  fontWeight: 900,
  letterSpacing: '1px',
  textTransform: 'uppercase',
  color: V2Theme.surfaceMuted,
};

const metaGrid: React.CSSProperties = {
  backgroundColor: V2Theme.surfacePanel,
  border: `1px solid ${V2Theme.surfaceBorder}`,
  borderRadius: V2Theme.radiusMd,
  padding: '8px 12px',
};
