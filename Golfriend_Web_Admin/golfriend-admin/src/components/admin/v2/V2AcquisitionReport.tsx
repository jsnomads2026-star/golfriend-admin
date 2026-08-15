import { useEffect, useMemo, useState } from "react";
import {
  acquisitionReportToCsv,
  acquisitionReportToJson,
  acquisitionReportToText,
  buildAcquisitionReport,
  JHCC_TRANSMISSION_SCHEMA,
  type AcquisitionReport,
} from "./acquisitionReportingModel.mjs";
import {
  localPreviewAcquisitionProvider,
  type AcquisitionProvider,
  type AcquisitionSnapshot,
} from "./courseAcquisitionProvider";
import "./V2AcquisitionReport.css";
const label = (v: string) =>
  v.replaceAll("_", " ").replace(/\b\w/g, (l) => l.toUpperCase());
const shown = (d: {
  disclosed: boolean;
  value: number | null;
  reason: string;
  partialCoverage: boolean;
  coverage: { contributing: number; total: number };
}) =>
  !d.disclosed
    ? `Withheld — ${label(d.reason)}`
    : d.partialCoverage
      ? `${d.value} (partial — ${d.coverage.contributing} of ${d.coverage.total} courses reporting)`
      : String(d.value);
// The LOCAL calendar day — see V2CourseAcquisition: the UTC day would keep a lapsed
// authorization reporting as effective for the offset window each morning.
const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
export default function V2AcquisitionReport({
  provider = localPreviewAcquisitionProvider,
  evaluationDate = today(),
  // No approved Golfriend-to-JHCC acquisition reporting contract exists, so no
  // authorization record is injected and delivery stays fail-closed.
  authorization = null,
  transmitter = null,
}: {
  provider?: AcquisitionProvider;
  evaluationDate?: string;
  authorization?: Record<string, unknown> | null;
  transmitter?: null;
}) {
  const [snap, setSnap] = useState<AcquisitionSnapshot | null>(null),
    [failed, setFailed] = useState(false),
    [periodStart, setPeriodStart] = useState("2026-07-01"),
    [periodEnd, setPeriodEnd] = useState(evaluationDate),
    [report, setReport] = useState<AcquisitionReport | null>(null),
    [copied, setCopied] = useState(false),
    [copyFailed, setCopyFailed] = useState(false);
  useEffect(() => {
    void provider.load().then(setSnap, () => setFailed(true));
  }, [provider]);
  const prospects = useMemo(() => snap?.prospects || [], [snap]);
  if (failed)
    return (
      <div className="acqr-state" role="alert">
        Acquisition analytics source unavailable. Retry after an approved source
        is configured.
      </div>
    );
  if (!snap)
    return (
      <div className="acqr-state" role="status">
        Loading acquisition analytics…
      </div>
    );
  const generate = () => {
    setCopied(false);
    setCopyFailed(false);
    setReport(
      buildAcquisitionReport({
        prospects,
        period: { start: periodStart, end: periodEnd },
        generatedAt: new Date().toISOString(),
        evaluationDate,
        authorization,
      }),
    );
  };
  const download = (text: string, extension: string) => {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `golfriend-course-acquisition.${extension}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  const copy = async () => {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(acquisitionReportToJson(report));
      setCopied(true);
    } catch {
      setCopyFailed(true);
    }
  };
  return (
    <div className="acqr">
      <header>
        <div>
          <span>ADMIN · ACQUISITION ANALYTICS</span>
          <h2>Course acquisition reporting</h2>
          <p>
            Country and course-level acquisition analytics prepared for a future
            approved Golfriend-to-JHCC reporting contract.
          </p>
        </div>
        <aside>
          <b>Local preview data</b>
          <small>
            Golfriend Admin manages Golfriend. JHCC receives oversight reporting
            only and is never the booking engine or a payment processor.
          </small>
        </aside>
      </header>
      <div className="acqr-tools">
        <label htmlFor="acqr-start">Period start</label>
        <input
          id="acqr-start"
          type="date"
          value={periodStart}
          onChange={(e) => setPeriodStart(e.target.value)}
        />
        <label htmlFor="acqr-end">Period end</label>
        <input
          id="acqr-end"
          type="date"
          value={periodEnd}
          onChange={(e) => setPeriodEnd(e.target.value)}
        />
        <button onClick={generate}>Generate acquisition report</button>
      </div>
      {!report ? (
        <div className="acqr-state">
          No report generated yet. Generation is local and deterministic.
        </div>
      ) : (
        <>
          <section className="acqr-metrics">
            <article>
              <span>Prospects</span>
              <b>{report.analytics.totals.prospects}</b>
            </article>
            <article>
              <span>Countries</span>
              <b>{report.analytics.totals.countries}</b>
            </article>
            <article>
              <span>Commission-effective</span>
              <b>{report.analytics.totals.commissionEffective}</b>
            </article>
            <article>
              <span>Opportunity evidence only</span>
              <b>{report.analytics.totals.opportunityEvidenceOnly}</b>
            </article>
          </section>
          <h3>By country</h3>
          <div className="acqr-table">
            <table>
              <thead>
                <tr>
                  <th>Country</th>
                  <th>Prospects</th>
                  <th>Commission-effective</th>
                  <th>Attribution</th>
                  <th>Booking interest</th>
                  <th>Confirmed bookings</th>
                </tr>
              </thead>
              <tbody>
                {report.analytics.countries.map((c) => (
                  <tr key={c.country}>
                    <td>
                      <b>{c.country}</b>
                    </td>
                    <td>{c.prospects}</td>
                    <td>{c.signed}</td>
                    <td>{label(c.demand.attribution)}</td>
                    <td>{shown(c.demand.bookingInterest)}</td>
                    <td>{shown(c.demand.confirmedBookings)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>By course</h3>
          <div className="acqr-table">
            <table>
              <thead>
                <tr>
                  <th>Course</th>
                  <th>Country / region</th>
                  <th>Stage</th>
                  <th>Contract</th>
                  <th>Commission</th>
                  <th>Contacts</th>
                  <th>Next follow-up</th>
                </tr>
              </thead>
              <tbody>
                {report.analytics.courses.map((c) => (
                  <tr key={c.prospectId}>
                    <td>
                      <b>{c.courseName}</b>
                    </td>
                    <td>
                      {c.country} · {c.region}
                    </td>
                    <td>{label(c.stage)}</td>
                    <td>{label(c.contractState)}</td>
                    <td>{label(c.commissionReason)}</td>
                    <td>{c.contactCount}</td>
                    <td>{c.nextFollowUpAt || "Not scheduled"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <section className="acqr-jhcc">
            <b>JHCC reporting contract · {JHCC_TRANSMISSION_SCHEMA}</b>
            <p>
              Privacy screening:{" "}
              {report.validation.valid
                ? "passed — no prohibited field or personal value found"
                : `blocked — ${report.validation.prohibitedKeys.join(", ") || `${report.validation.prohibitedValueCount} personal value(s)`}`}
            </p>
            <p>
              Delivery: {label(report.delivery.status)} ·{" "}
              {label(report.delivery.reason)}
            </p>
            <p>{report.delivery.notice}</p>
            <ul>
              {report.limitations.map((limitation) => (
                <li key={limitation}>{limitation}</li>
              ))}
            </ul>
            <div className="acqr-actions">
              <button
                disabled={!report.validation.valid}
                onClick={() => download(acquisitionReportToText(report), "txt")}
              >
                Download TXT
              </button>
              <button
                disabled={!report.validation.valid}
                onClick={() => download(acquisitionReportToCsv(report), "csv")}
              >
                Download CSV
              </button>
              <button disabled={!report.validation.valid} onClick={() => void copy()}>
                {copyFailed
                  ? "Clipboard unavailable"
                  : copied
                    ? "Copied"
                    : "Copy JSON"}
              </button>
              <button disabled={!transmitter}>
                Transmit to JHCC unavailable
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
