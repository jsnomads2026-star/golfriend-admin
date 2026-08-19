import { useCallback, useEffect, useState } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";

const call = async (name: string, data: any = {}) =>
  (await httpsCallable(getFunctions(), name)(data)).data as any;
const command = () => crypto.randomUUID().replaceAll("-", "_");

type Locale = "en" | "th" | "ko" | "ja" | "zh" | "es" | "fr" | "de";
const LOCALES: ReadonlyArray<string> = [
  "en",
  "th",
  "ko",
  "ja",
  "zh",
  "es",
  "fr",
  "de",
];

type AvailabilityStatus =
  | "pending_admin"
  | "open"
  | "closed"
  | string;

const EN = {
  title: "Course-provided availability",
  loading: "Loading availability…",
  empty: "No availability slots.",
  error: "Availability is unavailable. No change was made.",
  boundary:
    "Golfriend coordinates third-party booking only. No payment, fee, settlement or financial transaction is owned by Golfriend.",
  labels: {
    courseId: "Course ID",
    date: "Date",
    localTime: "Local time",
    timeZone: "Time zone",
    capacity: "Capacity",
    from: "From",
    to: "To",
    status: "Status",
    createHint: "Create pending slot",
    applyHint: "Apply",
  },
  noticeOk: "OK · ",
  create: "Create",
  approve: "Approve",
  close: "Close",
  reopen: "Reopen",
  retry: "Retry",
  loadingMore: "Loading availability…",
  course: "Course",
  statusMap: {
    pending_admin: "pending admin review",
    open: "open",
    closed: "closed",
    unknown: "unknown",
  },
};

