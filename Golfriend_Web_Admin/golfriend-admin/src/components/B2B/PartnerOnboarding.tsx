// ==========================================
// FILE: src/components/B2B/PartnerOnboarding.tsx
// Partner onboarding hub (L1 slice 5).
//
// A localized, RESUMABLE checklist. It reflects real progress by reading the
// partner's own scope (operated courses, published tee-times) read-only, plus the
// locally-saved Documents draft. No authoritative writes and no Cloud Functions —
// it only reads and links the operator to the next step, so a partner can leave
// and resume onboarding at any time.
// ==========================================
import { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { useT } from '../../i18n/hooks.ts';
import { ONBOARDING } from '../../i18n/partner/onboarding.ts';

type PartnerTab = 'availability' | 'documents';

interface Progress { course: boolean; availability: boolean; documents: boolean }

function documentsConsented(uid: string): boolean {
  try {
    const raw = localStorage.getItem(`golfriend.partner.documents.draft.${uid || 'anon'}`);
    if (!raw) return false;
    return Boolean((JSON.parse(raw) as { consent?: boolean }).consent);
  } catch {
    return false;
  }
}

export default function PartnerOnboarding({ partnerUid, onNavigate }: { partnerUid: string; onNavigate: (tab: PartnerTab) => void }) {
  const t = useT(ONBOARDING);
  const [progress, setProgress] = useState<Progress>(() => ({
    course: false,
    availability: false,
    documents: documentsConsented(partnerUid),
  }));

  // Read-only progress derivation from the partner's own scope.
  useEffect(() => {
    if (!partnerUid || partnerUid === 'UNKNOWN_USER') return;
    let cancelled = false;
    (async () => {
      try {
        const opSnap = await getDocs(query(collection(db, 'course_operators'), where('operatorUid', '==', partnerUid)));
        const ids = opSnap.docs.map((d) => (d.data() as { courseId?: string }).courseId || d.id).slice(0, 10);
        let hasSlots = false;
        if (ids.length) {
          const slotSnap = await getDocs(query(collection(db, 'tee_time_slots'), where('courseId', 'in', ids)));
          hasSlots = !slotSnap.empty;
        }
        if (cancelled) return;
        setProgress({ course: ids.length > 0, availability: hasSlots, documents: documentsConsented(partnerUid) });
      } catch {
        /* remain with the optimistic local-only progress */
      }
    })();
    return () => { cancelled = true; };
  }, [partnerUid]);

  const steps = [
    { key: 'signIn', done: true, tab: null as PartnerTab | null },
    { key: 'course', done: progress.course, tab: 'availability' as PartnerTab },
    { key: 'availability', done: progress.availability, tab: 'availability' as PartnerTab },
    { key: 'documents', done: progress.documents, tab: 'documents' as PartnerTab },
  ];
  const allDone = steps.every((s) => s.done);
  const nextStep = steps.find((s) => !s.done);

  const label = (key: string, suffix: 'Step' | 'StepDesc') => {
    const map: Record<string, string> = {
      signInStep: 'stepSignIn', signInStepDesc: 'stepSignInDesc',
      courseStep: 'stepCourse', courseStepDesc: 'stepCourseDesc',
      availabilityStep: 'stepAvailability', availabilityStepDesc: 'stepAvailabilityDesc',
      documentsStep: 'stepDocuments', documentsStepDesc: 'stepDocumentsDesc',
    };
    return t(map[key + suffix]);
  };

  return (
    <div style={{ padding: '20px', color: '#fff', maxWidth: '820px', margin: '0 auto' }}>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ color: '#d4af37', margin: 0, letterSpacing: '1px' }}>{t('title')}</h2>
        <p style={{ color: '#888', fontSize: '14px', marginTop: '5px' }}>{t('subtitle')}</p>
      </div>

      {allDone ? (
        <div role="status" style={{ padding: '14px 16px', borderRadius: '8px', backgroundColor: 'rgba(76,175,80,0.14)', border: '1px solid #4CAF50', color: '#a5d6a7', marginBottom: '16px', fontSize: '14px' }}>
          ✓ {t('allDone')}
        </div>
      ) : nextStep && nextStep.tab ? (
        <div style={{ marginBottom: '16px', fontSize: '13px', color: '#d4af37' }}>{t('resumeHint')}</div>
      ) : null}

      <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {steps.map((s) => (
          <li key={s.key} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 16px', backgroundColor: '#111', border: `1px solid ${s.done ? '#2e7d32' : '#333'}`, borderRadius: '8px' }}>
            <span aria-hidden style={{ fontSize: '18px' }}>{s.done ? '✅' : '⬜'}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, color: s.done ? '#a5d6a7' : '#fff' }}>{label(s.key, 'Step')}</div>
              <div style={{ color: '#888', fontSize: '12px' }}>{label(s.key, 'StepDesc')}</div>
            </div>
            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: s.done ? '#4CAF50' : '#FFC107' }}>{s.done ? t('done') : t('pending')}</span>
            {!s.done && s.tab && (
              <button onClick={() => onNavigate(s.tab as PartnerTab)} style={{ padding: '7px 14px', backgroundColor: '#d4af37', color: '#000', border: 'none', borderRadius: '6px', fontWeight: 700, cursor: 'pointer', fontSize: '12px' }}>
                {t('continueBtn')}
              </button>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
