// ============================================================================
// Enterprise outreach approvals — mounted inside the existing V2 Course Acquisition
// surface (Admin → Partners). This is NOT a demonstration page: every row comes from
// listOutreachDrafts and every button calls outreachDraftCommand. There is no local
// state machine, no optimistic transition and no client-side authority.
//
// What the client decides: what to render, and which buttons to OFFER. What the server
// decides: whether the action is permitted. The two are deliberately not the same thing —
// a hidden button is a usability affordance, never a control. Every action the UI offers
// is re-authorized on the server, so a user who calls the callable directly gains nothing.
//
// Nothing is sent from this screen. There is no transmitter, and the server reports every
// draft as not sendable with the reason why.
// ============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../../../i18n/hooks.ts';
import { outreachDict, outreachErrorKey, type OutreachKey } from '../../../i18n/admin/outreach.ts';
import {
  productionOutreachTransport,
  type OutreachRow, type OutreachTransport,
} from './outreachService';
import {
  authorityFingerprint, createIntentLedger, isAuthoritativeOutcome, shouldDisposeCache,
  type AuthorityIdentity, type IntentStore,
} from './outreachIntent';
import './V2OutreachApprovals.css';

const STATE_KEYS: Record<string, OutreachKey> = {
  draft_created: 'state.draft_created',
  reviewer_assigned: 'state.reviewer_assigned',
  previewed: 'state.previewed',
  approved: 'state.approved',
  rejected: 'state.rejected',
  changes_requested: 'state.changes_requested',
  expired: 'state.expired',
  revoked: 'state.revoked',
};

/** A state with no translation renders as its raw code rather than as a blank cell. */
const stateKey = (state: string): OutreachKey | null => STATE_KEYS[state] ?? null;

