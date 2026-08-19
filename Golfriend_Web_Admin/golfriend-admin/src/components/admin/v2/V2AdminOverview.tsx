import { ADMIN_NAVIGATION_AREAS, type AdminArea } from './adminNavigation';
import { ADMIN_ANALYTICS_PRESENTATION, ADMIN_CONTROL_PRESENTATION, ADMIN_PRESENTATION } from '../../../i18n/admin/presentation';
import { useAdminLocale } from './AdminLocaleContext';

type OverviewCopyKey =
  | 'operations'
  | 'heroTitle'
  | 'heroLead'
  | 'boundaries'
  | 'authority'
  | 'authorityTitle'
  | 'authorityLead'
  | 'courseData'
  | 'courseDataTitle'
  | 'courseDataLead'
  | 'teeTimes'
  | 'teeTimesTitle'
  | 'teeTimesLead'
  | 'areas'
  | 'openArea'
  | 'areaIndexPrefix';

type AdminOverviewCopy = Record<OverviewCopyKey, string>;

const OVERVIEW_COPY: Record<'en' | 'th' | 'ko' | 'ja' | 'zh' | 'es' | 'fr' | 'de', AdminOverviewCopy> = {
  en: {
    operations: 'Golfriend operations',
    heroTitle: 'Keep every round connected.',
    heroLead: 'One operational view for courses, bookings, partners, publishing and accountable reporting. Golfriend manages its own services here.',
    boundaries: 'Operating boundaries',
    authority: 'Authority',
    authorityTitle: 'Server-owned actions',
    authorityLead: 'Existing authorization and service boundaries remain the source of truth.',
    courseData: 'Course data',
    courseDataTitle: 'Protected synchronization',
    courseDataLead: 'Preview, trusted records and manual location safeguards remain intact.',
    teeTimes: 'Tee times',
    teeTimesTitle: 'Communication, not settlement',
    teeTimesLead: 'Golfriend coordinates booking operations and does not confirm external payments.',
    areas: 'Operational areas',
    openArea: 'Open area',
    areaIndexPrefix: 'Area',
  },
  th: {
    operations: 'งานปฏิบัติการ Golfriend',
    heroTitle: 'เชื่อมโยงทุกรอบการเล่นให้ต่อเนื่อง',
    heroLead: 'ดูแลงานสนาม การจอง พาร์ตเนอร์ การเผยแพร่ และรายงานที่ตรวจสอบได้จากที่เดียว โดย Golfriend ดูแลเฉพาะบริการของตน',
    boundaries: 'ขอบเขตการปฏิบัติงาน',
    authority: 'สิทธิ์ดำเนินการ',
    authorityTitle: 'การดำเนินการที่เซิร์ฟเวอร์ควบคุม',
    authorityLead: 'สิทธิ์และขอบเขตบริการที่มีอยู่ยังเป็นแหล่งข้อมูลอ้างอิง',
    courseData: 'ข้อมูลสนาม',
    courseDataTitle: 'ซิงก์ข้อมูลอย่างมีการป้องกัน',
    courseDataLead: 'ยังคงใช้การแสดงตัวอย่าง ข้อมูลที่เชื่อถือได้ และการตรวจตำแหน่งด้วยเจ้าหน้าที่',
    teeTimes: 'เวลาออกรอบ',
    teeTimesTitle: 'สื่อสาร ไม่ใช่ชำระเงิน',
    teeTimesLead: 'Golfriend ประสานงานการจองและไม่ยืนยันการชำระเงินผ่านระบบภายนอก',
    areas: 'พื้นที่ปฏิบัติงาน',
    openArea: 'เปิดพื้นที่',
    areaIndexPrefix: 'ลำดับที่',
  },
  ko: {
    operations: 'Golfriend 운영',
    heroTitle: '모든 라운드를 끊김 없이 연결하세요.',
    heroLead: '코스, 예약, 파트너, 게시 및 책임 있는 보고를 한 곳에서 관리합니다. Golfriend는 자체 서비스를 운영합니다.',
    boundaries: '운영 범위',
    authority: '권한',
    authorityTitle: '서버가 관리하는 작업',
    authorityLead: '기존 승인 및 서비스 경계가 계속 기준이 됩니다.',
    courseData: '코스 데이터',
    courseDataTitle: '보호된 동기화',
    courseDataLead: '미리보기, 신뢰된 기록 및 수동 위치 보호 절차를 유지합니다.',
    teeTimes: '티타임',
    teeTimesTitle: '결제가 아닌 커뮤니케이션',
    teeTimesLead: 'Golfriend는 예약 운영을 조율하며 외부 결제를 확정하지 않습니다.',
    areas: '운영 영역',
    openArea: '영역 열기',
    areaIndexPrefix: '영역',
  },
  ja: {
    operations: 'Golfriend 運用',
    heroTitle: 'すべてのラウンドを確実につなぐ。',
    heroLead: 'コース、予約、パートナー、掲載、説明可能な報告を一か所で管理します。Golfriend は自社サービスのみを運用します。',
    boundaries: '運用範囲',
    authority: '権限',
    authorityTitle: 'サーバー管理の操作',
    authorityLead: '既存の認可とサービス境界を引き続き正とします。',
    courseData: 'コースデータ',
    courseDataTitle: '保護された同期',
    courseDataLead: 'プレビュー、信頼済み記録、手動の位置確認を維持します。',
    teeTimes: 'ティータイム',
    teeTimesTitle: '決済ではなく連絡',
    teeTimesLead: 'Golfriend は予約運用を調整しますが、外部決済を確定しません。',
    areas: '運用エリア',
    openArea: 'エリアを開く',
    areaIndexPrefix: 'エリア',
  },
  zh: {
    operations: 'Golfriend 运营',
    heroTitle: '让每一场球顺畅衔接。',
    heroLead: '集中管理球场、预订、合作伙伴、发布和可追溯报告。Golfriend 仅管理自身服务。',
    boundaries: '运营边界',
    authority: '权限',
    authorityTitle: '服务器控制的操作',
    authorityLead: '现有授权和服务边界仍是准确信息来源。',
    courseData: '球场数据',
    courseDataTitle: '受保护的同步',
    courseDataLead: '保留预览、可信记录和人工位置保护措施。',
    teeTimes: '开球时间',
    teeTimesTitle: '负责沟通，不处理结算',
    teeTimesLead: 'Golfriend 协调预订运营，但不确认外部付款。',
    areas: '运营区域',
    openArea: '打开区域',
    areaIndexPrefix: '序号',
  },
  es: {
    operations: 'Operaciones de Golfriend',
    heroTitle: 'Mantén conectada cada ronda.',
    heroLead: 'Gestiona campos, reservas, socios, publicaciones e informes verificables desde un solo lugar. Golfriend administra únicamente sus propios servicios.',
    boundaries: 'Límites operativos',
    authority: 'Autoridad',
    authorityTitle: 'Acciones controladas por el servidor',
    authorityLead: 'Las autorizaciones y los límites de servicio existentes siguen siendo la fuente de referencia.',
    courseData: 'Datos de campos',
    courseDataTitle: 'Sincronización protegida',
    courseDataLead: 'Se mantienen las vistas previas, los registros fiables y las salvaguardas manuales de ubicación.',
    teeTimes: 'Horarios de salida',
    teeTimesTitle: 'Comunicación, no liquidación',
    teeTimesLead: 'Golfriend coordina las reservas y no confirma pagos externos.',
    areas: 'Áreas operativas',
    openArea: 'Abrir área',
    areaIndexPrefix: 'Área',
  },
  fr: {
    operations: 'Opérations Golfriend',
    heroTitle: 'Gardez chaque partie bien connectée.',
    heroLead: 'Gérez les parcours, réservations, partenaires, publications et rapports traçables depuis un seul espace. Golfriend gère uniquement ses propres services.',
    boundaries: 'Limites opérationnelles',
    authority: 'Autorité',
    authorityTitle: 'Actions contrôlées par le serveur',
    authorityLead: 'Les autorisations et limites de service existantes restent la référence.',
    courseData: 'Données des parcours',
    courseDataTitle: 'Synchronisation protégée',
    courseDataLead: 'Les aperçus, données fiables et contrôles manuels de localisation sont conservés.',
    teeTimes: 'Départs',
    teeTimesTitle: 'Communication, pas règlement',
    teeTimesLead: 'Golfriend coordonne les réservations sans confirmer les paiements externes.',
    areas: 'Domaines opérationnels',
    openArea: 'Ouvrir la zone',
    areaIndexPrefix: 'Zone',
  },
  de: {
    operations: 'Golfriend Betrieb',
    heroTitle: 'Jede Runde zuverlässig verbinden.',
    heroLead: 'Plätze, Buchungen, Partner, Veröffentlichungen und nachvollziehbare Berichte an einem Ort verwalten. Golfriend betreibt ausschließlich eigene Dienste.',
    boundaries: 'Betriebsgrenzen',
    authority: 'Berechtigung',
    authorityTitle: 'Servergesteuerte Aktionen',
    authorityLead: 'Bestehende Berechtigungen und Dienstgrenzen bleiben maßgeblich.',
    courseData: 'Platzdaten',
    courseDataTitle: 'Geschützte Synchronisierung',
    courseDataLead: 'Vorschau, vertrauenswürdige Datensätze und manuelle Standortprüfungen bleiben erhalten.',
    teeTimes: 'Startzeiten',
    teeTimesTitle: 'Kommunikation statt Abrechnung',
    teeTimesLead: 'Golfriend koordiniert Buchungen und bestätigt keine externen Zahlungen.',
    areas: 'Betriebsbereiche',
    openArea: 'Bereich öffnen',
    areaIndexPrefix: 'Bereich',
  },
};

