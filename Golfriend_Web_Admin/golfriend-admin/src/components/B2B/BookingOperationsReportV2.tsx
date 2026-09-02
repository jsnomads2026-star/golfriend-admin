import{useCallback,useEffect,useState}from"react";import{httpsCallable}from"firebase/functions";
import { functions } from '../../firebaseConfig';

const STATUS_OPTIONS=["pending","alternative_proposed","confirmed","completed","cancelled","expired"];
const call=async(n:string,d:any)=>(await httpsCallable(functions,n)(d)).data as any,
  command=()=>crypto.randomUUID().replaceAll("-", "_");

const EN={
  title:"Booking operations report",
  loading:"Loading reconciled booking operations…",
  empty:"No bookings match these filters.",
  error:"Booking reporting is unavailable. No data was changed.",
  boundary:"Operational coordination only. Exports exclude member identity, payments, fees, wallets, ledgers and settlement.",
  course:"Course",
  from:"From",
  to:"To",
  status:"Status",
  apply:"Apply filters",
  reconcile:"Reconcile",
  csv:"Download CSV",
  json:"Download JSON",
  receipt:"Receipt lookup",
  lookup:"Look up",
  lookupPlaceholder:"Receipt ID",
  anomalies:"Detected exceptions",
  summary:"Capacity and status summary",
  next:"Next page",
  retry:"Retry",
  all:"All",
  table:{
    organization:"Organization",
    course:"Course",
    timeZone:"Time zone",
    capacity:"Capacity",
    pending:"Pending",
    confirmed:"Confirmed",
    completed:"Completed",
    cancelled:"Cancelled",
    expired:"Expired",
    status:"Status",
  },
  statusMap:{
    pending:"Pending",
    alternative_proposed:"Alternative proposed",
    confirmed:"Confirmed",
    completed:"Completed",
    cancelled:"Cancelled",
    expired:"Expired",
  },
};

