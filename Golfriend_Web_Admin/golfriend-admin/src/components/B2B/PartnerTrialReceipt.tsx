import {useCallback, useEffect, useRef, useState} from 'react';
import {useLocale} from '../../i18n/hooks.ts';
import {trialReceiptCopy} from '../../i18n/partner/trialReceipt';
import {partnerTrialReceiptService, type TrialReceiptState} from './partnerTrialReceiptService';
import {trialPresentation} from './trialPresentation.mjs';

// ONE component renders the receipt for BOTH the Portal and Admin. That is deliberate: a
// second renderer is a second place for the two surfaces to disagree. Admin passes
// `organizationId`; the Portal passes none and the server scopes to the caller.
//
// Nothing here computes a money value. Amounts are formatted from the stored minor units
// exactly as issued -- never re-totalled, re-discounted or re-derived.

const money = (minor: number, currency: string, locale: string) => {
  try {
    return new Intl.NumberFormat(locale, {style: 'currency', currency}).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
};

const day = (iso: string, locale: string) => {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return iso;
  try { return new Intl.DateTimeFormat(locale, {dateStyle: 'medium'}).format(new Date(parsed)); } catch { return iso; }
};

export default function PartnerTrialReceipt({organizationId = null, admin = false, onCancelTrial}: {organizationId?: string | null; admin?: boolean; onCancelTrial?: () => Promise<void> | void}) {
  const locale = useLocale();
  const copy = trialReceiptCopy(locale);
  const [result, setResult] = useState<TrialReceiptState | null>(null);
  const [confirming, setConfirming] = useState(false);
  const generation = useRef(0);

  const load = useCallback(async () => {
    const run = ++generation.current;
    const next = admin && organizationId
      ? await partnerTrialReceiptService.forOrganization(organizationId)
      : await partnerTrialReceiptService.mine(organizationId ?? undefined);
    if (run === generation.current) setResult(next);
  }, [admin, organizationId]);

  useEffect(() => { void load(); return () => { generation.current += 1; }; }, [load]);

  if (!result) return <section className="sb-card" aria-busy="true"><p role="status">{copy.loading}</p></section>;

  if (result.state === 'error') {
    const message = result.reason === 'offline' ? copy.offline : result.reason === 'unknown' ? copy.unknown : copy.unavailable;
    return <section className="sb-card"><h2>{copy.heading}</h2><p role="alert">{message}</p></section>;
  }

  // A receipt whose stored digest does not re-derive is a security event, not a rendering
  // problem: show the failure, never a recalculated substitute.
  if (result.verification && result.verification.valid === false) {
    return <section className="sb-card"><h2>{copy.heading}</h2><p role="alert">{copy.securityError}</p></section>;
  }

  if (result.state !== 'ready' || !result.trial || !result.statement) {
    return <section className="sb-card"><h2>{copy.heading}</h2><p role="status">{copy.unavailable}</p></section>;
  }

  const {trial, statement} = result;
  const view = trialPresentation(trial);
  const statusLabel = view.status === 'cancelled' ? copy.statusCancelled
    : view.status === 'expired' ? copy.statusExpired
    : view.status === 'expiring' ? copy.statusExpiring : copy.statusActive;
  const tierLabel = statement.tier === 'enterprise' ? copy.enterprise : copy.smallBusiness;
  const enterpriseZeroBasis = statement.tier === 'enterprise' && statement.lines.length === 0;

  return (
    <section className="sb-card partner-trial-receipt" aria-labelledby={`trial-receipt-${admin ? 'admin' : 'portal'}`}>
      <h2 id={`trial-receipt-${admin ? 'admin' : 'portal'}`}>{copy.heading}</h2>

      <dl>
        <dt>{copy.organization}</dt><dd>{trial.organizationId}</dd>
        <dt>{copy.partnerType}</dt><dd>{tierLabel}</dd>
        <dt>{copy.trialStart}</dt><dd><time dateTime={trial.startsAt}>{day(trial.startsAt, locale)}</time></dd>
        <dt>{copy.trialEnd}</dt><dd><time dateTime={trial.endsAt}>{day(trial.endsAt, locale)}</time></dd>
        <dt>{copy.remaining}</dt><dd>{view.remaining} {copy.days}</dd>
        <dt>{copy.pricingVersion}</dt><dd><code>{statement.pricingPolicyVersion}</code></dd>
        <dt>{copy.agreementDigest}</dt><dd><code>{statement.agreementDigest.slice(0, 16)}…</code></dd>
        <dt>{copy.receiptNumber}</dt><dd><code>{statement.statementNumber}</code></dd>
      </dl>

      <p className="trial-status" role="status">{statusLabel}</p>
      {view.readOnly && view.readOnlyUntil ? (
        <p role="status">{copy.readOnlyNotice} {copy.exportNotice} <time dateTime={view.readOnlyUntil}>{day(view.readOnlyUntil, locale)}</time>.</p>
      ) : null}
      {view.status === 'expired' && !trial.cancelledAt ? <p role="status">{copy.readOnlyNotice}</p> : null}

      <h3>{copy.receipt}</h3>
      {enterpriseZeroBasis ? <p role="note">{copy.noBasisYet}</p> : null}
      <table>
        <caption className="sr-only">{copy.receipt} {statement.statementNumber}</caption>
        <thead>
          <tr><th scope="col">{copy.receipt}</th><th scope="col">{copy.normal}</th><th scope="col">{copy.discount}</th><th scope="col">{copy.due}</th></tr>
        </thead>
        <tbody>
          {statement.lines.map(line => (
            <tr key={`${line.kind}:${line.reference ?? 'base'}`}>
              <th scope="row">{line.kind === 'small_business_subscription' ? copy.subscription : line.kind === 'enterprise_attributed_commission' ? copy.commission : line.description}</th>
              <td>{money(line.normalMinor, line.currency, locale)}</td>
              <td>−{money(line.discountMinor, line.currency, locale)}</td>
              <td>{money(line.dueMinor, line.currency, locale)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">{copy.due}</th>
            <td>{money(statement.totals.normalMinor, statement.currency, locale)}</td>
            <td>−{money(statement.totals.discountMinor, statement.currency, locale)}</td>
            <td><strong>{money(statement.totals.dueMinor, statement.currency, locale)}</strong></td>
          </tr>
        </tfoot>
      </table>

      <p className="trial-boundary" role="note">{statement.externalMoneyBoundary}</p>
      <p className="trial-legal">{copy.legalPending}</p>

      {/* Admin never edits a receipt value; the Admin view is strictly read-only. */}
      {!admin && onCancelTrial && view.status !== 'cancelled' && view.status !== 'expired' ? (
        confirming ? (
          <div role="group" aria-label={copy.cancel}>
            <p role="alert">{copy.cancelConfirm}</p>
            <button type="button" onClick={() => { setConfirming(false); void Promise.resolve(onCancelTrial()).then(load); }}>{copy.cancelConfirmYes}</button>
            <button type="button" onClick={() => setConfirming(false)}>{copy.cancelConfirmNo}</button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirming(true)}>{copy.cancel}</button>
        )
      ) : null}
    </section>
  );
}