const COPY: Record<Locale, typeof EN> = {
  en: EN,
  th: {
    ...EN,
    title: "เวลาว่างที่สนามกอล์ฟเป็นผู้ให้บริการ",
    loading: "กำลังโหลดเวลาว่าง…",
    empty: "ยังไม่มีช่วงเวลา",
    error: "ระบบเวลาว่างไม่พร้อมใช้งาน ไม่มีการเปลี่ยนแปลง",
    boundary:
      "Golfriend ประสานการจองกับบุคคลที่สามเท่านั้น ไม่รับชำระ ค่าธรรมเนียม หรือการชำระบัญชี",
    labels: {
      ...EN.labels,
      courseId: "รหัสสนาม",
      date: "วันที่",
      localTime: "เวลาในท้องถิ่น",
      timeZone: "เขตเวลา",
      capacity: "จำนวนสูงสุด",
      createHint: "สร้างช่วงเวลาคงค้าง",
      applyHint: "ยืนยัน",
    },
    create: "สร้าง",
    approve: "อนุมัติ",
    close: "ปิด",
    reopen: "เปิดอีกครั้ง",
    retry: "ลองอีกครั้ง",
    from: "จาก",
    to: "ถึง",
    status: "สถานะ",
    course: "สนาม",
    statusMap: {
      ...EN.statusMap,
      pending_admin: "รออนุมัติแอดมิน",
      open: "เปิด",
      closed: "ปิด",
      unknown: "ไม่ทราบ",
    },
  },
  ko: {
    ...EN,
    title: "코스 제공 예약 가능 시간",
    labels: {
      ...EN.labels,
      courseId: "코스 ID",
      createHint: "예약 슬롯 생성",
      applyHint: "신청",
    },
    create: "생성",
    approve: "승인",
    close: "종료",
    reopen: "다시 열기",
    retry: "재시도",
    from: "시작",
    to: "종료",
    status: "상태",
    course: "코스",
    statusMap: {
      ...EN.statusMap,
      pending_admin: "관리자 승인 대기",
      open: "개방",
      closed: "마감",
      unknown: "알 수 없음",
    },
  },
  ja: {
    ...EN,
    title: "コース提供の空き時間",
    labels: {
      ...EN.labels,
      courseId: "コースID",
      createHint: "保留枠を作成",
      applyHint: "申請",
    },
    create: "作成",
    approve: "承認",
    close: "終了",
    reopen: "再開",
    retry: "再試行",
    from: "開始",
    to: "終了",
    status: "状態",
    course: "コース",
    statusMap: {
      ...EN.statusMap,
      pending_admin: "管理者承認待ち",
      open: "開放",
      closed: "締切",
      unknown: "不明",
    },
  },
  zh: {
    ...EN,
    title: "球场提供的可用时段",
    labels: {
      ...EN.labels,
      courseId: "球场 ID",
      createHint: "创建待处理时段",
      applyHint: "应用",
    },
    create: "创建",
    approve: "批准",
    close: "关闭",
    reopen: "重新打开",
    retry: "重试",
    from: "从",
    to: "到",
    status: "状态",
    course: "球场",
    statusMap: {
      ...EN.statusMap,
      pending_admin: "待管理员批准",
      open: "开放",
      closed: "关闭",
      unknown: "未知",
    },
  },
  es: {
    ...EN,
    title: "Disponibilidad proporcionada por el campo",
    labels: {
      ...EN.labels,
      courseId: "ID del campo",
      createHint: "Crear franja pendiente",
      applyHint: "Aplicar",
    },
    create: "Crear",
    approve: "Aprobar",
    close: "Cerrar",
    reopen: "Reabrir",
    retry: "Reintentar",
    from: "Desde",
    to: "Hasta",
    status: "Estado",
    course: "Campo",
    statusMap: {
      ...EN.statusMap,
      pending_admin: "pendiente de revisión",
      open: "abierto",
      closed: "cerrado",
      unknown: "desconocido",
    },
  },
  fr: {
    ...EN,
    title: "Disponibilités fournies par le parcours",
    labels: {
      ...EN.labels,
      courseId: "ID du parcours",
      createHint: "Créer un créneau en attente",
      applyHint: "Appliquer",
    },
    create: "Créer",
    approve: "Approuver",
    close: "Fermer",
    reopen: "Rouvrir",
    retry: "Réessayer",
    from: "De",
    to: "À",
    status: "État",
    course: "Parcours",
    statusMap: {
      ...EN.statusMap,
      pending_admin: "en attente admin",
      open: "ouvert",
      closed: "fermé",
      unknown: "inconnu",
    },
  },
  de: {
    ...EN,
    title: "Vom Platz bereitgestellte Verfügbarkeit",
    labels: {
      ...EN.labels,
      courseId: "Platz-ID",
      createHint: "Ausstehenden Slot erstellen",
      applyHint: "Anwenden",
    },
    create: "Erstellen",
    approve: "Bestätigen",
    close: "Schließen",
    reopen: "Wieder öffnen",
    retry: "Wiederholen",
    from: "Von",
    to: "Bis",
    status: "Status",
    course: "Platz",
    statusMap: {
      ...EN.statusMap,
      pending_admin: "Wartet auf Admin",
      open: "offen",
      closed: "geschlossen",
      unknown: "unbekannt",
    },
  },
};

const pickLocale = (admin = false) => {
  const key = admin ? "golfriend.admin.locale" : "golfriend.locale";
  const value = localStorage.getItem(key) || "en";
  return (LOCALES.includes(value) ? value : "en") as Locale;
};

const statusText = (status: AvailabilityStatus, copy: typeof EN) =>
  copy.statusMap[(status as keyof typeof copy["statusMap"]) || "unknown"] || status;

