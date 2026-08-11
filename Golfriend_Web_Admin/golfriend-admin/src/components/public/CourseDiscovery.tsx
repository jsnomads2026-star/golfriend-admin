import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import CourseInfo from './CourseInfo';
import type { PublicCourse, Lang } from './CourseInfo';
import BookingHandoff from './BookingHandoff';
import type { PublicSlot } from './BookingHandoff';

// ─────────────────────────────────────────────────────────────
// CourseDiscovery — public browse of courses + their open tee-times.
// Single-page flow: browse → select course (info + open slots) →
// select slot → BookingHandoff. Reads REAL Firestore data only.
// Bookable = status === 'open' AND bookedCount < capacity.
// ─────────────────────────────────────────────────────────────

const DICT: Record<Lang, Record<string, string>> = {
  en: {
    heading: 'Discover golf courses',
    sub: 'Browse partner courses and their open tee-times.',
    loading: 'Loading courses…',
    empty: 'No courses are available right now.',
    noSlots: 'No open tee-times for this course right now.',
    openTeeTimes: 'Open tee-times',
    book: 'Request',
    seatsLeft: 'seats left',
    error: 'Could not load courses. Please try again later.',
    back: '← Back to all courses',
  },
  th: {
    heading: 'ค้นหาสนามกอล์ฟ',
    sub: 'เรียกดูสนามพันธมิตรและเวลาออกรอบที่ว่าง',
    loading: 'กำลังโหลดสนาม…',
    empty: 'ยังไม่มีสนามให้บริการในขณะนี้',
    noSlots: 'ยังไม่มีเวลาออกรอบที่ว่างสำหรับสนามนี้',
    openTeeTimes: 'เวลาออกรอบที่ว่าง',
    book: 'ขอจอง',
    seatsLeft: 'ที่นั่งเหลือ',
    error: 'ไม่สามารถโหลดสนามได้ กรุณาลองใหม่ภายหลัง',
    back: '← กลับไปหน้าสนามทั้งหมด',
  },
};

const theme = {
  bg: '#0a0a0a',
  panel: '#121212',
  border: '#222',
  gold: '#d4af37',
  text: '#eee',
  muted: '#888',
};

