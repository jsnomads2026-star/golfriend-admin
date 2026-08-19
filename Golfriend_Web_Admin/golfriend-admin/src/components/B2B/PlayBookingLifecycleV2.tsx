import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type React from 'react';
import {getFunctions, httpsCallable} from 'firebase/functions';
import {useT} from '../../i18n/hooks.ts';
import {isCanonicalLocale, type CanonicalLocale} from '../../i18n/locales.ts';
import {PLAY_BOOKING_DESK, type PlayBookingDeskKey} from '../../i18n/partner/playBookingDesk.ts';
import {
  parsePlayBookingDeskResponse,
  classifyPlayBookingDeskError,
  parseBookingDeskActionResult,
  type PlayBookingDeskItem,
  type PlayBookingDeskProjection,
  type PlayBookingDeskStatus,
} from './bookingDeskProjection.mjs';
import {createPlayBookingOperationJournal} from './playBookingOperationJournal.mjs';
import {
  approvePlayBookingMessageDraft,
  createPlayBookingMessageDraft,
  playBookingMessageApprovalDigest,
  type PlayBookingMessageDraft,
  type PlayBookingMessageDraftType,
} from './playBookingMessageDraft.mjs';
import './PlayBookingDesk.css';

type Action = 'confirm' | 'alternative' | 'cancel';
type BookingLocale = CanonicalLocale;
type Booking = PlayBookingDeskItem;
type Ready = Extract<PlayBookingDeskProjection, { state: 'ready' }>;
type Raw = Record<string, any>;
type Manage = {
  bookingId: string;
  action: Action;
  expectedVersion: number;
  commandId: string;
  confirmationToken: string;
  alternativeSlotId?: string;
  message?: string;
};
type RecoveryOutcome = 'failed_no_effect' | 'released_without_execution' | 'completed_verified_receipt' | 'external_review';

export interface PlayBookingDeskService {
  load(): Promise<unknown>;
  preview(input: Omit<Manage, 'commandId' | 'confirmationToken'>): Promise<Raw>;
  manage(input: Manage): Promise<Raw>;
  operation(input: {bookingId: string; operationId: string}): Promise<Raw>;
  reconcile(input: Raw): Promise<Raw>;
}

const call = async (name: string, data: Raw = {}) => (await httpsCallable(getFunctions(), name)(data)).data as Raw;

export const productionPlayBookingDeskService: PlayBookingDeskService = Object.freeze({
  load: () => call('getPlayBookingsPortalV2'),
  preview: (input: Omit<Manage, 'commandId' | 'confirmationToken'>) => call('previewPlayBookingActionV2', input),
  manage: (input: Manage) => call('managePlayBookingV2', input),
  operation: (input: {bookingId: string; operationId: string}) => call('getPlayBookingOperationV2', input),
  reconcile: (input: Raw) => call('reconcilePlayBookingOperationV2', input),
});

const journal = createPlayBookingOperationJournal({storage: localStorage});
const states: Record<Action, readonly PlayBookingDeskStatus[]> = {
  confirm: ['pending', 'changed'],
  alternative: ['pending'],
  cancel: ['pending', 'changed', 'confirmed'],
};

const statusKey: Record<PlayBookingDeskStatus, PlayBookingDeskKey> = {
  pending: 'statusPending',
  confirmed: 'statusConfirmed',
  rejected: 'statusRejected',
  changed: 'statusChanged',
  cancelled: 'statusCancelled',
  expired: 'statusExpired',
};

const opPattern = /^pbo_[a-f0-9]{40}$/;
const sha = /^[a-f0-9]{64}$/;

const allowed = (projection: Ready, booking: Booking, action: Action) =>
  projection.permissions[action] && states[action].includes(booking.status);

const locale = (): BookingLocale => {
  const candidate = localStorage.getItem('golfriend.locale');
  return isCanonicalLocale(candidate) ? candidate : 'en';
};

const errorOperationId = (error: unknown): string => {
  if (!error || typeof error !== 'object') return '';
  const details = (error as { details?: unknown }).details;
  if (!details || typeof details !== 'object') return '';
  const value = (details as { operationId?: unknown }).operationId;
  return typeof value === 'string' && opPattern.test(value) ? value : '';
};

