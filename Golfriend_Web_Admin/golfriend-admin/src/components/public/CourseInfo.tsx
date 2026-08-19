import React from 'react';

// ─────────────────────────────────────────────────────────────
// CourseInfo — a single course's LOCALIZED info page.
// Self-contained EN/TH dictionary retained in component-local scope.
// No external i18n dependency — the app has none.
// ─────────────────────────────────────────────────────────────

type Lang = 'en' | 'th' | 'ko' | 'ja' | 'zh' | 'es' | 'fr' | 'de';

const LANGUAGE_OPTIONS: { code: Lang; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'th', label: 'ไทย' },
  { code: 'ko', label: '한국어' },
  { code: 'ja', label: '日本語' },
  { code: 'zh', label: '中文' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
];

export type { Lang };

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
    viewTeeTimesAria: 'View open tee-times for this course',
    holesUnit: 'holes',
    loading: 'Loading course information…',
    retry: 'Retry',
    empty: 'No course information found.',
    error: 'Unable to load course information. Please try again.',
    sectionLabel: 'Course information',
    titleUnknown: 'Unnamed course',
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
    viewTeeTimesAria: 'ดูเวลาออกรอบที่ว่างของสนามนี้',
    holesUnit: 'หลุม',
    loading: 'กำลังโหลดข้อมูลสนาม…',
    retry: 'ลองโหลดอีกครั้ง',
    empty: 'ไม่พบข้อมูลสนาม',
    error: 'ไม่สามารถโหลดข้อมูลสนามได้ กรุณาลองใหม่อีกครั้ง',
    sectionLabel: 'ข้อมูลสนาม',
    titleUnknown: 'ไม่ระบุชื่อสนาม',
  },
  ko: {
    courseInfo: '코스 정보',
    club: '클럽',
    location: '위치',
    address: '주소',
    holes: '홀',
    coordinates: '좌표',
    language: '언어',
    notProvided: '제공되지 않음',
    viewTeeTimes: '오픈 티타임 보기',
    viewTeeTimesAria: '이 코스의 오픈 티타임 보기',
    holesUnit: '홀',
    loading: '코스 정보를 불러오는 중…',
    retry: '다시 시도',
    empty: '코스 정보가 없습니다.',
    error: '코스 정보를 불러올 수 없습니다. 다시 시도해 주세요.',
    sectionLabel: '코스 정보',
    titleUnknown: '이름 없는 코스',
  },
  ja: {
    courseInfo: 'コース情報',
    club: 'クラブ',
    location: '場所',
    address: '住所',
    holes: 'ホール',
    coordinates: '座標',
    language: '言語',
    notProvided: '未提供',
    viewTeeTimes: '空きティータイムを表示',
    viewTeeTimesAria: 'このコースの空きティータイムを表示',
    holesUnit: 'ホール',
    loading: 'コース情報を読み込み中…',
    retry: '再試行',
    empty: 'コース情報が見つかりません。',
    error: 'コース情報を読み込めません。再試行してください。',
    sectionLabel: 'コース情報',
    titleUnknown: 'コース名なし',
  },
  zh: {
    courseInfo: '球场信息',
    club: '俱乐部',
    location: '位置',
    address: '地址',
    holes: '洞',
    coordinates: '坐标',
    language: '语言',
    notProvided: '未提供',
    viewTeeTimes: '查看可用开球时间',
    viewTeeTimesAria: '查看此球场的可用开球时间',
    holesUnit: '洞',
    loading: '正在加载球场信息…',
    retry: '重试',
    empty: '未找到球场信息。',
    error: '无法加载球场信息，请重试。',
    sectionLabel: '球场信息',
    titleUnknown: '未命名球场',
  },
  es: {
    courseInfo: 'Información del curso',
    club: 'Club',
    location: 'Ubicación',
    address: 'Dirección',
    holes: 'Hoyos',
    coordinates: 'Coordenadas',
    language: 'Idioma',
    notProvided: 'No especificado',
    viewTeeTimes: 'Ver horarios abiertos',
    viewTeeTimesAria: 'Ver horarios abiertos de este curso',
    holesUnit: 'hoyos',
    loading: 'Cargando información del curso…',
    retry: 'Reintentar',
    empty: 'No se encontró información del curso.',
    error: 'No se pudo cargar la información del curso. Inténtalo nuevamente.',
    sectionLabel: 'Información del curso',
    titleUnknown: 'Curso sin nombre',
  },
  fr: {
    courseInfo: 'Informations du parcours',
    club: 'Club',
    location: 'Emplacement',
    address: 'Adresse',
    holes: 'Trous',
    coordinates: 'Coordonnées',
    language: 'Langue',
    notProvided: 'Non fourni',
    viewTeeTimes: 'Voir les départs ouverts',
    viewTeeTimesAria: 'Voir les départs ouverts de ce parcours',
    holesUnit: 'trous',
    loading: 'Chargement des informations du parcours…',
    retry: 'Réessayer',
    empty: 'Aucune information de parcours trouvée.',
    error: 'Impossible de charger les informations du parcours. Veuillez réessayer.',
    sectionLabel: 'Informations du parcours',
    titleUnknown: 'Parcours sans nom',
  },
  de: {
    courseInfo: 'Kursinformationen',
    club: 'Club',
    location: 'Standort',
    address: 'Adresse',
    holes: 'Löcher',
    coordinates: 'Koordinaten',
    language: 'Sprache',
    notProvided: 'Nicht angegeben',
    viewTeeTimes: 'Offene Teezeiten anzeigen',
    viewTeeTimesAria: 'Offene Teezeiten für diesen Kurs anzeigen',
    holesUnit: 'Löcher',
    loading: 'Kursinformationen werden geladen…',
    empty: 'Keine Kursinformationen gefunden.',
    error: 'Kursinformationen konnten nicht geladen werden. Bitte erneut versuchen.',
    retry: 'Erneut versuchen',
    sectionLabel: 'Kursinformationen',
    titleUnknown: 'Unbenannter Kurs',
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
  status?: 'loading' | 'empty' | 'error' | 'ready';
  errorMessage?: string;
  onRetry?: () => void;
}

