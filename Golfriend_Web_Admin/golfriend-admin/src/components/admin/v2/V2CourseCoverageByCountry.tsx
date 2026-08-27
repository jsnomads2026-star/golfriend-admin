import { useCallback, useEffect, useState } from 'react';
import type { CountryCoverage, CourseOperationsService } from './courseOperationsService';

const headers = ['Country', 'Total courses', 'With coordinates', 'Missing coordinates', 'Golf API imported', 'Direct-confirmed', 'Provider evidence missing', 'Latest Golfriend fetch'];

export default function V2CourseCoverageByCountry({ service }: { service: CourseOperationsService }) {
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [countries, setCountries] = useState<CountryCoverage[]>([]);
  const load = useCallback(async () => {
    setState('loading');
    try { setCountries(await service.loadCountryCoverage()); setState('ready'); }
    catch { setState('unavailable'); }
  }, [service]);
  useEffect(() => { void load(); }, [load]);
  return <section className="course-catalogue" aria-labelledby="course-coverage-by-country-title">
    <div className="course-toolbar"><h3 id="course-coverage-by-country-title">Course Coverage by Country</h3><p>Server-authoritative aggregate. No country is inferred from coordinates.</p></div>
    {state === 'loading' && <div className="course-state" role="status" aria-live="polite">Loading country coverage…</div>}
    {state === 'unavailable' && <div className="course-state is-error" role="alert"><p>Country coverage is unavailable.</p><button onClick={() => void load()}>Retry</button></div>}
    {state === 'ready' && countries.length === 0 && <div className="course-state">No course records are available.</div>}
    {state === 'ready' && countries.length > 0 && <div className="course-table-wrap"><table><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{countries.map((country) => <tr key={country.country}><td>{country.country}</td><td>{country.totalCourses}</td><td>{country.coursesWithCoordinates}</td><td>{country.coursesMissingCoordinates}</td><td>{country.golfApiImportedCount}</td><td>{country.directConfirmedCount}</td><td>{country.providerEvidenceMissingCount}</td><td>{country.latestGolfriendFetchTime ? new Date(country.latestGolfriendFetchTime).toLocaleString() : 'Unavailable'}</td></tr>)}</tbody></table></div>}
  </section>;
}
