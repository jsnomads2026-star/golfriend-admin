// ==========================================
// FILE: src/components/admin/booking/BookingReportView.tsx
// C2D — Booking operations report UI.
// Streams bookings, passes data to BookingReport aggregator, renders results.
// No Firestore writes; export is local only. JHCC transmission: unavailable.
// ==========================================
import { useState, useEffect, useMemo, useCallback } from 'react';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from '../../../firebaseConfig';
import { V2Theme } from '../../../theme/v2Theme';
import { V2ControlRow } from '../../../theme/v2Primitives';
import {
  aggregate, exportCSV, exportTXT, reconcile,
  type BookingRecord, type ReportOutput,
} from './BookingReport';
import BookingReadiness from './BookingReadiness';

// ── Report UI localisation — exactly 8 canonical locales ─────────────────────

type RLocale = 'en' | 'th' | 'ko' | 'ja' | 'zh' | 'es' | 'fr' | 'de';
const REPORT_LOCALES: readonly RLocale[] = ['en', 'th', 'ko', 'ja', 'zh', 'es', 'fr', 'de'];

interface RS {
  heading: string;
  today: string; last7: string; last30: string; allTime: string; custom: string;
  summary: string;
  total: string; inWindow: string; pending: string; confirmed: string;
  rejected: string; cancelled: string; unknownStatus: string;
  exceptions: string; stale: string; waitingCourse: string; notifyFollowUp: string; unknownTs: string;
  byCourse: string; byStatus: string; byException: string; byLocale: string;
  ageBuckets: string; trends: string; dataQuality: string;
  missing: string; invalidRecords: string; excludedFromWindow: string;
  exportCopy: string; exportCSV: string; exportTXT: string;
  jhccNotice: string; disclaimer: string;
  loading: string; error: string; retry: string; empty: string;
  invalidRange: string; exportReady: string; partialData: string;
  drillStatus: string; drillQueue: string;
}