export default function CourseInfo({
  course,
  lang,
  onChangeLang,
  onViewTeeTimes,
  status = 'ready',
  errorMessage,
  onRetry,
}: Props) {
  const t = (k: string) => DICT[lang][k] ?? k;

  const locationParts = [course.city, course.state, course.country].filter(Boolean);
  const location = locationParts.length ? locationParts.join(', ') : t('notProvided');
  const holeCount = Array.isArray(course.holes) ? course.holes.length : 0;
  const displayName = course.name || course.clubName || course.courseID || course.id || t('titleUnknown');

  if (status === 'loading') {
    return (
      <div style={styles.card}>
        <h2 style={styles.title}>{t('sectionLabel')}</h2>
        <p role="status" aria-live="polite">
          {t('loading')}
        </p>
      </div>
    );
  }

  if (status === 'empty') {
    return (
      <div style={styles.card}>
        <h2 style={styles.title}>{t('sectionLabel')}</h2>
        <p>{t('empty')}</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div style={styles.card}>
        <h2 style={styles.title}>{t('sectionLabel')}</h2>
        <p role="alert">{errorMessage || t('error')}</p>
        <button
          style={styles.cta}
          onClick={onRetry || (() => undefined)}
          aria-label={t('retry')}
        >
          {t('retry')}
        </button>
      </div>
    );
  }

  return (
    <div style={styles.card}>
      <div style={styles.headerRow}>
        <h2 style={styles.title}>{displayName}</h2>
        <div style={styles.langToggle} role="group" aria-label={t('language')}>
          {LANGUAGE_OPTIONS.map((l) => (
            <button
              key={l.code}
              onClick={() => onChangeLang(l.code)}
              style={{
                ...styles.langBtn,
                ...(lang === l.code ? styles.langBtnActive : {}),
              }}
              aria-pressed={lang === l.code}
              aria-label={`${t('language')}: ${l.label}`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <p style={styles.sectionLabel}>{t('sectionLabel')}</p>

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
        <button
          style={styles.cta}
          onClick={onViewTeeTimes}
          aria-label={t('viewTeeTimesAria')}
        >
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
