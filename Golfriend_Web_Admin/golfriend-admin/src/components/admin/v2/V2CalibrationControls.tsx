// ============================================================================
// Golf API cost-calibration controls.
//
// This is a CLIENT SURFACE ONLY. It contains no calibration logic: arming, mode
// selection, the single-use claim, provider execution, cost measurement, quota
// settlement, receipt writing and the unconditional re-lock all live server-side in
// functions-course-catalogue (calibration.js / index.js) and are unchanged by this file.
//
// Three independent conditions must ALL hold before a control is even rendered:
//   1. an active Director record (server-owned admin_users/{uid}, via the shell identity);
//   2. a real App Check attestation in this build;
//   3. the browser believes it is online, so authority can still be revalidated.
//
// The server enforces the same authority again on every call (enforceAppCheck + the
// director() predicate + verifyCalibrationActivation). This gate exists so an operator
// is told why a control is unavailable, never to be the thing that makes it safe.
// ============================================================================
import { useContext, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../firebaseConfig';
import { AdminIdentityContext, type AdminIdentity } from './AdminIdentityContext';
import { calibrationBlockedReason } from './calibrationAuthority.js';
import { useT } from '../../../i18n/hooks.ts';
import { FOUNDER_ACCESS } from '../../../i18n/admin/founderAccess.ts';

type Target = { key: string; label: string };
type Result = { state: 'completed' | 'failed'; receiptId: string; providerRequestCount: number; remainingQuota: number | null; targets: Array<{ target: Target; classification: 'A' | 'B' | 'C' | 'D' }> };

export default function V2CalibrationControls({ identity }: { identity?: AdminIdentity } = {}) {
  const contextIdentity = useContext(AdminIdentityContext);
  const effectiveIdentity = identity ?? contextIdentity;
  const ft = useT(FOUNDER_ACCESS as unknown as Record<string, Record<string, string>>);
  const [busy, setBusy] = useState<'arm' | 'run' | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [targets, setTargets] = useState<Target[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const blocked = calibrationBlockedReason(effectiveIdentity);
  if (blocked) {
    const copy = blocked === 'offline' ? ft('calibrationOffline')
      : blocked === 'attestation' ? ft('calibrationAttestationRequired')
      : ft('calibrationDirectorRequired');
    return (
      <section aria-labelledby="calibration-controls-title" className="calibration-controls">
        <h3 id="calibration-controls-title">{ft('calibrationTitle')}</h3>
        <p role="status" aria-live="polite">{copy}</p>
      </section>
    );
  }

  // The client cannot supply a club, course or query. The server creates a one-use
  // arm token for its own fixed target set, then consumes only that token.
  const arm = async () => {
    setBusy('arm'); setNotice(null); setResult(null);
    try {
      const response = await httpsCallable(functions, 'armGolfApiSixCourseCalibration')({});
      const value = response.data as { runId?: unknown; targets?: unknown };
      if (typeof value.runId !== 'string' || !Array.isArray(value.targets)) throw Error('ARM_RESPONSE_INVALID');
      setRunId(value.runId);
      setTargets(value.targets.filter((item): item is Target => Boolean(item) && typeof (item as Target).key === 'string' && typeof (item as Target).label === 'string'));
      setNotice(ft('calibrationArmed'));
    } catch { setNotice(ft('calibrationUnavailable')); } finally { setBusy(null); }
  };
  const run = async () => {
    if (!runId) return;
    setBusy('run'); setNotice(null);
    try {
      const response = await httpsCallable(functions, 'runGolfApiSixCourseCalibration')({ runId });
      const value = response.data as Result;
      if ((value?.state !== 'completed' && value?.state !== 'failed') || typeof value.receiptId !== 'string' || !Array.isArray(value.targets)) throw Error('RUN_RESPONSE_INVALID');
      setResult(value); setRunId(null); if (value.state === 'failed') setNotice(ft('calibrationUnavailable'));
    } catch { setNotice(ft('calibrationUnavailable')); } finally { setBusy(null); }
  };

  return (
    <section aria-labelledby="calibration-controls-title" className="calibration-controls">
      <h3 id="calibration-controls-title">{ft('calibrationTitle')}</h3>
      <p>{ft('calibrationSixScope')}</p>
      <div role="group" aria-label={ft('calibrationTitle')}>
        <button type="button" disabled={busy !== null || runId !== null} onClick={() => { void arm(); }}>{ft('calibrationArm')}</button>
        <button type="button" disabled={busy !== null || runId === null} onClick={() => { void run(); }}>{ft('calibrationRun')}</button>
      </div>
      {targets.length > 0 && <ol aria-label="Locked calibration targets">{targets.map(target => <li key={target.key}>{target.label}</li>)}</ol>}
      {notice && <p role="status" aria-live="polite">{notice}</p>}
      {result && <div aria-live="polite"><p>{ft('calibrationReceipt')}: {result.receiptId}</p><p>{ft('calibrationRequests')}: {result.providerRequestCount}</p><p>{ft('calibrationRemaining')}: {result.remainingQuota ?? '—'}</p><p>A — COMPLETE USABLE CARD · B — PARTIAL CARD · C — CARD EXISTS BUT LAYOUT MAPPING AMBIGUOUS · D — NO CARD</p><table><thead><tr><th scope="col">Course</th><th scope="col">Result</th></tr></thead><tbody>{result.targets.map(item => <tr key={item.target.key}><td>{item.target.label}</td><td>{item.classification}</td></tr>)}</tbody></table></div>}
    </section>
  );
}