export default function CourseDiscovery() {
  const [lang, setLang] = useState<Lang>('en');
  const [courses, setCourses] = useState<PublicCourse[]>([]);
  const [slots, setSlots] = useState<PublicSlot[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<PublicSlot | null>(null);

  const t = (k: string) => DICT[lang][k] ?? k;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Courses
        const courseSnap = await getDocs(collection(db, 'courses'));
        const courseList: PublicCourse[] = courseSnap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<PublicCourse, 'id'>),
        }));

        // Only open slots (server-side filter); bookable check applied below.
        const slotSnap = await getDocs(
          query(collection(db, 'tee_time_slots'), where('status', '==', 'open'))
        );
        const slotList: PublicSlot[] = slotSnap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<PublicSlot, 'id'>),
        }));

        if (!cancelled) {
          setCourses(courseList);
          setSlots(slotList);
          setStatus('ready');
        }
      } catch (e) {
        if (!cancelled) setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Bookable slots grouped by courseId.
  const bookableByCourse = useMemo(() => {
    const map: Record<string, PublicSlot[]> = {};
    for (const s of slots) {
      const capacity = Number(s.capacity || 0);
      const booked = Number(s.bookedCount || 0);
      if (s.status === 'open' && booked < capacity) {
        (map[s.courseId] ||= []).push(s);
      }
    }
    // Sort each course's slots by date then time.
    Object.values(map).forEach((arr) =>
      arr.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
    );
    return map;
  }, [slots]);

  const selectedCourse = courses.find((c) => c.id === selectedCourseId) || null;

  // ── Booking sub-view ──
  if (selectedSlot) {
    return (
      <div style={styles.page}>
        <div style={styles.inner}>
          <BookingHandoff
            slot={selectedSlot}
            lang={lang}
            onBack={() => setSelectedSlot(null)}
          />
        </div>
      </div>
    );
  }

  // ── Course detail sub-view ──
  if (selectedCourse) {
    const courseKey = selectedCourse.courseID || selectedCourse.id;
    const courseSlots =
      bookableByCourse[selectedCourse.id] || bookableByCourse[courseKey] || [];
    return (
      <div style={styles.page}>
        <div style={styles.inner}>
          <button style={styles.backLink} onClick={() => setSelectedCourseId(null)}>
            {t('back')}
          </button>

          <CourseInfo course={selectedCourse} lang={lang} onChangeLang={setLang} />

          <h3 style={styles.slotsHeading}>{t('openTeeTimes')}</h3>
          {courseSlots.length === 0 ? (
            <p style={styles.muted}>{t('noSlots')}</p>
          ) : (
            <div style={styles.slotGrid}>
              {courseSlots.map((s) => {
                const seatsLeft = Number(s.capacity || 0) - Number(s.bookedCount || 0);
                return (
                  <div key={s.id} style={styles.slotCard}>
                    <div style={styles.slotDate}>{s.date}</div>
                    <div style={styles.slotTime}>{s.time}</div>
                    <div style={styles.slotMeta}>
                      {seatsLeft} {t('seatsLeft')} · {s.status}
                    </div>
                    <button style={styles.slotBtn} onClick={() => setSelectedSlot(s)}>
                      {t('book')} →
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Browse list ──
  return (
    <div style={styles.page}>
      <div style={styles.inner}>
        <div style={styles.headerRow}>
          <div>
            <h1 style={styles.heading}>{t('heading')}</h1>
            <p style={styles.muted}>{t('sub')}</p>
          </div>
          <div style={styles.langToggle}>
            {(['en', 'th'] as Lang[]).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                style={{ ...styles.langBtn, ...(lang === l ? styles.langBtnActive : {}) }}
                aria-pressed={lang === l}
              >
                {l === 'en' ? 'EN' : 'ไทย'}
              </button>
            ))}
          </div>
        </div>

        {status === 'loading' && <p style={styles.muted}>{t('loading')}</p>}
        {status === 'error' && <p style={styles.muted}>{t('error')}</p>}
        {status === 'ready' && courses.length === 0 && (
          <p style={styles.muted}>{t('empty')}</p>
        )}

        {status === 'ready' && courses.length > 0 && (
          <div style={styles.courseGrid}>
            {courses.map((c) => {
              const key = c.courseID || c.id;
              const openCount =
                (bookableByCourse[c.id]?.length || 0) +
                (c.courseID && c.courseID !== c.id
                  ? bookableByCourse[c.courseID]?.length || 0
                  : 0);
              const loc = [c.city, c.country].filter(Boolean).join(', ');
              return (
                <button
                  key={c.id}
                  style={styles.courseCard}
                  onClick={() => setSelectedCourseId(c.id)}
                >
                  <h3 style={styles.courseName}>{c.name || c.clubName || key}</h3>
                  {loc && <p style={styles.courseLoc}>{loc}</p>}
                  <span style={styles.openPill}>
                    {openCount} {t('openTeeTimes').toLowerCase()}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    backgroundColor: theme.bg,
    color: theme.text,
    minHeight: '100vh',
    fontFamily: 'sans-serif',
    padding: '40px 20px',
  },
  inner: { maxWidth: '1000px', margin: '0 auto' },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '16px',
    flexWrap: 'wrap',
    marginBottom: '28px',
  },
  heading: { margin: '0 0 6px 0', fontSize: '32px', fontWeight: 900, color: '#fff' },
  muted: { color: theme.muted, fontSize: '15px', lineHeight: 1.6 },
  langToggle: { display: 'flex', gap: '6px' },
  langBtn: {
    background: 'transparent',
    border: `1px solid ${theme.border}`,
    color: theme.muted,
    padding: '6px 12px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: '12px',
  },
  langBtnActive: { borderColor: theme.gold, color: theme.gold },
  courseGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: '20px',
  },
  courseCard: {
    textAlign: 'left',
    backgroundColor: theme.panel,
    border: `1px solid ${theme.border}`,
    borderRadius: '12px',
    padding: '20px',
    cursor: 'pointer',
    color: theme.text,
  },
  courseName: { margin: '0 0 6px 0', fontSize: '18px', fontWeight: 800, color: '#fff' },
  courseLoc: { margin: '0 0 12px 0', color: theme.muted, fontSize: '14px' },
  openPill: {
    display: 'inline-block',
    fontSize: '12px',
    fontWeight: 700,
    color: theme.gold,
    border: `1px solid ${theme.gold}`,
    borderRadius: '999px',
    padding: '4px 10px',
  },
  backLink: {
    background: 'transparent',
    border: 'none',
    color: theme.muted,
    cursor: 'pointer',
    fontSize: '14px',
    padding: 0,
    marginBottom: '16px',
  },
  slotsHeading: { fontSize: '18px', fontWeight: 800, color: '#fff', margin: '28px 0 12px 0' },
  slotGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: '16px',
  },
  slotCard: {
    backgroundColor: theme.panel,
    border: `1px solid ${theme.border}`,
    borderRadius: '10px',
    padding: '16px',
  },
  slotDate: { color: theme.muted, fontSize: '13px' },
  slotTime: { color: '#fff', fontSize: '20px', fontWeight: 800, margin: '2px 0 8px 0' },
  slotMeta: { color: theme.muted, fontSize: '13px', marginBottom: '12px' },
  slotBtn: {
    width: '100%',
    background: theme.gold,
    border: 'none',
    color: '#0a0a0a',
    padding: '10px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 800,
    fontSize: '14px',
  },
};