const draftTypeLabel = (t: (key: PlayBookingDeskKey) => string, type: PlayBookingMessageDraftType): string =>
  t(
    type === 'request_received'
      ? 'draftRequestReceived'
      : type === 'information_needed'
        ? 'draftInformationNeeded'
        : type === 'alternative_proposed'
          ? 'draftAlternativeProposed'
          : type === 'confirmed'
            ? 'draftConfirmed'
            : type === 'declined'
              ? 'draftDeclined'
              : type === 'cancellation_received'
                ? 'draftCancellationReceived'
                : type === 'cancellation_accepted'
                  ? 'draftCancellationAccepted'
                  : type === 'cancellation_declined'
                    ? 'draftCancellationDeclined'
                    : 'draftManualSupportRequired',
  );

const outcomeLabel = (t: (key: PlayBookingDeskKey) => string, outcome: RecoveryOutcome): string =>
  t(
    outcome === 'failed_no_effect'
      ? 'recoveryOutcomeFailedNoEffect'
      : outcome === 'released_without_execution'
        ? 'recoveryOutcomeReleasedWithoutExecution'
        : outcome === 'completed_verified_receipt'
          ? 'recoveryOutcomeCompletedVerifiedReceipt'
          : 'recoveryOutcomeExternalReview',
  );

const draftTypes = ['request_received', 'information_needed', 'alternative_proposed', 'confirmed', 'declined', 'cancellation_received', 'cancellation_accepted', 'cancellation_declined', 'manual_support_required'] as const;
const recoveryOutcomes = ['failed_no_effect', 'released_without_execution', 'completed_verified_receipt', 'external_review'] as const;

