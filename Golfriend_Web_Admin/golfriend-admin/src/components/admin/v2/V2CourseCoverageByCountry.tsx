import { useCallback, useEffect, useState } from 'react';
import type { CountryCoverage, CourseOperationsService } from './courseOperationsService';

const headers = ['Country', 'Total courses', 'With coordinates', 'Missing coordinates', 'Golf API imported', 'Direct-confirmed', 'Provider evidence missing', 'Latest Golfriend fetch', 'Cycle state'];
const timestamp = (value: number | null) => value ? new Date(value).toLocaleString() : 'Unavailable';
const safeCallableCode = (error: unknown, prefix: string) => {
  const raw = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code?: unknown }).code ?? '') : '';
  const code = raw.replace(/[^A-Z0-9_-]/gi, '_').toUpperCase();
  return `${prefix}_${code || 'UNKNOWN'}`;
};
const record = (value: unknown): Record<string, unknown> => typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
const globalQueue = (value: Record<string, unknown> | null) => Array.isArray(value?.queue) ? value.queue.map(record) : [];
const previewTime = (value: unknown) => { const parsed = Date.parse(String(value || '')); return Number.isFinite(parsed) ? new Date(parsed).toLocaleString() : 'Unavailable'; };
const rankingReason = (item: Record<string, unknown>) => {
  const ranking = record(item.ranking), components = record(ranking.components), parts = Object.entries(components).filter(([, value]) => Number(value) !== 0).map(([name, value]) => `${name}: ${String(value)}`);
  return `${String(ranking.reason || 'UNAVAILABLE')}${parts.length ? ` (${parts.join('; ')})` : ''}`;
};
export function GlobalPlanResult({ preview }: { preview: Record<string, unknown> }) {
  const [showAll,setShowAll]=useState(false);
  const queue=globalQueue(preview),first=record(preview.firstCountry),thailand=queue.find((item)=>item.country==='TH'||item.country==='THAILAND'),visible=showAll?queue:queue.slice(0,10);
  return <section className="course-state" aria-labelledby="global-plan-result-title" aria-live="polite"><h4 id="global-plan-result-title">Global Plan</h4><p><strong>Receipt ID:</strong> {String(preview.receiptId||'unavailable')} · <strong>Time:</strong> {previewTime(preview.generatedAt)}</p><p><strong>Preview only.</strong> Provider calls: {String(preview.providerCalls)} · Course writes: {String(preview.courseWrites)}. Automatic refresh remains {preview.enabled===true?'enabled':'disabled'}.</p><p><strong>First country:</strong> {String(first.country||'none')} · score {String(first.priorityScore??'unavailable')} · {rankingReason(first)}</p><p><strong>Thailand:</strong> {thailand?`rank ${queue.indexOf(thailand)+1} · score ${String(thailand.priorityScore??'unavailable')} · ${rankingReason(thailand)}`:'not in the authoritative queue'}.</p><h5>Ordered country queue ({queue.length})</h5><ol>{visible.map((item,index)=><li key={`${String(item.country)}-${index}`}><strong>#{index+1} {String(item.country||'UNKNOWN')}</strong> · score {String(item.priorityScore??'unavailable')} · {rankingReason(item)}</li>)}</ol>{queue.length>10&&<button onClick={()=>setShowAll((shown)=>!shown)}>{showAll?'Show first 10':'View all'}</button>}</section>;
}

export default function V2CourseCoverageByCountry({ service }: { service: CourseOperationsService }) {
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [countries, setCountries] = useState<CountryCoverage[]>([]);
  const [confirmCountry,setConfirmCountry]=useState<string|null>(null); const [message,setMessage]=useState('');
  const [globalPreviewState,setGlobalPreviewState]=useState<'idle'|'loading'|'ready'|'error'>('idle');
  const [globalPreview,setGlobalPreview]=useState<Record<string,unknown>|null>(null);
  const load = useCallback(async () => {
    setState('loading');
    try { setCountries(await service.loadCountryCoverage()); setState('ready'); }
    catch { setState('unavailable'); }
  }, [service]);
  const action = useCallback(async (country: string, command: 'plan'|'start'|'pause'|'resume') => {
    try {
      const result = command === 'plan' ? await service.planCountry(country) : command === 'start' ? await service.startCountry(country) : command === 'pause' ? await service.pauseCountry(country) : await service.resumeCountry(country);
      setMessage(command === 'plan' ? `${country} plan: ${String(result.providerCalls)} provider calls, ${String(result.courseWrites)} writes` : `${country} ${command === 'start' ? 'queued' : command}d`);
      setConfirmCountry(null); await load();
    } catch { setMessage(`${country} could not be ${command === 'start' ? 'started' : command === 'plan' ? 'planned' : `${command}d`}.`); }
  }, [load, service]);
  const previewGlobal = useCallback(async () => {
    setGlobalPreviewState('loading'); setGlobalPreview(null); setMessage('');
    try { const plan=await service.previewGlobalRefresh(); setGlobalPreview(plan); setGlobalPreviewState('ready'); }
    catch(error) { setGlobalPreviewState('error'); setMessage(`Global preview unavailable (${safeCallableCode(error, 'GLOBAL_PREVIEW')}). No provider calls or course writes were requested.`); }
  }, [service]);
  useEffect(() => { void load(); }, [load]);
  return <section className="course-catalogue" aria-labelledby="course-coverage-by-country-title">
    <div className="course-toolbar"><h3 id="course-coverage-by-country-title">Country acquisition pipeline</h3><p>Server-authoritative coverage. Plans make zero provider calls and zero course writes; only the scheduled worker contacts the provider. No country is inferred from coordinates.</p><button onClick={()=>void previewGlobal()} disabled={globalPreviewState==='loading'} aria-busy={globalPreviewState==='loading'}>{globalPreviewState==='loading'?'Preparing Global Plan…':'Preview Global Plan'}</button>{confirmCountry==='__global__'?<><button onClick={()=>void service.setGlobalRefresh(true).then(()=>{setMessage('Automatic refresh enabled.');setConfirmCountry(null);void load();}).catch(()=>setMessage('Automatic refresh could not be enabled.'))}>Confirm Enable Automatic Refresh</button><button onClick={()=>setConfirmCountry(null)}>Cancel</button></>:<button onClick={()=>setConfirmCountry('__global__')}>Enable Automatic Refresh</button>}</div>
    {globalPreviewState==='loading'&&<p className="course-state" role="status" aria-live="polite">Preparing the read-only global preview. No provider request or course write will be made.</p>}
    {globalPreviewState==='ready'&&globalPreview&&<GlobalPlanResult preview={globalPreview}/>}
    {state === 'loading' && <div className="course-state" role="status" aria-live="polite">Loading country coverage…</div>}
    {state === 'unavailable' && <div className="course-state is-error" role="alert"><p>Country coverage is unavailable.</p><button onClick={() => void load()}>Retry</button></div>}
    {state === 'ready' && countries.every((country) => country.totalCourses === 0) && <div className="course-state">No course records are available. UNKNOWN remains visible and unavailable.</div>}
    {state === 'ready' && countries.length > 0 && <div className="course-table-wrap"><table><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}<th>Country acquisition</th></tr></thead><tbody>{countries.map((country) => { const job=country.job,canPause=job?.state==='queued'||job?.state==='running',canResume=job?.state==='paused'; return <tr key={country.country}><td>{country.country}</td><td>{country.totalCourses}</td><td>{country.coursesWithCoordinates}</td><td>{country.coursesMissingCoordinates}</td><td>{country.golfApiImportedCount}</td><td>{country.directConfirmedCount}</td><td>{country.providerEvidenceMissingCount}</td><td>{country.latestGolfriendFetchTime ? new Date(country.latestGolfriendFetchTime).toLocaleString() : 'Unavailable'}</td><td>{country.country==='UNKNOWN'?'Unavailable':job?<>{job.state}{job.state==='paused'&&job.retryAtMs?` — retry ${timestamp(job.retryAtMs)}`:''}{job.state==='completed'&&job.nextDueAtMs?` — next ${timestamp(job.nextDueAtMs)}`:''}</>:'unavailable'}</td><td>{country.country==='UNKNOWN'?<span>Unavailable</span>:confirmCountry===country.country?<><button onClick={()=>void action(country.country,'start')}>Confirm Start</button><button onClick={()=>setConfirmCountry(null)}>Cancel</button></>:<><button onClick={()=>void action(country.country,'plan')}>Preview Plan</button>{canPause?<button onClick={()=>void action(country.country,'pause')}>Pause</button>:canResume?<button onClick={()=>void action(country.country,'resume')}>Resume</button>:<button onClick={()=>setConfirmCountry(country.country)}>Start</button>}</>}</td></tr>; })}</tbody></table></div>}{message&&globalPreviewState!=='error'&&<p role="status">{message}</p>}
    {globalPreviewState==='error'&&message&&<p className="course-state is-error" role="alert">{message}</p>}
  </section>;
}
