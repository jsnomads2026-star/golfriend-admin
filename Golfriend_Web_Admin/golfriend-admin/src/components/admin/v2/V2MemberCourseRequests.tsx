import { useCallback, useEffect, useState } from 'react';
import { useContext } from 'react';
import { AdminIdentityContext } from './AdminIdentityContext';
import type { CourseOperationsService } from './courseOperationsService';
// The same pure JavaScript model is exercised directly by Node tests.
// @ts-expect-error JavaScript model has an adjacent runtime test rather than TS declarations.
import { projectMemberCourseRequests } from './memberCourseRequestsModel.mjs';

type MemberCourseRequest={id:string;name:string;location:string;requestCount:number;requestedAtMs:number|null;status:string;providerClubId:string|null;providerCourseId:string|null;receiptId:string|null;error:string|null};

const date=(value:number|null)=>value?new Date(value).toLocaleDateString():'—';
export default function V2MemberCourseRequests({service}:{service:CourseOperationsService}){
  const identity=useContext(AdminIdentityContext),[state,setState]=useState<'loading'|'ready'|'error'>('loading'),[rows,setRows]=useState<MemberCourseRequest[]>([]),[busy,setBusy]=useState<string|null>(null);
  const load=useCallback(async()=>{setState('loading');try{const projection=await service.loadOperationsProjection();setRows(projectMemberCourseRequests(Array.isArray((projection as any).requests)?(projection as any).requests:[]));setState('ready');}catch{setState('error');}},[service]);
  useEffect(()=>{void load();},[load]);
  const importCourse=async (row:MemberCourseRequest)=>{if(!row.providerClubId||!row.providerCourseId)return;setBusy(row.id);try{await service.requestCourseImport({providerClubId:row.providerClubId,providerCourseId:row.providerCourseId});await load();}finally{setBusy(null);}};
  const canImport=identity?.status?.trim().toLocaleLowerCase()==='active'&&['Director','Manager','Support'].includes(identity.role||'');
  return <section className="course-member-requests" aria-labelledby="member-course-requests"><h3 id="member-course-requests">Member course requests</h3>{state==='loading'&&<p role="status">Loading member course requests…</p>}{state==='error'&&<p role="alert">Member course requests are unavailable.</p>}{state==='ready'&&rows.length===0&&<p>No member course requests.</p>}{state==='ready'&&rows.length>0&&<div className="course-table-wrap"><table><thead><tr><th>Request</th><th>Location</th><th>Requests</th><th>Date</th><th>Status</th><th>Action</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td>{row.name}{row.receiptId&&<small> · receipt {row.receiptId}</small>}</td><td>{row.location}</td><td>{row.requestCount}</td><td>{date(row.requestedAtMs)}</td><td>{row.status}{row.error&&<small> · {row.error}</small>}</td><td>{row.status==='Needs provider match'?'Needs provider match':canImport&&row.status==='Ready to import'?<button disabled={busy===row.id} onClick={()=>void importCourse(row)}>{busy===row.id?'Queueing…':'Import this course'}</button>:'—'}</td></tr>)}</tbody></table></div>}</section>;
}
