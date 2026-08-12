import { V2Theme } from '../../../theme/v2Theme';
import { V2Badge } from '../../../theme/v2Primitives';
import {
  BOOKING_RELEASE_CLASSIFICATIONS,
  BOOKING_RELEASE_READINESS,
  summarizeBookingReleaseReadiness,
  type BookingReleaseClassification,
  type BookingReleaseLocale,
} from './bookingReleaseReadiness.js';

interface Copy { title: string; truth: string; completed: string; blocked: string; manual: string; prerequisites: string; blockedDetail: string; manualDetail: string; }
const COPY: Record<BookingReleaseLocale, Copy> = {
  en: { title: 'Booking release readiness', truth: 'Fixture verification and contract readiness do not mean commissioned.', completed: 'Completed in scope', blocked: 'Externally blocked', manual: 'Manual verification', prerequisites: 'Remaining prerequisites', blockedDetail: 'Blocked external capabilities', manualDetail: 'Manual verification requirements' },
  th: { title: 'ความพร้อมเผยแพร่ระบบจอง', truth: 'การตรวจสอบด้วยข้อมูลจำลองและสัญญาที่พร้อม ไม่ได้หมายถึงเปิดใช้งานจริง', completed: 'เสร็จในขอบเขต', blocked: 'ถูกบล็อกจากภายนอก', manual: 'ต้องตรวจสอบด้วยตนเอง', prerequisites: 'ข้อกำหนดที่เหลือ', blockedDetail: 'ความสามารถที่ถูกบล็อกภายนอก', manualDetail: 'ข้อกำหนดการตรวจสอบด้วยตนเอง' },
  ko: { title: '예약 릴리스 준비 상태', truth: '픽스처 검증과 계약 준비는 실제 커미셔닝을 의미하지 않습니다.', completed: '범위 내 완료', blocked: '외부 차단', manual: '수동 검증', prerequisites: '남은 전제 조건', blockedDetail: '외부 차단 기능', manualDetail: '수동 검증 요구사항' },
  ja: { title: '予約リリース準備状況', truth: 'フィクスチャ検証と契約準備は、本番稼働済みを意味しません。', completed: '範囲内で完了', blocked: '外部要因で停止', manual: '手動検証', prerequisites: '残りの前提条件', blockedDetail: '外部要因で停止中の機能', manualDetail: '手動検証要件' },
  zh: { title: '预订发布就绪状态', truth: '固定数据验证和合同就绪并不表示已投入实际运行。', completed: '范围内完成', blocked: '外部阻塞', manual: '人工验证', prerequisites: '剩余先决条件', blockedDetail: '外部阻塞能力', manualDetail: '人工验证要求' },
  es: { title: 'Preparación de lanzamiento de reservas', truth: 'La verificación local y los contratos listos no significan puesta en servicio.', completed: 'Completado en alcance', blocked: 'Bloqueado externamente', manual: 'Verificación manual', prerequisites: 'Requisitos restantes', blockedDetail: 'Capacidades bloqueadas externamente', manualDetail: 'Requisitos de verificación manual' },
  fr: { title: 'Préparation de la mise en production des réservations', truth: 'La vérification locale et les contrats prêts ne signifient pas une mise en service.', completed: 'Terminé dans le périmètre', blocked: 'Bloqué en externe', manual: 'Vérification manuelle', prerequisites: 'Prérequis restants', blockedDetail: 'Capacités bloquées en externe', manualDetail: 'Exigences de vérification manuelle' },
  de: { title: 'Buchungs-Releasebereitschaft', truth: 'Fixture-Prüfung und Vertragsbereitschaft bedeuten keine Inbetriebnahme.', completed: 'Im Umfang abgeschlossen', blocked: 'Extern blockiert', manual: 'Manuelle Prüfung', prerequisites: 'Verbleibende Voraussetzungen', blockedDetail: 'Extern blockierte Funktionen', manualDetail: 'Anforderungen für manuelle Prüfung' },
};

const colors: Record<BookingReleaseClassification, string> = {
  implemented: V2Theme.successGreen, fixture_verified: V2Theme.warningAmber,
  contract_ready: V2Theme.fairwayLight, manual_verification_required: V2Theme.warningAmber,
  blocked_external: V2Theme.errorRed, unavailable: V2Theme.surfaceTextMuted,
};

export default function BookingReleaseReadiness({ locale }: { locale: BookingReleaseLocale }) {
  const summary = summarizeBookingReleaseReadiness();
  const copy = COPY[locale];
  const blocked = BOOKING_RELEASE_READINESS.filter((item) => item.classification === 'blocked_external' || item.classification === 'unavailable');
  const manual = BOOKING_RELEASE_READINESS.filter((item) => item.manualVerificationRequirements.length > 0);
  return (
    <section className="c3b-release-readiness" data-c3b-booking-release-readiness="true" aria-labelledby="c3b-release-heading">
      <h3 id="c3b-release-heading">{copy.title}</h3>
      <p className="c3b-release-truth" role="note">{copy.truth}</p>
      <div className="c3b-release-counts" aria-label={copy.title}>
        <Metric label={copy.completed} value={summary.completedCapabilities} color={V2Theme.successGreen} />
        <Metric label={copy.blocked} value={summary.externallyBlockedCapabilities} color={V2Theme.errorRed} />
        <Metric label={copy.manual} value={summary.manualVerificationCapabilities} color={V2Theme.warningAmber} />
      </div>
      <div className="c3b-release-classifications">
        {BOOKING_RELEASE_CLASSIFICATIONS.map((classification) => <span key={classification} style={{ color: colors[classification] }}><V2Badge status={classification} label={`${classification}: ${summary.counts[classification]}`} /></span>)}
      </div>
      <div className="c3b-release-details">
        <article><h4>{copy.prerequisites}</h4><ul>{summary.remainingPrerequisiteIds.map((id) => <li key={id}><code>{id}</code></li>)}</ul></article>
        <article data-c3b-blocked-external="true"><h4>{copy.blockedDetail}</h4>{blocked.map((item) => <div key={item.stableId}><strong>{item.stableId.replaceAll('_', ' ')}</strong><p>{item.sourceType}</p></div>)}</article>
        <article data-c3b-manual-verification="true"><h4>{copy.manualDetail}</h4>{manual.map((item) => <div key={item.stableId}><strong>{item.stableId.replaceAll('_', ' ')}</strong><ul>{item.manualVerificationRequirements.map((requirement) => <li key={requirement}>{requirement}</li>)}</ul></div>)}</article>
      </div>
    </section>
  );
}

function Metric({ label, value, color }: { label: string; value: number; color: string }) {
  return <div><span>{label}</span><strong style={{ color }}>{value}</strong></div>;
}
