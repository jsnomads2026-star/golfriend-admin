// ==========================================
// FILE: src/components/B2B/PartnerDocuments.tsx
// Partner application intake + status tracking (slice 1a/2a).
//
// Metadata + document CHECKLIST (attestation) + consent + attestation are
// submitted through the server-authoritative submitPartnerApplication callable
// (writes the caller's own partner_submissions/{uid}). Submitting NEVER grants
// partner status — approval leads to STAFF-controlled provisioning.
//
// Binary file upload is honestly unavailable (no Storage yet): the applicant
// attests they hold each document and will upload once it opens. The client only
// READS its own submission for status tracking; all writes go via the callable.
// ==========================================
import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../../firebaseConfig';
import { useT, useLocale } from '../../i18n/hooks.ts';
import { DOCUMENTS } from '../../i18n/partner/documents.ts';
import { INTAKE } from '../../i18n/partner/intake.ts';

const REQUIRED_DOCS = ['business_registration', 'ownership_or_authorization', 'responsible_person_id'] as const;
type DocKey = typeof REQUIRED_DOCS[number];

interface Submission {
  status: string;
  reviewNote?: string;
  missingDocuments?: string[];
}

const OPEN_STATES = new Set(['info_needed', 'rejected', 'draft']);

export default function PartnerDocuments({ partnerUid }: { partnerUid: string }) {
  const t = useT(INTAKE);
  const tc = useT(DOCUMENTS);
  const locale = useLocale();

  const [checklist, setChecklist] = useState<Record<DocKey, boolean>>({
    business_registration: false, ownership_or_authorization: false, responsible_person_id: false,
  });
  const [consent, setConsent] = useState(false);
  const [attest, setAttest] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [note, setNote] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [submission, setSubmission] = useState<Submission | null | 'loading'>('loading');

  const loadStatus = async () => {
    if (!partnerUid || partnerUid === 'UNKNOWN_USER') { setSubmission(null); return; }
    try {
      const snap = await getDoc(doc(db, 'partner_submissions', partnerUid));
      setSubmission(snap.exists() ? (snap.data() as Submission) : null);
    } catch {
      setSubmission(null);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerUid]);

  const formOpen = submission === null || (submission !== 'loading' && OPEN_STATES.has(submission.status));
  const hasSubmission = submission !== null && submission !== 'loading';

  const submit = async () => {
    if (!consent || !attest) { setNote({ msg: t('needConsentAttest'), type: 'error' }); return; }
    setSubmitting(true); setNote(null);
    try {
      const fn = httpsCallable(getFunctions(), 'submitPartnerApplication');
      const res = await fn({ checklist, consentAccepted: consent, attestationAccepted: attest, locale });
      if (!(res.data as { success?: boolean })?.success) throw new Error('not accepted');
      // Keep the onboarding hub's local consent signal in sync (client-side only).
      try { localStorage.setItem(`golfriend.partner.documents.draft.${partnerUid || 'anon'}`, JSON.stringify({ consent: true, consentLocale: locale, savedAt: new Date().toISOString() })); } catch { /* ignore */ }
      setNote({ msg: t('submittedOk'), type: 'success' });
      await loadStatus();
    } catch {
      setNote({ msg: t('submitFailed'), type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const statusLabel = (s: string) => ({
    submitted: t('st_submitted'), under_review: t('st_under_review'), approved: t('st_approved'),
    rejected: t('st_rejected'), info_needed: t('st_info_needed'),
  } as Record<string, string>)[s] || s;

  const docLabel = (d: DocKey) => t(('doc_' + d) as Parameters<typeof t>[0]);

  return (
    <div style={{ padding: '20px', color: '#fff', maxWidth: '900px', margin: '0 auto' }}>
      {note && (
        <div role="status" aria-live="polite" style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 8, fontSize: 13, lineHeight: 1.5,
          backgroundColor: note.type === 'error' ? 'rgba(255,68,68,0.14)' : note.type === 'success' ? 'rgba(76,175,80,0.14)' : 'rgba(212,175,55,0.14)',
          border: `1px solid ${note.type === 'error' ? '#ff4444' : note.type === 'success' ? '#4CAF50' : '#d4af37'}`,
          color: note.type === 'error' ? '#ff8a8a' : note.type === 'success' ? '#a5d6a7' : '#e6c84f' }}>{note.msg}</div>
      )}

      <div style={{ marginBottom: 24 }}>
        <h2 style={{ color: '#d4af37', margin: 0, letterSpacing: '1px' }}>{tc('title')}</h2>
        <p style={{ color: '#888', fontSize: 14, marginTop: 5 }}>{tc('subtitle')}</p>
      </div>

      {/* STATUS */}
      <div style={card}>
        <h3 style={cardHead}>{t('statusHeading')}</h3>
        {submission === 'loading' ? (
          <p style={{ color: '#888', fontSize: 13 }}>…</p>
        ) : submission === null ? (
          <p style={{ color: '#888', fontSize: 13 }}>{t('statusNone')}</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 14, color: '#a5d6a7', fontWeight: 700 }}>{statusLabel(submission.status)}</span>
            {submission.reviewNote ? <div style={{ fontSize: 13, color: '#ccc' }}><strong>{t('reviewNoteLabel')}:</strong> {submission.reviewNote}</div> : null}
            {Array.isArray(submission.missingDocuments) && submission.missingDocuments.length > 0 && (
              <div style={{ fontSize: 12, color: '#FFC107' }}>{t('missingLabel')}: {submission.missingDocuments.map((d) => docLabel(d as DocKey)).join(', ')}</div>
            )}
          </div>
        )}
      </div>

      {formOpen && (
        <>
          {/* CHECKLIST + honest file-upload state */}
          <div style={card}>
            <h3 style={cardHead}>{t('checklistHeading')}</h3>
            <p style={{ color: '#888', fontSize: 12, marginTop: 0 }}>{t('checklistHint')}</p>
            <div aria-label={t('fileUploadUnavailable')} style={{ display: 'inline-block', padding: '6px 12px', borderRadius: 6, border: '1px dashed #555', color: '#888', fontSize: 12, marginBottom: 12 }}>⛔ {t('fileUploadUnavailable')}</div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {REQUIRED_DOCS.map((d) => (
                <li key={d} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', backgroundColor: '#1a1a1a', borderRadius: 6, border: '1px solid #222' }}>
                  <input type="checkbox" checked={checklist[d]} onChange={(e) => setChecklist((p) => ({ ...p, [d]: e.target.checked }))} style={{ marginTop: 3 }} aria-label={docLabel(d)} />
                  <div><div style={{ fontSize: 13, fontWeight: 700 }}>{docLabel(d)}</div><div style={{ fontSize: 12, color: '#888' }}>{t('attestHave')}</div></div>
                </li>
              ))}
            </ul>
          </div>

          {/* CONSENT */}
          <div style={card}>
            <h3 style={cardHead}>{tc('consentHeading')}</h3>
            <p style={{ color: '#ccc', fontSize: 13, lineHeight: 1.6 }}>{tc('consentBody')}</p>
            <label style={checkRow}><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 3 }} /><span>{tc('consentCheckbox')}</span></label>
          </div>

          {/* ATTESTATION */}
          <div style={card}>
            <h3 style={cardHead}>{t('attestationHeading')}</h3>
            <p style={{ color: '#ccc', fontSize: 13, lineHeight: 1.6 }}>{t('attestationText')}</p>
            <label style={checkRow}><input type="checkbox" checked={attest} onChange={(e) => setAttest(e.target.checked)} style={{ marginTop: 3 }} /><span>{t('attestationCheckbox')}</span></label>
          </div>

          <button onClick={submit} disabled={submitting} style={{ padding: '10px 18px', backgroundColor: submitting ? '#555' : '#d4af37', color: '#000', border: 'none', borderRadius: 6, fontWeight: 800, cursor: submitting ? 'not-allowed' : 'pointer' }}>
            {submitting ? t('submitting') : (hasSubmission ? t('resubmit') : t('submitApplication'))}
          </button>
        </>
      )}
    </div>
  );
}

const card: React.CSSProperties = { backgroundColor: '#111', border: '1px solid #333', borderRadius: 8, padding: 20, marginBottom: 20 };
const cardHead: React.CSSProperties = { marginTop: 0, color: '#fff', fontSize: 15 };
const checkRow: React.CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', fontSize: 13, color: '#fff' };
