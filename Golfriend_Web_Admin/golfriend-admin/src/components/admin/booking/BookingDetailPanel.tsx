import { useEffect, useRef, useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { V2Theme } from '../../../theme/v2Theme';
import { V2Badge } from '../../../theme/v2Primitives';
import BookingMessageComposer from './BookingMessageComposer';

export interface BookingRowSlim { id: string; courseName: string; courseId: string; date: string; time: string; playerName: string; playerUid: string; status: string; }
interface AuditEvent { id: string; action: string; byRole: string; at: string | null; immutable: boolean; }
interface Message { id: string; senderRole: string; text: string; locale: string; createdAt: string | null; deliveryStatus: string; }
interface Props { booking: BookingRowSlim; onClose: () => void; }
const format = (value: string | null) => value ? new Date(value).toLocaleString() : '—';

export default function BookingDetailPanel({ booking, onClose }: Props) {
  const [audit, setAudit] = useState<AuditEvent[]>([]), [messages, setMessages] = useState<Message[]>([]), [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading'), [showComposer, setShowComposer] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const load = async () => {
    setState('loading');
    try {
      const result: any = await httpsCallable(getFunctions(), 'getAdminBookingStreamV2')({ bookingId: booking.id });
      if (result?.data?.source !== 'server' || result?.data?.availability !== 'confirmed') throw new Error('STREAM_UNAVAILABLE');
      setAudit(Array.isArray(result.data.audits) ? result.data.audits : []); setMessages(Array.isArray(result.data.messages) ? result.data.messages : []); setState('ready');
    } catch { setAudit([]); setMessages([]); setState('unavailable'); }
  };
  useEffect(() => { void load(); }, [booking.id]);
  useEffect(() => { closeRef.current?.focus(); }, []);
  return <div role="dialog" aria-modal="true" aria-label={`Booking details ${booking.courseName}`} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} style={{ position: 'fixed', inset: 0, zIndex: 900, backgroundColor: 'rgba(0,0,0,.75)', display: 'flex', justifyContent: 'flex-end', fontFamily: V2Theme.fontFamily }}>
    <section style={{ width: '100%', maxWidth: '620px', overflowY: 'auto', backgroundColor: V2Theme.surfaceDark, borderLeft: `1px solid ${V2Theme.surfaceBorder}`, padding: '20px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', borderBottom: `1px solid ${V2Theme.surfaceBorder}`, paddingBottom: '14px' }}><div><h2 style={{ margin: 0, color: V2Theme.warmWhite }}>Booking Communications</h2><p style={{ color: V2Theme.surfaceTextMuted }}>{booking.courseName} · {booking.date} {booking.time}</p></div><button ref={closeRef} onClick={onClose} aria-label="Close booking communications" style={closeStyle}>×</button></header>
      <p style={{ color: V2Theme.surfaceTextMuted, fontSize: '12px' }}>Server-owned audit and message records only. Provider delivery and financial settlement are unavailable.</p>
      {state === 'loading' && <p role="status">Loading server-confirmed communications…</p>}
      {state === 'unavailable' && <p role="alert" style={{ color: V2Theme.errorRed }}>Communications are unavailable until the server confirms staff access. <button onClick={() => void load()}>Retry</button></p>}
      {state === 'ready' && <><section><h3 style={heading}>Booking</h3><p>{booking.playerName} · <V2Badge status={booking.status} /> · {booking.id}</p></section><section><h3 style={heading}>Audit trail</h3>{audit.length ? <ol>{audit.map((event) => <li key={event.id}><strong>{event.action}</strong> by {event.byRole} · {format(event.at)} {event.immutable ? '· immutable' : ''}</li>)}</ol> : <p>No server-recorded events yet.</p>}</section><section><h3 style={heading}>Messages</h3>{messages.length ? <ol>{messages.map((message) => <li key={message.id}><strong>{message.senderRole}</strong> [{message.locale}] · {message.text}<br /><small>{format(message.createdAt)} · delivery {message.deliveryStatus}</small></li>)}</ol> : <p>No server-recorded messages yet.</p>}</section><section><h3 style={heading}>Compose message</h3>{showComposer ? <BookingMessageComposer booking={booking} onDismiss={() => { setShowComposer(false); void load(); }} /> : <button onClick={() => setShowComposer(true)}>Open Message Composer</button>}</section></>}
    </section>
  </div>;
}

const heading: React.CSSProperties = { color: V2Theme.surfaceTextMuted, fontSize: '12px', letterSpacing: '1px', textTransform: 'uppercase', marginTop: '24px' };
const closeStyle: React.CSSProperties = { background: 'none', border: 0, color: V2Theme.warmWhite, cursor: 'pointer', fontSize: '26px', minWidth: '44px', minHeight: '44px' };
