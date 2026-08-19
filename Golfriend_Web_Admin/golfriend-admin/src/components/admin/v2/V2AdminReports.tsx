/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { useAdminLocale } from "./AdminLocaleContext";
import CommissioningReadiness from "./CommissioningReadiness";
import AdminJhccFinancePanel from "./AdminJhccFinancePanel";
import { generateReport, periodRange, REPORT_LOCALES, reportToCsv, reportToJson, reportToTxt } from "./reportingModel.mjs";
import { defaultReportTransmitter, localReportingProvider, type ReportingSourceProvider, type ReportTransmitter } from "./reportingProvider";
import "./V2AdminReports.css";

const baseSections = {
  course_operations: "Course operations",
  booking_operations: "Booking operations",
  partner_onboarding: "Partner onboarding",
  marketing_store: "Marketing store",
  advertising: "Advertising",
  oem_exchange: "OEM / Exchange publishing",
  service_health: "Service health",
  security_precommission: "Security precommission",
  data_quality: "Data quality",
  jhcc_assistance: "JHCC assistance",
};

const COPY = Object.fromEntries(
  REPORT_LOCALES.map((locale: string) => [
    locale,
    {
      title: "Reports to JHCC",
      titleBanner: "GOLFRIEND OPERATIONS · LOCAL PREPARATION",
      intro: "Prepare traceable Golfriend reports without building or changing JHCC.",
      warning: "Automatic JHCC delivery awaiting approved reporting contract",
      warningDetail: "No credentials, endpoint, schedule, upload, or delivery is configured.",
      locale: "Locale",
      period: "Reporting period",
      periodOptions: {
        today: "Today",
        "7d": "Last 7 days",
        "30d": "Last 30 days",
        custom: "Custom",
      },
      customStartLabel: "Custom start",
      customEndLabel: "Custom end",
      generate: "Generate local report",
      latest: "Latest prepared report",
      periodLabel: "Period",
      coverageLabel: "Coverage",
      coverageKeys: {
        complete: "Complete",
        partial: "Partial",
        unavailable: "Unavailable",
        stale: "Stale",
      },
      sectionId: "Section",
      status: "Status",
      sectionStatusLabels: {
        complete: "Complete",
        partial: "Partial",
        unavailable: "Unavailable",
        stale: "Stale",
      },
      sourceLabel: "Source",
      sourceKindLabel: "Source type",
      sourceKindLabels: {
        trusted: "Trusted",
        partial: "Partial",
        unavailable: "Unavailable",
        local: "Local",
        local_preview: "Preview source",
        "local-preview": "Preview source",
      },
      summaryTitle: "Executive summary",
      summaryLead: "Traceable highlights and blockers",
      copySummary: "Copy executive summary",
      noSummary: "No report available.",
      txt: "Export .txt",
      csv: "Export .csv",
      json: "Export .json",
      previewPayload: "Preview future payload",
      transmit: "Transmission unavailable",
      previewUnavailable: "Confirm and send unavailable",
      exportReady: "Export ready",
      schema: "schema",
      version: "version",
      loading: "Loading reporting sources…",
      error: "Source unavailable.",
      retry: "Retry",
      retryAria: "Retry loading reporting sources",
      rangeError: "Invalid custom range. Correct the dates and retry.",
      sourceFallback: "No report source",
      previewHint: "Preview only · excluded from production totals",
      dateLabel: "Date",
      sections: baseSections,
    },
  ])
);

