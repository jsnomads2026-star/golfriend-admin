import { useCallback, useEffect, useState } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";

type Copy = {
  title: string;
  loading: string;
  empty: string;
  error: string;
  retry: string;
  unconfigured: string;
  course: string;
  organization: string;
  prepare: string;
  attempt: string;
  status: string;
  boundary: string;
  statusUnknown: string;
  statusMap: Record<string, string>;
  providerStatusMap: Record<string, string>;
};

const EN: Copy = {
  title: "Provider-neutral booking publication",
  loading: "Loading publication status…",
  empty: "No prepared publications.",
  error: "Publication boundary is unavailable. Nothing was transmitted.",
  retry: "Retry",
  unconfigured: "PROVIDER_UNCONFIGURED — reports may be prepared, but no external destination or credentials are configured.",
  course: "Claimed course ID",
  organization: "Organization ID",
  prepare: "Prepare publication",
  attempt: "Attempt publication",
  status: "Publication status",
  boundary: "Availability, booking lifecycle, status, message receipts and reconciliation only. No payment, fee, wallet, ledger, settlement or Golfriend Trip behavior.",
  statusUnknown: "Unknown status",
  statusMap: {
    draft: "Draft",
    prepared: "Prepared",
    prepared_for_review: "Prepared for review",
    published: "Published",
    failed: "Failed",
    queued: "Queued",
    sent: "Sent",
  },
  providerStatusMap: {
    queued: "Queued",
    sent: "Sent",
    accepted: "Accepted",
    rejected: "Rejected",
    blocked: "Blocked",
    ignored: "Ignored",
    unavailable: "Unavailable",
    done: "Done",
  },
};

