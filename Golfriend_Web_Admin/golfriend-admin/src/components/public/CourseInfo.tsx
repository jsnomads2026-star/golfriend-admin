import React from 'react';

// ─────────────────────────────────────────────────────────────
// CourseInfo — a single course's LOCALIZED info page.
// Self-contained EN/TH dictionary (Golfriend operates in Pattaya, TH).
// No external i18n dependency — the app has none.
// ─────────────────────────────────────────────────────────────

export type Lang = 'en' | 'th';

export interface PublicCourse {
  id: string;
  courseID?: string;
  clubName?: string;
  name?: string;
  city?: string;
  state?: string;
  country?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  holes?: unknown[];
}

// Small, self-contained label dictionary (labels only — course values come from Firestore).
const DICT: Record<Lang, Record<string, string>> = {
  en: {
    courseInfo: 'Course information',
    club: 'Club',
    location: 'Location',
    address: 'Address',
    holes: 'Holes',
    coordinates: 'Coordinates',
    language: 'Language',
    notProvided: 'Not provided',
    viewTeeTimes: 'View open tee-times',
    holesUnit: 'holes',
  },
  th: {
    courseInfo: 'ข้อมูลสนามกอล์ฟ',
    club: 'คลับ',
    location: 'ที่ตั้ง',
    address: 'ที่อยู่',
    holes: 'หลุม',
    coordinates: 'พิกัด',
    language: 'ภาษา',
    notProvided: 'ไม่ระบุ',
    viewTeeTimes: 'ดูเวลาออกรอบที่ว่าง',
    holesUnit: 'หลุม',
  },
};

const theme = {
  panel: '#121212',
  border: '#222',
  gold: '#d4af37',
  text: '#eee',
  muted: '#888',
};

interface Props {
  course: PublicCourse;
  lang: Lang;
  onChangeLang: (l: Lang) => void;
  onViewTeeTimes?: () => void;
}

export default function CourseInfo({ course, lang, onChangeLang, onViewTeeTimes }: Props) {
  const t = (k: string) => DICT[lang][k] ?? k;

  const locationParts = [course.city, course.state, course.country].filter(Boolean);
  const location = locationParts.length ? locationParts.join(', ') : t('notProvided');
  const holeCount = Array.isArray(course.holes) ? course.holes.length : 0;
  const displayName = course.name || course.clubName || course.courseID || course.id;

  return (
    <div style={styles.card}>
      <div style={styles.headerRow}>
        <h2 style={styles.title}>{displayName}</h2>
        <div style={styles.langToggle} role="group" aria-label={t('language')}>
          {(['en', 'th'] as Lang[]).map((l) => (
            <button
              key={l}
              onClick={() => onChangeLang(l)}
              style={{
                ...styles.langBtn,
                ...(lang === l ? styles.langBtnActive : {}),
              }}
              aria-pressed={lang === l}
            >
              {l === 'en' ? 'EN' : 'ไทย'}
            </button>
          ))}
        </div>
      </div>

      <p style={styles.sectionLabel}>{t('courseInfo')}</p>

      <dl style={styles.dl}>
        {course.clubName && (
          <Row label={t('club')} value={course.clubName} />
        )}
        <Row label={t('location')} value={location} />
        {course.address && <Row label={t('address')} value={course.address} />}
        <Row label={t('holes')} value={`${holeCount} ${t('holesUnit')}`} />
        {typeof course.latitude === 'number' && typeof course.longitude === 'number' && (
          <Row
            label={t('coordinates')}
            value={`${course.latitude.toFixed(4)}, ${course.longitude.toFixed(4)}`}
          />
        )}
      </dl>

      {onViewTeeTimes && (
        <button style={styles.cta} onClick={onViewTeeTimes}>
          {t('viewTeeTimes')} →
        </button>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.row}>
      <dt style={styles.dt}>{label}</dt>
      <dd style={styles.dd}>{value}</dd>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    backgroundColor: theme.panel,
    border: `1px solid ${theme.border}`,
    borderRadius: '12px',
    padding: '24px',
    color: theme.text,
    fontFamily: 'sans-serif',
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '16px',
    flexWrap: 'wrap',
  },
  title: { margin: 0, fontSize: '22px', fontWeight: 800, color: '#fff' },
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
  sectionLabel: {
    color: theme.gold,
    textTransform: 'uppercase',
    letterSpacing: '1px',
    fontSize: '12px',
    fontWeight: 700,
    marginTop: '20px',
    marginBottom: '8px',
  },
  dl: { margin: 0 },
  row: {
    display: 'flex',
    gap: '12px',
    padding: '8px 0',
    borderBottom: `1px solid ${theme.border}`,
  },
  dt: { color: theme.muted, minWidth: '120px', fontSize: '14px' },
  dd: { margin: 0, color: theme.text, fontSize: '14px' },
  cta: {
    marginTop: '20px',
    background: 'transparent',
    border: `1px solid ${theme.gold}`,
    color: theme.gold,
    padding: '10px 18px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: '14px',
  },
};
