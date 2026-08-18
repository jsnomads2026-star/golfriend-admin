/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/preserve-manual-memoization */
import { useEffect, useMemo, useState } from "react";
import {
  acquisitionSummary,
  CONTRACT_STATES,
  conversionHandoff,
  commissionState,
  filterProspects,
  invoiceEligibility,
  outboundProspect,
  PROSPECT_STAGES,
  type Prospect,
} from "./courseAcquisitionModel.mjs";
import {
  buildOpportunityReport,
  opportunityToJson,
  opportunityToText,
  OUTREACH_TEMPLATE_KINDS,
  renderOutreachTemplate,
  type OpportunityReport,
  type OutreachDraft,
} from "./courseOpportunityModel.mjs";
import {
  localPreviewAcquisitionProvider,
  type AcquisitionProvider,
  type AcquisitionSnapshot,
} from "./courseAcquisitionProvider";
import {
  capabilityAvailability,
  MOUNTED_CAPABILITIES,
  runCapabilityCommand,
  runConversionHandoff,
} from "./acquisitionOperations.mjs";
import { adapterStateLabel } from "./acquisitionAdapterStates.mjs";
import { createReceiptLedger } from "./acquisitionReceipts.mjs";
import { PRODUCTION_ACQUISITION_ADAPTERS } from "./previewAcquisitionAdapters.mjs";
import V2OutreachApprovals from "./V2OutreachApprovals";
import { LOCALE_CODES, coerceLocale } from "../../../i18n/locales";
import { useAdminLocale } from "./AdminLocaleContext";
import "./V2CourseAcquisition.css";
import { useDialogFocus } from "./useDialogFocus";
const label = (v: string) =>
  v.replaceAll("_", " ").replace(/\b\w/g, (l) => l.toUpperCase());