export default function V2AdminOverview({ onOpen }: { onOpen: (area: AdminArea) => void }) {
  const locale = useAdminLocale();
  const copy = {
    ...ADMIN_PRESENTATION[locale],
    ...ADMIN_ANALYTICS_PRESENTATION[locale],
    ...ADMIN_CONTROL_PRESENTATION[locale],
    ...OVERVIEW_COPY[locale],
  };

  return <div className="v2-admin-overview">
    <section className="v2-admin-hero">
      <div>
        <span>{copy.operations}</span>
        <h2>{copy.heroTitle}</h2>
      </div>
      <p>{copy.heroLead}</p>
    </section>

    <section className="v2-admin-principles" aria-label={copy.boundaries}>
      <h2>{copy.boundaries}</h2>
      <article>
        <span>{copy.authority}</span>
        <strong>{copy.authorityTitle}</strong>
        <p>{copy.authorityLead}</p>
      </article>
      <article>
        <span>{copy.courseData}</span>
        <strong>{copy.courseDataTitle}</strong>
        <p>{copy.courseDataLead}</p>
      </article>
      <article>
        <span>{copy.teeTimes}</span>
        <strong>{copy.teeTimesTitle}</strong>
        <p>{copy.teeTimesLead}</p>
      </article>
    </section>

    <section className="v2-admin-area-grid" aria-label={copy.areas}>
      <h2>{copy.areas}</h2>
      {ADMIN_NAVIGATION_AREAS.slice(1).map((area, index) => <button
        type="button"
        key={area.id}
        onClick={() => onOpen(area.id)}
        aria-label={`${copy.openArea} ${copy[area.id]} (${copy.areaIndexPrefix} ${index + 2})`}
      >
        <span>{String(index + 2).padStart(2, '0')}</span>
        <strong>{copy[area.id]}</strong>
        <i aria-hidden="true">↗</i>
      </button>)}
    </section>
  </div>;
}
