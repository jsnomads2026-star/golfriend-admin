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

export type CalibrationMode = 'list_only' | 'detail_only';

export default function V2CalibrationControls({ identity }: { identity?: AdminIdentity } = {}) {
  const contextIdentity = useContext(AdminIdentityContext);
  const effectiveIdentity = identity ?? contextIdentity;
  const ft = useT(FOUNDER_ACCESS as unknown as Record<string, Record<string, string>>);
  const [busy, setBusy] = useState<CalibrationMode | 'run' | null>(null);
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

  // Both calls are App Check-protected, Director-only callables. Arming and running are
  // deliberately two separate operator actions: the server treats each arm as single-use.
  const call = async (name: string, mode: CalibrationMode, marker: CalibrationMode | 'run') => {
    setBusy(marker);
    setNotice(null);
    try {
      const response = await httpsCallable(functions, name)({ mode });
      const value = response.data as Record<string, unknown> | null;
      setNotice(typeof value?.state === 'string' ? String(value.state) : 'completed');
    } catch {
      // Never surface a raw provider or transport error to the console.
      setNotice('unavailable');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section aria-labelledby="calibration-controls-title" className="calibration-controls">
      <h3 id="calibration-controls-title">{ft('calibrationTitle')}</h3>
      <div role="group" aria-label={ft('calibrationTitle')}>
        <button type="button" disabled={busy !== null}
          onClick={() => { void call('armGolfApiCalibrationCanary', 'list_only', 'list_only'); }}>
          Arm list_only
        </button>
        <button type="button" disabled={busy !== null}
          onClick={() => { void call('runGolfApiCalibrationCanary', 'list_only', 'run'); }}>
          Run armed calibration
        </button>
      </div>
      {notice && <p role="status" aria-live="polite">{notice}</p>}
    </section>
  );
}
