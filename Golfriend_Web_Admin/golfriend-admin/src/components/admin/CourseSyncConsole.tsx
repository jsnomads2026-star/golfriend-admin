// ==========================================
// FILE: src/components/admin/CourseSyncConsole.tsx
// Server-driven Golf-API course sync. The provider key lives only on the server;
// this console just invokes syncCoursesFromProvider in "preview" (dry-run) or
// "apply" mode and renders per-course success/conflict/error results.
// ==========================================
import { useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { functions } from '../../firebaseConfig';

interface ResultRow {
  courseId: string;
  result: string;
  message: string;
  before?: { latitude: number | null; longitude: number | null };
  after?: { latitude: number; longitude: number };
}

const RESULT_COLORS: Record<string, string> = {
  updated: '#4CAF50',
  nochange: '#888',
  conflict: '#ff9800',
  missing: '#ff9800',
  skipped_manual: '#1E88E5',
  error: '#ff4444',
};

export default function CourseSyncConsole({ isDirector }: { isDirector: boolean }) {
  const [idsText, setIdsText] = useState('');
  const [limit, setLimit] = useState('10');
  const [isBusy, setIsBusy] = useState(false);
  const [lastMode, setLastMode] = useState<string | null>(null);
  const [summary, setSummary] = useState<Record<string, number> | null>(null);
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [note, setNote] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [clubId, setClubId] = useState('');
  const [detailBusy, setDetailBusy] = useState(false);
  const [courseDetail, setCourseDetail] = useState<unknown>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  const notify = (msg: string, type: 'success' | 'error') => {
    setNote({ msg, type });
    setTimeout(() => setNote(null), 4000);
  };

  const run = async (mode: 'preview' | 'apply') => {
    setIsBusy(true);
    try {
      const ids = idsText.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
      const payload: any = { mode };
      if (ids.length) payload.courseIds = ids;
      else payload.limit = parseInt(limit, 10) || 10;

      const fn = httpsCallable(getFunctions(), 'syncCoursesFromProvider');
      const res: any = await fn(payload);
      if (!res?.data?.success) throw new Error('Sync did not complete.');
      setLastMode(mode);
      setSummary(res.data.summary || {});
      setRows(res.data.results || []);
      notify(`${mode === 'preview' ? 'Dry-run' : 'Apply'} complete: ${res.data.processed} course(s).`, 'success');
    } catch (e: any) {
      notify(e?.message || 'Sync failed.', 'error');
    } finally {
      setIsBusy(false);
    }
  };

  const hasUpdates = rows.some((r) => r.result === 'updated');
  const inspectCourseDetail = async () => {
    const value = clubId.trim();
    if (!value) return;
    setDetailBusy(true); setDetailError(null); setCourseDetail(null);
    try {
      // This is the V2-configured client. Do not use the legacy getFunctions() call above:
      // it defaults to us-central1 and can never reach asia-southeast1 queryGolfApi.
      const response = await httpsCallable(functions, 'queryGolfApi')({ operation: 'course-detail-diagnostic', clubId: value });
      setCourseDetail((response.data as { courseDetail?: unknown }).courseDetail ?? null);
    } catch (error: any) {
      setDetailError(error?.message || 'Course detail is unavailable.');
    } finally {
      setDetailBusy(false);
    }
  };

  return (
    <div style={{ padding: '24px', color: '#fff' }}>
      {note && (
        <div style={{ position: 'fixed', top: '20px', right: '20px', padding: '16px 24px', zIndex: 1000, backgroundColor: note.type === 'error' ? '#ff4444' : '#4CAF50', borderRadius: '8px', fontWeight: 'bold' }}>{note.msg}</div>
      )}

      <div style={{ borderBottom: '1px solid #333', paddingBottom: '12px', marginBottom: '20px' }}>
        <h2 style={{ color: '#d4af37', margin: 0 }}>🛰️ Course Provider Sync</h2>
        <p style={{ color: '#888', fontSize: '13px', marginTop: '6px', marginBottom: 0 }}>
          Golf-API credentials stay on the server. Preview proposes changes without writing; Apply commits validated updates,
          preserves manual corrections and last-known-good coordinates, and writes an audit record per change.
        </p>
      </div>

      <div style={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'end', flexWrap: 'wrap' }}>
          <div style={{ flex: 2, minWidth: '280px' }}>
            <label style={labelStyle}>Course provider IDs (optional, comma/space separated)</label>
            <input value={idsText} onChange={(e) => setIdsText(e.target.value)} placeholder="Leave blank to auto-select courses with broken coordinates" style={inputStyle} />
          </div>
          <div style={{ width: '120px' }}>
            <label style={labelStyle}>Batch limit</label>
            <input type="number" min={1} max={25} value={limit} onChange={(e) => setLimit(e.target.value)} disabled={idsText.trim().length > 0} style={inputStyle} />
          </div>
          <button onClick={() => run('preview')} disabled={isBusy} style={{ ...btn, backgroundColor: '#1E88E5', color: '#fff' }}>
            {isBusy && lastMode !== 'apply' ? 'RUNNING…' : '🔍 DRY-RUN PREVIEW'}
          </button>
          <button onClick={() => run('apply')} disabled={isBusy || !hasUpdates} title={hasUpdates ? '' : 'Run a preview first; enabled when there are updates to apply.'} style={{ ...btn, backgroundColor: hasUpdates ? '#d4af37' : '#333', color: hasUpdates ? '#000' : '#777', cursor: hasUpdates && !isBusy ? 'pointer' : 'not-allowed' }}>
            ✅ APPLY UPDATES
          </button>
        </div>
        <div style={{ color: '#666', fontSize: '11px', marginTop: '10px' }}>Bounded to ≤25 courses per run · rate-limited with retry/backoff · idempotent (re-running applied courses reports "nochange").</div>
      </div>

      {isDirector && <div style={{ backgroundColor: '#111', border: '1px solid #d4af37', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
        <h3 style={{ color: '#d4af37', marginTop: 0 }}>Club detail diagnostic</h3>
        <p style={{ color: '#aaa', fontSize: '13px' }}>Reads the provider’s raw club-detail response. It does not write course data, rate-limit state, or a diagnostic record.</p>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '240px' }}><label style={labelStyle}>Provider club ID</label><input value={clubId} onChange={(event) => setClubId(event.target.value)} placeholder="0111196091131202" style={inputStyle} /></div>
          <button onClick={() => void inspectCourseDetail()} disabled={detailBusy || !clubId.trim()} style={{ ...btn, backgroundColor: '#d4af37', color: '#000', cursor: detailBusy || !clubId.trim() ? 'not-allowed' : 'pointer' }}>{detailBusy ? 'READING…' : 'INSPECT DETAIL'}</button>
        </div>
        {detailError && <p role="alert" style={{ color: '#ff7777', marginBottom: 0 }}>{detailError}</p>}
        {courseDetail !== null && <pre aria-label="Raw club detail response" style={{ marginTop: '16px', marginBottom: 0, maxHeight: '360px', overflow: 'auto', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', padding: '12px', backgroundColor: '#0a0a0a', border: '1px solid #333', color: '#d8e8dc', fontSize: '12px' }}>{JSON.stringify(courseDetail, null, 2)}</pre>}
      </div>}

      {summary && (
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
          {Object.entries(summary).map(([k, v]) => (
            <span key={k} style={{ padding: '6px 12px', borderRadius: '6px', backgroundColor: '#1a1a1a', border: `1px solid ${RESULT_COLORS[k] || '#555'}`, color: RESULT_COLORS[k] || '#ccc', fontSize: '12px', fontWeight: 'bold' }}>
              {k}: {v}
            </span>
          ))}
          {lastMode && <span style={{ padding: '6px 12px', color: '#888', fontSize: '12px' }}>({lastMode})</span>}
        </div>
      )}

      {rows.length > 0 && (
        <div style={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '8px', padding: '16px', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
            <thead>
              <tr style={{ color: '#888', borderBottom: '1px solid #333' }}>
                <th style={th}>Course ID</th><th style={th}>Result</th><th style={th}>Before</th><th style={th}>After</th><th style={th}>Detail</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.courseId} style={{ borderBottom: '1px solid #222' }}>
                  <td style={{ ...td, fontFamily: 'monospace', color: '#aaa' }}>{r.courseId}</td>
                  <td style={td}>
                    <span style={{ padding: '3px 8px', borderRadius: '4px', fontWeight: 'bold', textTransform: 'uppercase', fontSize: '11px', color: RESULT_COLORS[r.result] || '#ccc', backgroundColor: '#0a0a0a', border: `1px solid ${RESULT_COLORS[r.result] || '#555'}` }}>{r.result}</span>
                  </td>
                  <td style={{ ...td, fontFamily: 'monospace' }}>{r.before && r.before.latitude != null ? `${r.before.latitude}, ${r.before.longitude}` : '—'}</td>
                  <td style={{ ...td, fontFamily: 'monospace', color: '#4CAF50' }}>{r.after ? `${r.after.latitude}, ${r.after.longitude}` : '—'}</td>
                  <td style={{ ...td, color: '#999' }}>{r.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const labelStyle = { display: 'block', color: '#888', fontSize: '11px', marginBottom: '6px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' };
const inputStyle = { width: '100%', padding: '9px', backgroundColor: '#0a0a0a', border: '1px solid #333', color: '#fff', borderRadius: '4px', boxSizing: 'border-box' as const };
const btn = { padding: '10px 18px', border: 'none', borderRadius: '6px', fontWeight: 900 as const, cursor: 'pointer', height: '40px' };
const th = { padding: '10px 12px', fontSize: '11px', fontWeight: 700 as const };
const td = { padding: '9px 12px', color: '#ccc' };
