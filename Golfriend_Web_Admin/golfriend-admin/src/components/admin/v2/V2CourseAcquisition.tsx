/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/preserve-manual-memoization */
import { useEffect, useMemo, useState } from "react";
import {
  acquisitionSummary,
  CONTRACT_STATES,
  conversionHandoff,
  commissionState,
  filterProspects,
  invoiceEligibility,
  PROSPECT_STAGES,
  shareableProspect,
  type Prospect,
} from "./courseAcquisitionModel.mjs";
import {
  localPreviewAcquisitionProvider,
  type AcquisitionProvider,
  type AcquisitionSnapshot,
} from "./courseAcquisitionProvider";
import { LOCALE_CODES } from "../../../i18n/locales";
import "./V2CourseAcquisition.css";
import { useDialogFocus } from "./useDialogFocus";
const label = (v: string) =>
  v.replaceAll("_", " ").replace(/\b\w/g, (l) => l.toUpperCase());
const today = () => new Date().toISOString().slice(0, 10);
export default function V2CourseAcquisition({
  provider = localPreviewAcquisitionProvider,
  evaluationDate = today(),
}: {
  provider?: AcquisitionProvider;
  evaluationDate?: string;
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
    [copied, setCopied] = useState(false);
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
  const copy = async () => {
    if (!selected) return;
    await navigator.clipboard.writeText(
      JSON.stringify(shareableProspect(selected), null, 2),
    );
    setCopied(true);
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
      <section className="acq-grid">
        <main>
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
                      onClick={() => {
                        setSelected(r);
                        setHandoff(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          setSelected(r);
                          setHandoff(null);
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
        </main>
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
          <div className="acq-actions">
            <button onClick={() => setHandoff(conversionHandoff(selected))}>
              Preview Portal onboarding handoff
            </button>
            <button onClick={() => void copy()}>
              {copied ? "Copied" : "Copy privacy-safe summary"}
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
