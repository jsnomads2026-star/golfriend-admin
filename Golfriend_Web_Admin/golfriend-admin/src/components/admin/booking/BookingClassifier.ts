// ==========================================
// FILE: src/components/admin/booking/BookingClassifier.ts
// C2C — Deterministic booking exception classifier.
// Pure function: no Firestore, no side effects. Fully injectable and testable.
// Derives queue state from booking status + trusted timestamps only.
// ==========================================

export type ExceptionKind =
  | 'stale_request'                    // pending > 48 h without resolution
  | 'pending_course_response'          // pending, waiting for course to confirm/reject
  | 'rejected_requires_notification'   // rejected; golfer may not yet be informed
  | 'cancelled_requires_ack'           // cancelled; golfer may not yet be informed
  | 'healthy';                         // confirmed or no action needed

export interface ClassificationInput {
  status: string;
  /** Booking creation time in milliseconds. Omit when unknown — stale is never assumed. */
  createdAtMs?: number;
  /** Injectable clock for deterministic testing. Defaults to Date.now(). */
  nowMs?: number;
}

/** 48-hour stale threshold. Bookings pending beyond this appear as stale_request. */
export const STALE_THRESHOLD_MS = 48 * 60 * 60 * 1000;

/**
 * Classify a booking into an exception kind.
 * Never invents state — confirmed without a createdAt still returns 'healthy'.
 * If createdAt is unknown, pending is never promoted to 'stale_request'.
 */
export function classify(input: ClassificationInput): ExceptionKind {
  const now = input.nowMs ?? Date.now();
  const { status, createdAtMs } = input;

  switch (status) {
    case 'pending':
      if (createdAtMs !== undefined && now - createdAtMs > STALE_THRESHOLD_MS) {
        return 'stale_request';
      }
      return 'pending_course_response';
    case 'rejected':
      return 'rejected_requires_notification';
    case 'cancelled':
      return 'cancelled_requires_ack';
    default:
      // 'confirmed' and any unknown status → no action needed
      return 'healthy';
  }
}

export const EXCEPTION_KINDS_ALL: ExceptionKind[] = [
  'stale_request',
  'pending_course_response',
  'rejected_requires_notification',
  'cancelled_requires_ack',
  'healthy',
];

// ── Queue UI localisation — exactly 8 canonical locales ──────────────────

export type QueueLocale = 'en' | 'th' | 'ko' | 'ja' | 'zh' | 'es' | 'fr' | 'de';
export const QUEUE_LOCALES: readonly QueueLocale[] = ['en', 'th', 'ko', 'ja', 'zh', 'es', 'fr', 'de'] as const;

export interface QueueStrings {
  heading: string;
  stale_request: string;
  pending_course_response: string;
  rejected_requires_notification: string;
  cancelled_requires_ack: string;
  healthy: string;
  followUp: string;
  filterAll: string;
  filterExceptionsOnly: string;
  sortOldest: string;
  sortNewest: string;
  empty: string;
  emptyFiltered: string;
  loading: string;
  error: string;
  retry: string;
  disclaimer: string;
  sendUnavailable: string;
  sendUnavailableDetail: string;
}

