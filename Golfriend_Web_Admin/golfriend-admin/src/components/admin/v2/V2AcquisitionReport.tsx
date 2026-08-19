import { useEffect, useMemo, useState } from "react";
import { useAdminLocale } from "./AdminLocaleContext";
import type { AdminLocale } from "./adminNavigation";
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

const EN = {
  header: "ADMIN · ACQUISITION ANALYTICS",
  title: "Course acquisition reporting",
  description:
    "Country and course-level acquisition analytics prepared for a future approved Golfriend-to-JHCC reporting contract.",
  previewTitle: "Local preview data",
  previewSub:
    "Golfriend Admin manages Golfriend. JHCC receives oversight reporting only and is never the booking engine or a payment processor.",
  periodStart: "Period start",
  periodEnd: "Period end",
  generate: "Generate acquisition report",
  fail: "Acquisition analytics source unavailable. Retry after an approved source is configured.",
  loading: "Loading acquisition analytics…",
  reload: "Retry",
  reportStatusNo: "No report generated yet.",
  reportStatusSuffix: "Generate to review this surface.",
  reportStatusPrefix: "Deliverable",
  statusScreen: "screen",
  statusAuthorization: "authorization",
  statusTransmitter: "transmitter",
  statusGenerated: "generated",
  prospects: "Prospects",
  countries: "Countries",
  commissionEffective: "Commission-effective",
  opportunityEvidenceOnly: "Opportunity evidence only",
  byCountry: "By country",
  byCourse: "By course",
  country: "Country",
  prospectsHeader: "Prospects",
  commissionEffectiveHeader: "Commission-effective",
  attribution: "Attribution",
  bookingInterest: "Booking interest",
  confirmedBookings: "Confirmed bookings",
  course: "Course",
  countryRegion: "Country / region",
  stage: "Stage",
  contract: "Contract",
  commission: "Commission",
  contacts: "Contacts",
  nextFollowUp: "Next follow-up",
  withheld: "Withheld — {reason}",
  partial: "{value} (partial — {contributing} of {total} courses reporting)",
  jhccContract: "JHCC reporting contract",
  privacyStatus: "Privacy screening: ",
  privacyOk: "passed — no prohibited field or personal value found",
  privacyBlocked: "blocked — {reason}",
  deliveryStatus: "Delivery: ",
  deliveryStatusFallback: "{status} · {reason}",
  gatePrivacy: "Privacy screen: ",
  gateAuthorization: "Authorization: ",
  gateTransmitter: "Transmitter: ",
  statePassed: "passed",
  stateBlocked: "blocked",
  stateYes: "yes",
  stateNo: "no",
  stateApproved: "approved",
  stateNotApproved: "not approved",
  stateMounted: "mounted",
  stateNotMounted: "not mounted",
  deliveryNotice:
    "Delivery requires all three conditions. An approved authorization alone is never sufficient.",
  noSchedule: "Not scheduled",
  downloadTxt: "Download TXT",
  downloadCsv: "Download CSV",
  copyJson: "Copy JSON",
  copied: "Copied",
  copyBlocked: "Clipboard unavailable",
  transmitUnavailable: "Transmit to JHCC unavailable",
};

