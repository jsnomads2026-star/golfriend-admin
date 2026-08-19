import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import CourseInfo from './CourseInfo';
import type { PublicCourse } from './CourseInfo';
import BookingHandoff from './BookingHandoff';
import type { PublicSlot } from './BookingHandoff';

// ─────────────────────────────────────────────────────────────
// CourseDiscovery — public browse of courses + their open tee-times.
// Single-page flow: browse → select course (info + open slots) →
// select slot → BookingHandoff. Reads REAL Firestore data only.
// Bookable = status === 'open' AND bookedCount < capacity.
// ─────────────────────────────────────────────────────────────

type Lang = 'en' | 'th' | 'ko' | 'ja' | 'zh' | 'es' | 'fr' | 'de';

const LANGUAGE_NAMES = {
  en: 'English',
  th: 'ไทย',
  ko: '한국어',
  ja: '日本語',
  zh: '中文',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
};

const DICT: Record<Lang, Record<string, string>> = {
  en: {
    heading: 'Discover golf courses',
    sub: 'Browse partner courses and their open tee-times.',
    language: 'Language',
    loading: 'Loading courses…',
    empty: 'No courses are available right now.',
    noSlots: 'No open tee-times for this course right now.',
    openTeeTimes: 'Open tee-times',
    book: 'Request',
    seatsLeft: 'seats left',
    error: 'Could not load courses. Please try again later.',
    back: '← Back to all courses',
    backAria: 'Return to all courses',
    viewCourse: 'Open tee-time availability for',
    requestSlot: 'Request tee-time',
    courseCardAria: 'View open tee-times for',
    requestSlotAria: 'Request this tee-time',
    loadingErrorRetry: 'Retry loading courses',
  },
  th: {
    heading: 'ค้นหาสนามกอล์ฟ',
    sub: 'เรียกดูสนามพันธมิตรและเวลาออกรอบที่ว่าง',
    language: 'ภาษา',
    loading: 'กำลังโหลดสนาม…',
    empty: 'ยังไม่มีสนามให้บริการในขณะนี้',
    noSlots: 'ยังไม่มีเวลาออกรอบที่ว่างสำหรับสนามนี้',
    openTeeTimes: 'เวลาออกรอบที่ว่าง',
    book: 'ขอจอง',
    seatsLeft: 'ที่นั่งเหลือ',
    error: 'ไม่สามารถโหลดสนามได้ กรุณาลองใหม่ภายหลัง',
    back: '← กลับไปหน้าสนามทั้งหมด',
    backAria: 'กลับไปหน้ารายการสนามทั้งหมด',
    viewCourse: 'ดูเวลาออกรอบที่ว่างสำหรับ',
    requestSlot: 'ขอจองเวลาออกรอบ',
    courseCardAria: 'ดูเวลาออกรอบของสนาม',
    requestSlotAria: 'ขอจองช่วงเวลาออกรอบนี้',
    loadingErrorRetry: 'ลองโหลดรายการอีกครั้ง',
  },
  ko: {
    heading: '골프장 찾기',
    sub: '파트너 골프장과 오픈 티타임을 찾아보세요.',
    language: '언어',
    loading: '코스를 불러오는 중…',
    empty: '현재 사용할 수 있는 코스가 없습니다.',
    noSlots: '현재 이 코스의 오픈 티타임이 없습니다.',
    openTeeTimes: '오픈 티타임',
    book: '요청',
    seatsLeft: '남은 좌석',
    error: '코스를 불러올 수 없습니다. 나중에 다시 시도해 주세요.',
    back: '← 모든 코스로 돌아가기',
    backAria: '모든 코스 목록으로 돌아가기',
    viewCourse: '이 코스의 오픈 티타임 보기',
    requestSlot: '티타임 요청',
    courseCardAria: '이 코스의 티타임 확인',
    requestSlotAria: '이 티타임을 요청',
    loadingErrorRetry: '코스 다시 불러오기',
  },
  ja: {
    heading: 'ゴルフコースを見つける',
    sub: 'パートナーコースと空いているティータイムを閲覧',
    language: '言語',
    loading: 'コースを読み込み中…',
    empty: '現在、利用可能なコースがありません。',
    noSlots: 'このコースの空きティータイムは現在ありません。',
    openTeeTimes: '空きティータイム',
    book: 'リクエスト',
    seatsLeft: '残り席',
    error: 'コースを読み込めません。しばらくしてから再試行してください。',
    back: '← すべてのコースに戻る',
    backAria: 'すべてのコース一覧へ戻る',
    viewCourse: 'このコースの空きティータイムを表示',
    requestSlot: 'ティータイムをリクエスト',
    courseCardAria: 'このコースのティータイムを表示',
    requestSlotAria: 'このティータイムをリクエスト',
    loadingErrorRetry: 'コースを再読み込み',
  },
  zh: {
    heading: '发现高尔夫球场',
    sub: '浏览合作球场及其可预订时间。',
    language: '语言',
    loading: '正在加载球场…',
    empty: '目前没有可用球场。',
    noSlots: '此球场目前无可用开球时间。',
    openTeeTimes: '可用开球时间',
    book: '请求',
    seatsLeft: '剩余席位',
    error: '无法加载球场，请稍后重试。',
    back: '← 返回全部球场',
    backAria: '返回全部球场列表',
    viewCourse: '查看该球场的可用开球时间',
    requestSlot: '请求开球时间',
    courseCardAria: '查看该球场开球时间',
    requestSlotAria: '请求此开球时间',
    loadingErrorRetry: '重新加载球场',
  },
  es: {
    heading: 'Descubrir campos de golf',
    sub: 'Navega por cursos asociados y sus horas de salida abiertas.',
    language: 'Idioma',
    loading: 'Cargando campos…',
    empty: 'No hay campos disponibles en este momento.',
    noSlots: 'No hay horarios abiertos para este campo en este momento.',
    openTeeTimes: 'Horarios abiertos',
    book: 'Solicitar',
    seatsLeft: 'asientos disponibles',
    error: 'No se pudieron cargar los campos. Intenta de nuevo más tarde.',
    back: '← Volver a todos los campos',
    backAria: 'Volver a la lista de todos los campos',
    viewCourse: 'Ver horarios abiertos de',
    requestSlot: 'Solicitar un horario',
    courseCardAria: 'Ver horarios de este campo',
    requestSlotAria: 'Solicitar este horario',
    loadingErrorRetry: 'Reintentar carga de campos',
  },
  fr: {
    heading: 'Découvrez des parcours de golf',
    sub: 'Parcourez les parcours partenaires et leurs départs disponibles.',
    language: 'Langue',
    loading: 'Chargement des parcours…',
    empty: 'Aucun parcours n’est disponible pour le moment.',
    noSlots: 'Aucun départ ouvert pour ce parcours pour l’instant.',
    openTeeTimes: 'Départs ouverts',
    book: 'Demander',
    seatsLeft: 'places disponibles',
    error: 'Impossible de charger les parcours. Veuillez réessayer plus tard.',
    back: '← Retour à tous les parcours',
    backAria: 'Retourner à la liste complète des parcours',
    viewCourse: 'Voir les départs ouverts de',
    requestSlot: 'Demander un départ',
    courseCardAria: 'Voir les départs ouverts de ce parcours',
    requestSlotAria: 'Demander ce départ',
    loadingErrorRetry: 'Réessayer le chargement',
  },
  de: {
    heading: 'Golfplätze entdecken',
    sub: 'Durchsuche Partnerplätze und deren verfügbare Teezeiten.',
    language: 'Sprache',
    loading: 'Kurse werden geladen…',
    empty: 'Zurzeit sind keine Kurse verfügbar.',
    noSlots: 'Für diesen Platz sind aktuell keine offenen Teezeiten vorhanden.',
    openTeeTimes: 'Offene Teezeiten',
    book: 'Anfragen',
    seatsLeft: 'freie Plätze',
    error: 'Kurse konnten nicht geladen werden. Bitte später erneut versuchen.',
    back: '← Zurück zu allen Kursen',
    backAria: 'Zurück zu allen Kursen',
    viewCourse: 'Offene Teezeiten für',
    requestSlot: 'Teezeit anfragen',
    courseCardAria: 'Offene Teezeiten dieses Kurses anzeigen',
    requestSlotAria: 'Diese Teezeit anfragen',
    loadingErrorRetry: 'Kurse erneut laden',
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
  const childLang = lang === 'en' || lang === 'th' ? lang : 'en';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const courseSnap = await getDocs(collection(db, 'courses'));
        const courseList: PublicCourse[] = courseSnap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<PublicCourse, 'id'>),
        }));

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

  const bookableByCourse = useMemo(() => {
    const map: Record<string, PublicSlot[]> = {};
    for (const s of slots) {
      const capacity = Number(s.capacity || 0);
      const booked = Number(s.bookedCount || 0);
      if (s.status === 'open' && booked < capacity) {
        (map[s.courseId] ||= []).push(s);
      }
    }
    Object.values(map).forEach((arr) =>
      arr.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
    );
    return map;
  }, [slots]);

  const selectedCourse = courses.find((c) => c.id === selectedCourseId) || null;

  if (selectedSlot) {
    return (
      <div style={styles.page}>
        <div style={styles.inner}>
          <BookingHandoff
            slot={selectedSlot}
            lang={childLang}
            onBack={() => setSelectedSlot(null)}
          />
        </div>
      </div>
    );
  }

  if (selectedCourse) {
    const courseKey = selectedCourse.courseID || selectedCourse.id;
    const courseSlots =
      bookableByCourse[selectedCourse.id] || bookableByCourse[courseKey] || [];
    const displayCourseName = selectedCourse.name || selectedCourse.clubName || courseKey;

    return (
      <div style={styles.page}>
        <div style={styles.inner}>
          <button
            style={styles.backLink}
            onClick={() => setSelectedCourseId(null)}
            aria-label={t('backAria')}
          >
            {t('back')}
          </button>

          <CourseInfo
            course={selectedCourse}
            lang={childLang}
            onChangeLang={(next) => setLang(next)}
          />

          <h3 style={styles.slotsHeading}>
            {t('openTeeTimes')}: {displayCourseName}
          </h3>
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
                    <button
                      style={styles.slotBtn}
                      onClick={() => setSelectedSlot(s)}
                      aria-label={`${t('requestSlotAria')} ${s.date} ${s.time}`}
                    >
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

  return (
    <div style={styles.page}>
      <div style={styles.inner}>
        <div style={styles.headerRow}>
          <div>
            <h1 style={styles.heading}>{t('heading')}</h1>
            <p style={styles.muted}>{t('sub')}</p>
          </div>
          <div style={styles.langToggle} role="group" aria-label={t('language')}>
            {(['en', 'th', 'ko', 'ja', 'zh', 'es', 'fr', 'de'] as Lang[]).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                style={{ ...styles.langBtn, ...(lang === l ? styles.langBtnActive : {}) }}
                aria-pressed={lang === l}
                aria-label={`${t('language')}: ${LANGUAGE_NAMES[l]}`}
              >
                {LANGUAGE_NAMES[l]}
              </button>
            ))}
          </div>
        </div>

        {status === 'loading' && <p style={styles.muted}>{t('loading')}</p>}
        {status === 'error' && <p style={styles.muted}>{t('error')}</p>}
        {status === 'ready' && courses.length === 0 && <p style={styles.muted}>{t('empty')}</p>}

        {status === 'ready' && courses.length > 0 && (
          <div style={styles.courseGrid}>
            {courses.map((c) => {
              const key = c.courseID || c.id;
              const displayName = c.name || c.clubName || key;
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
                  aria-label={`${t('courseCardAria')} ${displayName}`}
                >
                  <h3 style={styles.courseName}>{displayName}</h3>
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
  langToggle: { display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' },
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
