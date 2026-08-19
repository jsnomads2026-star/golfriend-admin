import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../../../firebaseConfig';
import CourseCorrectionRequest from './CourseCorrectionRequest';

interface CourseOption { courseID: string; label: string; city?: string; }
interface OperatedCourse { courseId: string; courseName: string; }
type Lang = 'en' | 'th' | 'ko' | 'ja' | 'zh' | 'es' | 'fr' | 'de';

const DICT: Record<Lang, Record<string, string>> = {
  en: {
    title: 'Venues',
    subtitle:
      'Onboard and review the golf courses your enterprise operates. Tee-time availability and pricing per venue are published from Core Operations.',
    onboardHeader: 'Onboard a Venue',
    selectVenuePrompt: 'Select a venue to onboard…',
    onboardButton: 'Onboard',
    onboardButtonBusy: 'Onboarding…',
    onboardDescription: 'Onboarding assigns your enterprise as the exclusive operator of the selected venue.',
    loading: 'Loading available venues…',
    empty: 'No venues available to onboard.',
    retry: 'Retry',
    retryAria: 'Retry loading venues',
    noOnboarded: 'No venues onboarded yet.',
    operatedHeader: 'Operated Venues',
    totalLabel: 'total',
    activeLabel: '✓ ACTIVE',
    idLabel: 'ID',
    notificationMissingVenue: 'Select a venue to onboard.',
    onboardSuccess: 'Onboarded {name} as an operated venue.',
    onboardError: 'Could not onboard venue. Please try again.',
    selectAria: 'Venue to onboard',
    onboardAria: 'Onboard selected venue',
    retryStatusAria: 'Retry loading venue list',
    venueCardAria: 'Operated venue',
    activeStatus: 'Status: active',
    loadingError: 'Unable to load venues. Please try again.',
    statusBadge: 'ACTIVE',
    onboardBusyStatus: 'Venue onboarding in progress',
    emptyState: 'No venues onboarded yet.',
  },
  th: {
    title: 'สถานที่',
    subtitle:
      'เพิ่มและตรวจสอบสนามกอล์ฟที่องค์กรของคุณดำเนินการ สนามและราคาค่าบริการต่อรอบจะแสดงจากระบบปฏิบัติการหลัก',
    onboardHeader: 'เพิ่มสถานที่',
    selectVenuePrompt: 'เลือกสถานที่เพื่อเพิ่ม…',
    onboardButton: 'เพิ่มสถานที่',
    onboardButtonBusy: 'กำลังเพิ่ม…',
    onboardDescription: 'การเพิ่มสถานที่จะกำหนดให้องค์กรของคุณเป็นผู้ดำเนินการแต่ผู้เดียวของสถานที่นี้',
    loading: 'กำลังโหลดสถานที่ที่มีอยู่…',
    empty: 'ไม่มีสถานที่ให้เพิ่มในขณะนี้',
    retry: 'ลองใหม่',
    retryAria: 'ลองโหลดรายการสถานที่อีกครั้ง',
    noOnboarded: 'ยังไม่มีสถานที่ที่เพิ่ม',
    operatedHeader: 'สถานที่ที่ดำเนินการ',
    totalLabel: 'ทั้งหมด',
    activeLabel: '✓ ทำงานอยู่',
    idLabel: 'รหัส',
    notificationMissingVenue: 'เลือกสถานที่เพื่อเพิ่มก่อน',
    onboardSuccess: 'เพิ่ม {name} เป็นสถานที่ที่ดำเนินการแล้ว',
    onboardError: 'ไม่สามารถเพิ่มสถานที่ได้ กรุณาลองใหม่',
    selectAria: 'เลือกสถานที่ที่จะเพิ่ม',
    onboardAria: 'เพิ่มสถานที่ที่เลือก',
    retryStatusAria: 'ลองโหลดรายชื่อสถานที่อีกครั้ง',
    venueCardAria: 'สถานที่ที่ดำเนินการ',
    activeStatus: 'สถานะ: ทำงานอยู่',
    loadingError: 'ไม่สามารถโหลดสถานที่ได้ กรุณาลองใหม่อีกครั้ง',
    statusBadge: 'ทำงานอยู่',
    onboardBusyStatus: 'กำลังดำเนินการเพิ่มสถานที่',
    emptyState: 'ยังไม่มีสถานที่ที่เพิ่ม',
  },
  ko: {
    title: '장소',
    subtitle:
      '기업이 운영하는 골프 코스를 온보딩하고 검토합니다. 코스별 티타임 가용성과 가격은 코어 운영에서 게시됩니다.',
    onboardHeader: '장소 온보딩',
    selectVenuePrompt: '온보딩할 장소를 선택하세요…',
    onboardButton: '온보딩',
    onboardButtonBusy: '온보딩 중…',
    onboardDescription: '온보딩을 통해 선택한 장소의 단독 운영자로 지정됩니다.',
    loading: '사용 가능한 장소를 불러오는 중…',
    empty: '온보딩 가능한 장소가 없습니다.',
    retry: '다시 시도',
    retryAria: '장소 목록 다시 불러오기',
    noOnboarded: '아직 온보딩된 장소가 없습니다.',
    operatedHeader: '운영 중인 장소',
    totalLabel: '총계',
    activeLabel: '✓ 활성',
    idLabel: 'ID',
    notificationMissingVenue: '온보딩할 장소를 선택하세요.',
    onboardSuccess: '{name}이(가) 운영 장소로 온보딩되었습니다.',
    onboardError: '장소 온보딩에 실패했습니다. 다시 시도해 주세요.',
    selectAria: '온보딩할 장소 선택',
    onboardAria: '선택한 장소 온보딩',
    retryStatusAria: '장소 목록 다시 불러오기',
    venueCardAria: '운영 중인 장소',
    activeStatus: '상태: 활성',
    loadingError: '장소를 불러올 수 없습니다. 다시 시도해 주세요.',
    statusBadge: '활성',
    onboardBusyStatus: '장소 온보딩 진행 중',
    emptyState: '아직 온보딩된 장소가 없습니다.',
  },
  ja: {
    title: '会場',
    subtitle:
      '運営するゴルフコースをオンボードおよび確認します。会場ごとのティータイム空き状況と価格はコア運営から公開されます。',
    onboardHeader: '会場をオンボード',
    selectVenuePrompt: 'オンボードする会場を選択…',
    onboardButton: 'オンボード',
    onboardButtonBusy: 'オンボード中…',
    onboardDescription: 'オンボードすると、選択した会場の専属運営者として企業が登録されます。',
    loading: '利用可能な会場を読み込み中…',
    empty: 'オンボード可能な会場がありません。',
    retry: '再試行',
    retryAria: '会場一覧を再読み込み',
    noOnboarded: 'まだオンボードされた会場はありません。',
    operatedHeader: '運営中の会場',
    totalLabel: '合計',
    activeLabel: '✓ 有効',
    idLabel: 'ID',
    notificationMissingVenue: '会場を選択してください。',
    onboardSuccess: '{name} が運営会場としてオンボードされました。',
    onboardError: '会場のオンボードに失敗しました。再試行してください。',
    selectAria: 'オンボードする会場',
    onboardAria: '選択した会場をオンボード',
    retryStatusAria: '会場一覧を再読み込み',
    venueCardAria: '運営中の会場',
    activeStatus: '状態: 有効',
    loadingError: '会場を読み込めません。再試行してください。',
    statusBadge: '有効',
    onboardBusyStatus: '会場をオンボード中です',
    emptyState: 'まだオンボードされた会場はありません。',
  },
  zh: {
    title: '场地',
    subtitle:
      '添加并审核贵企业运营的高尔夫球场。每个场地的开球时间和价格由核心运营发布。',
    onboardHeader: '添加场地',
    selectVenuePrompt: '选择要添加的场地…',
    onboardButton: '添加',
    onboardButtonBusy: '正在添加…',
    onboardDescription: '添加将把贵企业设为所选场地的独家运营方。',
    loading: '正在加载可用场地…',
    empty: '当前无可添加场地。',
    retry: '重试',
    retryAria: '重试加载场地列表',
    noOnboarded: '还没有已添加场地。',
    operatedHeader: '已运营场地',
    totalLabel: '共计',
    activeLabel: '✓ 已生效',
    idLabel: 'ID',
    notificationMissingVenue: '请选择要添加的场地。',
    onboardSuccess: '{name} 已添加为已运营场地。',
    onboardError: '场地添加失败，请重试。',
    selectAria: '选择要添加的场地',
    onboardAria: '添加选定场地',
    retryStatusAria: '重试加载场地列表',
    venueCardAria: '已运营场地',
    activeStatus: '状态：已生效',
    loadingError: '无法加载场地，请重试。',
    statusBadge: '已生效',
    onboardBusyStatus: '场地添加中',
    emptyState: '目前还没有已添加场地。',
  },
  es: {
    title: 'Sedes',
    subtitle:
      'Incorpora y revisa los campos de golf que opera tu empresa. La disponibilidad y precios por sede se publican desde Core Operations.',
    onboardHeader: 'Incorporar sede',
    selectVenuePrompt: 'Selecciona una sede para incorporar…',
    onboardButton: 'Incorporar',
    onboardButtonBusy: 'Incorporando…',
    onboardDescription: 'La incorporación asigna a tu empresa como operadora exclusiva de la sede seleccionada.',
    loading: 'Cargando sedes disponibles…',
    empty: 'No hay sedes disponibles para incorporar.',
    retry: 'Reintentar',
    retryAria: 'Reintentar carga de sedes',
    noOnboarded: 'Aún no hay sedes incorporadas.',
    operatedHeader: 'Sedes operadas',
    totalLabel: 'total',
    activeLabel: '✓ ACTIVA',
    idLabel: 'ID',
    notificationMissingVenue: 'Selecciona una sede para incorporar.',
    onboardSuccess: '{name} se incorporó como sede operada.',
    onboardError: 'No se pudo incorporar la sede. Inténtalo de nuevo.',
    selectAria: 'Sede para incorporar',
    onboardAria: 'Incorporar sede seleccionada',
    retryStatusAria: 'Reintentar cargar lista de sedes',
    venueCardAria: 'Sede operada',
    activeStatus: 'Estado: activa',
    loadingError: 'No se pudo cargar las sedes. Intenta nuevamente.',
    statusBadge: 'ACTIVA',
    onboardBusyStatus: 'Incorporando sede',
    emptyState: 'Aún no hay sedes incorporadas.',
  },
  fr: {
    title: 'Sites',
    subtitle:
      'Ajoutez et consultez les parcours de golf exploités par votre entreprise. La disponibilité des départs et les prix par site sont publiés depuis Core Operations.',
    onboardHeader: 'Ajouter un site',
    selectVenuePrompt: 'Sélectionner un site à ajouter…',
    onboardButton: 'Ajouter',
    onboardButtonBusy: 'Ajout en cours…',
    onboardDescription: "L'ajout désigne votre entreprise comme exploitant exclusif du site sélectionné.",
    loading: 'Chargement des sites disponibles…',
    empty: 'Aucun site disponible à ajouter.',
    retry: 'Réessayer',
    retryAria: 'Réessayer le chargement des sites',
    noOnboarded: 'Aucun site n’a encore été ajouté.',
    operatedHeader: 'Sites exploités',
    totalLabel: 'total',
    activeLabel: '✓ ACTIF',
    idLabel: 'ID',
    notificationMissingVenue: 'Sélectionnez un site à ajouter.',
    onboardSuccess: '{name} a été ajouté comme site exploité.',
    onboardError: "Échec de l'ajout du site. Veuillez réessayer.",
    selectAria: 'Sélectionner le site à ajouter',
    onboardAria: 'Ajouter le site sélectionné',
    retryStatusAria: 'Réessayer le chargement des sites',
    venueCardAria: 'Site exploité',
    activeStatus: 'État: actif',
    loadingError: "Impossible de charger les sites. Veuillez réessayer.",
    statusBadge: 'ACTIF',
    onboardBusyStatus: 'Ajout du site en cours',
    emptyState: 'Aucun site n’a encore été ajouté.',
  },
  de: {
    title: 'Spielorte',
    subtitle:
      'Onboarden und prüfen Sie die Golfplätze, die Ihr Unternehmen betreibt. Verfügbarkeit und Preise pro Venue werden von Core Operations veröffentlicht.',
    onboardHeader: 'Venue onboarden',
    selectVenuePrompt: 'Wählen Sie einen Venue zum Onboarden aus…',
    onboardButton: 'Onboarden',
    onboardButtonBusy: 'Wird onboarded…',
    onboardDescription: 'Beim Onboarding wird Ihr Unternehmen als exklusiver Betreiber des ausgewählten Venues festgelegt.',
    loading: 'Verfügbare Venues werden geladen…',
    empty: 'Keine Venues zum Onboarden verfügbar.',
    retry: 'Wiederholen',
    retryAria: 'Venue-Liste erneut laden',
    noOnboarded: 'Noch keine Venues onboarded.',
    operatedHeader: 'Betreute Venues',
    totalLabel: 'gesamt',
    activeLabel: '✓ AKTIV',
    idLabel: 'ID',
    notificationMissingVenue: 'Wählen Sie einen Venue zum Onboarden.',
    onboardSuccess: '{name} wurde als betreuter Venue hinzugefügt.',
    onboardError: 'Venue-Onboarding fehlgeschlagen. Bitte erneut versuchen.',
    selectAria: 'Zu onbaordender Venue',
    onboardAria: 'Ausgewählten Venue onboarden',
    retryStatusAria: 'Venue-Liste erneut laden',
    venueCardAria: 'Betreuter Venue',
    activeStatus: 'Status: aktiv',
    loadingError: 'Venues konnten nicht geladen werden. Bitte erneut versuchen.',
    statusBadge: 'AKTIV',
    onboardBusyStatus: 'Venue-Onboarding läuft',
    emptyState: 'Noch keine onboardeten Venues.',
  },
};