/** sessionStorage when available; a no-op in environments without it. */
const defaultIntentStore = (): IntentStore => {
  try {
    if (typeof sessionStorage !== 'undefined') return sessionStorage;
  } catch { /* access can throw under strict privacy settings */ }
  return { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
};

export default function V2OutreachApprovals({
  transport = productionOutreachTransport,
  identity = null,
  intentStore,
}: {
  transport?: OutreachTransport;
  /** Governing authority. A change to ANY field disposes cached draft content. */
  identity?: AuthorityIdentity | null;
  intentStore?: IntentStore;
}) {
  const t = useT(outreachDict as unknown as Record<string, Record<string, string>>);
  const [rows, setRows] = useState<OutreachRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ code: string | null; replayed: boolean; state: string | null } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // The intent ledger is scoped to the current authority fingerprint, so pending commands
  // can never be recovered by a different identity after a reload.
  const fingerprint = authorityFingerprint(identity);
  const store = useMemo(() => intentStore ?? defaultIntentStore(), [intentStore]);
  const ledger = useMemo(
    () => createIntentLedger(store, fingerprint),
    [store, fingerprint],
  );
  const seenIdentity = useRef<AuthorityIdentity | null>(identity);

  // DISPOSAL. When the governing authority changes — sign-out, suspension, role or scope
  // change, a new request version, lost App Check, going offline — previously authorized
  // draft content on screen is no longer authorized. It is dropped, not left to go stale.
  useEffect(() => {
    const previous = seenIdentity.current;
    seenIdentity.current = identity;
    if (!shouldDisposeCache(previous, identity)) return;
    setRows([]);
    setNotice(null);
    setBusy(null);
    setListError(identity && identity.online === false ? 'internal_error' : 'unauthenticated');
    ledger.disposeAll();
  }, [fingerprint, identity, ledger]);

  const load = useCallback(() => transport.list(), [transport]);

  /**
   * Applies a server listing. A failed listing shows the error and must NOT fall back to
   * an empty table — an empty table reads as "there is nothing awaiting approval", which
   * is the most misleading thing this screen could say.
   */
  const applyList = useCallback((result: Awaited<ReturnType<OutreachTransport['list']>>) => {
    setListError(result.ok ? null : (result.code ?? 'internal_error'));
    setRows(result.ok ? result.rows : []);
    setLoading(false);
  }, []);

  const failedList = useCallback(() => {
    applyList({ ok: false, code: 'internal_error', rows: [] });
  }, [applyList]);

  useEffect(() => { void load().then(applyList, failedList); }, [load, applyList, failedList]);

  /** Refresh is a plain event handler; the server remains the only source of the rows. */
  const reload = () => { setLoading(true); void load().then(applyList, failedList); };

  const send = useCallback(async (row: OutreachRow, requestedState: string) => {
    const intent = {
      draftId: row.draftId,
      requestedState,
      expectedVersion: row.version,
      // Content identity: editing what would be approved yields a different intent, so a
      // retry can never carry new content under an id the server already accepted.
      contentRef: `${row.subject ?? ''}|${row.body ?? ''}`,
    };
    // SINGLE FLIGHT: a second click on the same intent is not a second command.
    const begun = ledger.begin(intent);
    if (begun.alreadyInFlight) return;

    setBusy(row.draftId);
    setNotice(null);
    const outcome = await transport.command({
      op: 'transition',
      draftId: row.draftId,
      expectedVersion: row.version,
      requestedState,
      // The SAME id for every attempt at this intent. A fresh id per attempt is what
      // made the server's replay ledger unreachable from this surface.
      commandId: begun.commandId,
    });
    // Only an AUTHORITATIVE outcome retires the intent. A transport failure keeps it, so
    // the retry reuses the id and the server replays instead of applying twice.
    if (isAuthoritativeOutcome(outcome)) ledger.settle(intent);
    setNotice({ code: outcome.code, replayed: outcome.replayed, state: outcome.state });
    setBusy(null);
    // Re-read from the server rather than patching local state: the server is the only
    // place that knows what actually landed.
    applyList(await load());
  }, [transport, load, applyList, ledger]);

  const holdLabel = (hold: boolean | null): OutreachKey =>
    hold === null ? 'hold.unknown' : hold ? 'hold.active' : 'hold.clear';

  return (
    <section className="out-approvals" aria-labelledby="out-approvals-title">
      <header>
        <span>{t('eyebrow')}</span>
        <h3 id="out-approvals-title">{t('title')}</h3>
        <p>{t('subtitle')}</p>
      </header>

      <p className="out-notice">{t('notice.noTransmission')}</p>
      <p className="out-notice">{t('notice.serverAuthority')}</p>

      <div className="out-bar">
        <button type="button" onClick={() => void reload()} disabled={loading}>{t('refresh')}</button>
        {notice && (
          <output className="out-result" data-ok={notice.code === null}>
            {/* The SERVER's resulting state, not the action that was attempted. Reporting a
                fixed "Approved" on every success would have announced an approval after a
                reject or a revoke — in all eight locales. */}
            {notice.code === null
              ? `${notice.state && stateKey(notice.state) ? t(stateKey(notice.state) as OutreachKey) : (notice.state ?? '')}${notice.replayed ? ` · ${t('replayed')}` : ''}`
              : t(outreachErrorKey(notice.code))}
          </output>
        )}
      </div>

      {loading && <p className="out-state">{t('loading')}</p>}
      {!loading && listError && <p className="out-state out-error">{t(outreachErrorKey(listError))}</p>}
      {!loading && !listError && rows.length === 0 && <p className="out-state">{t('empty')}</p>}

      {!loading && !listError && rows.length > 0 && (
        <div className="out-table">
          <table>
            <thead>
              <tr>
                <th>{t('col.draft')}</th>
                <th>{t('col.state')}</th>
                <th>{t('col.version')}</th>
                <th>{t('col.jurisdiction')}</th>
                <th>{t('col.reviewer')}</th>
                <th>{t('col.expires')}</th>
                <th>{t('col.hold')}</th>
                <th>{t('col.sendable')}</th>
                <th aria-label={t('action.approve')} />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const key = stateKey(row.state);
                return (
                  <tr key={row.draftId} data-state={row.state}>
                    <td>
                      <b>{row.draftId}</b>
                      {/* A human approval requires seeing what is being approved. */}
                      <small>{row.subject ?? ""}</small>
                      <small>{row.body ?? ""}</small>
                    </td>
                    <td><b data-state={row.state}>{key ? t(key) : row.state}</b></td>
                    <td>{row.version}</td>
                    <td>
                      {row.jurisdiction ?? '—'}
                      <small>{t(row.jurisdictionApproved ? 'jurisdiction.approved' : 'jurisdiction.unapproved')}</small>
                    </td>
                    <td>
                      {row.hasAssignedReviewer ? t('reviewer.assigned') : t('reviewer.none')}
                      {row.callerIsAssignedReviewer && <small>{t('reviewer.you')}</small>}
                      {row.callerIsCreator && <small>{t('creator.you')}</small>}
                    </td>
                    <td>{row.expiresAt ?? t('expires.none')}</td>
                    <td data-hold={String(row.legalHold)}>{t(holdLabel(row.legalHold))}</td>
                    <td>
                      {/* Driven by the server flag, not a constant. Hard-coding the
                          negative fails closed today but would silently invert if
                          transmission were ever enabled. */}
                      <b>{row.sendable ? row.state : t('sendable.no')}</b>
                      <small>{t(outreachErrorKey(row.sendableReason))}</small>
                    </td>
                    <td className="out-actions">
                      {/* Offered only to the assigned reviewer — but the SERVER is what
                          enforces it. Hiding the button is convenience, not a control. */}
                      {/* A reviewer must PREVIEW before approving: the server graph has no
                          reviewer_assigned -> approved edge, so an approval nobody looked at
                          is refused rather than merely discouraged. */}
                      <button
                        type="button"
                        disabled={busy === row.draftId || !row.callerIsAssignedReviewer}
                        onClick={() => void send(row, 'previewed')}
                      >{t('action.preview')}</button>
                      <button
                        type="button"
                        disabled={busy === row.draftId || !row.callerIsAssignedReviewer}
                        onClick={() => void send(row, 'approved')}
                      >{t('action.approve')}</button>
                      <button
                        type="button"
                        disabled={busy === row.draftId || !row.callerIsAssignedReviewer}
                        onClick={() => void send(row, 'rejected')}
                      >{t('action.reject')}</button>
                      <button
                        type="button"
                        disabled={busy === row.draftId}
                        onClick={() => void send(row, 'changes_requested')}
                      >{t('action.requestChanges')}</button>
                      <button
                        type="button"
                        disabled={busy === row.draftId}
                        onClick={() => void send(row, 'revoked')}
                      >{t('action.revoke')}</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
