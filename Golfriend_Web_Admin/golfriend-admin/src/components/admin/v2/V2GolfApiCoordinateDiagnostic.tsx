import { useContext, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../firebaseConfig';
import { AdminIdentityContext, type AdminIdentity } from './AdminIdentityContext';
import { coordinateEvidenceFromRaw, quotaEvidenceFromRaw, type CoordinateEvidence } from './golfApiCoordinateDiagnostic';

const TARGETS = Object.freeze([
  { name: 'Asia Pattaya Hotel Golf Course', clubId: '141519520198593734', courseId: '01114151974637461062' },
  { name: 'Pattaya Country Club', clubId: '141519520199382294', courseId: '0121225247069227' },
  { name: 'Chee Chan Golf Resort', clubId: '1618236956711724', courseId: '0121618236956711724' },
]);

type Result = {
  name: string; clubId: string; courseId: string; endpoint: string | null; providerHttpStatus: number | null;
  responseDigest: string | null; coordinates: CoordinateEvidence[]; quota: CoordinateEvidence[]; error: string | null;
};

const isActiveDirector = (identity: AdminIdentity | null | undefined) => identity?.role === 'Director' && identity.status?.trim().toLocaleLowerCase() === 'active' && identity.appCheck === true && identity.online === true;

export default function V2GolfApiCoordinateDiagnostic() {
  const identity = useContext(AdminIdentityContext);
  const attempted = useRef(new Set<string>());
  const [results, setResults] = useState<Result[]>([]);
  const [running, setRunning] = useState(false);
  if (!isActiveDirector(identity)) return null;
  const run = async () => {
    setRunning(true);
    const call = httpsCallable(functions, 'queryGolfApi');
    const next: Result[] = [];
    for (const target of TARGETS) {
      if (attempted.current.has(target.clubId)) continue;
      attempted.current.add(target.clubId);
      try {
        const response = await call({ operation: 'course-detail-diagnostic', clubId: target.clubId });
        const value = response.data as { courseDetail?: unknown; diagnostic?: { endpoint?: unknown; providerHttpStatus?: unknown; responseDigest?: unknown } };
        next.push({
          ...target,
          endpoint: typeof value.diagnostic?.endpoint === 'string' ? value.diagnostic.endpoint : null,
          providerHttpStatus: typeof value.diagnostic?.providerHttpStatus === 'number' ? value.diagnostic.providerHttpStatus : null,
          responseDigest: typeof value.diagnostic?.responseDigest === 'string' ? value.diagnostic.responseDigest : null,
          coordinates: coordinateEvidenceFromRaw(value.courseDetail), quota: quotaEvidenceFromRaw(value.courseDetail), error: null,
        });
      } catch {
        next.push({ ...target, endpoint: `/api/v2.3/clubs/${target.clubId}`, providerHttpStatus: null, responseDigest: null, coordinates: [], quota: [], error: 'The provider diagnostic did not return a successful result.' });
      }
    }
    setResults(current => [...current, ...next]);
    setRunning(false);
  };
  const evidence = JSON.stringify(results, null, 2);
  return <section className="course-section" aria-labelledby="golf-api-coordinate-diagnostic-title">
    <p className="course-eyebrow">DIRECTOR DIAGNOSTIC</p><h3 id="golf-api-coordinate-diagnostic-title">Golf API coordinate evidence</h3>
    <p>Runs only the three approved club-detail reads. It stores nothing and shows only coordinate paths, quota paths, provider status, and a response digest.</p>
    <button disabled={running || attempted.current.size === TARGETS.length} onClick={() => void run()}>{running ? 'Checking approved clubs…' : 'Check three approved clubs'}</button>
    {results.length > 0 && <textarea aria-label="Copy-safe Golf API coordinate evidence" readOnly value={evidence} rows={Math.min(28, Math.max(8, results.length * 8))} />}
  </section>;
}