export default function VenueManager({ partnerUid }: { partnerUid: string }) {
  const [vault, setVault] = useState<CourseOption[]>([]);
  const [operated, setOperated] = useState<OperatedCourse[]>([]);
  const [claimCourseId, setClaimCourseId] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [note, setNote] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');

  const [lang, setLang] = useState<Lang>('en');

  const normalizeLocale = (locale: string) => {
    const langCode = locale.toLowerCase().split('-')[0];
    if (langCode === 'en' || langCode === 'th' || langCode === 'ko' || langCode === 'ja' || langCode === 'zh' || langCode === 'es' || langCode === 'fr' || langCode === 'de') {
      return langCode;
    }
    return 'en';
  };

  const t = (key: keyof (typeof DICT)['en'], vars: Record<string, string> = {}) => {
    const raw = DICT[lang][key] || DICT.en[key] || key;
    return raw.replace(/\{(\w+)\}/g, (_, v) => vars[v] ?? `{${v}}`);
  };

  useEffect(() => {
    const browserLang = normalizeLocale(navigator.language || 'en');
    setLang(browserLang);
  }, []);

  const notify = (msg: string, type: 'success' | 'error') => {
    setNote({ msg, type });
    setTimeout(() => setNote(null), 4000);
  };

  const loadVault = async () => {
    setLoadState('loading');
    try {
      const snap = await getDocs(collection(db, 'courses'));
      setVault(
        snap.docs
          .map((d) => {
            const c = d.data() as any;
            const id = c.courseID || d.id;
            const name = c.clubName || c.name || id;
            const place = [c.city, c.country].filter(Boolean).join(', ');
            return { courseID: id, label: place ? `${name} — ${place}` : name, city: c.city };
          })
          .filter((o) => o.courseID)
          .sort((a, b) => a.label.localeCompare(b.label))
      );
      setLoadState('ready');
    } catch (e) {
      setLoadState('error');
      console.error('Venue vault load error:', e);
    }
  };

  useEffect(() => {
    void loadVault();
  }, []);

  const operatedIds = useMemo(() => new Set(operated.map((o) => o.courseId)), [operated]);
  const claimable = useMemo(() => vault.filter((v) => !operatedIds.has(v.courseID)), [vault, operatedIds]);

  // Courses THIS enterprise operates.
  useEffect(() => {
    if (!partnerUid || partnerUid === 'UNKNOWN_USER') return;
    const q = query(collection(db, 'course_operators'), where('operatorUid', '==', partnerUid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setOperated(
          snap.docs.map((d) => {
            const o = d.data() as any;
            return { courseId: o.courseId || d.id, courseName: o.courseName || d.id } as OperatedCourse;
          })
        );
      },
      (err) => console.error('Venue operator sync error:', err)
    );
    return () => unsub();
  }, [partnerUid]);

  const onboardVenue = async () => {
    if (!claimCourseId) return notify(t('notificationMissingVenue'), 'error');
    setIsBusy(true);
    try {
      const fn = httpsCallable(getFunctions(), 'claimCourseOperator');
      const res: any = await fn({ courseId: claimCourseId });
      if (!res?.data?.success) throw new Error('Onboarding was not accepted.');
      notify(t('onboardSuccess', { name: String(res.data.courseName || claimCourseId) }), 'success');
      setClaimCourseId('');
    } catch (e: any) {
      notify(e?.message || t('onboardError'), 'error');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div style={{ padding: '20px', color: '#fff', maxWidth: '1100px', margin: '0 auto' }}>
      {note && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            padding: '16px 24px',
            zIndex: 1000,
            backgroundColor: note.type === 'error' ? '#ff4444' : '#4CAF50',
            borderRadius: '8px',
            fontWeight: 'bold',
          }}
        >
          {note.msg}
        </div>
      )}

      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ color: '#d4af37', margin: 0, letterSpacing: '1px' }}>{t('title')}</h2>
        <p style={{ color: '#888', fontSize: '14px', marginTop: '5px' }}>{t('subtitle')}</p>
      </div>

      <div
        style={{
          backgroundColor: '#111',
          border: '1px solid #d4af37',
          borderRadius: '8px',
          padding: '20px',
          marginBottom: '20px',
        }}
      >
        <h3 style={{ marginTop: 0, color: '#d4af37', fontSize: '15px' }}>{t('onboardHeader')}</h3>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <select
            value={claimCourseId}
            onChange={(e) => setClaimCourseId(e.target.value)}
            style={{ ...inputStyle, flex: 1 }}
            aria-label={t('selectAria')}
          >
            <option value="">{t('selectVenuePrompt')}</option>
            {claimable.map((c) => (
              <option key={c.courseID} value={c.courseID}>
                {c.label}
              </option>
            ))}
          </select>
          <button
            onClick={onboardVenue}
            disabled={isBusy}
            aria-label={t('onboardAria')}
            aria-busy={isBusy}
            style={{
              padding: '10px 18px',
              backgroundColor: isBusy ? '#555' : '#d4af37',
              color: '#000',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 900,
              cursor: isBusy ? 'not-allowed' : 'pointer',
            }}
          >
            {isBusy ? `${t('onboardButtonBusy')}` : t('onboardButton')}
          </button>
        </div>

        <div style={{ color: '#666', fontSize: '11px', marginTop: '10px' }}>{t('onboardDescription')}</div>
        {isBusy && (
          <p role="status" aria-live="polite" style={{ color: '#d4af37', marginTop: '6px', marginBottom: 0, fontSize: '11px' }}>
            {t('onboardBusyStatus')}
          </p>
        )}
        {loadState === 'loading' && (
          <p role="status" aria-live="polite" style={{ color: '#888', marginTop: '10px' }}>
            {t('loading')}
          </p>
        )}
        {loadState === 'error' && (
          <div role="alert" aria-live="assertive" style={{ marginTop: '10px' }}>
            <p style={{ color: '#888', margin: 0 }}>{t('loadingError')}</p>
            <button
              onClick={loadVault}
              style={retryStyle}
              aria-label={t('retryAria')}
            >
              {t('retry')}
            </button>
          </div>
        )}
      </div>

      <div style={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '8px', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, color: '#aaa', fontSize: '14px', textTransform: 'uppercase' }}>{t('operatedHeader')}</h3>
          <span style={{ color: '#4CAF50', fontSize: '13px', fontWeight: 'bold' }}>
            {operated.length} {t('totalLabel')}
          </span>
        </div>
        {operated.length === 0 ? (
          <div
            role="status"
            aria-live="polite"
            style={{ textAlign: 'center', padding: '40px', color: '#555', border: '1px dashed #333', borderRadius: '6px' }}
          >
            {loadState === 'ready' ? t('emptyState') : t('empty')}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
            {operated.map((o) => (
              <div
                key={o.courseId}
                role="status"
                aria-live="polite"
                aria-label={`${t('venueCardAria')} ${o.courseName}`}
                style={{
                  backgroundColor: '#1a1a1a',
                  border: '1px solid #222',
                  borderRadius: '8px',
                  padding: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '8px',
                    backgroundColor: '#0a0a0a',
                    border: '1px solid #333',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '20px',
                  }}
                >
                  ⛳
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {o.courseName}
                  </div>
                  <div style={{ color: '#666', fontSize: '11px' }}>
                    {t('idLabel')}: {o.courseId}
                  </div>
                </div>
                <span style={{ color: '#4CAF50', fontSize: '11px', fontWeight: 'bold' }} aria-label={t('activeStatus')}>
                  {t('activeLabel')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      <CourseCorrectionRequest />
    </div>
  );
}

const inputStyle = {
  width: '100%',
  padding: '9px',
  backgroundColor: '#0a0a0a',
  border: '1px solid #333',
  color: '#fff',
  borderRadius: '4px',
  boxSizing: 'border-box' as const,
};

const retryStyle = {
  marginTop: '8px',
  padding: '8px 12px',
  backgroundColor: '#111',
  border: '1px solid #d4af37',
  color: '#d4af37',
  borderRadius: '6px',
  cursor: 'pointer',
};
