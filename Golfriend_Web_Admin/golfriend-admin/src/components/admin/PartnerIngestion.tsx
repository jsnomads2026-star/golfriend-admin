// ==========================================
// FILE: src/components/admin/PartnerIngestion.tsx
// Admin ingestion queue for partner applications (slice 1a).
//
// Staff review the intake submissions: begin review / approve / reject / request
// info. All reads and writes go through staff-gated callables
// (listPartnerSubmissions, reviewPartnerSubmission) — Admin SDK server-side, so
// no client Firestore rules dependency and no client authoritative writes.
// Approval flags a provisioning HANDOFF only; it never grants partner status.
// ==========================================
import { useEffect, useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useT } from '../../i18n/hooks.ts';
import { INGESTION } from '../../i18n/admin/ingestion.ts';

interface Item {
  id: string; status: string; applicantEmail: string; note: string;
  missingDocuments: string[]; reviewNote: string; readyForProvisioning: boolean;
}
type Decision = 'begin_review' | 'approve' | 'reject' | 'request_info';

export default function PartnerIngestion() {
  const t = useT(INGESTION);
  const [items, setItems] = useState<Item[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [note, setNote] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const load = async () => {
    try {
      const fn = httpsCallable(getFunctions(), 'listPartnerSubmissions');
      const res = await fn({});
      const data = res.data as { items?: Item[] };
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch {
      setItems([]);
      setNote({ msg: t('loadFailed'), type: 'error' });
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const review = async (id: string, decision: Decision) => {
    setBusyId(id); setNote(null);
    try {
      const fn = httpsCallable(getFunctions(), 'reviewPartnerSubmission');
      const res = await fn({ submissionId: id, decision, reviewNote: notes[id] || '' });
      const data = res.data as { success?: boolean; readyForProvisioning?: boolean };
      if (!data?.success) throw new Error('not accepted');
      setNote({ msg: data.readyForProvisioning ? t('handoffNote') : t('reviewedOk'), type: 'success' });
      await load();
    } catch {
      setNote({ msg: t('reviewFailed'), type: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  const statusLabel = (s: string) => ({
    submitted: t('st_submitted'), under_review: t('st_under_review'), approved: t('st_approved'),
    rejected: t('st_rejected'), info_needed: t('st_info_needed'),
  } as Record<string, string>)[s] || s;

  return (
    <div style={{ padding: 20, color: '#fff', maxWidth: 1100, margin: '0 auto' }}>
      {note && (
        <div role="status" aria-live="polite" style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 8, fontSize: 13,
          backgroundColor: note.type === 'error' ? 'rgba(255,68,68,0.14)' : 'rgba(76,175,80,0.14)',
          border: `1px solid ${note.type === 'error' ? '#ff4444' : '#4CAF50'}`, color: note.type === 'error' ? '#ff8a8a' : '#a5d6a7' }}>{note.msg}</div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ color: '#d4af37', margin: 0, letterSpacing: '1px' }}>{t('title')}</h2>
          <p style={{ color: '#888', fontSize: 14, marginTop: 5, maxWidth: 640 }}>{t('subtitle')}</p>
        </div>
        <button onClick={() => void load()} style={btn('#888', '#1a1a1a')}>{t('refresh')}</button>
      </div>

      {items === null ? (
        <p style={{ color: '#888' }}>…</p>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#555', border: '1px dashed #333', borderRadius: 6 }}>{t('empty')}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items.map((it) => (
            <div key={it.id} style={{ padding: 16, backgroundColor: '#111', border: '1px solid #333', borderRadius: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{t('colApplicant')}: {it.applicantEmail || it.id}</div>
                  <div style={{ fontSize: 12, color: '#a5d6a7', marginTop: 2 }}>{t('colStatus')}: {statusLabel(it.status)}</div>
                  {it.missingDocuments.length > 0 && <div style={{ fontSize: 12, color: '#FFC107', marginTop: 2 }}>{t('colMissing')}: {it.missingDocuments.join(', ')}</div>}
                  {it.note && <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>“{it.note}”</div>}
                </div>
              </div>
              <input
                type="text" placeholder={t('reviewNotePh')} aria-label={t('reviewNotePh')}
                value={notes[it.id] || ''} onChange={(e) => setNotes((p) => ({ ...p, [it.id]: e.target.value }))}
                style={{ width: '100%', boxSizing: 'border-box', margin: '12px 0', padding: '8px 10px', backgroundColor: '#0a0a0a', border: '1px solid #333', color: '#fff', borderRadius: 6 }}
              />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button disabled={busyId === it.id} onClick={() => review(it.id, 'begin_review')} style={btn('#2196F3', '#0a1a2a')}>{t('decBeginReview')}</button>
                <button disabled={busyId === it.id} onClick={() => review(it.id, 'approve')} style={btn('#4CAF50', '#0a2a12')}>{t('decApprove')}</button>
                <button disabled={busyId === it.id} onClick={() => review(it.id, 'request_info')} style={btn('#FFC107', '#2a230a')}>{t('decRequestInfo')}</button>
                <button disabled={busyId === it.id} onClick={() => review(it.id, 'reject')} style={btn('#ff4444', '#2a0a0a')}>{t('decReject')}</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const btn = (color: string, bg: string): React.CSSProperties => ({ backgroundColor: bg, color, border: `1px solid ${color}`, borderRadius: 4, padding: '7px 14px', cursor: 'pointer', fontWeight: 700, fontSize: 12 });