const localeCopy = {
  ...COPY,
  en: COPY.en,
  th: {
    ...COPY.en,
    title: "รายงานไปยัง JHCC",
    warning: "การส่ง JHCC อัตโนมัติรอการอนุมัติข้อตกลงรายงาน",
    warningDetail: "ยังไม่ได้ตั้งค่าข้อมูลรับรอง, endpoint, กำหนดตารางเวลา, การอัปโหลด หรือการส่งมอบ",
    locale: "ภาษา",
    period: "ช่วงเวลารายงาน",
    periodOptions: { ...COPY.en.periodOptions, today: "วันนี้", "7d": "7 วันล่าสุด", "30d": "30 วันล่าสุด", custom: "กำหนดเอง" },
    customStartLabel: "วันที่เริ่มต้นกำหนดเอง",
    customEndLabel: "วันที่สิ้นสุดกำหนดเอง",
    generate: "สร้างรายงานในระบบ",
    latest: "รายงานที่จัดเตรียมล่าสุด",
    periodLabel: "ช่วงเวลา",
    coverageLabel: "ความคุ้มคลุม",
    coverageKeys: { ...COPY.en.coverageKeys, complete: "ครบถ้วน", partial: "บางส่วน", unavailable: "ไม่มี", stale: "ล้าสมัย" },
    sectionId: "หมวด",
    status: "สถานะ",
    sectionStatusLabels: { ...COPY.en.sectionStatusLabels, complete: "สำเร็จ", partial: "บางส่วน", unavailable: "ไม่มี", stale: "ล้าสมัย" },
    sourceLabel: "แหล่งที่มา",
    sourceKindLabel: "ประเภทแหล่งข้อมูล",
    sourceKindLabels: { ...COPY.en.sourceKindLabels, trusted: "เชื่อถือได้", local: "ท้องถิ่น", unavailable: "ไม่ได้กำหนด", "local-preview": "เฉพาะโหมดดูตัวอย่าง" },
    summaryTitle: "สรุปผู้บริหาร",
    summaryLead: "ไฮไลต์และอุปสรรคที่ติดตามได้",
    copySummary: "คัดลอกสรุปผู้บริหาร",
    txt: "ส่งออก .txt",
    csv: "ส่งออก .csv",
    json: "ส่งออก .json",
    previewPayload: "ดูตัวอย่าง payload ล่วงหน้า",
    previewUnavailable: "ยืนยันและไม่สามารถส่งได้",
    exportReady: "พร้อมส่งออก",
    retryAria: "ลองโหลดแหล่งข้อมูลรายงานอีกครั้ง",
    retry: "ลองใหม่",
    rangeError: "ช่วงวันที่กำหนดเองไม่ถูกต้อง แก้ไขวันที่แล้วลองอีกครั้ง",
    sourceFallback: "ไม่มีแหล่งข้อมูลรายงาน",
    noSummary: "ไม่พบข้อมูลสรุป",
    previewHint: "โหมดดูตัวอย่างเท่านั้น · ไม่ถูกรวมในยอดผลิต",
    dateLabel: "วันที่",
    sections: { ...baseSections, course_operations: "ปฏิบัติการสนาม", booking_operations: "ปฏิบัติการจอง", partner_onboarding: "การสมัครพันธมิตร", marketing_store: "คลังสินค้า", advertising: "โฆษณา", oem_exchange: "การเผยแพร่ OEM / Exchange", service_health: "สุขภาพบริการ", security_precommission: "ความปลอดภัยก่อนเริ่มใช้งาน", data_quality: "คุณภาพข้อมูล", jhcc_assistance: "การช่วยเหลือ JHCC" },
  },
  ko: {
    ...COPY.en,
    title: "JHCC 보고서",
    warning: "승인된 보고 계약을 기다리는 JHCC 자동 전송",
    warningDetail: "자격증명, 엔드포인트, 스케줄, 업로드 또는 전달이 구성되지 않았습니다.",
    locale: "언어",
    period: "보고 기간",
    periodOptions: { ...COPY.en.periodOptions, today: "오늘", "7d": "지난 7일", "30d": "지난 30일", custom: "직접 입력" },
    customStartLabel: "시작 날짜",
    customEndLabel: "종료 날짜",
    generate: "로컬 보고서 생성",
    latest: "최신 준비 보고서",
    periodLabel: "기간",
    coverageLabel: "커버리지",
    sectionId: "영역",
    status: "상태",
    sourceLabel: "소스",
    sourceKindLabel: "소스 유형",
    sourceKindLabels: { ...COPY.en.sourceKindLabels, trusted: "신뢰", local: "로컬", unavailable: "없음", "local-preview": "미리보기" },
    summaryTitle: "실행 요약",
    summaryLead: "추적 가능한 하이라이트 및 차단 항목",
    copySummary: "요약 복사",
    previewPayload: "향후 전달 본문 미리보기",
    previewUnavailable: "확인 후 전송 불가",
    retry: "다시 시도",
    retryAria: "보고서 소스 다시 로드",
    sourceFallback: "소스 없음",
    noSummary: "보고 내용 없음",
    sections: { ...baseSections, course_operations: "코스 운영", booking_operations: "예약 운영", partner_onboarding: "파트너 온보딩", marketing_store: "마케팅 스토어", advertising: "광고", oem_exchange: "OEM / Exchange 게시", service_health: "서비스 상태", security_precommission: "보안 사전 점검", data_quality: "데이터 품질", jhcc_assistance: "JHCC 지원" },
  },
  ja: {
    ...COPY.en,
    title: "JHCCへのレポート",
    warning: "承認済みのレポート契約を待つJHCC自動送信",
    warningDetail: "認証情報、エンドポイント、スケジュール、アップロード、配信は未設定です。",
    locale: "言語",
    period: "報告期間",
    periodOptions: { ...COPY.en.periodOptions, today: "今日", "7d": "過去7日間", "30d": "過去30日間", custom: "カスタム" },
    customStartLabel: "カスタム開始日",
    customEndLabel: "カスタム終了日",
    generate: "ローカルレポート作成",
    latest: "最新の準備済みレポート",
    periodLabel: "期間",
    coverageLabel: "カバレッジ",
    sectionId: "セクション",
    status: "ステータス",
    sourceLabel: "ソース",
    sourceKindLabel: "ソース種別",
    sourceKindLabels: { ...COPY.en.sourceKindLabels, trusted: "信頼", local: "ローカル", unavailable: "なし", "local-preview": "プレビュー" },
    summaryTitle: "エグゼクティブサマリー",
    summaryLead: "追跡可能なハイライトとブロッカー",
    copySummary: "サマリーをコピー",
    previewPayload: "将来ペイロードのプレビュー",
    previewUnavailable: "確認して送信不可",
    retry: "再試行",
    retryAria: "レポートソースを再読込",
    sourceFallback: "ソースなし",
    noSummary: "レポートなし",
    sections: { ...baseSections, course_operations: "コース運営", booking_operations: "予約運営", partner_onboarding: "パートナー申請", marketing_store: "マーケティングストア", advertising: "広告", oem_exchange: "OEM / Exchange 公開", service_health: "サービス健全性", security_precommission: "セキュリティ事前審査", data_quality: "データ品質", jhcc_assistance: "JHCCサポート" },
  },
  zh: {
    ...COPY.en,
    title: "JHCC报表",
    warning: "等待已批准的报告合约的JHCC自动提交",
    warningDetail: "未配置凭证、端点、计划、上传或交付。",
    locale: "语言",
    period: "报告周期",
    periodOptions: { ...COPY.en.periodOptions, today: "今天", "7d": "最近7天", "30d": "最近30天", custom: "自定义" },
    customStartLabel: "自定义开始",
    customEndLabel: "自定义结束",
    generate: "生成本地报表",
    latest: "最新已准备报表",
    periodLabel: "周期",
    coverageLabel: "覆盖",
    sectionId: "模块",
    status: "状态",
    sourceLabel: "来源",
    sourceKindLabel: "来源类型",
    sourceKindLabels: { ...COPY.en.sourceKindLabels, trusted: "可信", local: "本地", unavailable: "无", "local-preview": "预览" },
    summaryTitle: "执行摘要",
    summaryLead: "可追踪摘要与阻塞点",
    copySummary: "复制执行摘要",
    previewPayload: "预览未来载荷",
    previewUnavailable: "确认后暂不可发送",
    retry: "重试",
    retryAria: "重新加载报告源",
    sourceFallback: "无可用源",
    noSummary: "暂无报表",
    sections: { ...baseSections, course_operations: "球场运营", booking_operations: "预约运营", partner_onboarding: "合作方入驻", marketing_store: "营销素材库", advertising: "广告", oem_exchange: "OEM/Exchange 发布", service_health: "服务健康", security_precommission: "预启用安全", data_quality: "数据质量", jhcc_assistance: "JHCC协助" },
  },
  es: {
    ...COPY.en,
    title: "Informes de JHCC",
    warning: "Entrega automática de JHCC a la espera de contrato aprobado",
    warningDetail: "No hay credenciales, endpoint, programación, carga o entrega configurados.",
    locale: "Idioma",
    period: "Período del informe",
    periodOptions: { ...COPY.en.periodOptions, today: "Hoy", "7d": "Últimos 7 días", "30d": "Últimos 30 días", custom: "Personalizado" },
    customStartLabel: "Inicio personalizado",
    customEndLabel: "Fin personalizado",
    generate: "Generar informe local",
    latest: "Informe preparado más reciente",
    periodLabel: "Período",
    sectionId: "Sección",
    status: "Estado",
    sourceLabel: "Fuente",
    sourceKindLabel: "Tipo de fuente",
    sourceKindLabels: { ...COPY.en.sourceKindLabels, trusted: "Confiable", local: "Local", unavailable: "No disponible", "local-preview": "Vista previa" },
    summaryTitle: "Resumen ejecutivo",
    summaryLead: "Puntos e incidencias trazables",
    copySummary: "Copiar resumen ejecutivo",
    previewPayload: "Previsualizar payload futuro",
    previewUnavailable: "Confirmar y envío no disponible",
    retry: "Reintentar",
    retryAria: "Reintentar cargar las fuentes del informe",
    sourceFallback: "Sin fuente",
    noSummary: "No hay informe",
    sections: { ...baseSections, course_operations: "Operaciones de campo", booking_operations: "Operaciones de reserva", partner_onboarding: "Onboarding del partner", marketing_store: "Tienda de marketing", advertising: "Publicidad", oem_exchange: "Publicación OEM/Exchange", service_health: "Salud del servicio", security_precommission: "Precomisionamiento de seguridad", data_quality: "Calidad de datos", jhcc_assistance: "Asistencia JHCC" },
  },
  fr: {
    ...COPY.en,
    title: "Rapports JHCC",
    warning: "Transmission automatique JHCC en attente du contrat de reporting approuvé",
    warningDetail: "Aucun identifiant, endpoint, planning, upload ou livraison n’est configuré.",
    locale: "Langue",
    period: "Période de rapport",
    periodOptions: { ...COPY.en.periodOptions, today: "Aujourd'hui", "7d": "7 derniers jours", "30d": "30 derniers jours", custom: "Personnalisé" },
    customStartLabel: "Début personnalisé",
    customEndLabel: "Fin personnalisée",
    generate: "Générer un rapport local",
    latest: "Dernier rapport préparé",
    periodLabel: "Période",
    coverageLabel: "Couverture",
    sectionId: "Section",
    status: "Statut",
    sourceLabel: "Source",
    sourceKindLabel: "Type de source",
    sourceKindLabels: { ...COPY.en.sourceKindLabels, trusted: "Fiable", local: "Local", unavailable: "Indisponible", "local-preview": "Prévisualisation" },
    summaryTitle: "Résumé exécutif",
    summaryLead: "Points saillants et blocages traçables",
    copySummary: "Copier le résumé exécutif",
    previewPayload: "Prévisualiser le payload futur",
    previewUnavailable: "Confirmer et indisponible",
    retry: "Réessayer",
    retryAria: "Recharger les sources de rapport",
    sourceFallback: "Aucune source",
    noSummary: "Aucun rapport",
    sections: { ...baseSections, course_operations: "Opérations de parcours", booking_operations: "Opérations de réservation", partner_onboarding: "Intégration partenaires", marketing_store: "Magasin marketing", advertising: "Publicité", oem_exchange: "Publication OEM / Exchange", service_health: "Santé du service", security_precommission: "Précommissionnement", data_quality: "Qualité des données", jhcc_assistance: "Assistance JHCC" },
  },
  de: {
    ...COPY.en,
    title: "Berichte für JHCC",
    warning: "Übermittlung an JHCC ausstehend auf genehmigten Reporting-Vertrag",
    warningDetail: "Keine Zugangsdaten, Endpunkt, Zeitplan, Upload oder Zustellung konfiguriert.",
    locale: "Sprache",
    period: "Berichtszeitraum",
    periodOptions: { ...COPY.en.periodOptions, today: "Heute", "7d": "Letzte 7 Tage", "30d": "Letzte 30 Tage", custom: "Benutzerdefiniert" },
    customStartLabel: "Startdatum",
    customEndLabel: "Enddatum",
    generate: "Lokalen Bericht erstellen",
    latest: "Zuletzt vorbereiteter Bericht",
    periodLabel: "Zeitraum",
    coverageLabel: "Abdeckung",
    sectionId: "Bereich",
    status: "Status",
    sourceLabel: "Quelle",
    sourceKindLabel: "Quellentyp",
    sourceKindLabels: { ...COPY.en.sourceKindLabels, trusted: "Vertrauenswürdig", local: "Lokal", unavailable: "Nicht verfügbar", "local-preview": "Vorschau" },
    summaryTitle: "Zusammenfassung",
    summaryLead: "Nachverfolgbare Highlights und Blocker",
    copySummary: "Zusammenfassung kopieren",
    previewPayload: "Zukünftige Nutzdaten-Vorschau",
    previewUnavailable: "Bestätigen und nicht sendbar",
    retry: "Wiederholen",
    retryAria: "Berichtsquellen neu laden",
    sourceFallback: "Keine Quelle",
    noSummary: "Kein Bericht",
    sections: { ...baseSections, course_operations: "Platzbetrieb", booking_operations: "Buchungsbetrieb", partner_onboarding: "Partner-Onboarding", marketing_store: "Marketing-Shop", advertising: "Werbung", oem_exchange: "OEM / Exchange Publishing", service_health: "Servicezustand", security_precommission: "Sicherheits-Vorbereitung", data_quality: "Datenqualität", jhcc_assistance: "JHCC-Unterstützung" },
  },
};

