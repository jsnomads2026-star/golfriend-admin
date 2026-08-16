import {useEffect, useState} from 'react';
import {useAdminLocale} from './AdminLocaleContext';
import type {AdminLocale} from './adminNavigation';
import type {CourseOperationsService} from './courseOperationsService';

const COPY:Record<AdminLocale,{title:string;empty:string;error:string}>={
  en:{title:'Course growth receipts',empty:'No authoritative course-growth receipts are available.',error:'Course-growth receipts are unavailable.'},
  th:{title:'ใบรับการเพิ่มสนาม',empty:'ยังไม่มีใบรับการเพิ่มสนามที่เชื่อถือได้',error:'ไม่สามารถโหลดใบรับการเพิ่มสนามได้'},
  ko:{title:'코스 성장 영수증',empty:'권한 있는 코스 성장 영수증이 없습니다.',error:'코스 성장 영수증을 불러올 수 없습니다.'},
  ja:{title:'コース拡充の受領票',empty:'正規のコース拡充受領票はありません。',error:'コース拡充受領票を読み込めません。'},
  zh:{title:'球场增长回执',empty:'暂无权威球场增长回执。',error:'无法加载球场增长回执。'},
  es:{title:'Recibos de crecimiento de campos',empty:'No hay recibos autorizados de crecimiento.',error:'Los recibos de crecimiento no están disponibles.'},
  fr:{title:'Reçus de croissance des parcours',empty:'Aucun reçu de croissance faisant autorité.',error:'Les reçus de croissance sont indisponibles.'},
  de:{title:'Belege für Platzwachstum',empty:'Keine autoritativen Wachstumsbelege verfügbar.',error:'Wachstumsbelege sind nicht verfügbar.'},
};
type Receipt={id:string;status:string;jobId:string;result:Record<string,unknown>};
export default function V2CourseGrowthReceipts({service}:{service:CourseOperationsService}){
  const copy=COPY[useAdminLocale()];const[state,setState]=useState<'loading'|'ready'|'error'>('loading');const[rows,setRows]=useState<Receipt[]>([]);
  useEffect(()=>{void service.loadGrowthReceipts().then(items=>{setRows(items.map(item=>({id:item.id,status:String(item.data.status||'unknown'),jobId:String(item.data.jobId||'unknown'),result:typeof item.data.result==='object'&&item.data.result?item.data.result as Record<string,unknown>:{}})));setState('ready');},()=>setState('error'));},[service]);
  return <section className="course-receipts" aria-labelledby="course-growth-receipts"><h3 id="course-growth-receipts">{copy.title}</h3>{state==='loading'&&<p role="status">…</p>}{state==='error'&&<p role="alert">{copy.error}</p>}{state==='ready'&&rows.length===0&&<p>{copy.empty}</p>}{rows.map(row=><article key={row.id}><strong>{row.status}</strong><span>{row.id}</span><small>{row.jobId} · added {String(row.result.added??0)} · failed {String(row.result.failed??0)} · calls {String(row.result.apiCallsUsed??0)}</small></article>)}</section>;
}
