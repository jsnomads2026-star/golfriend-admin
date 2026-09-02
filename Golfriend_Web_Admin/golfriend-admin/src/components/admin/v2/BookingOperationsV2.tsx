import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../firebaseConfig';

type BookingRow = {
  bookingId: string;
  lifecycleState: string;
  linkedRound: { roundId: string | null; lifecycleState: string | null; source: string };
  submission: { commandId: string | null; submittedAt: unknown; submissionSnapshotRef: string | null; memberDisplayName: string };
  projectionVersion: number | null;
  schedule: { courseId: string | null; slotId: string | null; date: string | null; time: string | null; timeZone: string | null };
  partnerResponse: { state: string | null; alternativeOffer: AlternativeOffer | null; partnerMessage: string | null; respondedAt: unknown; respondedByUid: string | null; cancelledAt: unknown; cancelledByUid: string | null };
  playerChangeEvents: Transition[];
  transitions: Transition[];
  correctionHistory: Array<{ correctionRequestId: string; reason: string | null; actorUid: string | null; actorRole: string | null; createdAt: unknown; immutable: boolean }>;
};

type AlternativeOffer = { transitionId?: string | null; slotId?: string | null; courseId?: string | null; proposedTime?: { date?: string | null; time?: string | null; timeZone?: string | null } | null; capacity?: number | null; partnerMessage?: string | null };
type Transition = { transitionId: string | null; bookingId: string; roundId: string | null; actor: string | null; actorRole: string | null; timestamp: unknown; submissionSnapshotRef: string | null; projectionVersion: number | null; kind: string; status: string | null; partnerMessage: string | null; alternativeOffer: AlternativeOffer | null; partnerVisible: boolean };

const STATUS_OPTIONS = ['', 'pending', 'alternative_proposed', 'awaiting_partner', 'confirmed', 'completed', 'declined', 'cancelled', 'expired', 'player_withdrawn'];
const commandId = () => `admin_${crypto.randomUUID().replaceAll('-', '_')}`;
const value = (input: unknown) => {
  if (!input) return 'Not recorded';
  if (typeof input === 'string') return input;
  if (typeof input === 'object' && input && 'toDate' in input && typeof (input as any).toDate === 'function') return (input as any).toDate().toLocaleString();
  return String(input);
};
const offerValue = (offer: AlternativeOffer | null) => {
  if (!offer) return 'None';
  const when = offer.proposedTime ? `${offer.proposedTime.date || 'No date'} ${offer.proposedTime.time || ''} ${offer.proposedTime.timeZone || ''}`.trim() : 'Time not recorded';
  return `transition ${offer.transitionId || 'Not recorded'} · course ${offer.courseId || 'Not recorded'} · ${when} · capacity ${offer.capacity ?? 'Not recorded'}`;
};

