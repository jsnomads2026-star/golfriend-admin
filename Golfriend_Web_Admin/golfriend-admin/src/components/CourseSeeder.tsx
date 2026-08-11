import { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDocs, setDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../firebaseConfig';

type Course = Record<string, any>;
type Preview = {
  jobId: string;
  discovered: number;
  alreadyInFirebase: number;
  newCoursesReady: number;
  remainingAfterBatch: number;
  apiCallsUsed: number;
  courses: Array<{courseID: string; clubName: string; name: string; country?: string}>;
};
type CommitResult = {
  added: number;
  skippedExisting: number;
  reviewRequired: number;
  failed: number;
  apiCallsUsed: number;
  errors: Array<{courseID: string; message: string}>;
};

function hasCoordinates(course: Course) {
  const latitude = Number(course.latitude ?? course.lat);
  const longitude = Number(course.longitude ?? course.lng);
  return Number.isFinite(latitude) && latitude !== 0 && Number.isFinite(longitude) && longitude !== 0;
}

export default function CourseSeeder() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [location, setLocation] = useState('12.9236, 100.8825');
  const [radiusKm, setRadiusKm] = useState('50');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [working, setWorking] = useState<'preview' | 'commit' | null>(null);
  const [search, setSearch] = useState('');
  const [manualGps, setManualGps] = useState<Record<string, string>>({});

  const addLog = (message: string) => setLogs((current) => [...current, message]);

  const fetchVault = async () => {
    const snapshot = await getDocs(collection(db, 'courses'));
    setCourses(snapshot.docs.map((item) => ({docId: item.id, ...item.data()})));
  };

  useEffect(() => {
    fetchVault().catch((error) => addLog(`Failed to read Firebase courses: ${error.message}`));
  }, []);

  const health = useMemo(() => {
    const review = courses.filter((course) => course.requiresCoordinatorReview || course.requiresManualGPS).length;
    const missingGps = courses.filter((course) => !hasCoordinates(course)).length;
    return {total: courses.length, review, missingGps};
  }, [courses]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return courses;
    return courses.filter((course) =>
      [course.clubName, course.name, course.country, course.courseID]
        .some((value) => String(value || '').toLowerCase().includes(query)),
    );
  }, [courses, search]);

  const previewImport = async () => {
    const [latitude, longitude] = location.split(',').map((value) => Number(value.trim()));
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      addLog('Enter coordinates as latitude, longitude.');
      return;
    }
    setWorking('preview');
    setPreview(null);
    try {
      const call = httpsCallable(getFunctions(), 'previewCourseRegionImport');
      const response = await call({latitude, longitude, radiusKm: Number(radiusKm)});
      const result = response.data as Preview;
      setPreview(result);
      addLog(`Preview ${result.jobId}: ${result.discovered} discovered, ${result.alreadyInFirebase} cached, ${result.newCoursesReady} ready to add. One API call used.`);
    } catch (error: any) {
      addLog(`Preview failed: ${error.message}`);
    } finally {
      setWorking(null);
    }
  };

  const commitImport = async () => {
    if (!preview) return;
    setWorking('commit');
    try {
      const call = httpsCallable(getFunctions(), 'commitCourseRegionImport');
      const response = await call({jobId: preview.jobId});
      const result = response.data as CommitResult;
      addLog(`Commit complete: ${result.added} added, ${result.skippedExisting} skipped, ${result.reviewRequired} need review, ${result.failed} failed, ${result.apiCallsUsed} API calls used.`);
      result.errors?.forEach((error) => addLog(`${error.courseID}: ${error.message}`));
      setPreview(null);
      await fetchVault();
    } catch (error: any) {
      addLog(`Commit failed: ${error.message}`);
    } finally {
      setWorking(null);
    }
  };

  const saveManualCoordinates = async (course: Course) => {
    const courseId = String(course.courseID || course.docId || '');
    const [latitude, longitude] = (manualGps[courseId] || '').split(',').map((value) => Number(value.trim()));
    if (!courseId || !Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      addLog(`Invalid manual coordinates for ${course.clubName || course.name}.`);
      return;
    }
    await setDoc(doc(db, 'courses', course.docId || courseId), {
      latitude, longitude, lat: latitude, lng: longitude,
      requiresCoordinatorReview: false,
      requiresManualGPS: false,
      manuallyCorrected: true,
      lastManualCorrectionAt: new Date().toISOString(),
    }, {merge: true});
    setManualGps((current) => ({...current, [courseId]: ''}));
    addLog(`Saved coordinator coordinates for ${course.clubName || course.name}.`);
    await fetchVault();
  };

  return (
    <div style={{padding: 20, margin: 20, color: '#fff', background: '#171a1d', border: '1px solid #34513e', borderRadius: 12}}>
      <h2 style={{marginTop: 0, color: '#d4af37'}}>Golf Course Data Operations</h2>
      <p style={{color: '#bbb'}}>Firebase first. Preview before commit. Golf API credentials remain server-side.</p>

      <div style={{display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18}}>
        <strong>Firebase courses: {health.total}</strong>
        <span>Coordinator review: {health.review}</span>
        <span>Missing GPS: {health.missingGps}</span>
      </div>

      <div style={{padding: 16, background: '#0f1214', borderRadius: 8, marginBottom: 18}}>
        <h3 style={{marginTop: 0}}>Regional growth batch</h3>
        <div style={{display: 'flex', gap: 8, flexWrap: 'wrap'}}>
          <input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="latitude, longitude" style={{minWidth: 230, padding: 9}} />
          <input type="number" min="1" max="200" value={radiusKm} onChange={(event) => setRadiusKm(event.target.value)} style={{width: 90, padding: 9}} />
          <button onClick={previewImport} disabled={working !== null} style={{padding: '9px 15px'}}> {working === 'preview' ? 'Checking…' : 'Preview missing courses'} </button>
        </div>

        {preview && (
          <div style={{marginTop: 14, padding: 14, border: '1px solid #d4af37', borderRadius: 8}}>
            <div>{preview.discovered} discovered · {preview.alreadyInFirebase} already cached · {preview.newCoursesReady} ready to add</div>
            {preview.remainingAfterBatch > 0 && <div>{preview.remainingAfterBatch} remain for the next controlled batch.</div>}
            <ul>{preview.courses.map((course) => <li key={course.courseID}>{course.clubName} — {course.name} {course.country ? `(${course.country})` : ''}</li>)}</ul>
            <button onClick={commitImport} disabled={working !== null || preview.newCoursesReady === 0} style={{padding: '9px 15px', background: '#1f6d42', color: '#fff'}}>
              {working === 'commit' ? 'Importing…' : `Approve and add ${preview.newCoursesReady}`}
            </button>
          </div>
        )}
      </div>

      <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search Firebase courses" style={{width: '100%', boxSizing: 'border-box', padding: 9, marginBottom: 10}} />
      <div style={{maxHeight: 320, overflowY: 'auto'}}>
        {filtered.map((course) => {
          const courseId = String(course.courseID || course.docId || '');
          return (
            <div key={course.docId || courseId} style={{padding: 10, borderBottom: '1px solid #333'}}>
              <strong>{course.clubName || course.name || courseId}</strong> — {course.name || 'Course'} · {course.country || 'Unknown country'}
              {!hasCoordinates(course) && (
                <div style={{display: 'flex', gap: 8, marginTop: 7}}>
                  <input value={manualGps[courseId] || ''} onChange={(event) => setManualGps((current) => ({...current, [courseId]: event.target.value}))} placeholder="latitude, longitude" />
                  <button onClick={() => saveManualCoordinates(course)}>Save verified GPS</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{marginTop: 18, padding: 12, background: '#080909', maxHeight: 220, overflowY: 'auto', fontFamily: 'monospace', fontSize: 12}}>
        {logs.length ? logs.map((log, index) => <div key={`${index}-${log}`}>{log}</div>) : 'Ready for a dry-run preview.'}
      </div>
    </div>
  );
}