const COPY: Record<string, Copy> = {
  en: EN,
  th: {
    ...EN,
    title: "การเผยแพร่ข้อมูลการจองแบบเป็นกลาง",
    loading: "กำลังโหลดสถานะการเผยแพร่…",
    empty: "ยังไม่มีข้อมูลที่เตรียมไว้",
    error: "ขอบเขตการเผยแพร่ไม่พร้อมใช้งาน ไม่มีการส่งข้อมูล",
    retry: "ลองใหม่อีกครั้ง",
    unconfigured: "PROVIDER_UNCONFIGURED — ยังไม่ได้กำหนดผู้ให้บริการ ปลายทาง หรือข้อมูลรับรอง จึงเตรียมข้อมูลได้แต่ยังส่งออกไม่ได้",
    course: "รหัสสนามที่ได้รับสิทธิ์",
    organization: "รหัสองค์กร",
    prepare: "เตรียมข้อมูล",
    attempt: "ลองส่งข้อมูล",
    status: "สถานะการเผยแพร่",
    statusUnknown: "สถานะไม่ทราบ",
    boundary: "เฉพาะเวลาว่าง วงจรการจอง สถานะ ใบรับข้อความ และการตรวจสอบยอด ไม่มีการชำระ ค่าธรรมเนียม กระเป๋าเงิน บัญชี การชำระบัญชี หรือ Golfriend Trip",
    statusMap: { ...EN.statusMap, draft: "ร่าง", prepared: "เตรียมแล้ว", prepared_for_review: "เตรียมรอพิจารณา", published: "เผยแพร่แล้ว", failed: "ล้มเหลว", queued: "รอคิว", sent: "ส่งแล้ว" },
    providerStatusMap: { ...EN.providerStatusMap, queued: "รอคิว", sent: "ส่งแล้ว", accepted: "ยอมรับแล้ว", rejected: "ปฏิเสธ", blocked: "ปิดกั้น", ignored: "ถูกละเว้น", unavailable: "ไม่พร้อมให้บริการ", done: "เสร็จสิ้น" },
  },
  ko: {
    ...EN,
    title: "공급자 중립 예약 게시",
    loading: "게시 상태를 불러오는 중…",
    empty: "준비된 게시물이 없습니다.",
    error: "게시 경계를 사용할 수 없습니다. 전송된 데이터가 없습니다.",
    retry: "다시 시도",
    unconfigured: "PROVIDER_UNCONFIGURED — 외부 대상과 자격 증명이 구성되지 않아 보고서를 준비할 수만 있고 전송할 수 없습니다.",
    course: "승인된 코스 ID",
    organization: "조직 ID",
    prepare: "게시 준비",
    attempt: "게시 시도",
    status: "게시 상태",
    statusUnknown: "알 수 없는 상태",
    boundary: "이용 가능 시간, 예약 수명주기, 상태, 메시지 영수증 및 조정만 포함합니다. 결제, 수수료, 지갑, 원장, 정산 또는 Golfriend Trip 기능은 포함하지 않습니다.",
    statusMap: { ...EN.statusMap, draft: "임시", prepared: "준비 완료", prepared_for_review: "검토 준비 완료", published: "게시됨", failed: "실패", queued: "대기 중", sent: "전송됨" },
    providerStatusMap: { ...EN.providerStatusMap, queued: "대기 중", sent: "전송됨", accepted: "승인됨", rejected: "거부됨", blocked: "차단됨", ignored: "무시됨", unavailable: "사용 불가", done: "완료" },
  },
  ja: {
    ...EN,
    title: "プロバイダー中立の予約公開",
    loading: "公開状態を読み込んでいます…",
    empty: "準備済みの公開データはありません。",
    error: "公開境界を利用できません。データは送信されていません。",
    retry: "再試行",
    unconfigured: "PROVIDER_UNCONFIGURED — 外部送信先と認証情報が未設定のため、レポートは準備できますが送信できません。",
    course: "承認済みコース ID",
    organization: "組織 ID",
    prepare: "公開を準備",
    attempt: "公開を試行",
    status: "公開状態",
    statusUnknown: "不明な状態",
    boundary: "空き状況、予約ライフサイクル、状態、メッセージ受領記録、照合のみを対象とします。支払い、手数料、ウォレット、台帳、決済、Golfriend Trip は含みません。",
    statusMap: { ...EN.statusMap, draft: "下書き", prepared: "準備済み", prepared_for_review: "レビュー準備中", published: "公開済み", failed: "失敗", queued: "キュー中", sent: "送信済み" },
    providerStatusMap: { ...EN.providerStatusMap, queued: "キュー中", sent: "送信済み", accepted: "受理済み", rejected: "拒否", blocked: "ブロック", ignored: "無視", unavailable: "利用不可", done: "完了" },
  },
  zh: {
    ...EN,
    title: "供应商中立预订发布",
    loading: "正在加载发布状态…",
    empty: "暂无已准备的发布内容。",
    error: "发布边界不可用。未传输任何数据。",
    retry: "重试",
    unconfigured: "PROVIDER_UNCONFIGURED — 尚未配置外部目的地和凭据，只能准备报告，不能传输。",
    course: "已获授权的球场 ID",
    organization: "组织 ID",
    prepare: "准备发布",
    attempt: "尝试发布",
    status: "发布状态",
    statusUnknown: "未知状态",
    boundary: "仅包含可用时段、预订生命周期、状态、消息回执和对账。不包含付款、费用、钱包、账本、结算或 Golfriend Trip 功能。",
    statusMap: { ...EN.statusMap, draft: "草稿", prepared: "已准备", prepared_for_review: "待复核", published: "已发布", failed: "失败", queued: "排队中", sent: "已发送" },
    providerStatusMap: { ...EN.providerStatusMap, queued: "排队中", sent: "已发送", accepted: "已接受", rejected: "已拒绝", blocked: "已阻止", ignored: "已忽略", unavailable: "不可用", done: "完成" },
  },
  es: {
    ...EN,
    title: "Publicación neutral de reservas",
    loading: "Cargando el estado de publicación…",
    empty: "No hay publicaciones preparadas.",
    error: "El límite de publicación no está disponible. No se transmitió nada.",
    retry: "Reintentar",
    unconfigured: "PROVIDER_UNCONFIGURED — los informes pueden prepararse, pero no hay destino externo ni credenciales configurados.",
    course: "ID del campo autorizado",
    organization: "ID de la organización",
    prepare: "Preparar publicación",
    attempt: "Intentar publicación",
    status: "Estado de publicación",
    statusUnknown: "Estado desconocido",
    boundary: "Solo disponibilidad, ciclo de reserva, estado, recibos de mensajes y conciliación. Sin pagos, tarifas, monedero, libro mayor, liquidación ni funciones de Golfriend Trip.",
    statusMap: { ...EN.statusMap, draft: "Borrador", prepared: "Preparado", prepared_for_review: "Preparado para revisión", published: "Publicado", failed: "Fallido", queued: "En cola", sent: "Enviado" },
    providerStatusMap: { ...EN.providerStatusMap, queued: "En cola", sent: "Enviado", accepted: "Aceptado", rejected: "Rechazado", blocked: "Bloqueado", ignored: "Ignorado", unavailable: "No disponible", done: "Completado" },
  },
  fr: {
    ...EN,
    title: "Publication neutre des réservations",
    loading: "Chargement de l’état de publication…",
    empty: "Aucune publication préparée.",
    error: "La limite de publication est indisponible. Aucune donnée n’a été transmise.",
    retry: "Réessayer",
    unconfigured: "PROVIDER_UNCONFIGURED — les rapports peuvent être préparés, mais aucune destination externe ni aucun identifiant n’est configuré.",
    course: "ID du parcours autorisé",
    organization: "ID de l’organisation",
    prepare: "Préparer la publication",
    attempt: "Tenter la publication",
    status: "État de la publication",
    statusUnknown: "Statut inconnu",
    boundary: "Uniquement les disponibilités, le cycle de réservation, les statuts, les reçus de messages et le rapprochement. Aucun paiement, frais, portefeuille, registre, règlement ni fonction Golfriend Trip.",
    statusMap: { ...EN.statusMap, draft: "Brouillon", prepared: "Préparé", prepared_for_review: "Préparé pour révision", published: "Publié", failed: "Échec", queued: "En attente", sent: "Envoyé" },
    providerStatusMap: { ...EN.providerStatusMap, queued: "En attente", sent: "Envoyé", accepted: "Accepté", rejected: "Refusé", blocked: "Bloqué", ignored: "Ignoré", unavailable: "Indisponible", done: "Terminé" },
  },
  de: {
    ...EN,
    title: "Anbieterneutrale Buchungsveröffentlichung",
    loading: "Veröffentlichungsstatus wird geladen…",
    empty: "Keine vorbereiteten Veröffentlichungen.",
    error: "Die Veröffentlichungsgrenze ist nicht verfügbar. Es wurde nichts übertragen.",
    retry: "Wiederholen",
    unconfigured: "PROVIDER_UNCONFIGURED — Berichte können vorbereitet werden, aber es sind kein externes Ziel und keine Zugangsdaten konfiguriert.",
    course: "ID des autorisierten Golfplatzes",
    organization: "Organisations-ID",
    prepare: "Veröffentlichung vorbereiten",
    attempt: "Veröffentlichung versuchen",
    status: "Veröffentlichungsstatus",
    statusUnknown: "Unbekannter Status",
    boundary: "Nur Verfügbarkeit, Buchungsablauf, Status, Nachrichtenbelege und Abstimmung. Keine Zahlungen, Gebühren, Wallets, Hauptbücher, Abrechnung oder Golfriend-Trip-Funktionen.",
    statusMap: { ...EN.statusMap, draft: "Entwurf", prepared: "Vorbereitet", prepared_for_review: "Bereit zur Prüfung", published: "Veröffentlicht", failed: "Fehlgeschlagen", queued: "Warteschlange", sent: "Gesendet" },
    providerStatusMap: { ...EN.providerStatusMap, queued: "Warteschlange", sent: "Gesendet", accepted: "Akzeptiert", rejected: "Abgelehnt", blocked: "Blockiert", ignored: "Ignoriert", unavailable: "Nicht verfügbar", done: "Fertig" },
  },
};

