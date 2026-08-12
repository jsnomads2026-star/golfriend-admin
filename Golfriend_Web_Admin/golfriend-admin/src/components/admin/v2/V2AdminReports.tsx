/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react';
import { useAdminLocale } from './AdminLocaleContext';
import CommissioningReadiness from './CommissioningReadiness';
import { generateReport, periodRange, REPORT_LOCALES, reportToCsv, reportToJson, reportToTxt } from './reportingModel.mjs';
import { defaultReportTransmitter, localReportingProvider, type ReportingSourceProvider, type ReportTransmitter } from './reportingProvider';
import './V2AdminReports.css';

const label = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
const COPY = Object.fromEntries(REPORT_LOCALES.map((locale: string) => [locale, { title:'Reports to JHCC', warning:'Automatic JHCC delivery awaiting approved reporting contract', period:'Reporting period', generate:'Generate local report', copy:'Copy executive summary', txt:'Export .txt', csv:'Export .csv', json:'Export .json', transmit:'Transmission unavailable', summary:'Executive summary' }]));

export default function V2AdminReports({ provider = localReportingProvider, transmitter = defaultReportTransmitter }: { provider?: ReportingSourceProvider; transmitter?: ReportTransmitter | null }) {
  const [sources, setSources] = useState<any>(null);
  const [error, setError] = useState(false);
  const [kind, setKind] = useState('7d');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [report, setReport] = useState<any>(null);
  const [rangeError, setRangeError] = useState(false);
  const [exportReady, setExportReady] = useState(false);
  const [transmitPreview, setTransmitPreview] = useState(false);
  const locale = useAdminLocale();

  useEffect(() => { void provider.load().then(setSources, () => setError(true)); }, [provider]);
  const copyText = COPY[locale];
  if (error) return <div className="reports-state" role="alert">Source unavailable. <button onClick={() => location.reload()}>Retry</button></div>;
  if (!sources) return <div className="reports-state" role="status">Loading reporting sources…</div>;

  const generate = () => {
    try {
      const period = periodRange(kind, new Date(), { start, end });
      setReport(generateReport({ period, sources, generatedAt: new Date().toISOString() }));
      setRangeError(false);
      setExportReady(true);
    } catch {
      setRangeError(true);
      setReport(null);
    }
  };
  const download = (text: string, type: string, name: string) => {
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(new Blob([text], { type }));
    anchor.download = name;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  };
  const copy = async () => {
    if (report) await navigator.clipboard.writeText(report.executiveSummary.highlights.concat(report.executiveSummary.risks, report.executiveSummary.attention, report.executiveSummary.nextActions).map((item: any) => `[${item.sectionId}] ${item.text}`).join('\n'));
  };

  return <div className="reports-ops">
    <header><div><span>GOLFRIEND OPERATIONS · LOCAL PREPARATION</span><h2>{copyText.title}</h2><p>Prepare traceable Golfriend reports without building or changing JHCC.</p></div><aside><b>{copyText.warning}</b><small>No credentials, endpoint, schedule, upload, or delivery is configured.</small></aside></header>
    <section className="report-controls"><label>Locale<b>{locale.toUpperCase()}</b></label><label>{copyText.period}<select value={kind} onChange={(event) => setKind(event.target.value)}><option value="today">Today</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="custom">Custom</option></select></label>{kind === 'custom' && <><input aria-label="Custom start" type="date" value={start} onChange={(event) => setStart(event.target.value)} /><input aria-label="Custom end" type="date" value={end} onChange={(event) => setEnd(event.target.value)} /></>}<button onClick={generate}>{copyText.generate}</button></section>
    {rangeError && <div className="reports-state is-error">Invalid custom range. Correct the dates and retry.</div>}
    {report && <><section className="report-overview"><article><span>Latest prepared report</span><b>{report.generatedAt}</b></article><article><span>Period</span><b>{report.period.start.slice(0, 10)} — {report.period.end.slice(0, 10)}</b></article>{Object.entries(report.coverage).map(([key, value]) => <article key={key}><span>{label(key)}</span><b>{String(value)}</b></article>)}</section><section className="report-grid"><main>{report.sections.map((section: any) => <article key={section.id} className={`is-${section.status}`}><span>{label(section.id)}</span><b>{label(section.status)}</b><p>{section.sourceLabel}</p><small>{section.sourceKind === 'local-preview' ? 'Preview only · excluded from production totals' : section.sourceKind}</small></article>)}</main><aside><span>{copyText.summary}</span><h3>Traceable highlights and blockers</h3>{report.executiveSummary.highlights.concat(report.executiveSummary.risks, report.executiveSummary.attention, report.executiveSummary.nextActions).map((item: any, index: number) => <p key={`${item.sectionId}-${index}`}><b>{label(item.sectionId)}</b> {item.text}</p>)}<button onClick={() => void copy()}>{copyText.copy}</button></aside></section><section className="report-actions"><button onClick={() => download(reportToTxt(report), 'text/plain', 'golfriend-report.txt')}>{copyText.txt}</button><button onClick={() => download(reportToCsv(report), 'text/csv', 'golfriend-report.csv')}>{copyText.csv}</button><button onClick={() => download(reportToJson(report), 'application/json', 'golfriend-report.json')}>{copyText.json}</button><button onClick={() => setTransmitPreview(true)}>Preview future payload</button><button disabled={!transmitter}>{copyText.transmit}</button></section>{exportReady && <p className="export-ready">Export ready · schema {report.schema} · version {report.version}</p>}{transmitPreview && <div className="transmission"><b>Future transmission preview</b><pre>{JSON.stringify({ schema:report.schema, generatedAt:report.generatedAt, period:report.period, coverage:report.coverage }, null, 2)}</pre><p>{copyText.warning}</p><button disabled>Confirm and send unavailable</button></div>}</>}
    <CommissioningReadiness />
  </div>;
}