// The LOCAL calendar day. toISOString() would give the UTC day, which east of UTC reports
// yesterday for part of each morning — and an agreement that lapsed yesterday would still
// read as effective for that window.
const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
export default function V2CourseAcquisition({
  provider = localPreviewAcquisitionProvider,
  evaluationDate = today(),
  // Production adapters are null. Mounting a real adapter is a separate approval, so this
  // surface can never be configured into production work by a default.
  adapters = PRODUCTION_ACQUISITION_ADAPTERS,
  mode = "preview",
}: {
  provider?: AcquisitionProvider;
  evaluationDate?: string;
  adapters?: Record<string, unknown>;
  mode?: "preview" | "production";
}) {
  const [snap, setSnap] = useState<AcquisitionSnapshot | null>(null),
    [failed, setFailed] = useState(false),
    [query, setQuery] = useState(""),
    [stage, setStage] = useState("all"),
    [country, setCountry] = useState("all"),
    [contract, setContract] = useState("all"),
    [locale, setLocale] = useState("all"),
    [sort, setSort] = useState("recent"),
    [selected, setSelected] = useState<Prospect | null>(null),
    [handoff, setHandoff] = useState<any>(null),
    [report, setReport] = useState<OpportunityReport | null>(null),
    [draft, setDraft] = useState<OutreachDraft | null>(null),
    [draftKind, setDraftKind] = useState("invitation"),
    [draftLocale, setDraftLocale] = useState("en"),
    [includeRecipient, setIncludeRecipient] = useState(false),
    [copied, setCopied] = useState(false),
    [copyFailed, setCopyFailed] = useState(false),
    [ledger] = useState(() => createReceiptLedger()),
    [commandStates, setCommandStates] = useState<Record<string, any>>({}),
    [announcement, setAnnouncement] = useState("");
  // The panel speaks the ADMIN's language. `draftLocale` is the outreach draft's language and
  // must not retranslate an unrelated part of the operator's screen.
  const adminLocale = useAdminLocale();
  const detailRef = useDialogFocus(Boolean(selected), () => setSelected(null));
  useEffect(() => {
    void provider.load().then(setSnap, () => setFailed(true));
  }, [provider]);
  const rows = useMemo(() => snap?.prospects || [], [snap]),
    summary = useMemo(
      () => acquisitionSummary(rows, evaluationDate),
      [rows, evaluationDate],
    ),
    countries = useMemo(
      () => [...new Set(rows.map((r) => r.country))].sort(),
      [rows],
    ),
    visible = useMemo(
      () =>
        filterProspects(rows, { query, stage, country, contract, locale, sort }),
      [rows, query, stage, country, contract, locale, sort],
    );
  if (failed)
    return (
      <div className="acq-state" role="alert">
        Course acquisition source unavailable. Retry after an approved source is
        configured.
      </div>
    );
  if (!snap)
    return (
      <div className="acq-state" role="status">
        Loading course acquisition registry…
      </div>
    );
  const open = (r: Prospect) => {
    setSelected(r);
    setHandoff(null);
    setReport(null);
    setDraft(null);
    setCopied(false);
    setCopyFailed(false);
    setIncludeRecipient(false);
    setDraftLocale(coerceLocale(r.contactLocale));
  };
  const copy = async () => {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(
        draft
          ? `${draft.subject}\n\n${draft.body}`
          : report
            ? opportunityToJson(report)
            : JSON.stringify(outboundProspect(selected), null, 2),
      );
      setCopied(true);
    } catch {
      setCopyFailed(true);
    }
  };
  const exportEvidence = () => {
    if (!report) return;
    const url = URL.createObjectURL(
      new Blob([opportunityToText(report)], { type: "text/plain" }),
    );
    const link = document.createElement("a");
    link.href = url;
    // A filename is a durable artifact no privacy screen covers downstream, so the identifier
    // is reduced to a safe token rather than trusted.
    const safeName = String(report.course.id ?? "prospect")
      .replace(/[^A-Za-z0-9_-]/g, "-")
      .slice(0, 48);
    link.download = `golfriend-opportunity-${safeName}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  const availability = capabilityAvailability(adapters);
  const runCommand = async (capabilityId: string) => {
    const outcome = await runCapabilityCommand({
      capabilityId,
      adapters,
      ledger,
      mode,
      idempotencyKey: `${capabilityId}:${selected?.id ?? "none"}`,
      issuedAt: new Date().toISOString(),
      input: {
        limit: 10,
        prospect: selected,
        draft,
        recipientSelected: includeRecipient,
        humanApproved: false,
      },
    });
    setCommandStates((previous) => ({ ...previous, [capabilityId]: outcome }));
    // The announcement carries the capability NAME, the state, the refusal reason and the
    // receipt id. The receipt id changes per command, so a repeated run still announces
    // instead of producing an identical text node that a screen reader would skip.
    setAnnouncement(
      [
        label(capabilityId.replace("acquisition.", "")),
        adapterStateLabel(outcome.state, adminLocale),
        outcome.error ? outcome.error.message : "",
        outcome.receipt ? `Receipt ${outcome.receipt.receiptId}` : "",
        outcome.receipt?.replayed ? "replayed" : "",
      ]
        .filter(Boolean)
        .join(" · "),
    );
  };
  const eligibility = selected
    ? invoiceEligibility(selected, evaluationDate)
    : null;
  const commission = selected
    ? commissionState(selected.contract, evaluationDate)
    : null;
  return (
    <div className="acq-ops">
      <header>
        <div>
          <span>ADMIN · READ-ONLY ACQUISITION REGISTRY</span>
          <h2>Enterprise course acquisition</h2>
          <p>
            Track unsigned-course outreach without sending messages, creating
            accounts, raising invoices or changing authority.
          </p>
        </div>
        <aside>
          <b>Local preview data</b>
          <small>
            No approved acquisition backend, outreach service or handoff service
            is configured.
          </small>
        </aside>
      </header>
      <section className="acq-metrics">
        <article>
          <span>Total prospects</span>
          <b>{summary.total}</b>
        </article>
        <article>
          <span>Opportunity evidence only</span>
          <b>{summary.opportunityEvidenceOnly}</b>
        </article>
        <article>
          <span>Commission-effective</span>
          <b>{summary.invoiceable}</b>
        </article>
        <article>
          <span>Follow-ups due</span>
          <b>{summary.followUpsDue}</b>
        </article>
      </section>
      <p className="acq-rule">
        An unsigned course receives opportunity evidence, never an invoice. No
        commission is effective without a signed, effective-dated agreement and
        verified activation.
      </p>
      <section className="acq-adapters" aria-labelledby="acq-adapters-heading">
        <h3 id="acq-adapters-heading">
          Mounted capabilities ·{" "}
          <span lang={adminLocale}>
            {adapterStateLabel(
              mode === "production" ? "modeProduction" : "modePreview",
              adminLocale,
            )}
          </span>
        </h3>
        <p className="acq-adapter-note">
          Production adapters are not mounted. A command here reaches only the
          adapter that is configured; in preview nothing is sent, transmitted or
          written, no course is contacted and no partner status is granted.
        </p>
        <div className="acq-adapter-grid">
          {MOUNTED_CAPABILITIES.map(({ capabilityId }) => {
            const mountState = availability.find(
              (entry) => entry.capabilityId === capabilityId,
            );
            const outcome = commandStates[capabilityId];
            const state = outcome ? outcome.state : mountState?.state;
            return (
              <article key={capabilityId} data-capability={capabilityId}>
                <span id={`${capabilityId}-name`}>
                  {label(capabilityId.replace("acquisition.", ""))}
                </span>
                <b
                  id={`${capabilityId}-state`}
                  data-state={state}
                  lang={adminLocale}
                >
                  {adapterStateLabel(state, adminLocale)}
                </b>
                {outcome?.error && (
                  <small>
                    {outcome.error.code} · {outcome.error.message}
                  </small>
                )}
                {outcome?.receipt && (
                  <small>
                    Receipt {outcome.receipt.receiptId} ·{" "}
                    {outcome.receipt.previewOnly
                      ? "preview only"
                      : "production"}
                    {outcome.receipt.replayed ? " · replayed" : ""}
                  </small>
                )}
                <button
                  type="button"
                  disabled={!mountState?.mounted}
                  aria-describedby={`${capabilityId}-state`}
                  aria-label={`${
                    mountState?.mounted
                      ? "Run capability command"
                      : "No adapter mounted"
                  }: ${label(capabilityId.replace("acquisition.", ""))}`}
                  onClick={() => void runCommand(capabilityId)}
                >
                  {mountState?.mounted
                    ? "Run capability command"
                    : "No adapter mounted"}
                </button>
              </article>
            );
          })}
        </div>
        <p className="acq-live" role="status" aria-live="polite">
          {announcement || "No capability command has been run."}
        </p>
      </section>
      {/* The authoritative outreach approval workflow. Unlike the preview adapters above,
          every row and every action here goes to the server callables — there is no
          client-side authority and no simulated outcome. */}
      <V2OutreachApprovals />
      <section className="acq-grid">
        <section className="panel-region">
          <div className="acq-tools">
            <input
              aria-label="Search prospects"
              placeholder="Search course, country or region"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select
              aria-label="Stage filter"
              value={stage}
              onChange={(e) => setStage(e.target.value)}
            >
              <option value="all">All stages</option>
              {PROSPECT_STAGES.map((x) => (
                <option key={x} value={x}>{label(x)}</option>
              ))}
            </select>
            <select
              aria-label="Country filter"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
            >
              <option value="all">All countries</option>
              {countries.map((x) => (
                <option key={x} value={x}>{x}</option>
              ))}
            </select>
            <select
              aria-label="Contract state filter"
              value={contract}
              onChange={(e) => setContract(e.target.value)}
            >
              <option value="all">All contract states</option>
              {CONTRACT_STATES.map((x) => (
                <option key={x} value={x}>{label(x)}</option>
              ))}
            </select>
            <select
              aria-label="Contact locale filter"
              value={locale}
              onChange={(e) => setLocale(e.target.value)}
            >
              <option value="all">All locales</option>
              {LOCALE_CODES.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
            <select
              aria-label="Sort prospects"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="recent">Recently contacted</option>
              <option value="course">Course name</option>
              <option value="follow_up">Next follow-up</option>
            </select>
          </div>
          {visible.length === 0 ? (
            <div className="acq-state">No prospects match this view.</div>
          ) : (
            <div className="acq-table">
              <table>
                <thead>
                  <tr>
                    <th>Course</th>
                    <th>Country / region</th>
                    <th>Stage</th>
                    <th>Contract</th>
                    <th>Last contacted</th>
                    <th>Next follow-up</th>
                    <th>Demand attribution</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => (
                    <tr
                      key={r.id}
                      tabIndex={0}
                      onClick={() => open(r)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          open(r);
                        }
                      }}
                    >
                      <td>
                        <b>{r.courseName}</b>
                      </td>
                      <td>
                        {r.country} · {r.region}
                      </td>
                      <td>{label(r.stage)}</td>
                      <td>{label(r.contract.state)}</td>
                      <td>{r.lastContactedAt || "Never recorded"}</td>
                      <td>{r.nextFollowUpAt || "Not scheduled"}</td>
                      <td>{label(r.demand.attribution)}</td>
                      <td>{r.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <aside className="acq-stages">
          <span>PIPELINE BY STAGE</span>
          {PROSPECT_STAGES.filter((s) => summary.byStage[s] > 0).map((s) => (
            <div key={s}>
              <b>{label(s)}</b>
              <small>{summary.byStage[s]}</small>
            </div>
          ))}
        </aside>
      </section>
      {selected && eligibility && commission && (
        <div
          ref={detailRef}
          className="acq-detail"
          role="dialog"
          aria-modal="true"
          aria-label="Course prospect detail"
        >
          <button onClick={() => setSelected(null)}>Close</button>
          <span>{label(selected.stage)}</span>
          <h3>{selected.courseName}</h3>
          <p
            className={
              eligibility.invoiceAllowed ? "acq-signed" : "acq-unsigned"
            }
          >
            {eligibility.notice}
          </p>
          <dl>
            <div>
              <dt>Location</dt>
              <dd>
                {selected.country} · {selected.region}
              </dd>
            </div>
            <div>
              <dt>Contact role</dt>
              <dd>
                {selected.contactRole} ·{" "}
                {selected.contactLocale || "Locale unverified"}
              </dd>
            </div>
            <div>
              <dt>Course identifier</dt>
              <dd>{selected.courseId || "None verified"}</dd>
            </div>
            <div>
              <dt>Contract / pilot</dt>
              <dd>
                {label(selected.contract.state)} · effective from{" "}
                {selected.contract.effectiveFrom || "no effective date"} ·
                activation{" "}
                {selected.contract.activatedAt || "not verified"} · pilot ends{" "}
                {selected.contract.pilotEndsAt || "not applicable"}
              </dd>
            </div>
            <div>
              <dt>Commission state</dt>
              <dd>
                {label(commission.reason)} ·{" "}
                {commission.effective
                  ? `${commission.commissionBps} bps`
                  : "no effective rate"}{" "}
                · recorded by {label(commission.authority)}
              </dd>
            </div>
            <div>
              <dt>Demand attribution</dt>
              <dd>
                {label(selected.demand.attribution)} · {selected.demand.source}
              </dd>
            </div>
            <div>
              <dt>Provenance</dt>
              <dd>{selected.source}</dd>
            </div>
          </dl>
          <h4>Contact history · internal notes withheld</h4>
          {selected.history.length === 0 ? (
            <div className="acq-note">No contact history recorded.</div>
          ) : (
            selected.history.map((h, i) => (
              <div className="acq-note" key={`${h.at}-${i}`}>
                <b>{h.at || "Undated"}</b>
                {label(h.channel)} · {label(h.stageAfter)} · {h.summary}
              </div>
            ))
          )}
          <h4>Opportunity evidence and outreach drafts</h4>
          <div className="acq-compose">
            <select
              aria-label="Outreach template"
              value={draftKind}
              onChange={(e) => setDraftKind(e.target.value)}
            >
              {OUTREACH_TEMPLATE_KINDS.map((x) => (
                <option key={x} value={x}>{label(x)}</option>
              ))}
            </select>
            <select
              aria-label="Draft locale"
              value={draftLocale}
              onChange={(e) => setDraftLocale(e.target.value)}
            >
              {LOCALE_CODES.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
            <button
              onClick={() =>
                setReport(
                  buildOpportunityReport({
                    prospect: selected,
                    generatedAt: new Date().toISOString(),
                    evaluationDate,
                  }),
                )
              }
            >
              Build opportunity evidence
            </button>
            <button
              onClick={() =>
                setDraft(
                  renderOutreachTemplate({
                    kind: draftKind,
                    locale: draftLocale,
                    prospect: selected,
                    report,
                    includeRecipient,
                  }),
                )
              }
            >
              Generate draft
            </button>
            <label className="acq-recipient">
              <input
                type="checkbox"
                checked={includeRecipient}
                onChange={(e) => setIncludeRecipient(e.target.checked)}
              />
              Address the selected recipient by name (draft only, awaiting human
              approval — never enters analytics or evidence)
            </label>
          </div>
          {report && (
            <div className="acq-evidence">
              <b>Opportunity evidence · {report.schema}</b>
              <p>
                Period {report.period.label} · attribution{" "}
                {label(report.attribution.level)} · aggregates below{" "}
                {report.privacy.minimumAggregate} are withheld
              </p>
              <ul>
                {report.metrics.map((m) => (
                  <li key={m.id}>
                    <b>{label(m.id)}</b>
                    <span>
                      {m.disclosed
                        ? m.value
                        : m.reason === "not_authoritatively_attributed"
                          ? "Not claimed — no authoritative attribution"
                          : `Withheld — ${label(m.reason)}`}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="acq-unsigned">{report.invoice.notice}</p>
              <p>
                No member identity, internal note or precise personal movement
                is included.
              </p>
              <button onClick={exportEvidence}>Download evidence (TXT)</button>
            </div>
          )}
          {draft && (
            <div className="acq-draft">
              <b>
                {draft.kind} · {draft.locale}
              </b>
              <p>{draft.subject}</p>
              <pre>{draft.body}</pre>
              <p>{draft.notice}</p>
              <button disabled>Send draft unavailable</button>
            </div>
          )}
          <div className="acq-actions">
            <button onClick={() => setHandoff(conversionHandoff(selected))}>
              Preview Portal onboarding handoff
            </button>
            <button
              onClick={() =>
                void runConversionHandoff({
                  adapters,
                  ledger,
                  mode,
                  idempotencyKey: `conversion:${selected.id}`,
                  issuedAt: new Date().toISOString(),
                  prospect: selected,
                }).then((outcome) => {
                  setCommandStates((previous) => ({
                    ...previous,
                    "acquisition.portal-conversion": outcome,
                  }));
                  setAnnouncement(
                    `Portal conversion handoff · ${adapterStateLabel(outcome.state, adminLocale)}${outcome.error ? ` · ${outcome.error.message}` : ""}${outcome.receipt ? ` · Receipt ${outcome.receipt.receiptId}` : ""}`,
                  );
                })
              }
            >
              Submit conversion handoff to adapter
            </button>
            <button onClick={() => void copy()}>
              {copyFailed
                ? "Clipboard unavailable"
                : copied
                  ? "Copied"
                  : "Copy privacy-safe summary"}
            </button>
          </div>
          {handoff && (
            <div className="acq-handoff">
              <b>Portal onboarding handoff preview</b>
              <p>
                {handoff.courseName} → {handoff.targetPipeline} ·{" "}
                {handoff.eligible
                  ? `target status ${handoff.targetStatus}`
                  : handoff.blockedReason}
              </p>
              <p>{handoff.notice}</p>
              <button disabled>Submit handoff unavailable</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