const REPORT_STRINGS: Record<RLocale, RS> = {
  en: {
    heading: 'Booking Operations Report',
    today: 'Today', last7: 'Last 7 days', last30: 'Last 30 days', allTime: 'All time', custom: 'Custom range',
    summary: 'Summary',
    total: 'Total requests', inWindow: 'In period', pending: 'Pending', confirmed: 'Confirmed',
    rejected: 'Rejected', cancelled: 'Cancelled', unknownStatus: 'Unknown status',
    exceptions: 'Exceptions', stale: 'Stale (>48 h)', waitingCourse: 'Awaiting course', notifyFollowUp: 'Notify/ack follow-up', unknownTs: 'Unknown timestamp',
    byCourse: 'By course', byStatus: 'By status', byException: 'By exception type', byLocale: 'By golfer locale',
    ageBuckets: 'Pending by age', trends: 'Daily trend', dataQuality: 'Data quality',
    missing: 'Missing', invalidRecords: 'Invalid records', excludedFromWindow: 'Outside window',
    exportCopy: 'Copy summary', exportCSV: 'Export CSV', exportTXT: 'Export TXT',
    jhccNotice: 'JHCC automatic transmission: NOT AVAILABLE. No approved reporting contract exists.',
    disclaimer: 'This report contains no revenue, payment, conversion, or delivery data. Golfriend does not sell tee times or process payments.',
    loading: 'Loading report…', error: 'Could not load report data.', retry: 'Retry', empty: 'No booking data.',
    invalidRange: 'Invalid date range. Start must be before end.',
    exportReady: 'Export ready', partialData: 'Some records lack timestamps — see Data Quality.',
    drillStatus: 'View in table', drillQueue: 'View exceptions',
  },
  th: {
    heading: 'รายงานการดำเนินงานการจอง',
    today: 'วันนี้', last7: '7 วันที่ผ่านมา', last30: '30 วันที่ผ่านมา', allTime: 'ทั้งหมด', custom: 'ช่วงเวลากำหนดเอง',
    summary: 'สรุป', total: 'คำขอทั้งหมด', inWindow: 'ในช่วงเวลา', pending: 'รอดำเนินการ', confirmed: 'ยืนยันแล้ว', rejected: 'ปฏิเสธแล้ว', cancelled: 'ยกเลิกแล้ว', unknownStatus: 'สถานะไม่ทราบ',
    exceptions: 'ข้อยกเว้น', stale: 'รอนานเกิน 48 ชั่วโมง', waitingCourse: 'รอสนาม', notifyFollowUp: 'ต้องแจ้ง/รับทราบ', unknownTs: 'ไม่ทราบเวลา',
    byCourse: 'ตามสนาม', byStatus: 'ตามสถานะ', byException: 'ตามประเภทข้อยกเว้น', byLocale: 'ตามภาษา',
    ageBuckets: 'รอดำเนินการตามอายุ', trends: 'แนวโน้มรายวัน', dataQuality: 'คุณภาพข้อมูล',
    missing: 'ขาดข้อมูล', invalidRecords: 'บันทึกไม่ถูกต้อง', excludedFromWindow: 'นอกช่วงเวลา',
    exportCopy: 'คัดลอกสรุป', exportCSV: 'ส่งออก CSV', exportTXT: 'ส่งออก TXT',
    jhccNotice: 'การส่ง JHCC อัตโนมัติ: ไม่พร้อมใช้งาน ไม่มีสัญญารายงานที่ได้รับอนุมัติ',
    disclaimer: 'รายงานนี้ไม่มีข้อมูลรายได้ การชำระเงิน หรือการยืนยัน Golfriend ไม่ขายเวลาออกรอบ',
    loading: 'กำลังโหลดรายงาน…', error: 'ไม่สามารถโหลดข้อมูลรายงาน', retry: 'ลองใหม่', empty: 'ไม่มีข้อมูลการจอง',
    invalidRange: 'ช่วงวันที่ไม่ถูกต้อง วันเริ่มต้นต้องอยู่ก่อนวันสิ้นสุด',
    exportReady: 'พร้อมส่งออก', partialData: 'บางบันทึกไม่มีการประทับเวลา — ดูคุณภาพข้อมูล',
    drillStatus: 'ดูในตาราง', drillQueue: 'ดูข้อยกเว้น',
  },
  ko: {
    heading: '예약 운영 보고서',
    today: '오늘', last7: '최근 7일', last30: '최근 30일', allTime: '전체', custom: '사용자 지정 기간',
    summary: '요약', total: '총 요청', inWindow: '기간 내', pending: '대기 중', confirmed: '확정', rejected: '거절', cancelled: '취소', unknownStatus: '알 수 없는 상태',
    exceptions: '예외', stale: '지연(48시간 초과)', waitingCourse: '골프장 대기', notifyFollowUp: '알림/확인 필요', unknownTs: '타임스탬프 없음',
    byCourse: '골프장별', byStatus: '상태별', byException: '예외 유형별', byLocale: '언어별',
    ageBuckets: '나이별 대기', trends: '일별 추세', dataQuality: '데이터 품질',
    missing: '누락', invalidRecords: '잘못된 레코드', excludedFromWindow: '기간 외',
    exportCopy: '요약 복사', exportCSV: 'CSV 내보내기', exportTXT: 'TXT 내보내기',
    jhccNotice: 'JHCC 자동 전송: 사용 불가. 승인된 보고 계약이 없습니다.',
    disclaimer: '이 보고서에는 수익, 결제 또는 전환 데이터가 없습니다. Golfriend는 티타임을 판매하지 않습니다.',
    loading: '보고서 로딩 중…', error: '보고서 데이터를 불러올 수 없습니다.', retry: '다시 시도', empty: '예약 데이터 없음',
    invalidRange: '잘못된 날짜 범위. 시작일이 종료일보다 앞서야 합니다.',
    exportReady: '내보내기 준비됨', partialData: '일부 레코드에 타임스탬프 없음 — 데이터 품질 참조',
    drillStatus: '테이블에서 보기', drillQueue: '예외 보기',
  },
  ja: {
    heading: '予約オペレーションレポート',
    today: '本日', last7: '過去7日間', last30: '過去30日間', allTime: '全期間', custom: 'カスタム期間',
    summary: '概要', total: '総リクエスト', inWindow: '期間内', pending: '保留中', confirmed: '確定', rejected: '拒否', cancelled: 'キャンセル', unknownStatus: '不明なステータス',
    exceptions: '例外', stale: '滞留（48時間超）', waitingCourse: 'コース応答待ち', notifyFollowUp: '通知/確認が必要', unknownTs: 'タイムスタンプ不明',
    byCourse: 'コース別', byStatus: 'ステータス別', byException: '例外タイプ別', byLocale: '言語別',
    ageBuckets: '年齢別保留', trends: '日次トレンド', dataQuality: 'データ品質',
    missing: '欠損', invalidRecords: '無効なレコード', excludedFromWindow: '期間外',
    exportCopy: 'サマリーをコピー', exportCSV: 'CSVエクスポート', exportTXT: 'TXTエクスポート',
    jhccNotice: 'JHCC自動送信：利用不可。承認済み報告契約が存在しません。',
    disclaimer: 'このレポートには収益、支払い、またはコンバージョンデータは含まれません。GolfriendはTee timeを販売しません。',
    loading: 'レポートを読み込み中…', error: 'レポートデータを読み込めませんでした。', retry: '再試行', empty: '予約データなし',
    invalidRange: '無効な日付範囲。開始日は終了日より前である必要があります。',
    exportReady: 'エクスポート準備完了', partialData: '一部のレコードにタイムスタンプがありません — データ品質を参照',
    drillStatus: 'テーブルで表示', drillQueue: '例外を表示',
  },
  zh: {
    heading: '预订运营报告',
    today: '今天', last7: '最近7天', last30: '最近30天', allTime: '全部时间', custom: '自定义范围',
    summary: '摘要', total: '总请求', inWindow: '期间内', pending: '待处理', confirmed: '已确认', rejected: '已拒绝', cancelled: '已取消', unknownStatus: '未知状态',
    exceptions: '异常', stale: '滞留（超过48小时）', waitingCourse: '等待球场', notifyFollowUp: '通知/确认', unknownTs: '时间戳缺失',
    byCourse: '按球场', byStatus: '按状态', byException: '按异常类型', byLocale: '按语言',
    ageBuckets: '按年龄待处理', trends: '每日趋势', dataQuality: '数据质量',
    missing: '缺失', invalidRecords: '无效记录', excludedFromWindow: '不在期间内',
    exportCopy: '复制摘要', exportCSV: '导出CSV', exportTXT: '导出TXT',
    jhccNotice: 'JHCC自动传输：不可用。不存在已批准的报告合同。',
    disclaimer: '本报告不含收入、付款或转化数据。Golfriend不销售球场时间。',
    loading: '正在加载报告…', error: '无法加载报告数据。', retry: '重试', empty: '没有预订数据',
    invalidRange: '日期范围无效。开始日期必须早于结束日期。',
    exportReady: '导出准备就绪', partialData: '部分记录缺少时间戳 — 请参阅数据质量',
    drillStatus: '在表格中查看', drillQueue: '查看异常',
  },
  es: {
    heading: 'Informe de operaciones de reserva',
    today: 'Hoy', last7: 'Últimos 7 días', last30: 'Últimos 30 días', allTime: 'Todo el tiempo', custom: 'Rango personalizado',
    summary: 'Resumen', total: 'Total de solicitudes', inWindow: 'En el período', pending: 'Pendiente', confirmed: 'Confirmada', rejected: 'Rechazada', cancelled: 'Cancelada', unknownStatus: 'Estado desconocido',
    exceptions: 'Excepciones', stale: 'Atrasada (>48 h)', waitingCourse: 'Esperando campo', notifyFollowUp: 'Notificar/confirmar', unknownTs: 'Sin marca de tiempo',
    byCourse: 'Por campo', byStatus: 'Por estado', byException: 'Por tipo de excepción', byLocale: 'Por idioma',
    ageBuckets: 'Pendientes por antigüedad', trends: 'Tendencia diaria', dataQuality: 'Calidad de datos',
    missing: 'Faltante', invalidRecords: 'Registros inválidos', excludedFromWindow: 'Fuera del período',
    exportCopy: 'Copiar resumen', exportCSV: 'Exportar CSV', exportTXT: 'Exportar TXT',
    jhccNotice: 'Transmisión automática JHCC: NO DISPONIBLE. No existe un contrato de informe aprobado.',
    disclaimer: 'Este informe no contiene datos de ingresos, pagos ni conversiones. Golfriend no vende tiempos de salida.',
    loading: 'Cargando informe…', error: 'No se pudieron cargar los datos del informe.', retry: 'Reintentar', empty: 'Sin datos de reservas',
    invalidRange: 'Rango de fechas inválido. La fecha de inicio debe ser anterior a la de fin.',
    exportReady: 'Exportación lista', partialData: 'Algunos registros no tienen marca de tiempo — ver Calidad de datos',
    drillStatus: 'Ver en tabla', drillQueue: 'Ver excepciones',
  },
  fr: {
    heading: "Rapport des opérations de réservation",
    today: "Aujourd'hui", last7: '7 derniers jours', last30: '30 derniers jours', allTime: 'Tout le temps', custom: 'Plage personnalisée',
    summary: 'Résumé', total: 'Total des demandes', inWindow: 'Dans la période', pending: 'En attente', confirmed: 'Confirmé', rejected: 'Refusé', cancelled: 'Annulé', unknownStatus: 'Statut inconnu',
    exceptions: 'Exceptions', stale: 'En retard (>48 h)', waitingCourse: "En attente du parcours", notifyFollowUp: 'Notifier/accuser réception', unknownTs: 'Horodatage inconnu',
    byCourse: 'Par parcours', byStatus: 'Par statut', byException: "Par type d'exception", byLocale: 'Par langue',
    ageBuckets: 'En attente par âge', trends: 'Tendance quotidienne', dataQuality: 'Qualité des données',
    missing: 'Manquant', invalidRecords: 'Enregistrements invalides', excludedFromWindow: 'Hors période',
    exportCopy: 'Copier le résumé', exportCSV: 'Exporter CSV', exportTXT: 'Exporter TXT',
    jhccNotice: "Transmission automatique JHCC : NON DISPONIBLE. Aucun contrat de rapport approuvé n'existe.",
    disclaimer: "Ce rapport ne contient aucune donnée de revenus, paiements ou conversions. Golfriend ne vend pas de départs.",
    loading: 'Chargement du rapport…', error: 'Impossible de charger les données du rapport.', retry: 'Réessayer', empty: 'Aucune donnée de réservation',
    invalidRange: 'Plage de dates invalide. La date de début doit être antérieure à la date de fin.',
    exportReady: 'Exportation prête', partialData: "Certains enregistrements n'ont pas d'horodatage — voir Qualité des données",
    drillStatus: 'Voir dans le tableau', drillQueue: 'Voir les exceptions',
  },
  de: {
    heading: 'Buchungs-Betriebsbericht',
    today: 'Heute', last7: 'Letzte 7 Tage', last30: 'Letzte 30 Tage', allTime: 'Gesamte Zeit', custom: 'Benutzerdefinierter Zeitraum',
    summary: 'Zusammenfassung', total: 'Gesamtanfragen', inWindow: 'Im Zeitraum', pending: 'Ausstehend', confirmed: 'Bestätigt', rejected: 'Abgelehnt', cancelled: 'Storniert', unknownStatus: 'Unbekannter Status',
    exceptions: 'Ausnahmen', stale: 'Veraltet (>48 h)', waitingCourse: 'Warte auf Golfplatz', notifyFollowUp: 'Benachrichtigen/bestätigen', unknownTs: 'Kein Zeitstempel',
    byCourse: 'Nach Golfplatz', byStatus: 'Nach Status', byException: 'Nach Ausnahmetyp', byLocale: 'Nach Sprache',
    ageBuckets: 'Ausstehend nach Alter', trends: 'Täglicher Trend', dataQuality: 'Datenqualität',
    missing: 'Fehlend', invalidRecords: 'Ungültige Datensätze', excludedFromWindow: 'Außerhalb des Zeitraums',
    exportCopy: 'Zusammenfassung kopieren', exportCSV: 'CSV exportieren', exportTXT: 'TXT exportieren',
    jhccNotice: 'Automatische JHCC-Übertragung: NICHT VERFÜGBAR. Es existiert kein genehmigter Berichtsvertrag.',
    disclaimer: 'Dieser Bericht enthält keine Umsatz-, Zahlungs- oder Konversionsdaten. Golfriend verkauft keine Abschlagzeiten.',
    loading: 'Bericht wird geladen…', error: 'Berichtsdaten konnten nicht geladen werden.', retry: 'Erneut versuchen', empty: 'Keine Buchungsdaten',
    invalidRange: 'Ungültiger Datumsbereich. Startdatum muss vor Enddatum liegen.',
    exportReady: 'Export bereit', partialData: 'Einige Datensätze haben keinen Zeitstempel — siehe Datenqualität',
    drillStatus: 'In Tabelle anzeigen', drillQueue: 'Ausnahmen anzeigen',
  },
};

