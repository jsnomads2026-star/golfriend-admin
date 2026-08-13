// ==========================================
// FILE: src/components/B2B/PartnerDocuments.tsx
// Partner Documents & Consent (L1 slice 4).
//
// CLIENT-SIDE ONLY. This surface lets a partner prepare verification documents
// and capture consent, and saves a resumable DRAFT to localStorage. It performs
// NO authoritative writes and calls NO Cloud Functions — document intake is not
// yet commissioned, so submission is honestly unavailable. The original consent
// text shown to the operator is recorded in the draft (locale + timestamp) so it
// is preserved as the record of truth when the backend is later commissioned.
// ==========================================
import { useState } from 'react';
import { useT, useLocale } from '../../i18n/hooks.ts';
import { DOCUMENTS } from '../../i18n/partner/documents.ts';

interface DocumentDraft {
  fileNames: string[];
  consent: boolean;
  consentLocale: string;
  consentText: string;
  savedAt: string;
}

const draftKey = (uid: string) => `golfriend.partner.documents.draft.${uid || 'anon'}`;

function loadDraft(uid: string): DocumentDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(uid));
    return raw ? (JSON.parse(raw) as DocumentDraft) : null;
  } catch {
    return null;
  }
}

export default function PartnerDocuments({ partnerUid }: { partnerUid: string }) {
  const t = useT(DOCUMENTS);
  const locale = useLocale();
  // Restore a saved draft (resume) via lazy initializers — no effect needed.
  // Files themselves cannot be re-hydrated from storage, so their names are shown
  // as previously-selected for reference.
  const [initialDraft] = useState<DocumentDraft | null>(() => loadDraft(partnerUid));
  const [files, setFiles] = useState<File[]>([]);
  const [savedNames, setSavedNames] = useState<string[]>(() => initialDraft?.fileNames ?? []);
  const [consent, setConsent] = useState<boolean>(() => Boolean(initialDraft?.consent));
  const [note, setNote] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(
    () => (initialDraft ? { msg: t('draftRestored'), type: 'info' } : null),
  );

  const allNames = [...savedNames, ...files.map((f) => f.name)];

  const writeDraft = () => {
    const draft: DocumentDraft = {
      fileNames: allNames,
      consent,
      consentLocale: locale,
      consentText: t('consentBody'),
      savedAt: new Date().toISOString(),
    };
    try { localStorage.setItem(draftKey(partnerUid), JSON.stringify(draft)); } catch { /* ignore */ }
  };

  const saveDraft = () => { writeDraft(); setNote({ msg: t('draftSaved'), type: 'success' }); };

  const submit = () => {
    if (!consent) { setNote({ msg: t('consentRequired'), type: 'error' }); return; }
    writeDraft();
    // Honest state: no commissioned intake backend. Never fabricate success.
    setNote({ msg: t('submitUnavailable'), type: 'info' });
  };

  const removeSaved = (name: string) => setSavedNames((prev) => prev.filter((n) => n !== name));
  const removeFile = (idx: number) => setFiles((prev) => prev.filter((_, i) => i !== idx));

  return (
    <div style={{ padding: '20px', color: '#fff', maxWidth: '900px', margin: '0 auto' }}>
      {note && (
        <div role="status" aria-live="polite" style={{ marginBottom: '16px', padding: '12px 16px', borderRadius: '8px', fontSize: '13px', lineHeight: 1.5, backgroundColor: note.type === 'error' ? 'rgba(255,68,68,0.14)' : note.type === 'success' ? 'rgba(76,175,80,0.14)' : 'rgba(212,175,55,0.14)', border: `1px solid ${note.type === 'error' ? '#ff4444' : note.type === 'success' ? '#4CAF50' : '#d4af37'}`, color: note.type === 'error' ? '#ff8a8a' : note.type === 'success' ? '#a5d6a7' : '#e6c84f' }}>
          {note.msg}
        </div>
      )}

      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ color: '#d4af37', margin: 0, letterSpacing: '1px' }}>{t('title')}</h2>
        <p style={{ color: '#888', fontSize: '14px', marginTop: '5px' }}>{t('subtitle')}</p>
      </div>

      {/* UPLOAD */}
      <div style={card}>
        <h3 style={cardHead}>{t('uploadHeading')}</h3>
        <p style={{ color: '#888', fontSize: '12px', marginTop: 0 }}>{t('fileHint')}</p>
        <label style={{ display: 'inline-block', padding: '10px 16px', backgroundColor: '#d4af37', color: '#000', borderRadius: '6px', fontWeight: 800, cursor: 'pointer' }}>
          {t('chooseFiles')}
          <input
            type="file"
            multiple
            aria-label={t('chooseFiles')}
            onChange={(e) => setFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])])}
            style={{ display: 'none' }}
          />
        </label>

        <div style={{ marginTop: '14px' }}>
          {allNames.length === 0 ? (
            <div style={{ color: '#555', fontSize: '13px' }}>{t('noFiles')}</div>
          ) : (
            <>
              <div style={{ color: '#aaa', fontSize: '11px', textTransform: 'uppercase', marginBottom: '6px' }}>{t('selectedFiles')}</div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {savedNames.map((name) => (
                  <li key={`saved-${name}`} style={fileRow}>
                    <span style={{ fontSize: '13px' }}>📄 {name}</span>
                    <button onClick={() => removeSaved(name)} aria-label={t('removeAria')} style={removeBtn}>{t('remove')}</button>
                  </li>
                ))}
                {files.map((f, i) => (
                  <li key={`file-${f.name}-${i}`} style={fileRow}>
                    <span style={{ fontSize: '13px' }}>📄 {f.name}</span>
                    <button onClick={() => removeFile(i)} aria-label={t('removeAria')} style={removeBtn}>{t('remove')}</button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      {/* CONSENT */}
      <div style={card}>
        <h3 style={cardHead}>{t('consentHeading')}</h3>
        <p style={{ color: '#ccc', fontSize: '13px', lineHeight: 1.6 }}>{t('consentBody')}</p>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', fontSize: '13px', color: '#fff' }}>
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: '3px' }} />
          <span>{t('consentCheckbox')}</span>
        </label>
      </div>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <button onClick={saveDraft} style={{ padding: '10px 18px', backgroundColor: 'transparent', color: '#d4af37', border: '1px solid #d4af37', borderRadius: '6px', fontWeight: 700, cursor: 'pointer' }}>{t('saveDraft')}</button>
        <button onClick={submit} style={{ padding: '10px 18px', backgroundColor: '#d4af37', color: '#000', border: 'none', borderRadius: '6px', fontWeight: 800, cursor: 'pointer' }}>{t('submit')}</button>
      </div>
    </div>
  );
}

const card: React.CSSProperties = { backgroundColor: '#111', border: '1px solid #333', borderRadius: '8px', padding: '20px', marginBottom: '20px' };
const cardHead: React.CSSProperties = { marginTop: 0, color: '#fff', fontSize: '15px' };
const fileRow: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', backgroundColor: '#1a1a1a', borderRadius: '6px', border: '1px solid #222' };
const removeBtn: React.CSSProperties = { background: 'transparent', border: '1px solid #ff4444', color: '#ff4444', borderRadius: '4px', padding: '4px 10px', cursor: 'pointer', fontSize: '11px', fontWeight: 700 };