const COPY:any={
  en:EN,
  th:{
    ...EN,
    title:"รายงานการดำเนินงานการจอง",
    loading:"กำลังโหลดรายงานการจอง…",
    empty:"ไม่พบการจองตามตัวกรอง",
    error:"รายงานการจองไม่พร้อมใช้งาน ไม่มีการเปลี่ยนแปลง",
    boundary:"สำหรับการประสานงานเท่านั้น การส่งออกไม่รวมข้อมูลสมาชิก การชำระ ค่าธรรมเนียม กระเป๋าเงิน บัญชี หรือการชำระบัญชี",
    apply:"ใช้ตัวกรอง",
    reconcile:"ตรวจสอบยอด",
    summary:"สรุปความจุและสถานะ",
    retry:"ลองอีกครั้ง",
    all:"ทั้งหมด",
    table:{...EN.table,organization:"องค์กร",course:"สนาม",timeZone:"เขตเวลา",capacity:"ความจุ",pending:"รอการยืนยัน",confirmed:"ยืนยันแล้ว",completed:"เสร็จสิ้น",cancelled:"ยกเลิก",expired:"หมดอายุ",status:"สถานะ"},
    statusMap:{pending:"รอดำเนินการ",alternative_proposed:"เสนอช่วงทางเลือก",confirmed:"ยืนยัน",completed:"เสร็จสิ้น",cancelled:"ยกเลิก",expired:"หมดอายุ"},
  },
  ko:{
    ...EN,
    title:"예약 운영 보고서",
    retry:"다시 시도",
    all:"전체",
    table:{...EN.table,organization:"조직",course:"코스",timeZone:"시간대",capacity:"수용 인원",pending:"대기",confirmed:"확정",completed:"완료",cancelled:"취소됨",expired:"만료됨",status:"상태"},
    statusMap:{...EN.statusMap,pending:"대기",alternative_proposed:"대체 제안됨",confirmed:"확정",completed:"완료",cancelled:"취소됨",expired:"만료됨"},
  },
  ja:{
    ...EN,
    title:"予約運用レポート",
    retry:"再試行",
    all:"すべて",
    table:{...EN.table,organization:"組織",course:"コース",timeZone:"タイムゾーン",capacity:"容量",pending:"保留中",confirmed:"確定",completed:"完了",cancelled:"キャンセル済み",expired:"期限切れ",status:"ステータス"},
    statusMap:{...EN.statusMap,pending:"保留中",alternative_proposed:"代替提案済み",confirmed:"確定",completed:"完了",cancelled:"キャンセル済み",expired:"期限切れ"},
  },
  zh:{
    ...EN,
    title:"预订运营报告",
    retry:"重试",
    all:"全部",
    table:{...EN.table,organization:"组织",course:"球场",timeZone:"时区",capacity:"容量",pending:"待处理",confirmed:"已确认",completed:"已完成",cancelled:"已取消",expired:"已过期",status:"状态"},
    statusMap:{...EN.statusMap,pending:"待处理",alternative_proposed:"待处理替代方案",confirmed:"已确认",completed:"已完成",cancelled:"已取消",expired:"已过期"},
  },
  es:{
    ...EN,
    title:"Informe operativo de reservas",
    retry:"Reintentar",
    all:"Todos",
    table:{...EN.table,organization:"Organización",course:"Campo",timeZone:"Zona horaria",capacity:"Capacidad",pending:"Pendiente",confirmed:"Confirmado",completed:"Completado",cancelled:"Cancelado",expired:"Caducado",status:"Estado"},
    statusMap:{...EN.statusMap,pending:"Pendiente",alternative_proposed:"Propuesta alternativa",confirmed:"Confirmado",completed:"Completado",cancelled:"Cancelado",expired:"Caducado"},
  },
  fr:{
    ...EN,
    title:"Rapport des opérations de réservation",
    retry:"Réessayer",
    all:"Tous",
    table:{...EN.table,organization:"Organisation",course:"Parcours",timeZone:"Fuseau horaire",capacity:"Capacité",pending:"En attente",confirmed:"Confirmé",completed:"Terminé",cancelled:"Annulé",expired:"Expiré",status:"Statut"},
    statusMap:{...EN.statusMap,pending:"En attente",alternative_proposed:"Alternative proposée",confirmed:"Confirmé",completed:"Terminé",cancelled:"Annulé",expired:"Expiré"},
  },
  de:{
    ...EN,
    title:"Buchungsbetriebsbericht",
    retry:"Wiederholen",
    all:"Alle",
    table:{...EN.table,organization:"Organisation",course:"Platz",timeZone:"Zeitzone",capacity:"Kapazität",pending:"Ausstehend",confirmed:"Bestätigt",completed:"Abgeschlossen",cancelled:"Storniert",expired:"Abgelaufen",status:"Status"},
    statusMap:{...EN.statusMap,pending:"Ausstehend",alternative_proposed:"Alternativvorschlag",confirmed:"Bestätigt",completed:"Abgeschlossen",cancelled:"Storniert",expired:"Abgelaufen"},
  },
};

const getStatusLabel=(copy:any,status:string)=>copy.statusMap[status]||status;