// ── Time-window helpers ──────────────────────────────────────────────────────

type WindowPreset = 'today' | 'last7' | 'last30' | 'allTime' | 'custom';

function presetWindow(preset: WindowPreset, now: number): { start?: number; end: number } {
  const end = now;
  const day = 86_400_000;
  const startOfToday = (() => { const d = new Date(now); d.setUTCHours(0,0,0,0); return d.getTime(); })();
  switch (preset) {
    case 'today':  return { start: startOfToday, end };
    case 'last7':  return { start: end - 7 * day, end };
    case 'last30': return { start: end - 30 * day, end };
    case 'allTime': return { end };
    default: return { end };
  }
}

// ── Trend bar helper ─────────────────────────────────────────────────────────

function TrendBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <div style={{
        height: '8px', width: `${pct}%`, minWidth: pct > 0 ? '2px' : '0',
        backgroundColor: color, borderRadius: '2px', transition: 'width 0.2s',
      }} aria-hidden />
      <span style={{ fontSize: '11px', color: V2Theme.surfaceTextMuted, minWidth: '22px' }}>{value}</span>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

interface Props {
  onDrillStatus?: (status: string) => void;
  onDrillQueue?: () => void;
}

export default function BookingReportView({ onDrillStatus, onDrillQueue }: Props) {
  const [rawBookings, setRawBookings] = useState<BookingRecord[]>([]);
  const [loading, setLoading]   = useState(true);
  const [streamErr, setErr]      = useState(false);
  const [retryCount, setRetryCount] = useState(0); // increment to re-trigger the stream
  const [locale, setLocale]      = useState<RLocale>('en');
  const [windowPreset, setPreset] = useState<WindowPreset>('last7');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd]     = useState('');
  const [copyDone, setCopyDone]  = useState(false);
  const [csvDone, setCsvDone]    = useState(false);
  const [txtDone, setTxtDone]    = useState(false);

  const L = REPORT_STRINGS[locale];
  const now = Date.now();

  // Stream bookings with createdAt (independent read-only stream).
  useEffect(() => {
    setLoading(true); setErr(false);
    const unsub = onSnapshot(
      query(collection(db, 'bookings')),
      (snap) => {
        setRawBookings(snap.docs.map((d) => {
          const b = d.data() as any;
          const createdAt = b.createdAt;
          const createdAtMs: number | undefined =
            createdAt?.toMillis ? createdAt.toMillis()
            : createdAt?.seconds ? createdAt.seconds * 1000
            : undefined;
          return {
            id: d.id,
            status: b.status || '',
            courseName: b.courseName || undefined,
            courseId: b.courseId || undefined,
            date: b.date || undefined,
            time: b.time || undefined,
            playerUid: b.playerUid || undefined,
            playerName: b.playerName || undefined,
            createdAtMs,
            locale: b.locale || undefined,
          } as BookingRecord;
        }));
        setLoading(false);
      },
      () => { setErr(true); setLoading(false); },
    );
    return () => unsub();
  }, [retryCount]);

  // Resolve window.
  const { windowStart, windowEnd, rangeError } = useMemo(() => {
    if (windowPreset === 'custom') {
      if (!customStart || !customEnd) return { windowStart: undefined, windowEnd: now, rangeError: false };
      const s = new Date(customStart + 'T00:00:00Z').getTime();
      const e = new Date(customEnd + 'T23:59:59Z').getTime();
      if (isNaN(s) || isNaN(e) || s > e) return { windowStart: undefined, windowEnd: now, rangeError: true };
      return { windowStart: s, windowEnd: e, rangeError: false };
    }
    const pw = presetWindow(windowPreset, now);
    return { windowStart: pw.start, windowEnd: pw.end, rangeError: false };
  }, [windowPreset, customStart, customEnd, now]);

  // Aggregated report.
  const report = useMemo<ReportOutput | null>(() => {
    if (rawBookings.length === 0 || rangeError) return null;
    return aggregate({ bookings: rawBookings, nowMs: now, windowStart, windowEnd });
  }, [rawBookings, now, windowStart, windowEnd, rangeError]);

  // Reconciliation check.
  const reconcileResult = useMemo(() => {
    if (!report) return null;
    return reconcile(report);
  }, [report]);

  const exportMeta = useMemo(() => ({
    generatedAt: new Date(now).toISOString(),
    periodLabel: report?.windowInfo.label ?? 'unknown',
    appliedFilters: windowPreset === 'custom' ? `custom: ${customStart}–${customEnd}` : windowPreset,
    totalRows: rawBookings.length,
    dataLimitations: [
      'No revenue, payment, conversion, or delivery confirmation data is present.',
      'Golfriend does not sell tee times or process payments.',
      `${report?.dataQuality.missingTimestamp ?? 0} records lack timestamps and were excluded from period metrics.`,
    ],
  }), [report, now, windowPreset, customStart, customEnd, rawBookings.length]);

  const handleCopy = useCallback(async () => {
    if (!report) return;
    const txt = exportTXT(report, exportMeta);
    try { await navigator.clipboard.writeText(txt); }
    catch { const el = document.createElement('textarea'); el.value = txt; document.body.appendChild(el); el.select(); document.execCommand('copy'); el.remove(); }
    setCopyDone(true); setTimeout(() => setCopyDone(false), 2500);
  }, [report, exportMeta]);

  const handleCSV = useCallback(() => {
    if (!report) return;
    const csv = exportCSV(rawBookings, exportMeta, now);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `booking-ops-report-${exportMeta.periodLabel.replace(/\s/g, '-')}.csv`; a.click(); URL.revokeObjectURL(url);
    setCsvDone(true); setTimeout(() => setCsvDone(false), 2500);
  }, [report, rawBookings, exportMeta, now]);

  const handleTXT = useCallback(() => {
    if (!report) return;
    const txt = exportTXT(report, exportMeta);
    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `booking-ops-report-${exportMeta.periodLabel.replace(/\s/g, '-')}.txt`; a.click(); URL.revokeObjectURL(url);
    setTxtDone(true); setTimeout(() => setTxtDone(false), 2500);
  }, [report, exportMeta]);

  // ── Render ────────────────────────────────────────────────────────────────

  const s = report?.summary;
  const dq = report?.dataQuality;

  return (
    <div style={{ fontFamily: V2Theme.fontFamily, color: V2Theme.warmWhite }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: `1px solid ${V2Theme.surfaceBorder}`, paddingBottom: '12px', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <h2 style={{ margin: 0, color: V2Theme.gold, fontSize: '18px' }}>📊 {L.heading}</h2>
          {report && <p style={{ margin: '4px 0 0', fontSize: '12px', color: V2Theme.surfaceTextMuted }}>{report.windowInfo.label} · {s?.total ?? 0} records</p>}
        </div>
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }} role="group" aria-label="Report language">
          {REPORT_LOCALES.map((l) => (
            <button key={l} onClick={() => setLocale(l)} aria-pressed={locale === l} style={{ padding: '4px 9px', fontSize: '11px', fontWeight: 700, borderRadius: V2Theme.radiusPill, cursor: 'pointer', minHeight: '28px', border: `1px solid ${locale === l ? V2Theme.gold : V2Theme.surfaceBorder}`, backgroundColor: locale === l ? `${V2Theme.gold}22` : 'transparent', color: locale === l ? V2Theme.gold : V2Theme.surfaceTextMuted }}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* ── Time window ── */}
      <V2ControlRow style={{ marginBottom: '12px' }}>
        {(['today', 'last7', 'last30', 'allTime', 'custom'] as WindowPreset[]).map((wp) => (
          <button key={wp} onClick={() => setPreset(wp)} aria-pressed={windowPreset === wp}
            style={{ padding: '6px 12px', minHeight: '36px', fontSize: '12px', fontWeight: 700, borderRadius: V2Theme.radiusPill, cursor: 'pointer', border: `1px solid ${windowPreset === wp ? V2Theme.gold : V2Theme.surfaceBorder}`, backgroundColor: windowPreset === wp ? `${V2Theme.gold}22` : 'transparent', color: windowPreset === wp ? V2Theme.gold : V2Theme.surfaceTextMuted }}>
            {L[wp as keyof RS]}
          </button>
        ))}
      </V2ControlRow>

      {windowPreset === 'custom' && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="date" aria-label="Report start date" value={customStart} onChange={(e) => setCustomStart(e.target.value)}
            style={{ padding: '7px 10px', backgroundColor: V2Theme.surfaceCard, border: `1px solid ${V2Theme.surfaceBorder}`, color: V2Theme.warmWhite, borderRadius: V2Theme.radiusMd, fontFamily: V2Theme.fontFamily, fontSize: '13px' }} />
          <span style={{ color: V2Theme.surfaceTextMuted }}>–</span>
          <input type="date" aria-label="Report end date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)}
            style={{ padding: '7px 10px', backgroundColor: V2Theme.surfaceCard, border: `1px solid ${V2Theme.surfaceBorder}`, color: V2Theme.warmWhite, borderRadius: V2Theme.radiusMd, fontFamily: V2Theme.fontFamily, fontSize: '13px' }} />
          {rangeError && <span role="alert" style={{ color: V2Theme.errorRed, fontSize: '12px' }}>{L.invalidRange}</span>}
        </div>
      )}

      {/* ── States ── */}
      {loading && <StateBox role="status" aria-live="polite" aria-busy>{L.loading}</StateBox>}
      {!loading && streamErr && (
        <StateBox role="alert" error>
          {L.error} <button onClick={() => setRetryCount((c) => c + 1)} style={retryBtn}>{L.retry}</button>
        </StateBox>
      )}
      {!loading && !streamErr && rawBookings.length === 0 && <StateBox>{L.empty}</StateBox>}
      {!loading && !streamErr && dq && dq.missingTimestamp > 0 && (
        <div role="status" style={{ padding: '8px 12px', marginBottom: '12px', backgroundColor: `${V2Theme.warningAmber}12`, border: `1px solid ${V2Theme.warningAmber}44`, borderRadius: V2Theme.radiusMd, fontSize: '12px', color: V2Theme.warningAmber }}>
          ⚠️ {L.partialData}
        </div>
      )}
      {reconcileResult && !reconcileResult.ok && (
        <div role="alert" style={{ padding: '8px 12px', marginBottom: '12px', backgroundColor: `${V2Theme.errorRed}12`, border: `1px solid ${V2Theme.errorRed}44`, borderRadius: V2Theme.radiusMd, fontSize: '12px', color: V2Theme.errorRed }}>
          ⚠️ Reconciliation warning: {reconcileResult.errors.join('; ')}
        </div>
      )}

      {/* ── Summary metrics ── */}
      <BookingReadiness locale={locale} />

      {report && s && (
        <>
          <SectionLabel>{L.summary}</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '8px', marginBottom: '20px' }}>
            <MetricCard label={L.total} value={s.total} />
            <MetricCard label={L.inWindow} value={s.inWindow} accent={V2Theme.fairwayLight} />
            <MetricCard label={L.pending} value={s.pending} accent={V2Theme.warningAmber}
              drill={onDrillStatus ? () => onDrillStatus('pending') : undefined} drillLabel={L.drillStatus} />
            <MetricCard label={L.confirmed} value={s.confirmed} accent={V2Theme.successGreen}
              drill={onDrillStatus ? () => onDrillStatus('confirmed') : undefined} drillLabel={L.drillStatus} />
            <MetricCard label={L.rejected} value={s.rejected} accent={V2Theme.errorRed}
              drill={onDrillStatus ? () => onDrillStatus('rejected') : undefined} drillLabel={L.drillStatus} />
            <MetricCard label={L.cancelled} value={s.cancelled} accent={V2Theme.surfaceTextMuted} />
            <MetricCard label={L.exceptions} value={s.exceptionCount} accent={V2Theme.errorRed}
              drill={onDrillQueue} drillLabel={L.drillQueue} />
            <MetricCard label={L.stale} value={s.staleCount} accent={V2Theme.errorRed} />
            <MetricCard label={L.waitingCourse} value={s.waitingForCourse} accent={V2Theme.warningAmber} />
            <MetricCard label={L.notifyFollowUp} value={s.notificationFollowUps} accent={V2Theme.warningAmber} />
            <MetricCard label={L.unknownTs} value={s.unknownTimestamp} accent={V2Theme.surfaceTextMuted} />
          </div>

          {/* ── Breakdowns (side by side on desktop) ── */}
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '20px' }}>
            {/* By status */}
            <div style={{ flex: '1 1 220px', ...cardStyle }}>
              <SectionLabel>{L.byStatus}</SectionLabel>
              {Object.entries(report.byStatus).map(([st, n]) => (
                <BreakdownRow key={st} label={st} value={n} total={s.total} />
              ))}
            </div>

            {/* By exception */}
            <div style={{ flex: '1 1 220px', ...cardStyle }}>
              <SectionLabel>{L.byException}</SectionLabel>
              {(Object.entries(report.byExceptionKind) as [string, number][]).map(([k, n]) => (
                <BreakdownRow key={k} label={k.replace(/_/g, ' ')} value={n} total={s.total} />
              ))}
            </div>

            {/* By locale */}
            <div style={{ flex: '1 1 180px', ...cardStyle }}>
              <SectionLabel>{L.byLocale}</SectionLabel>
              {Object.entries(report.byLocale).slice(0, 10).map(([loc, n]) => (
                <BreakdownRow key={loc} label={loc} value={n} total={s.total} />
              ))}
            </div>
          </div>

          {/* By course */}
          {report.byCourse.length > 0 && (
            <div style={{ marginBottom: '20px', ...cardStyle }}>
              <SectionLabel>{L.byCourse}</SectionLabel>
              <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', minWidth: '400px' }}>
                  <thead>
                    <tr style={{ color: V2Theme.surfaceTextMuted, borderBottom: `1px solid ${V2Theme.surfaceBorder}` }}>
                      {['Course', 'Total', 'Confirmed', 'Pending', 'Rejected', 'Cancelled'].map((h) => (
                        <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.byCourse.slice(0, 15).map((c) => (
                      <tr key={c.courseName} style={{ borderBottom: `1px solid ${V2Theme.surfaceBorder}44` }}>
                        <td style={{ padding: '6px 10px', color: V2Theme.warmWhite }}>{c.courseName}</td>
                        <td style={{ padding: '6px 10px' }}>{c.total}</td>
                        <td style={{ padding: '6px 10px', color: V2Theme.successGreen }}>{c.confirmed}</td>
                        <td style={{ padding: '6px 10px', color: V2Theme.warningAmber }}>{c.pending}</td>
                        <td style={{ padding: '6px 10px', color: V2Theme.errorRed }}>{c.rejected}</td>
                        <td style={{ padding: '6px 10px', color: V2Theme.surfaceTextMuted }}>{c.cancelled}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Age buckets */}
          {report.ageBuckets.some((b) => b.count > 0) && (
            <div style={{ marginBottom: '20px', ...cardStyle }}>
              <SectionLabel>{L.ageBuckets}</SectionLabel>
              {report.ageBuckets.filter((b) => b.count > 0).map((b) => (
                <BreakdownRow key={b.label} label={b.label} value={b.count} total={s.pending || 1} />
              ))}
            </div>
          )}

          {/* Trends */}
          {report.trends.length > 0 && (
            <div style={{ marginBottom: '20px', ...cardStyle }}>
              <SectionLabel>{L.trends}</SectionLabel>
              <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', minWidth: '520px' }} aria-label="Daily booking trends">
                  <thead>
                    <tr style={{ color: V2Theme.surfaceTextMuted, borderBottom: `1px solid ${V2Theme.surfaceBorder}` }}>
                      {['Date', 'Requests', 'Confirmed', 'Rejected', 'Cancelled', 'Exceptions'].map((h) => (
                        <th key={h} style={{ padding: '5px 8px', textAlign: 'left', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const maxReq = Math.max(1, ...report.trends.map((t) => t.requests));
                      return report.trends.map((t) => (
                        <tr key={t.dateLabel} style={{ borderBottom: `1px solid ${V2Theme.surfaceBorder}44`, opacity: t.hasData ? 1 : 0.4 }}>
                          <td style={{ padding: '5px 8px', fontFamily: V2Theme.fontMono, color: t.hasData ? V2Theme.surfaceText : V2Theme.surfaceMuted }}>{t.dateLabel}</td>
                          <td style={{ padding: '5px 8px', minWidth: '80px' }}><TrendBar value={t.requests} max={maxReq} color={V2Theme.fairwayLight} /></td>
                          <td style={{ padding: '5px 8px', color: V2Theme.successGreen }}>{t.confirmed || '—'}</td>
                          <td style={{ padding: '5px 8px', color: V2Theme.errorRed }}>{t.rejected || '—'}</td>
                          <td style={{ padding: '5px 8px', color: V2Theme.surfaceTextMuted }}>{t.cancelled || '—'}</td>
                          <td style={{ padding: '5px 8px', color: t.exceptions > 0 ? V2Theme.warningAmber : V2Theme.surfaceMuted }}>{t.exceptions || '—'}</td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Data quality */}
          {dq && (
            <div style={{ marginBottom: '20px', ...cardStyle }}>
              <SectionLabel>{L.dataQuality}</SectionLabel>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '8px' }}>
                {[
                  ['Timestamp', dq.missingTimestamp],
                  ['Course', dq.missingCourse],
                  ['Locale', dq.missingLocale],
                  ['Status', dq.unknownStatus],
                  ['Invalid records', dq.invalidRecords],
                  ['Outside window', dq.excludedFromWindow],
                ].map(([label, val]) => (
                  <div key={label as string} style={{ padding: '8px 12px', backgroundColor: V2Theme.surfaceCard, borderRadius: V2Theme.radiusMd, border: `1px solid ${V2Theme.surfaceBorder}` }}>
                    <div style={{ fontSize: '10px', color: V2Theme.surfaceMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{L.missing} {label as string}</div>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: (val as number) > 0 ? V2Theme.warningAmber : V2Theme.surfaceTextMuted }}>{val as number}</div>
                    <div style={{ fontSize: '10px', color: V2Theme.surfaceMuted }}>of {dq.totalRecords}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Export */}
          <div style={{ marginBottom: '20px', ...cardStyle }}>
            <SectionLabel>{L.exportReady}</SectionLabel>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
              <button onClick={handleCopy} aria-label={L.exportCopy} style={exportBtn}>{copyDone ? '✓ Copied' : L.exportCopy}</button>
              <button onClick={handleCSV} aria-label={L.exportCSV} style={exportBtn}>{csvDone ? '✓ Done' : L.exportCSV}</button>
              <button onClick={handleTXT} aria-label={L.exportTXT} style={exportBtn}>{txtDone ? '✓ Done' : L.exportTXT}</button>
            </div>
            {/* JHCC notice */}
            <div data-c2d-jhcc-unavailable="true" style={{ padding: '10px 14px', backgroundColor: `${V2Theme.surfaceMuted}12`, border: `1px solid ${V2Theme.surfaceBorder}`, borderRadius: V2Theme.radiusMd, fontSize: '12px', color: V2Theme.surfaceTextMuted }}>
              <strong style={{ color: V2Theme.warningAmber }}>📤 {L.jhccNotice}</strong>
            </div>
          </div>

          {/* Disclaimer */}
          <p data-c2d-disclaimer="true" style={{ fontSize: '11px', color: V2Theme.surfaceMuted, lineHeight: 1.55, borderTop: `1px solid ${V2Theme.surfaceBorder}`, paddingTop: '10px', margin: 0 }}>
            {L.disclaimer}
          </p>
        </>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StateBox({ children, role, error }: { children: React.ReactNode; role?: string; error?: boolean; }) {
  return (
    <div role={role} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '20px', border: `1px dashed ${error ? V2Theme.errorRed + '66' : V2Theme.surfaceBorder}`, borderRadius: V2Theme.radiusLg, color: error ? V2Theme.errorRed : V2Theme.surfaceTextMuted, fontSize: '14px', marginBottom: '16px' }}>
      {children}
    </div>
  );
}

function MetricCard({ label, value, accent, drill, drillLabel }: { label: string; value: number; accent?: string; drill?: () => void; drillLabel?: string }) {
  return (
    <div style={{ padding: '12px 14px', backgroundColor: V2Theme.surfacePanel, border: `1px solid ${V2Theme.surfaceBorder}`, borderRadius: V2Theme.radiusMd }}>
      <div style={{ fontSize: '10px', color: V2Theme.surfaceMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>{label}</div>
      <div style={{ fontSize: '24px', fontWeight: 800, color: accent ?? V2Theme.warmWhite }}>{value}</div>
      {drill && drillLabel && (
        <button onClick={drill} style={{ marginTop: '4px', background: 'none', border: 'none', color: V2Theme.gold, fontSize: '11px', cursor: 'pointer', padding: 0, fontWeight: 700 }}>
          {drillLabel} →
        </button>
      )}
    </div>
  );
}

function BreakdownRow({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', borderBottom: `1px solid ${V2Theme.surfaceBorder}33` }}>
      <span style={{ fontSize: '12px', color: V2Theme.surfaceText, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      <div style={{ width: `${pct}%`, maxWidth: '80px', minWidth: value > 0 ? '3px' : '0', height: '6px', backgroundColor: V2Theme.fairway, borderRadius: '3px' }} aria-hidden />
      <span style={{ fontSize: '12px', color: V2Theme.warmWhite, minWidth: '28px', textAlign: 'right' }}>{value}</span>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ margin: '0 0 10px', fontSize: '11px', fontWeight: 900, letterSpacing: '1px', textTransform: 'uppercase', color: V2Theme.surfaceMuted }}>
      {children}
    </p>
  );
}

const cardStyle: React.CSSProperties = {
  backgroundColor: V2Theme.surfacePanel,
  border: `1px solid ${V2Theme.surfaceBorder}`,
  borderRadius: V2Theme.radiusLg,
  padding: '16px',
};

const retryBtn: React.CSSProperties = {
  marginLeft: '10px', background: 'none', border: `1px solid ${V2Theme.errorRed}`, color: V2Theme.errorRed,
  borderRadius: V2Theme.radiusMd, padding: '4px 12px', cursor: 'pointer', fontWeight: 700, fontSize: '12px',
};

const exportBtn: React.CSSProperties = {
  padding: '8px 16px', minHeight: '40px', borderRadius: V2Theme.radiusMd, fontWeight: 700, fontSize: '12px',
  cursor: 'pointer', border: `1px solid ${V2Theme.surfaceBorder}`, backgroundColor: `${V2Theme.fairway}18`,
  color: V2Theme.surfaceText, fontFamily: V2Theme.fontFamily,
};