const call = async (name: string, data: unknown) => (await httpsCallable(getFunctions(), name)(data)).data as any;
const command = () => crypto.randomUUID().replaceAll("-", "_");
const labelFor = (map: Record<string, string>, raw: string, fallback: string) => (map[raw] || fallback || raw);

export default function BookingProviderPublicationV2({admin = false}:{admin?: boolean}) {
  const locale = localStorage.getItem(admin ? "golfriend.admin.locale" : "golfriend.locale") || "en";
  const copy = COPY[locale] || EN;
  const [data, setData] = useState<any>();
  const [state, setState] = useState("loading");
  const [courseId, setCourseId] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setState("loading");
    try {
      setData(await call("getBookingProviderPublicationsV2", { admin, organizationId }));
      setState("ready");
    } catch {
      setState("error");
    }
  }, [admin, organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (name: string, payload: object) => {
    try {
      const result = await call(name, { ...payload, admin, organizationId, commandId: command() });
      setNotice(`${result.status || "OK"} · ${result.receiptId}`);
      await load();
    } catch (error: any) {
      setNotice(error?.message?.includes("PROVIDER_UNCONFIGURED") ? copy.unconfigured : copy.error);
    }
  };

  if (state === "loading") return <p role="status" aria-live="polite">{copy.loading}</p>;

  if (state === "error") {
    return (
      <section>
        <h2>{copy.title}</h2>
        <p role="alert">{copy.error}</p>
        <button type="button" onClick={() => void load()} aria-label={copy.retry}>{copy.retry}</button>
      </section>
    );
  }

  return (
    <section className="partner-authority" aria-labelledby={`provider-publication-${admin}`}>
      <h2 id={`provider-publication-${admin}`}>{copy.title}</h2>
      <p>{copy.boundary}</p>
      <p role="status" aria-live="polite">{copy.unconfigured}</p>

      {data.canPrepare && (
        <form onSubmit={(event) => {
          event.preventDefault();
          void run("prepareBookingProviderPublicationV2", { courseId });
        }}>
          {admin && (
            <label>
              {copy.organization}
              <input
                required
                value={organizationId}
                onChange={(event) => setOrganizationId(event.target.value)}
                aria-label={copy.organization}
              />
            </label>
          )}

          <label>
            {copy.course}
            <input
              required
              value={courseId}
              onChange={(event) => setCourseId(event.target.value)}
              aria-label={copy.course}
            />
          </label>

          <button type="submit" aria-label={copy.prepare}>{copy.prepare}</button>
        </form>
      )}

      <h3>{copy.status}</h3>

      {!data.publications.length ? (
        <p>{copy.empty}</p>
      ) : (
        <ul>
          {data.publications.map((item: any) => (
            <li key={item.publicationId}>
              <strong>{item.courseId}</strong>
              <span> · {labelFor(copy.statusMap, item.status, copy.statusUnknown)} </span>
              <span>· {labelFor(copy.providerStatusMap, item.providerStatus, copy.statusUnknown)} </span>
              <span>· {item.timeZone}</span>
              {data.canPrepare && (
                <button
                  type="button"
                  onClick={() => void run("publishBookingProviderPublicationV2", { publicationId: item.publicationId })}
                  aria-label={`${copy.attempt} ${item.publicationId}`}
                >
                  {copy.attempt}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {notice && <p role={notice === copy.error ? "alert" : "status"} aria-live="polite">{notice}</p>}
    </section>
  );
}
