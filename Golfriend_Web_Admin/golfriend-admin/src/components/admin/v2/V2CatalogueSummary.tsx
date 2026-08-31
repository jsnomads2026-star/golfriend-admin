import { useCallback, useEffect, useState } from 'react';
import type { CourseOperationsService } from './courseOperationsService';

const item=(label:string,value:unknown)=><article><span>{label}</span><strong>{value===null||value===undefined?'—':String(value)}</strong></article>;
export default function V2CatalogueSummary({service}:{service:CourseOperationsService}){
  const [data,setData]=useState<any>(null);
  const load=useCallback(async()=>{try{setData(await service.loadCountryIngestionProjection());}catch{setData({error:true});}},[service]);
  useEffect(()=>{void load();},[load]);
  if(!data)return <section className="course-catalogue-summary"><p role="status">Loading catalogue summary…</p></section>;
  if(data.error)return <section className="course-catalogue-summary"><p role="alert">Catalogue summary is unavailable. <button onClick={()=>void load()}>Retry</button></p></section>;
  const catalogue=data.catalogue||{},last=data.pipeline?.lastCompleted?.completedAt;
  return <section className="course-catalogue-summary" aria-label="Global catalogue summary"><div className="course-ops-metrics">{item('Clubhouses / booking venues',catalogue.clubhouseCount)}{item('Playable course layouts',catalogue.courseLayoutCount)}{item('Needs clubhouse review',catalogue.needsClubhouseIdentityReviewCount)}{item('Last successful import time',last?new Date(String(last)).toLocaleString():'—')}</div></section>;
}