const ACQUISITION_COPY: Record<AdminLocale, typeof EN> = {
  en: EN,
  th: {
    ...EN,
    header: "แอดมิน · การวิเคราะห์การได้ลูกค้า",
    title: "รายงานการได้ลูกค้าหลักสูตร",
    description:
      "การวิเคราะห์การได้ลูกค้าในระดับประเทศและหลักสูตรสำหรับสัญญาการรายงาน Golfriend-to-JHCC ที่อนุมัติในอนาคต",
    previewTitle: "ข้อมูลตัวอย่างภายใน",
    previewSub:
      "Golfriend Admin บริหารจัดการ Golfriend ข้อมูลสำหรับ JHCC เป็นการรายงานตรวจสอบเท่านั้นและไม่เคยเป็นระบบจองหรือผู้ประมวลผลการชำระเงิน",
    periodStart: "ช่วงเวลาระยะแรก",
    periodEnd: "ช่วงเวลาระยะท้าย",
    generate: "สร้างรายงานการได้ลูกค้า",
    fail: "ไม่สามารถโหลดข้อมูลการวิเคราะห์การได้ลูกค้าได้ ลองใหม่อีกครั้งเมื่อกำหนดแหล่งที่อนุมัติแล้ว",
    loading: "กำลังโหลดการวิเคราะห์การได้ลูกค้า…",
    reportStatusNo: "ยังไม่มีรายงานที่สร้างขึ้น",
    reportStatusSuffix: "สร้างเพื่อทบทวนข้อมูลนี้",
    prospects: "แนวโน้ม",
    countries: "ประเทศ",
    commissionEffective: "ผลักดันค่าส่งเสริม",
    opportunityEvidenceOnly: "เฉพาะหลักฐานโอกาส",
    byCountry: "ตามประเทศ",
    byCourse: "ตามหลักสูตร",
    country: "ประเทศ",
    prospectsHeader: "แนวโน้ม",
    commissionEffectiveHeader: "การเรียกเก็บค่านายหน้า",
    attribution: "ที่มาของข้อมูล",
    bookingInterest: "ความสนใจการจอง",
    confirmedBookings: "การจองที่ยืนยัน",
    course: "หลักสูตร",
    countryRegion: "ประเทศ / เขต",
    stage: "ขั้นตอน",
    contract: "สัญญา",
    commission: "ค่าคอมมิชชั่น",
    contacts: "ผู้ติดต่อ",
    nextFollowUp: "ติดตามครั้งถัดไป",
    statePassed: "ผ่าน",
    stateBlocked: "ถูกบล็อก",
    stateYes: "ใช่",
    stateNo: "ไม่",
    stateApproved: "อนุมัติ",
    stateNotApproved: "ยังไม่อนุมัติ",
    stateMounted: "เชื่อมต่อแล้ว",
    stateNotMounted: "ยังไม่เชื่อมต่อ",
    noSchedule: "ยังไม่นัดหมาย",
    copyJson: "คัดลอก JSON",
    copied: "คัดลอกแล้ว",
    copyBlocked: "ไม่สามารถคัดลอกได้",
  },
  ko: {
    ...EN,
    header: "관리자 · 획득 분석",
    title: "코스 획득 보고서",
    description:
      "향후 승인된 Golfriend-to-JHCC 보고 계약을 위해 국가 및 코스 수준의 획득 분석을 준비합니다.",
    previewTitle: "로컬 미리보기 데이터",
    periodStart: "시작일",
    periodEnd: "종료일",
    generate: "획득 보고서 생성",
    statusScreen: "검증",
    statusAuthorization: "권한",
    statusTransmitter: "송신기",
    noSchedule: "미예약",
  },
  ja: {
    ...EN,
    header: "管理者 · アクイジション分析",
    title: "コース獲得レポート",
    description:
      "将来の承認済み Golfriend-to-JHCC 報告契約向けの、国別・コース別アクイジション分析です。",
    previewTitle: "ローカルプレビュー",
    periodStart: "開始日",
    periodEnd: "終了日",
    generate: "獲得レポートを生成",
  },
  zh: {
    ...EN,
    header: "管理员 · 获取分析",
    title: "课程获客报告",
    description: "为未来获得批准的 Golfriend-to-JHCC 报告合同准备国家/课程级别的获客分析。",
    previewTitle: "本地预览数据",
    periodStart: "开始日期",
    periodEnd: "结束日期",
    generate: "生成获取报告",
  },
  es: {
    ...EN,
    header: "ADMIN · ANÁLISIS DE ADQUISICIÓN",
    title: "Informe de adquisición de cursos",
    description:
      "Análisis de adquisición por país y curso preparado para un contrato futuro aprobado de reporte Golfriend-to-JHCC.",
    previewTitle: "Datos de vista previa local",
    periodStart: "Inicio del período",
    periodEnd: "Fin del período",
    generate: "Generar informe de adquisición",
  },
  fr: {
    ...EN,
    header: "ADMIN · ANALYSE D'ACQUISITION",
    title: "Rapport d'acquisition de cours",
    description:
      "Analyse d'acquisition par pays et par cours préparée pour un futur contrat de reporting Golfriend-to-JHCC approuvé.",
    previewTitle: "Données de prévisualisation locale",
    periodStart: "Début de période",
    periodEnd: "Fin de période",
    generate: "Générer le rapport d'acquisition",
  },
  de: {
    ...EN,
    header: "ADMIN · ERFASSUNGSANALYSE",
    title: "Kursakquisitionsbericht",
    description:
      "Länder- und kursbezogene Akquisitionsanalyse für einen zukünftigen freigegebenen Golfriend-to-JHCC-Berichtsvertrag.",
    previewTitle: "Lokale Vorschau Daten",
    periodStart: "Zeitraumbeginn",
    periodEnd: "Zeitraumende",
    generate: "Akquisitionsbericht erstellen",
  },
};