export const QUEUE_LABELS: Record<QueueLocale, QueueStrings> = {
  en: {
    heading: 'Booking Exception Queue',
    stale_request: 'Stale Request (>48 h)',
    pending_course_response: 'Awaiting Course Response',
    rejected_requires_notification: 'Rejected — Notify Golfer',
    cancelled_requires_ack: 'Cancelled — Acknowledge',
    healthy: 'Healthy',
    followUp: 'Follow Up',
    filterAll: 'All',
    filterExceptionsOnly: 'Exceptions only',
    sortOldest: 'Oldest first',
    sortNewest: 'Newest first',
    empty: 'No bookings in queue.',
    emptyFiltered: 'No exceptions match the current filters.',
    loading: 'Loading exception queue…',
    error: 'Could not load booking queue.',
    retry: 'Retry',
    disclaimer: 'Golfriend facilitates communication. Golfriend does not sell tee times or process payments.',
    sendUnavailable: 'Automatic reminders unavailable',
    sendUnavailableDetail: 'No approved backend scheduler exists. Use Follow Up to draft and send messages manually.',
  },
  th: {
    heading: 'คิวข้อยกเว้นการจอง',
    stale_request: 'รอนานเกิน 48 ชั่วโมง',
    pending_course_response: 'รอการตอบกลับจากสนาม',
    rejected_requires_notification: 'ปฏิเสธ — แจ้งนักกอล์ฟ',
    cancelled_requires_ack: 'ยกเลิก — รับทราบ',
    healthy: 'ปกติ',
    followUp: 'ติดตาม',
    filterAll: 'ทั้งหมด',
    filterExceptionsOnly: 'เฉพาะข้อยกเว้น',
    sortOldest: 'เก่าสุดก่อน',
    sortNewest: 'ใหม่สุดก่อน',
    empty: 'ไม่มีการจองในคิว',
    emptyFiltered: 'ไม่มีข้อยกเว้นที่ตรงกับตัวกรองปัจจุบัน',
    loading: 'กำลังโหลดคิวข้อยกเว้น…',
    error: 'ไม่สามารถโหลดคิวการจองได้',
    retry: 'ลองใหม่',
    disclaimer: 'Golfriend อำนวยความสะดวกในการสื่อสาร Golfriend ไม่ขายเวลาออกรอบหรือประมวลผลการชำระเงิน',
    sendUnavailable: 'การแจ้งเตือนอัตโนมัติไม่พร้อมใช้งาน',
    sendUnavailableDetail: 'ไม่มีตัวกำหนดเวลาที่ได้รับอนุมัติ ใช้การติดตามเพื่อร่างและส่งข้อความด้วยตนเอง',
  },
  ko: {
    heading: '예약 예외 대기열',
    stale_request: '지연 요청 (48시간 초과)',
    pending_course_response: '골프장 응답 대기 중',
    rejected_requires_notification: '거절됨 — 골퍼 알림 필요',
    cancelled_requires_ack: '취소됨 — 확인 필요',
    healthy: '정상',
    followUp: '후속 조치',
    filterAll: '전체',
    filterExceptionsOnly: '예외만',
    sortOldest: '오래된 순',
    sortNewest: '최신 순',
    empty: '대기열에 예약이 없습니다.',
    emptyFiltered: '현재 필터와 일치하는 예외가 없습니다.',
    loading: '예외 대기열 로딩 중…',
    error: '예약 대기열을 불러올 수 없습니다.',
    retry: '다시 시도',
    disclaimer: 'Golfriend는 통신을 지원합니다. Golfriend는 티타임을 판매하거나 결제를 처리하지 않습니다.',
    sendUnavailable: '자동 알림 사용 불가',
    sendUnavailableDetail: '승인된 백엔드 스케줄러가 없습니다. 후속 조치를 통해 메시지를 수동으로 작성하고 전송하세요.',
  },
  ja: {
    heading: '予約例外キュー',
    stale_request: '滞留リクエスト（48時間超）',
    pending_course_response: 'コース応答待ち',
    rejected_requires_notification: '拒否済み — ゴルファーへ通知',
    cancelled_requires_ack: 'キャンセル済み — 確認が必要',
    healthy: '問題なし',
    followUp: 'フォローアップ',
    filterAll: 'すべて',
    filterExceptionsOnly: '例外のみ',
    sortOldest: '古い順',
    sortNewest: '新しい順',
    empty: 'キューに予約はありません。',
    emptyFiltered: '現在のフィルターに一致する例外はありません。',
    loading: '例外キューを読み込み中…',
    error: '予約キューを読み込めませんでした。',
    retry: '再試行',
    disclaimer: 'Golfriendはコミュニケーションを支援します。Golfriendはティータイムの販売や支払い処理を行いません。',
    sendUnavailable: '自動リマインダー利用不可',
    sendUnavailableDetail: '承認済みバックエンドスケジューラーが存在しません。フォローアップから手動でメッセージを作成・送信してください。',
  },
  zh: {
    heading: '预订异常队列',
    stale_request: '滞留请求（超过48小时）',
    pending_course_response: '等待球场回复',
    rejected_requires_notification: '已拒绝 — 通知高尔夫球手',
    cancelled_requires_ack: '已取消 — 确认',
    healthy: '正常',
    followUp: '跟进',
    filterAll: '全部',
    filterExceptionsOnly: '仅例外',
    sortOldest: '最旧优先',
    sortNewest: '最新优先',
    empty: '队列中没有预订。',
    emptyFiltered: '没有与当前筛选条件匹配的异常。',
    loading: '正在加载异常队列…',
    error: '无法加载预订队列。',
    retry: '重试',
    disclaimer: 'Golfriend提供沟通便利服务，不销售球场时间或处理付款。',
    sendUnavailable: '自动提醒不可用',
    sendUnavailableDetail: '不存在已批准的后端调度器。请使用跟进功能手动起草和发送消息。',
  },
  es: {
    heading: 'Cola de excepciones de reserva',
    stale_request: 'Solicitud atrasada (>48 h)',
    pending_course_response: 'Esperando respuesta del campo',
    rejected_requires_notification: 'Rechazada — Notificar al golfista',
    cancelled_requires_ack: 'Cancelada — Acuse de recibo',
    healthy: 'Sin excepciones',
    followUp: 'Dar seguimiento',
    filterAll: 'Todos',
    filterExceptionsOnly: 'Solo excepciones',
    sortOldest: 'Más antiguo primero',
    sortNewest: 'Más reciente primero',
    empty: 'No hay reservas en la cola.',
    emptyFiltered: 'Ninguna excepción coincide con los filtros actuales.',
    loading: 'Cargando cola de excepciones…',
    error: 'No se pudo cargar la cola de reservas.',
    retry: 'Reintentar',
    disclaimer: 'Golfriend facilita la comunicación. Golfriend no vende tiempos de salida ni procesa pagos.',
    sendUnavailable: 'Recordatorios automáticos no disponibles',
    sendUnavailableDetail: 'No existe un programador de backend aprobado. Use Dar seguimiento para redactar y enviar mensajes manualmente.',
  },
  fr: {
    heading: "File d'exceptions de réservation",
    stale_request: 'Demande en retard (>48 h)',
    pending_course_response: "En attente de réponse du parcours",
    rejected_requires_notification: 'Refusée — Notifier le golfeur',
    cancelled_requires_ack: "Annulée — Accusé de réception",
    healthy: 'Sans exception',
    followUp: 'Faire le suivi',
    filterAll: 'Tous',
    filterExceptionsOnly: 'Exceptions seulement',
    sortOldest: 'Plus ancien en premier',
    sortNewest: 'Plus récent en premier',
    empty: "Aucune réservation dans la file.",
    emptyFiltered: "Aucune exception ne correspond aux filtres actuels.",
    loading: "Chargement de la file d'exceptions…",
    error: "Impossible de charger la file de réservations.",
    retry: 'Réessayer',
    disclaimer: "Golfriend facilite la communication. Golfriend ne vend pas de départs ni ne traite les paiements.",
    sendUnavailable: 'Rappels automatiques indisponibles',
    sendUnavailableDetail: "Aucun planificateur backend approuvé n'existe. Utilisez Faire le suivi pour rédiger et envoyer des messages manuellement.",
  },
  de: {
    heading: 'Buchungs-Ausnahme-Warteschlange',
    stale_request: 'Veraltete Anfrage (>48 h)',
    pending_course_response: 'Warte auf Antwort des Golfplatzes',
    rejected_requires_notification: 'Abgelehnt — Golfer benachrichtigen',
    cancelled_requires_ack: 'Storniert — Bestätigung erforderlich',
    healthy: 'Kein Problem',
    followUp: 'Nachfassen',
    filterAll: 'Alle',
    filterExceptionsOnly: 'Nur Ausnahmen',
    sortOldest: 'Älteste zuerst',
    sortNewest: 'Neueste zuerst',
    empty: 'Keine Buchungen in der Warteschlange.',
    emptyFiltered: 'Keine Ausnahmen entsprechen den aktuellen Filtern.',
    loading: 'Ausnahme-Warteschlange wird geladen…',
    error: 'Buchungswarteschlange konnte nicht geladen werden.',
    retry: 'Erneut versuchen',
    disclaimer: 'Golfriend erleichtert die Kommunikation. Golfriend verkauft keine Abschlagzeiten und verarbeitet keine Zahlungen.',
    sendUnavailable: 'Automatische Erinnerungen nicht verfügbar',
    sendUnavailableDetail: 'Es existiert kein genehmigter Backend-Scheduler. Verwenden Sie Nachfassen, um Nachrichten manuell zu verfassen und zu senden.',
  },
};
