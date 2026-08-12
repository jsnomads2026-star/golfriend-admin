/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/preserve-manual-memoization */
import { useEffect, useMemo, useState } from "react";
import {
  decisionPreview,
  filterPartnerRequests,
  onboardingChecklist,
  PARTNER_LOCALES,
  PARTNER_STATUSES,
  PARTNER_TYPES,
  partnerSummary,
  type PartnerRequest,
} from "./partnerOperationsModel.mjs";
import {
  localPreviewPartnerProvider,
  type PartnerOperationsProvider,
  type PartnerOperationsSnapshot,
} from "./partnerOperationsProvider";
import "./V2PartnerOperations.css";
import { useDialogFocus } from "./useDialogFocus";
const label = (v: string) =>
  v.replaceAll("_", " ").replace(/\b\w/g, (l) => l.toUpperCase());
export default function V2PartnerOperations({
  provider = localPreviewPartnerProvider,
}: {
  provider?: PartnerOperationsProvider;
}) {
  const [snap, setSnap] = useState<PartnerOperationsSnapshot | null>(null),
    [failed, setFailed] = useState(false),
    [query, setQuery] = useState(""),
    [type, setType] = useState("all"),
    [status, setStatus] = useState("all"),
    [locale, setLocale] = useState("all"),
    [sort, setSort] = useState("newest"),
    [selected, setSelected] = useState<PartnerRequest | null>(null),
    [preview, setPreview] = useState<any>(null),
    [decision, setDecision] = useState("request_information"),
    [summaryLocale, setSummaryLocale] = useState("en"),
    [copied, setCopied] = useState(false);
  const detailRef = useDialogFocus(Boolean(selected), () => setSelected(null));
  useEffect(() => {
    void provider.load().then(setSnap, () => setFailed(true));
  }, [provider]);
  const rows = useMemo(() => snap?.requests || [], [snap]),
    summary = useMemo(() => partnerSummary(rows), [rows]),
    visible = useMemo(
      () => filterPartnerRequests(rows, { query, type, status, locale, sort }),
      [rows, query, type, status, locale, sort],
    );
  if (failed)
    return (
      <div className="partner-state" role="alert">
        Partner request source unavailable. Retry after an approved source is
        configured.
      </div>
    );
  if (!snap)
    return (
      <div className="partner-state" role="status">
        Loading partner requests…
      </div>
    );
  const copy = async () => {
    if (!selected) return;
    await navigator.clipboard.writeText(
      JSON.stringify(
        {
          organization: selected.organization,
          type: selected.type,
          status: selected.status,
          locale: summaryLocale,
          checklist: onboardingChecklist(selected),
        },
        null,
        2,
      ),
    );
    setCopied(true);
  };
  return (
    <div className="partner-ops">
      <header>
        <div>
          <span>ADMIN · READ-ONLY REVIEW</span>
          <h2>Partner requests and onboarding</h2>
          <p>
            Review intake evidence without creating accounts, sending messages,
            or changing authority.
          </p>
        </div>
        <aside>
          <b>Local preview data</b>
          <small>
            No approved request backend or decision service is configured.
          </small>
        </aside>
      </header>
      <section className="partner-metrics">
        <article>
          <span>Total requests</span>
          <b>{summary.total}</b>
        </article>
        {PARTNER_STATUSES.map((s) => (
          <article key={s}>
            <span>{label(s)}</span>
            <b>{summary.byStatus[s]}</b>
          </article>
        ))}
      </section>
      <section className="partner-grid">
        <main>
          <div className="partner-tools">
            <input
              aria-label="Search partner requests"
              placeholder="Search organization, location or contact"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select
              aria-label="Partner type filter"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="all">All types</option>
              {PARTNER_TYPES.map((x) => (
                <option key={x} value={x}>{label(x)}</option>
              ))}
            </select>
            <select
              aria-label="Status filter"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="all">All statuses</option>
              {PARTNER_STATUSES.map((x) => (
                <option key={x} value={x}>{label(x)}</option>
              ))}
            </select>
            <select
              aria-label="Locale filter"
              value={locale}
              onChange={(e) => setLocale(e.target.value)}
            >
              <option value="all">All locales</option>
              {PARTNER_LOCALES.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
            <select
              aria-label="Sort requests"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="newest">Newest</option>
              <option value="organization">Organization</option>
            </select>
          </div>
          {visible.length === 0 ? (
            <div className="partner-state">No requests match this view.</div>
          ) : (
            <div className="partner-table">
              <table>
                <thead>
                  <tr>
                    <th>Organization</th>
                    <th>Type</th>
                    <th>Country / region</th>
                    <th>Contact</th>
                    <th>Locale</th>
                    <th>Submitted</th>
                    <th>Status</th>
                    <th>Owner</th>
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
                        setPreview(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          setSelected(r);
                          setPreview(null);
                        }
                      }}
                    >
                      <td>
                        <b>{r.organization}</b>
                      </td>
                      <td>{label(r.type)}</td>
                      <td>
                        {r.country} · {r.region}
                      </td>
                      <td>{r.contactName}</td>
                      <td>{r.contactLocale || "Unverified"}</td>
                      <td>{r.submittedAt || "Unknown"}</td>
                      <td>{label(r.status)}</td>
                      <td>{r.owner || "Unassigned / unverified"}</td>
                      <td>{r.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </main>
        <aside className="partner-recent">
          <span>RECENT ACTIVITY</span>
          {summary.recent.map((r: any) => (
            <button key={r.id} onClick={() => setSelected(r)}>
              <b>{r.organization}</b>
              <small>
                {r.submittedAt} · {label(r.status)}
              </small>
            </button>
          ))}
        </aside>
      </section>
      {selected && (
        <div
          ref={detailRef}
          className="partner-detail"
          role="dialog"
          aria-modal="true"
          aria-label="Partner request detail"
        >
          <button onClick={() => setSelected(null)}>Close</button>
          <span>{label(selected.type)}</span>
          <h3>{selected.organization}</h3>
          <p>{selected.collaboration}</p>
          <dl>
            <div>
              <dt>Contact</dt>
              <dd>
                {selected.contactName} ·{" "}
                {selected.contactLocale || "Locale unverified"}
              </dd>
            </div>
            <div>
              <dt>Location</dt>
              <dd>
                {selected.country} · {selected.region}
              </dd>
            </div>
            <div>
              <dt>Course identifiers</dt>
              <dd>
                {selected.courseIds.length
                  ? selected.courseIds.join(", ")
                  : "None verified"}
              </dd>
            </div>
            <div>
              <dt>Trusted links/files</dt>
              <dd>
                {selected.links.length
                  ? selected.links.map((x: any) => x.label).join(", ")
                  : "None verified"}
              </dd>
            </div>
            <div>
              <dt>Provenance</dt>
              <dd>{selected.source}</dd>
            </div>
            <div>
              <dt>Status history</dt>
              <dd>
                {selected.history.length
                  ? selected.history
                      .map((x: any) => `${x.at}: ${x.status}`)
                      .join(" · ")
                  : "Unavailable"}
              </dd>
            </div>
          </dl>
          <h4>Onboarding checklist · evidence only</h4>
          {onboardingChecklist(selected).map((x) => (
            <div className="check" key={x.key}>
              <b>{x.complete ? "✓" : "—"}</b>
              {x.label}
            </div>
          ))}
          <div className="decision">
            <select
              aria-label="Decision"
              value={decision}
              onChange={(e) => setDecision(e.target.value)}
            >
              <option value="request_information">Information required</option>
              <option value="approve">Approve</option>
              <option value="decline">Decline</option>
            </select>
            <select
              aria-label="Summary locale"
              value={summaryLocale}
              onChange={(e) => setSummaryLocale(e.target.value)}
            >
              {PARTNER_LOCALES.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
            <button
              onClick={() =>
                setPreview(decisionPreview(selected, decision, summaryLocale))
              }
            >
              Preview decision
            </button>
            <button onClick={() => void copy()}>
              {copied ? "Copied" : "Copy / export summary"}
            </button>
          </div>
          {preview && (
            <div className="decision-preview">
              <b>Decision preview</b>
              <p>
                {preview.organization} · {label(preview.decision)} ·{" "}
                {preview.locale}
              </p>
              <p>{preview.notice}</p>
              <button disabled>Submit decision unavailable</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
