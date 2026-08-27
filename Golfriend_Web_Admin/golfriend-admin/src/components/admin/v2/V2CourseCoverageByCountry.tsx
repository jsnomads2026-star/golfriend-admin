import { useCallback, useEffect, useState } from 'react';
import type { CountryCoverage, CourseOperationsService } from './courseOperationsService';

const headers = ['Country', 'Total courses', 'With coordinates', 'Missing coordinates', 'Golf API imported', 'Direct-confirmed', 'Provider evidence missing', 'Latest Golfriend fetch', 'Cycle state'];
const timestamp = (value: number | null) => value ? new Date(value).toLocaleString() : 'Unavailable';

export default function V2CourseCoverageByCountry({ service }: { service: CourseOperationsService }) {
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [countries, setCountries] = useState<CountryCoverage[]>([]);
  const [confirmCountry,setConfirmCountry]=useState<string|null>(null); const [message,setMessage]=useState('');
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
  useEffect(() => { void load(); }, [load]);
  return <section className="course-catalogue" aria-labelledby="course-coverage-by-country-title">
    <div className="course-toolbar"><h3 id="course-coverage-by-country-title">Country acquisition pipeline</h3><p>Server-authoritative coverage. Plans make zero provider calls and zero course writes; only the scheduled worker contacts the provider. No country is inferred from coordinates.</p><button onClick={()=>void service.previewGlobalRefresh().then(plan=>setMessage(`Global preview: ${String(plan.firstCountry&&((plan.firstCountry as Record<string,unknown>).country)||'none')} first; ${String(plan.providerCalls)} provider calls, ${String(plan.courseWrites)} writes.`)).catch(()=>setMessage('Global preview is unavailable.'))}>Preview Global Plan</button>{confirmCountry==='__global__'?<><button onClick={()=>void service.setGlobalRefresh(true).then(()=>{setMessage('Automatic refresh enabled.');setConfirmCountry(null);void load();}).catch(()=>setMessage('Automatic refresh could not be enabled.'))}>Confirm Enable Automatic Refresh</button><button onClick={()=>setConfirmCountry(null)}>Cancel</button></>:<button onClick={()=>setConfirmCountry('__global__')}>Enable Automatic Refresh</button>}</div>
    {state === 'loading' && <div className="course-state" role="status" aria-live="polite">Loading country coverage…</div>}
    {state === 'unavailable' && <div className="course-state is-error" role="alert"><p>Country coverage is unavailable.</p><button onClick={() => void load()}>Retry</button></div>}
    {state === 'ready' && countries.every((country) => country.totalCourses === 0) && <div className="course-state">No course records are available. UNKNOWN remains visible and unavailable.</div>}
    {state === 'ready' && countries.length > 0 && <div className="course-table-wrap"><table><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}<th>Country acquisition</th></tr></thead><tbody>{countries.map((country) => { const job=country.job,canPause=job?.state==='queued'||job?.state==='running',canResume=job?.state==='paused'; return <tr key={country.country}><td>{country.country}</td><td>{country.totalCourses}</td><td>{country.coursesWithCoordinates}</td><td>{country.coursesMissingCoordinates}</td><td>{country.golfApiImportedCount}</td><td>{country.directConfirmedCount}</td><td>{country.providerEvidenceMissingCount}</td><td>{country.latestGolfriendFetchTime ? new Date(country.latestGolfriendFetchTime).toLocaleString() : 'Unavailable'}</td><td>{country.country==='UNKNOWN'?'Unavailable':job?<>{job.state}{job.state==='paused'&&job.retryAtMs?` — retry ${timestamp(job.retryAtMs)}`:''}{job.state==='completed'&&job.nextDueAtMs?` — next ${timestamp(job.nextDueAtMs)}`:''}</>:'unavailable'}</td><td>{country.country==='UNKNOWN'?<span>Unavailable</span>:confirmCountry===country.country?<><button onClick={()=>void action(country.country,'start')}>Confirm Start</button><button onClick={()=>setConfirmCountry(null)}>Cancel</button></>:<><button onClick={()=>void action(country.country,'plan')}>Preview Plan</button>{canPause?<button onClick={()=>void action(country.country,'pause')}>Pause</button>:canResume?<button onClick={()=>void action(country.country,'resume')}>Resume</button>:<button onClick={()=>setConfirmCountry(country.country)}>Start</button>}</>}</td></tr>; })}</tbody></table></div>}{message&&<p role="status">{message}</p>}
  </section>;
}