export default function CourseAvailabilityV2({ admin = false }: { admin?: boolean }) {
  const copy = COPY[pickLocale(admin)];
  const [data, setData] = useState<any>(null);
  const [state, setState] = useState("loading");
  const [busy, setBusy] = useState(false);
  const [courseId, setCourseId] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [timeZone, setTimeZone] = useState("Asia/Bangkok");
  const [capacity, setCapacity] = useState(4);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setState("loading");
    try {
      setData(await call(admin ? "listCourseAvailabilityAdminV2" : "getCourseAvailabilityV2"));
      setState("ready");
    } catch {
      setState("error");
    }
  }, [admin]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (fn: () => Promise<any>) => {
    setBusy(true);
    try {
      const r = await fn();
      setNotice(`${copy.noticeOk}${r.receiptId}`);
      await load();
    } catch {
      setNotice(copy.error);
    } finally {
      setBusy(false);
    }
  };

  if (state === "loading") {
    return <p role="status">{copy.loading}</p>;
  }

  if (state === "error") {
    return (
      <section className="partner-authority">
        <p role="alert">{copy.error}</p>
        <button type="button" onClick={() => void load()}>
          {copy.retry}
        </button>
      </section>
    );
  }

  return (
    <section className="partner-authority">
      <h2>{copy.title}</h2>
      <strong>{copy.boundary}</strong>
      {!admin && !data.readOnly && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void run(() =>
              call("manageCourseAvailabilityV2", {
                action: "create",
                courseId,
                date,
                time,
                timeZone,
                capacity,
                expectedVersion: 0,
                commandId: command(),
              }),
            );
          }}
        >
          <label>
            {copy.labels.courseId}
            <input required value={courseId} onChange={(e) => setCourseId(e.target.value)} />
          </label>
          <label>
            {copy.labels.date}
            <input required type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label>
            {copy.labels.localTime}
            <input required type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
          <label>
            {copy.labels.timeZone}
            <input required value={timeZone} onChange={(e) => setTimeZone(e.target.value)} />
          </label>
          <label>
            {copy.labels.capacity}
            <input
              required
              type="number"
              min="1"
              max="8"
              value={capacity}
              onChange={(e) => setCapacity(Number(e.target.value))}
            />
          </label>
          <button disabled={busy} type="submit">
            {copy.create}
          </button>
        </form>
      )}
      {!data.slots.length ? <p>{copy.empty}</p> : null}
      {data.slots.length ? (
        <ul>
          {data.slots.map((x: any) => {
            const next = statusText(x.status as AvailabilityStatus, copy);
            return (
              <li key={x.slotId}>
                <span>
                  <strong>{copy.course}</strong>: {x.courseId}
                </span>
                {" · "}
                <span>
                  {copy.from} {x.date} {x.time} ({x.timeZone}) {copy.to}
                </span>
                {" · "}
                <span>
                  {x.bookedCount}/{x.capacity}
                </span>
                {" · "}
                <span>
                  {copy.status}: {next}
                </span>
                {" · "}
                <span>v{x.version}</span>
                {admin && (
                  <>
                    {x.status === "pending_admin" && (
                      <button
                        type="button"
                        onClick={() =>
                          void run(() =>
                            call("reviewCourseAvailabilityV2", {
                              slotId: x.slotId,
                              status: "open",
                              expectedVersion: x.version,
                              commandId: command(),
                            }),
                          )
                        }
                      >
                        {copy.approve}
                      </button>
                    )}
                    {x.status === "open" && (
                      <button
                        type="button"
                        onClick={() =>
                          void run(() =>
                            call("reviewCourseAvailabilityV2", {
                              slotId: x.slotId,
                              status: "closed",
                              expectedVersion: x.version,
                              commandId: command(),
                            }),
                          )
                        }
                      >
                        {copy.close}
                      </button>
                    )}
                    {x.status === "closed" && (
                      <button
                        type="button"
                        onClick={() =>
                          void run(() =>
                            call("reviewCourseAvailabilityV2", {
                              slotId: x.slotId,
                              status: "open",
                              expectedVersion: x.version,
                              commandId: command(),
                            }),
                          )
                        }
                      >
                        {copy.reopen}
                      </button>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
      {notice && <p role={notice.startsWith("OK") ? "status" : "alert"}>{notice}</p>}
    </section>
  );
}