export default function PlayBookingLifecycleV2({
  admin = false,
  service = productionPlayBookingDeskService,
}: {
  admin?: boolean;
  service?: PlayBookingDeskService;
}) {
  const t = useT(PLAY_BOOKING_DESK) as (k: PlayBookingDeskKey) => string;
  const dialog = useRef<HTMLElement | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [projection, setProjection] = useState<PlayBookingDeskProjection | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState('');
  const [pending, setPending] = useState<{ action: Action; booking: Booking } | null>(null);
  const [ack, setAck] = useState(false);
  const [slot, setSlot] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [operationRef, setOperationRef] = useState('');
  const [operation, setOperation] = useState<Raw | null>(null);
  const [reason, setReason] = useState('');
  const [outcome, setOutcome] = useState<RecoveryOutcome>('failed_no_effect');
  const [evidence, setEvidence] = useState('');
  const [reconcileAck, setReconcileAck] = useState(false);
  const [draftType, setDraftType] = useState<PlayBookingMessageDraftType>('request_received');
  const [draftText, setDraftText] = useState('');
  const [draft, setDraft] = useState<PlayBookingMessageDraft | null>(null);

  const ready = projection?.state === 'ready' ? (projection as Ready) : null;
  const selected = ready?.bookings.find((x) => x.bookingId === selectedId) || null;
  const reconciler = !!ready && ['organization_owner', 'organization_admin'].includes(ready.role);

  const load = useCallback(async () => {
    if (admin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const next = parsePlayBookingDeskResponse(await service.load());
      setProjection(next);
      if (next.state === 'ready') {
        await journal.activateScope('membershipId' in next ? next.membershipId : next.role);
        journal.recover();
        setSelectedId((id) => (next.bookings.some((x) => x.bookingId === id) ? id : next.bookings[0]?.bookingId || ''));
      } else {
        setNotice(t(next.state === 'delegated_scope_unavailable' ? 'delegatedScopeUnavailable' : 'invalidDataError'));
      }
    } catch (error) {
      setNotice(t(classifyPlayBookingDeskError(error) === 'stale' ? 'staleError' : 'loadError'));
    } finally {
      setLoading(false);
    }
  }, [admin, service, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (pending) {
      dialog.current?.querySelector<HTMLElement>('input,textarea,button')?.focus();
    }
  }, [pending]);

  const queue = useMemo(
    () => [...(ready?.bookings || [])].sort((a, b) => a.teeTime.date.localeCompare(b.teeTime.date)),
    [ready],
  );

  const close = () => {
    setPending(null);
    setAck(false);
    setTimeout(() => returnFocus.current?.focus(), 0);
  };

  const keys = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Escape' && !busy) close();
    if (e.key !== 'Tab' || !dialog.current) return;
    const controls = [...dialog.current.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled)')];
    if (e.shiftKey && document.activeElement === controls[0]) {
      e.preventDefault();
      controls.at(-1)?.focus();
    } else if (!e.shiftKey && document.activeElement === controls.at(-1)) {
      e.preventDefault();
      controls[0]?.focus();
    }
  };

  const begin = (action: Action, target: HTMLElement) => {
    if (ready && selected && allowed(ready, selected, action)) {
      returnFocus.current = target;
      setPending({action, booking: selected});
      setAck(false);
      setNotice('');
    }
  };

  const execute = async () => {
    if (!pending || !ack || busy) return;
    const payload: Manage = {
      bookingId: pending.booking.bookingId,
      action: pending.action,
      expectedVersion: pending.booking.version,
      ...(pending.action === 'alternative' ? {alternativeSlotId: slot.trim(), message: message.trim()} : {}),
    } as Manage;
    if (pending.action === 'alternative' && (!slot.trim() || !message.trim())) return;
    setBusy(true);
    let commandId = '';
    try {
      const preview = await service.preview(payload);
      if (
        preview.bookingId !== payload.bookingId ||
        preview.action !== payload.action ||
        preview.revision !== payload.expectedVersion ||
        !String(preview.confirmationToken).startsWith('pbc_') ||
        !sha.test(String(preview.payloadDigest)) ||
        Date.parse(preview.expiresAt) <= Date.now()
      )
        throw Error('PREVIEW_INVALID');
      const prep = await journal.prepare({
        bookingId: payload.bookingId,
        action: payload.action,
        revision: payload.expectedVersion,
        payload: {action: payload.action, revision: payload.expectedVersion, slot: slot || null},
        ...(payload.action === 'confirm'
          ? {}
          : {confirmation: {slot: preview.payloadDigest, expiresAt: Date.parse(preview.expiresAt)}}),
      });
      if (!('commandId' in prep) || prep.state === 'ambiguous') throw Error('AMBIGUOUS');
      commandId = prep.commandId;
      journal.markInFlight(commandId);
      const raw = await service.manage({...payload, commandId, confirmationToken: preview.confirmationToken});
      const result = parseBookingDeskActionResult(raw, {
        bookingId: payload.bookingId,
        action: payload.action,
        commandId,
        currentVersion: pending.booking.version,
        currentStatus: pending.booking.status,
      });
      if (result.state !== 'verified') throw Error('UNVERIFIED');
      journal.markCompleted(commandId);
      setNotice(`${t('actionSucceeded')} · ${result.receiptId}`);
      close();
      await load();
    } catch (error) {
      if (commandId) journal.markAmbiguous(commandId);
      const op = errorOperationId(error);
      if (op) {
        setOperationRef(op);
        setOperation({operationId: op, state: 'ambiguous'});
      }
      setNotice(t(commandId ? 'operationAmbiguous' : 'operationError'));
    } finally {
      setBusy(false);
    }
  };

  const lookup = async () => {
    if (!selected || !opPattern.test(operationRef)) return;
    setBusy(true);
    try {
      const value = await service.operation({bookingId: selected.bookingId, operationId: operationRef});
      setOperation(value);
      setNotice(
        t(value.state === 'pending' ? 'operationPending' : value.state === 'ambiguous' ? 'operationAmbiguous' : 'recoveryStableReference'),
      );
    } catch {
      setNotice(t('operationError'));
    } finally {
      setBusy(false);
    }
  };

  const reconcile = async () => {
    if (!selected || !operation?.mayReconcile || !reconciler || !reconcileAck || reason.trim().length < 8) return;
    const digest = sha.test(evidence) ? evidence : '';
    const proof =
      outcome === 'failed_no_effect'
        ? {noEffect: true, evidenceDigest: digest}
        : outcome === 'released_without_execution'
          ? {releaseReceiptId: evidence, noExecution: true}
          : outcome === 'completed_verified_receipt'
            ? {receiptId: evidence, evidenceDigest: digest}
            : {externalReviewId: evidence, evidenceDigest: digest};
    if (outcome !== 'released_without_execution' && !digest) return;

    setBusy(true);
    try {
      await service.reconcile({
        bookingId: selected.bookingId,
        operationId: operation.operationId,
        commandId: crypto.randomUUID().replaceAll('-', '_'),
        reason: reason.trim(),
        reconciliationToken: operation.reconciliationToken,
        outcome,
        evidence: proof,
      });
      setNotice(t('actionSucceeded'));
      setOperation(null);
      await load();
    } catch {
      setNotice(t('operationError'));
    } finally {
      setBusy(false);
    }
  };

  const makeDraft = () => {
    if (!selected || !draftText.trim()) return;
    setDraft(
      createPlayBookingMessageDraft({
        type: draftType,
        bookingId: selected.bookingId,
        recipientRef: selected.bookingId,
        locale: locale(),
        revision: selected.version,
        status: selected.status,
        slot: {
          slotId: selected.slotId,
          courseRef: selected.courseId,
          date: selected.teeTime.date,
          time: selected.teeTime.time,
          timeZone: selected.teeTime.timeZone,
        },
        message: draftText.trim(),
      }),
    );
    setNotice(t('messageDraftOnly'));
  };

  const approve = () => {
    if (draft) {
      setDraft(approvePlayBookingMessageDraft(draft, playBookingMessageApprovalDigest(draft)));
      setNotice(t('messageAwaitingTransmitter'));
    }
  };

  const operationState = operation
    ? operation.state === 'pending'
      ? t('operationPending')
      : operation.state === 'ambiguous'
        ? t('operationAmbiguous')
        : t('recoveryStableReference')
    : '';

  if (admin) {
    return (
      <section className="booking-desk-state">
        <h2>{t('title')}</h2>
        <p role="status">{t('noChange')}</p>
      </section>
    );
  }
  if (loading) return <p role="status" aria-live="polite">{t('loading')}</p>;
  if (!ready) {
    return (
      <section className="booking-desk-state">
        <p role="alert">{notice || t('loadError')}</p>
        <button onClick={() => void load()}>{t('retry')}</button>
      </section>
    );
  }

  return (
    <section className="booking-desk" aria-labelledby="desk-title">
      <header className="booking-desk__header">
        <div>
          <span>{t('sectionLabel')}</span>
          <h2 id="desk-title">{t('title')}</h2>
          <p>{t('providerBoundary')} {t('privacyBoundary')}</p>
        </div>
        <button disabled={busy || !!pending} onClick={() => void load()}>{t('reload')}</button>
      </header>
      <dl className="booking-desk__scope">
        <div>
          <dt>{t('projectionVersionLabel')}</dt>
          <dd>{'projectionVersion' in ready ? ready.projectionVersion : ready.schema}</dd>
        </div>
        {'generatedAt' in ready && (
          <>
            <div>
              <dt>{t('projectionGeneratedAtLabel')}</dt>
              <dd>{ready.generatedAt}</dd>
            </div>
            <div>
              <dt>{t('projectionExpiresAtLabel')}</dt>
              <dd>{ready.expiresAt}</dd>
            </div>
            <div>
              <dt>{t('courseLabel')}</dt>
              <dd>{ready.delegatedCourseIds.join(', ')}</dd>
            </div>
          </>
        )}
      </dl>

      {notice && <p className="booking-desk__notice" role="status" aria-live="polite">{notice}</p>}

      <div className="booking-desk__layout">
        <nav className="booking-desk__queue" aria-label={t('queueTitle')}>
          <h3>{t('queueTitle')}</h3>
          <ul>
            {queue.length === 0 ? (
              <li>{t('empty')}</li>
            ) : (
              queue.map((b) => (
                <li key={b.bookingId}>
                  <button
                    disabled={!!pending}
                    aria-current={b.bookingId === selectedId ? 'true' : undefined}
                    onClick={() => setSelectedId(b.bookingId)}
                  >
                    <strong>{b.memberDisplayName}</strong>
                    <span>{b.course.name || b.courseId} · {b.teeTime.date} {b.teeTime.time}</span>
                    <i data-status={b.status}>{t(statusKey[b.status])}</i>
                  </button>
                </li>
              ))
            )}
          </ul>
        </nav>

        <article className="booking-desk__detail" aria-live="polite">
          {selected && (
            <>
              <div className="booking-desk__detail-heading">
                <h3>{selected.bookingId}</h3>
                <i data-status={selected.status}>{t(statusKey[selected.status])}</i>
              </div>
              <dl>
                {[
                  [t('memberLabel'), selected.memberDisplayName],
                  [t('courseLabel'), selected.course.name || selected.courseId],
                  [t('timeLabel'), `${selected.teeTime.date} ${selected.teeTime.time} ${selected.teeTime.timeZone}`],
                  [t('providerLabel'), selected.provider?.displayName || t('unavailableValue')],
                  [t('termsLabel'), selected.terms || t('unavailableValue')],
                  [t('versionLabel'), selected.version],
                  [t('contactLabel'), t('unavailableValue')],
                  [t('referenceLabel'), selected.reference || t('unavailableValue')],
                ].map(([k, v]) => (
                  <div key={String(k)}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="booking-desk__actions">
                {(['confirm', 'alternative', 'cancel'] as Action[]).map(
                  (a) => allowed(ready, selected, a) && (
                    <button key={a} disabled={busy || !!pending} onClick={(e) => begin(a, e.currentTarget)}>
                      {t(a === 'alternative' ? 'proposeAlternative' : a)}
                    </button>
                  ),
                )}
              </div>

              {pending && (
                <section
                  ref={dialog}
                  tabIndex={-1}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="preview-title"
                  onKeyDown={keys}
                  className="booking-desk__confirmation"
                >
                  <h4 id="preview-title">{t('previewConfirmationTitle')}</h4>
                  <p>{t('previewConfirmationBody')}</p>
                  <p>{pending.booking.bookingId} · v{pending.booking.version} · {t(pending.action === 'alternative' ? 'proposeAlternative' : pending.action)}</p>
                  <p>{pending.booking.course.name || pending.booking.courseId} · {pending.booking.teeTime.date} {pending.booking.teeTime.time}</p>
                  {pending.action === 'alternative' && (
                    <>
                      <label>{t('alternativeSlotLabel')}<input value={slot} onChange={(e) => setSlot(e.target.value)} /></label>
                      <label>{t('alternativeMessageLabel')}<textarea value={message} onChange={(e) => setMessage(e.target.value)} /></label>
                    </>
                  )}
                  <label className="booking-desk__ack">
                    <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                    {t('authorizedAcknowledgement')}
                  </label>
                  <div>
                    <button disabled={!ack || busy} onClick={() => void execute()}>{t('submit')}</button>
                    <button
                      aria-label={t('dialogCloseLabel')}
                      disabled={busy}
                      onClick={close}
                    >
                      {t('close')}
                    </button>
                  </div>
                </section>
              )}

              <section className="booking-desk__message">
                <h4>{t('messageTitle')}</h4>
                <p>{t('messagePrivacyBoundary')} {t('messageDraftOnly')}</p>
                <select
                  aria-label={t('messageTitle')}
                  value={draftType}
                  onChange={(e) => {
                    setDraftType(e.target.value as PlayBookingMessageDraftType);
                    setDraft(null);
                  }}
                >
                  {draftTypes.map((x) => <option key={x} value={x}>{draftTypeLabel(t, x)}</option>)}
                </select>
                <textarea aria-label={t('messageLabel')} value={draftText} onChange={(e) => {
                  setDraftText(e.target.value);
                  setDraft(null);
                }} />
                <button disabled={!draftText.trim()} onClick={makeDraft}>{t('submit')}</button>
                {draft && (
                  <div className="booking-desk__draft">
                    <strong>{draftTypeLabel(t, draft.type)}</strong>
                    <p>{draft.message}</p>
                    <code>{draft.approval.digest}</code>
                    <p>{t(draft.approval.approved ? 'messageAwaitingTransmitter' : 'messageDraftOnly')}</p>
                    {!draft.approval.approved && <button onClick={approve}>{t('authorizedAcknowledgement')}</button>}
                  </div>
                )}
              </section>

              <section className="booking-desk__recovery">
                <h4>{t('recoveryTitle')}</h4>
                <p>{t('retrySameCommand')}</p>
                <label>{t('referenceLabel')}<input value={operationRef} onChange={(e) => setOperationRef(e.target.value)} /></label>
                <button disabled={!opPattern.test(operationRef) || busy} onClick={() => void lookup()}>{t('reload')}</button>
                {operation && (
                  <>
                    <p>{operation.operationId} · {operationState}</p>
                    {operation.state === 'ambiguous' && <p>{t('manualReconciliationRequired')}</p>}
                    {operation.mayReconcile && reconciler && (
                      <div className="booking-desk__reconcile">
                        <select value={outcome} onChange={(e) => setOutcome(e.target.value as RecoveryOutcome)}>
                          {recoveryOutcomes.map((x) => <option key={x} value={x}>{outcomeLabel(t, x)}</option>)}
                        </select>
                        <label>{t('referenceLabel')}<input value={evidence} onChange={(e) => setEvidence(e.target.value)} /></label>
                        <label>{t('messageLabel')}<textarea value={reason} onChange={(e) => setReason(e.target.value)} /></label>
                        <label className="booking-desk__ack">
                          <input
                            type="checkbox"
                            checked={reconcileAck}
                            onChange={(e) => setReconcileAck(e.target.checked)}
                          />
                          {t('authorizedAcknowledgement')}
                        </label>
                        <button disabled={!reconcileAck || busy || reason.trim().length < 8} onClick={() => void reconcile()}>{t('submit')}</button>
                      </div>
                    )}
                  </>
                )}
              </section>
            </>
          )}
        </article>
      </div>
    </section>
  );
}
