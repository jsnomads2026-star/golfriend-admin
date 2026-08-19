import {useCallback,useEffect,useState} from 'react';
import type{CourseOperationsService}from'./courseOperationsService';

const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'?value as Record<string,unknown>:{};
const shown=(value:unknown)=>value===null||value===undefined||value===''?'—':String(value);
const when=(value:unknown)=>value?new Date(String(value)).toLocaleString():'—';

export default function V2CourseOperationsMonitor({service}:{service:CourseOperationsService}){
  const[state,setState]=useState<'loading'|'ready'|'error'>('loading');
  const[data,setData]=useState<Record<string,unknown>>({});
  const load=useCallback(async()=>{setState('loading');try{setData(await service.loadIngestionOperations());setState('ready')}catch{setState('error')}},[service]);
  useEffect(()=>{void load()},[load]);
  const counts=object(data.counts),checkpoint=object(data.checkpoint),configuration=object(data.configuration),lastRun=object(data.lastRun),progress=object(checkpoint.progress),quota=object(data.quota);
  if(state==='loading')return <section className="course-operations-monitor"><p role="status">Loading authoritative catalogue status…</p></section>;
  if(state==='error')return <section className="course-operations-monitor"><p role="alert">Authoritative catalogue status is unavailable.</p><button onClick={()=>void load()}>Retry</button></section>;
  return <section className="course-operations-monitor" aria-labelledby="course-catalogue-status">
    <h3 id="course-catalogue-status">Golf API catalogue authority</h3>
    <p role="status">Provider access: {configuration.enabled===true?'enabled':'blocked'} · Project: {shown(data.projectId)}</p>
    <dl className="quota">
      <div><dt>Canonical / usable</dt><dd>{shown(counts.canonical)} / {shown(counts.usable)}</dd></div>
      <div><dt>Unique CourseID / ClubID</dt><dd>{shown(counts.uniqueCourseIDs)} / {shown(counts.uniqueClubIDs)}</dd></div>
      <div><dt>Missing ClubID</dt><dd>{shown(counts.missingClubID)}</dd></div>
      <div><dt>Quarantine</dt><dd>{shown(counts.quarantined)}</dd></div>
      <div><dt>Retries / dead letters</dt><dd>{shown(counts.pendingRetries)} / {shown(counts.deadLetters)}</dd></div>
      <div><dt>Scanned / created / updated</dt><dd>{shown(progress.scanned)} / {shown(progress.created)} / {shown(progress.updated)}</dd></div>
      <div><dt>Unchanged / failed</dt><dd>{shown(progress.unchanged)} / {shown(progress.failed)}</dd></div>
      <div><dt>Provider remaining</dt><dd>{shown(checkpoint.apiRequestsLeft)}</dd></div>
      <div><dt>Internal budget / reserve</dt><dd>{shown(quota.configuredBudget??configuration.configuredBudget)} / {shown(quota.emergencyReserve??configuration.reserve)}</dd></div>
      <div><dt>Checkpoint</dt><dd>{shown(checkpoint.state)} · {shown(checkpoint.lastSuccessfulPath)} → {shown(checkpoint.nextPath)}</dd></div>
      <div><dt>Last / next run</dt><dd>{when(checkpoint.lastRunAt??lastRun.completedAt)} / {when(checkpoint.nextRunAt)}</dd></div>
      <div><dt>Last run result</dt><dd>{shown(lastRun.state)} · {shown(lastRun.stopReason)}</dd></div>
    </dl>
    <button onClick={()=>void load()}>Refresh status</button>
  </section>;
}