export default function BookingOperationsReportV2({admin=false}:{admin?:boolean}){
  const locale=localStorage.getItem(admin?"golfriend.admin.locale":"golfriend.locale")||"en";
  const copy=COPY[locale]||EN;
  const [data,setData]=useState<any>();
  const [state,setState]=useState("loading");
  const [filters,setFilters]=useState<any>({pageSize:25});
  const [receipt,setReceipt]=useState("");
  const [notice,setNotice]=useState("");

  const load=useCallback(async(extra:any={})=>{
    setState("loading");
    try {
      setData(await call(admin?"getBookingOperationsAdminV2":"getBookingOperationsPortalV2",{filters:{...filters,...extra}}));
      setState("ready");
    } catch {
      setState("error");
    }
  },[admin,filters]);

  useEffect(()=>{void load();},[load]);

  const action=async(name:string,payload:any)=>{
    try {
      const r=await call(name,{...payload,admin});
      setNotice(`${r.receiptId} · ${r.sourceVersion||r.schema||"verified"}`);
      return r;
    } catch {
      setNotice(copy.error);
    }
  };

  const download=async(format:"csv"|"json")=>{
    const r=await action("exportBookingOperationsV2",{filters,format,commandId:command()});
    if(!r)return;
    const a=document.createElement("a");
    a.href=URL.createObjectURL(new Blob([r.body],{type:r.contentType}));
    a.download=`booking-operations-${r.receiptId}.${format}`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if(state==="loading") return <p role="status" aria-live="polite">{copy.loading}</p>;
  if(state==="error") return <section><h2>{copy.title}</h2><p role="alert">{copy.error}</p><button onClick={()=>void load()} aria-label={copy.retry}>{copy.retry}</button></section>;

  return <section className="partner-authority" aria-labelledby={`booking-report-${admin}`}>
    <h2 id={`booking-report-${admin}`}>{copy.title}</h2>
    <p>{copy.boundary}</p>
    <form onSubmit={e=>{e.preventDefault();void load();}}>
      <label>{copy.course}<input value={filters.courseId||""} onChange={e=>setFilters({...filters,courseId:e.target.value})} aria-label={copy.course}/></label>
      <label>{copy.from}<input type="date" value={filters.dateFrom||""} onChange={e=>setFilters({...filters,dateFrom:e.target.value})} aria-label={copy.from}/></label>
      <label>{copy.to}<input type="date" value={filters.dateTo||""} onChange={e=>setFilters({...filters,dateTo:e.target.value})} aria-label={copy.to}/></label>
      <label>{copy.status}<select value={filters.status||""} onChange={e=>setFilters({...filters,status:e.target.value})} aria-label={copy.status}>
        <option value="">{copy.all}</option>
        {STATUS_OPTIONS.map((x)=> <option key={x} value={x}>{getStatusLabel(copy,x)}</option>)}
      </select></label>
      <button aria-label={copy.apply}>{copy.apply}</button>
    </form>

    {!data.total ? <p role="status">{copy.empty}</p> : <>
      <h3>{copy.summary}</h3>
      <div tabIndex={0} role="region" aria-label={copy.summary}>
        <table>
          <thead>
            <tr>
              <th>{copy.table.organization}</th>
              <th>{copy.table.course}</th>
              <th>{copy.table.timeZone}</th>
              <th>{copy.table.capacity}</th>
              <th>{copy.table.pending}</th>
              <th>{copy.table.confirmed}</th>
              <th>{copy.table.completed}</th>
              <th>{copy.table.cancelled}</th>
              <th>{copy.table.expired}</th>
            </tr>
          </thead>
          <tbody>
            {data.summaries.map((x:any)=><tr key={`${x.organizationId}-${x.courseId}`}>
              <td>{x.organizationId}</td>
              <td>{x.courseId}</td>
              <td>{x.timeZone}</td>
              <td>{x.capacity}</td>
              <td>{x.pending}</td>
              <td>{x.confirmed}</td>
              <td>{x.completed}</td>
              <td>{x.cancelled}</td>
              <td>{x.expired}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </>}

    {data.anomalies.length>0 && <>
      <h3>{copy.anomalies}</h3>
      <ul>{data.anomalies.map((x:any,i:number)=><li key={`${x.code}-${i}`}>{x.code} · {x.bookingId||x.slotId||x.courseId}</li>)}</ul>
    </>}

    <div>
      <button onClick={()=>void download("csv")} aria-label={copy.csv}>{copy.csv}</button>
      <button onClick={()=>void download("json")} aria-label={copy.json}>{copy.json}</button>
      {data.permissions.reconcile&&<button onClick={()=>void action("reconcileBookingOperationsV2",{filters,expectedSourceVersion:data.sourceVersion,commandId:command()})} aria-label={copy.reconcile}>{copy.reconcile}</button>}
      {data.nextCursor&&<button onClick={()=>void load({cursor:data.nextCursor})} aria-label={copy.next}>{copy.next}</button>}
    </div>

    <form onSubmit={e=>{e.preventDefault();void action("getBookingOperationsReceiptV2",{receiptId:receipt});}}>
      <label>{copy.receipt}<input required value={receipt} onChange={e=>setReceipt(e.target.value)} aria-label={copy.lookupPlaceholder}/></label>
      <button aria-label={copy.lookup}>{copy.lookup}</button>
    </form>

    {notice&&<p role={notice===copy.error?"alert":"status"} aria-live="polite">{notice}</p>}
  </section>;
}