export default function BookingOperationsV2() {
  const [rows, setRows] = useState<BookingRow[]>([]);
  const [courseId, setCourseId] = useState('');
  const [status, setStatus] = useState('');
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [notice, setNotice] = useState('');
  const [reasonByBooking, setReasonByBooking] = useState<Record<string, string>>({});
  const [busyBookingId, setBusyBookingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    setNotice('');
    try {
      const callable = httpsCallable(functions, 'getAdminBookingOperationsV2');
      const response = await callable({ filters: { courseId, status } });
      const data = response.data as { schema?: string; rows?: BookingRow[] };
      if (data.schema !== 'golfriend.booking-operations-admin.v2' || !Array.isArray(data.rows)) throw new Error('Unexpected booking operations response.');
      setRows(data.rows);
      setState('ready');
    } catch {
      setState('error');
    }
  }, [courseId, status]);

  useEffect(() => { void load(); }, [load]);

  const submitFilters = (event: FormEvent) => { event.preventDefault(); void load(); };
  const requestCorrection = async (bookingId: string) => {
    const reason = (reasonByBooking[bookingId] || '').trim();
    if (reason.length < 8) { setNotice('A correction request needs a reason of at least 8 characters. No booking was changed.'); return; }
    setBusyBookingId(bookingId);
    try {
      const callable = httpsCallable(functions, 'requestBookingCorrectionV2');
      const response = await callable({ bookingId, reason, commandId: commandId() });
      const result = response.data as { correctionRequestId?: string; effect?: string };
      setNotice(`Correction request ${result.correctionRequestId || 'recorded'} is immutable. ${result.effect || 'No booking lifecycle mutation.'}`);
      setReasonByBooking((current) => ({ ...current, [bookingId]: '' }));
      await load();
    } catch {
      setNotice('Correction request was not accepted. No booking was changed.');
    } finally {
      setBusyBookingId(null);
    }
  };

  return <section aria-labelledby="booking-operations-title" style={{ padding: 24 }}>
    <h1 id="booking-operations-title">Booking Operations</h1>
    <p>Read-only investigation and audited correction requests. Only an authorised partner or course action can confirm a booking. Booking confirmation never opens Play Golf.</p>
    <form onSubmit={submitFilters}>
      <label>Course ID <input value={courseId} onChange={(event) => setCourseId(event.target.value)} /></label>{' '}
      <label>Status <select value={status} onChange={(event) => setStatus(event.target.value)}>{STATUS_OPTIONS.map((item) => <option key={item} value={item}>{item || 'All states'}</option>)}</select></label>{' '}
      <button type="submit">Apply filters</button>
    </form>
    {state === 'loading' && <p role="status">Loading authoritative booking operations…</p>}
    {state === 'error' && <p role="alert">Booking Operations is unavailable. No booking data was changed.</p>}
    {notice && <p role="status">{notice}</p>}
    {state === 'ready' && rows.length === 0 && <p role="status">No authoritative booking records match these filters.</p>}
    {rows.map((row) => <article key={row.bookingId} style={{ border: '1px solid #777', padding: 16, marginTop: 16 }}>
      <h2>{row.bookingId}</h2>
      <p><strong>Booking lifecycle:</strong> {row.lifecycleState} · <strong>Course:</strong> {row.schedule.courseId || 'Not recorded'} · <strong>Slot:</strong> {row.schedule.slotId || 'Not recorded'} · {row.schedule.date || 'No date'} {row.schedule.time || ''} {row.schedule.timeZone || ''}</p>
      <p><strong>Linked round lifecycle:</strong> {row.linkedRound.roundId ? `${row.linkedRound.roundId} · ${row.linkedRound.lifecycleState || 'State not recorded'}` : 'No linked round record was returned for this booking.'}</p>
      <p><strong>Submission snapshot:</strong> {row.submission.memberDisplayName} · command {row.submission.commandId || 'Not recorded'} · ref {row.submission.submissionSnapshotRef || 'Not recorded'} · submitted {value(row.submission.submittedAt)} · <strong>Projection version:</strong> {row.projectionVersion ?? 'Not recorded'}</p>
      <p><strong>Partner response:</strong> {row.partnerResponse.state || 'Not recorded'} · alternative offer {offerValue(row.partnerResponse.alternativeOffer)} · partner message {row.partnerResponse.partnerMessage || 'None'} · responded {value(row.partnerResponse.respondedAt)} by {row.partnerResponse.respondedByUid || 'Actor not recorded'} · cancelled {value(row.partnerResponse.cancelledAt)} by {row.partnerResponse.cancelledByUid || 'Actor not recorded'}</p>
      <details><summary>Lifecycle transitions and player-change events</summary>
        {row.transitions.length === 0 ? <p>No immutable transition receipts were returned.</p> : <ul>{row.transitions.map((event, index) => <li key={event.transitionId || `${event.kind}-${index}`}><strong>{event.kind}</strong> → {event.status || 'State not recorded'} · transition {event.transitionId || 'Not recorded'} · booking {event.bookingId} · round {event.roundId || 'No linked round recorded'} · {value(event.timestamp)} · actor {event.actor || 'Not recorded'} ({event.actorRole || 'Role not recorded'}) · submission {event.submissionSnapshotRef || 'Not recorded'} · projection {event.projectionVersion ?? 'Not recorded'} · alternative {offerValue(event.alternativeOffer)} · partner message {event.partnerMessage || 'None'}</li>)}</ul>}
        <p><strong>Explicit partner-visible player-change events:</strong> {row.playerChangeEvents.length ? row.playerChangeEvents.map((event) => `${event.kind} (${value(event.timestamp)})`).join(', ') : 'None recorded.'}</p>
      </details>
      <details><summary>Immutable correction and audit history</summary>
        {row.correctionHistory.length === 0 ? <p>No correction requests recorded.</p> : <ul>{row.correctionHistory.map((item) => <li key={item.correctionRequestId}>{item.correctionRequestId} · {item.reason || 'No reason recorded'} · {value(item.createdAt)} · {item.actorRole || 'Actor role not recorded'} · {item.actorUid || 'Actor UID not recorded'} · {item.immutable ? 'immutable' : 'integrity state unavailable'}</li>)}</ul>}
      </details>
      <div style={{ marginTop: 12 }}>
        <button disabled title="Force Confirm is unavailable: only the authorised partner or course action may confirm a booking.">Force Confirm</button>
        <label style={{ display: 'block', marginTop: 8 }}>Correction reason <textarea value={reasonByBooking[row.bookingId] || ''} onChange={(event) => setReasonByBooking((current) => ({ ...current, [row.bookingId]: event.target.value }))} minLength={8} maxLength={1000} /></label>
        <button type="button" disabled={busyBookingId === row.bookingId} onClick={() => void requestCorrection(row.bookingId)}>Submit correction request</button>
      </div>
    </article>)}
  </section>;
}