const shown = (d: {
  disclosed: boolean;
  value: number | null;
  reason: string;
  partialCoverage: boolean;
  coverage: { contributing: number; total: number };
}) =>
  !d.disclosed
    ? `Withheld — ${d.reason}`
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

  const locale = useAdminLocale();
  const copy = ACQUISITION_COPY[locale];

  useEffect(() => {
    void provider.load().then(setSnap, () => setFailed(true));
  }, [provider]);

  const prospects = useMemo(() => snap?.prospects || [], [snap]);

  if (failed)
    return (
      <div className="acqr-state" role="alert">
        {copy.fail}
        <button type="button" onClick={() => window.location.reload()}>
          {copy.reload}
        </button>
      </div>
    );
  if (!snap)
    return (
      <div className="acqr-state" role="status">
        {copy.loading}
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

  const copyOut = async () => {
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
          <span>{copy.header}</span>
          <h2>{copy.title}</h2>
          <p>{copy.description}</p>
        </div>
        <aside>
          <b>{copy.previewTitle}</b>
          <small>{copy.previewSub}</small>
        </aside>
      </header>
      <div className="acqr-tools">
        <label htmlFor="acqr-start">{copy.periodStart}</label>
        <input
          id="acqr-start"
          type="date"
          value={periodStart}
          onChange={(e) => setPeriodStart(e.target.value)}
        />
        <label htmlFor="acqr-end">{copy.periodEnd}</label>
        <input
          id="acqr-end"
          type="date"
          value={periodEnd}
          onChange={(e) => setPeriodEnd(e.target.value)}
        />
        <button onClick={generate}>{copy.generate}</button>
      </div>
      <p className="acqr-live" role="status" aria-live="polite">
        {report
          ? `${copy.reportStatusPrefix}: ${copy[report.delivery.deliverable ? "stateYes" : "stateNo"]} · ${copy.statusScreen} ${copy[report.validation.valid ? "statePassed" : "stateBlocked"]} · ${copy.statusAuthorization} ${report.delivery.authorized ? copy.stateApproved : copy.stateNotApproved} · ${copy.statusTransmitter} ${report.delivery.transmitterMounted ? copy.stateMounted : copy.stateNotMounted} · ${copy.statusGenerated} ${report.generatedAt}`
          : `${copy.reportStatusNo} ${copy.reportStatusSuffix}`}
      </p>
      {!report ? (
        <div className="acqr-state">{copy.reportStatusNo}</div>
      ) : (
        <>
          <section className="acqr-metrics">
            <article>
              <span>{copy.prospects}</span>
              <b>{report.analytics.totals.prospects}</b>
            </article>
            <article>
              <span>{copy.countries}</span>
              <b>{report.analytics.totals.countries}</b>
            </article>
            <article>
              <span>{copy.commissionEffective}</span>
              <b>{report.analytics.totals.commissionEffective}</b>
            </article>
            <article>
              <span>{copy.opportunityEvidenceOnly}</span>
              <b>{report.analytics.totals.opportunityEvidenceOnly}</b>
            </article>
          </section>
          <h3>{copy.byCountry}</h3>
          <div className="acqr-table">
            <table>
              <thead>
                <tr>
                  <th>{copy.country}</th>
                  <th>{copy.prospectsHeader}</th>
                  <th>{copy.commissionEffectiveHeader}</th>
                  <th>{copy.attribution}</th>
                  <th>{copy.bookingInterest}</th>
                  <th>{copy.confirmedBookings}</th>
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
          <h3>{copy.byCourse}</h3>
          <div className="acqr-table">
            <table>
              <thead>
                <tr>
                  <th>{copy.course}</th>
                  <th>{copy.countryRegion}</th>
                  <th>{copy.stage}</th>
                  <th>{copy.contract}</th>
                  <th>{copy.commission}</th>
                  <th>{copy.contacts}</th>
                  <th>{copy.nextFollowUp}</th>
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
                    <td>{c.nextFollowUpAt || copy.noSchedule}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <section className="acqr-jhcc">
            <b>
              {copy.jhccContract} · {JHCC_TRANSMISSION_SCHEMA}
            </b>
            <p>
              {copy.privacyStatus}
              {report.validation.valid
                ? copy.privacyOk
                : copy.privacyBlocked.replace(
                    "{reason}",
                    report.validation.prohibitedKeys.join(", ") ||
                      `${report.validation.prohibitedValueCount} personal value(s)`,
                  )}
            </p>
            <p>
              {copy.deliveryStatus}
              {copy.deliveryStatusFallback
                .replace("{status}", label(report.delivery.status))
                .replace("{reason}", label(report.delivery.reason))}
            </p>
            <ul className="acqr-gate">
              <li>
                {copy.gatePrivacy}
                {report.validation.valid
                  ? copy.statePassed
                  : copy.stateBlocked}
              </li>
              <li>
                {copy.gateAuthorization}
                {report.delivery.authorized ? copy.stateApproved : copy.stateNotApproved}
              </li>
              <li>
                {copy.gateTransmitter}
                {report.delivery.transmitterMounted
                  ? copy.stateMounted
                  : copy.stateNotMounted}
              </li>
            </ul>
            <p>{copy.deliveryNotice}</p>
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
                {copy.downloadTxt}
              </button>
              <button
                disabled={!report.validation.valid}
                onClick={() => download(acquisitionReportToCsv(report), "csv")}
              >
                {copy.downloadCsv}
              </button>
              <button disabled={!report.validation.valid} onClick={() => void copyOut()}>
                {copyFailed
                  ? copy.copyBlocked
                  : copied
                    ? copy.copied
                    : copy.copyJson}
              </button>
              <button disabled={!transmitter}>
                {copy.transmitUnavailable}
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