const COPY_TEXT = localeCopy as Record<
  "en" | "th" | "ko" | "ja" | "zh" | "es" | "fr" | "de",
  (typeof localeCopy)[keyof typeof localeCopy]
>;

const labelFromMap = (key: string, map: Record<string, string>) => map[key] || key;

export default function V2AdminReports({
  provider = localReportingProvider,
  transmitter = defaultReportTransmitter,
}: {
  provider?: ReportingSourceProvider;
  transmitter?: ReportTransmitter | null;
}) {
  const [sources, setSources] = useState<any>(null);
  const [error, setError] = useState(false);
  const [kind, setKind] = useState("7d");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [report, setReport] = useState<any>(null);
  const [rangeError, setRangeError] = useState(false);
  const [exportReady, setExportReady] = useState(false);
  const [transmitPreview, setTransmitPreview] = useState(false);
  const locale = useAdminLocale();
  const copy = COPY_TEXT[locale] || COPY_TEXT.en;

  useEffect(() => {
    void provider.load().then(setSources, () => setError(true));
  }, [provider]);

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
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(new Blob([text], { type }));
    anchor.download = name;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  };

  const copySummary = async () => {
    if (report) {
      await navigator.clipboard.writeText(
        report.executiveSummary.highlights
          .concat(report.executiveSummary.risks, report.executiveSummary.attention, report.executiveSummary.nextActions)
          .map((item: any) => `[${item.sectionId}] ${item.text}`)
          .join("\n")
      );
    }
  };

  if (error) {
    return (
      <div className="reports-state" role="alert">
        <p>{copy.error}</p>
        <button type="button" onClick={() => location.reload()} aria-label={copy.retryAria}>
          {copy.retry}
        </button>
      </div>
    );
  }

  if (!sources) {
    return (
      <div className="reports-state" role="status">
        {copy.loading}
      </div>
    );
  }

  return (
    <div className="reports-ops">
      <header>
        <div>
          <span>{copy.titleBanner}</span>
          <h2>{copy.title}</h2>
          <p>{copy.intro}</p>
        </div>
        <aside>
          <b>{copy.warning}</b>
          <small>{copy.warningDetail}</small>
        </aside>
      </header>

      <section className="report-controls">
        <label>
          {copy.locale}
          <b>{locale.toUpperCase()}</b>
        </label>
        <label>
          {copy.period}
          <select value={kind} onChange={(event) => setKind(event.target.value)}>
            <option value="today">{copy.periodOptions.today}</option>
            <option value="7d">{copy.periodOptions["7d"]}</option>
            <option value="30d">{copy.periodOptions["30d"]}</option>
            <option value="custom">{copy.periodOptions.custom}</option>
          </select>
        </label>
        {kind === "custom" && (
          <>
            <label>
              {copy.customStartLabel}
              <input
                aria-label={copy.customStartLabel}
                type="date"
                value={start}
                onChange={(event) => setStart(event.target.value)}
              />
            </label>
            <label>
              {copy.customEndLabel}
              <input
                aria-label={copy.customEndLabel}
                type="date"
                value={end}
                onChange={(event) => setEnd(event.target.value)}
              />
            </label>
          </>
        )}
        <button onClick={generate}>{copy.generate}</button>
      </section>

      {rangeError && <div className="reports-state is-error">{copy.rangeError}</div>}

      {report && (
        <>
          <section className="report-overview">
            <article>
              <span>{copy.latest}</span>
              <b>{report.generatedAt}</b>
            </article>
            <article>
              <span>{copy.periodLabel}</span>
              <b>
                {report.period.start.slice(0, 10)} — {report.period.end.slice(0, 10)}
              </b>
            </article>
            {Object.entries(report.coverage).map(([key, value]) => (
              <article key={key}>
                <span>{labelFromMap(key, copy.coverageKeys)}</span>
                <b>{String(value)}</b>
              </article>
            ))}
          </section>

          <section className="report-grid">
            <section className="panel-region">
              {report.sections.map((section: any) => (
                <article key={section.id} className={`is-${section.status}`}>
                  <span>{labelFromMap(section.id, copy.sections)}</span>
                  <b>
                    {copy.status}: {labelFromMap(section.status, copy.sectionStatusLabels)}
                  </b>
                  <p>
                    {copy.sourceLabel}: {section.sourceLabel || copy.sourceFallback}
                  </p>
                  <small>
                    {copy.sourceKindLabel}:{" "}
                    {(section.sourceKind === "local-preview" && section.sourceLabel === copy.sourceFallback) || section.sourceKind === "local-preview"
                      ? copy.previewHint
                      : labelFromMap(section.sourceKind, copy.sourceKindLabels)}
                  </small>
                </article>
              ))}
            </section>

            <aside>
              <span>{copy.summaryTitle}</span>
              <h3>{copy.summaryLead}</h3>
              {report.executiveSummary.highlights.concat(
                report.executiveSummary.risks,
                report.executiveSummary.attention,
                report.executiveSummary.nextActions
              ).length ? (
                report.executiveSummary.highlights
                  .concat(
                    report.executiveSummary.risks,
                    report.executiveSummary.attention,
                    report.executiveSummary.nextActions
                  )
                  .map((item: any, index: number) => (
                    <p key={`${item.sectionId}-${index}`}>
                      <b>{labelFromMap(item.sectionId, copy.sections)}</b> {item.text}
                    </p>
                  ))
              ) : (
                <p>{copy.noSummary}</p>
              )}
              <button onClick={() => void copySummary()}>{copy.copySummary}</button>
            </aside>
          </section>

          <section className="report-actions">
            <button onClick={() => download(reportToTxt(report), "text/plain", "golfriend-report.txt")}>
              {copy.txt}
            </button>
            <button onClick={() => download(reportToCsv(report), "text/csv", "golfriend-report.csv")}>
              {copy.csv}
            </button>
            <button onClick={() => download(reportToJson(report), "application/json", "golfriend-report.json")}>
              {copy.json}
            </button>
            <button onClick={() => setTransmitPreview(true)}>{copy.previewPayload}</button>
            <button disabled={!transmitter}>{copy.transmit}</button>
          </section>

          {exportReady && (
            <p className="export-ready">
              {copy.exportReady} · {copy.schema} {report.schema} · {copy.version} {report.version}
            </p>
          )}

          {transmitPreview && (
            <div className="transmission">
              <b>{copy.previewPayload}</b>
              <pre>
                {JSON.stringify(
                  { schema: report.schema, generatedAt: report.generatedAt, period: report.period, coverage: report.coverage },
                  null,
                  2
                )}
              </pre>
              <p>{copy.warning}</p>
              <button disabled>{copy.previewUnavailable}</button>
            </div>
          )}
        </>
      )}

      <AdminJhccFinancePanel />
      <CommissioningReadiness />
    </div>
  );
}
