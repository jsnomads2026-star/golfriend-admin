import { useState } from 'react';
import { V2Theme } from '../../../theme/v2Theme';
import { BOOKING_DATA_CONTRACT, BOOKING_READINESS_REGISTRY, C3A_BASE_BUILD_ID, type CanonicalLocale, type ReadinessEntry } from './BookingCommissioning.js';

interface ReadinessStrings { title: string; distinction: string; trustedSource: string; prerequisites: string; allowed: string; blocked: string; owner: string; build: string; show: string; hide: string; }
const STRINGS: Record<CanonicalLocale, ReadinessStrings> = {
  en: { title: 'Booking Readiness', distinction: 'Fixture-verified and contract-ready do not mean commissioned.', trustedSource: 'Trusted source', prerequisites: 'Prerequisites', allowed: 'Allowed actions', blocked: 'Blocked actions', owner: 'Authority owner', build: 'Last verified build', show: 'Show details', hide: 'Hide details' },
  th: { title: 'ความพร้อมการจอง', distinction: 'ตรวจสอบด้วยข้อมูลจำลองหรือสัญญาพร้อม ไม่ได้หมายถึงเปิดใช้งานจริง', trustedSource: 'แหล่งข้อมูลที่เชื่อถือได้', prerequisites: 'ข้อกำหนดเบื้องต้น', allowed: 'การดำเนินการที่อนุญาต', blocked: 'การดำเนินการที่ถูกบล็อก', owner: 'เจ้าของสิทธิ์', build: 'บิลด์ที่ตรวจสอบล่าสุด', show: 'แสดงรายละเอียด', hide: 'ซ่อนรายละเอียด' },
  ko: { title: '예약 준비 상태', distinction: '픽스처 검증 및 계약 준비는 실제 커미셔닝을 의미하지 않습니다.', trustedSource: '신뢰할 수 있는 소스', prerequisites: '전제 조건', allowed: '허용된 작업', blocked: '차단된 작업', owner: '권한 소유자', build: '마지막 검증 빌드', show: '세부정보 표시', hide: '세부정보 숨기기' },
  ja: { title: '予約準備状況', distinction: 'フィクスチャ検証済み・契約準備済みは、本番稼働済みを意味しません。', trustedSource: '信頼できるソース', prerequisites: '前提条件', allowed: '許可された操作', blocked: '禁止された操作', owner: '権限所有者', build: '最終検証ビルド', show: '詳細を表示', hide: '詳細を非表示' },
  zh: { title: '预订就绪状态', distinction: '固定数据已验证或合同已就绪，并不表示已投入实际运行。', trustedSource: '可信来源', prerequisites: '先决条件', allowed: '允许的操作', blocked: '禁止的操作', owner: '权限所有者', build: '最近验证的构建', show: '显示详情', hide: '隐藏详情' },
  es: { title: 'Preparación de reservas', distinction: 'Verificado con datos locales o contrato listo no significa comisionado.', trustedSource: 'Fuente confiable', prerequisites: 'Requisitos previos', allowed: 'Acciones permitidas', blocked: 'Acciones bloqueadas', owner: 'Responsable de autoridad', build: 'Última compilación verificada', show: 'Mostrar detalles', hide: 'Ocultar detalles' },
  fr: { title: 'État de préparation des réservations', distinction: 'Vérifié par données locales ou contrat prêt ne signifie pas mis en service.', trustedSource: 'Source fiable', prerequisites: 'Prérequis', allowed: 'Actions autorisées', blocked: 'Actions bloquées', owner: "Responsable de l'autorité", build: 'Dernier build vérifié', show: 'Afficher les détails', hide: 'Masquer les détails' },
  de: { title: 'Buchungsbereitschaft', distinction: 'Fixture-geprüft oder vertragsbereit bedeutet nicht in Betrieb genommen.', trustedSource: 'Vertrauenswürdige Quelle', prerequisites: 'Voraussetzungen', allowed: 'Erlaubte Aktionen', blocked: 'Gesperrte Aktionen', owner: 'Verantwortliche Stelle', build: 'Zuletzt geprüfter Build', show: 'Details anzeigen', hide: 'Details ausblenden' },
};
const stateColor: Record<ReadinessEntry['currentState'], string> = { unavailable: V2Theme.surfaceTextMuted, fixture_verified: V2Theme.warningAmber, contract_ready: V2Theme.fairwayLight, commissioned: V2Theme.successGreen, degraded: V2Theme.errorRed };

export default function BookingReadiness({ locale }: { locale: CanonicalLocale }) {
  const [expanded, setExpanded] = useState(false);
  const labels = STRINGS[locale];
  return (
    <section data-c3a-booking-readiness="true" aria-labelledby="c3a-readiness-heading" className="c3a-readiness">
      <div className="c3a-readiness-header"><div><h3 id="c3a-readiness-heading">{labels.title}</h3><p>{labels.distinction}</p></div>
        <button type="button" aria-expanded={expanded} aria-controls="c3a-readiness-details" onClick={() => setExpanded((value) => !value)}>{expanded ? labels.hide : labels.show}</button>
      </div>
      <dl className="c3a-readiness-meta"><div><dt>{labels.trustedSource}</dt><dd>{String(BOOKING_DATA_CONTRACT.sourceAuthority)}</dd></div><div><dt>{labels.build}</dt><dd><code>{C3A_BASE_BUILD_ID.slice(0, 12)}</code></dd></div></dl>
      <div id="c3a-readiness-details" hidden={!expanded} className="c3a-readiness-grid">
        {BOOKING_READINESS_REGISTRY.map((entry) => <article key={entry.capabilityId}>
          <h4>{entry.capabilityId.replaceAll('_', ' ')}</h4><strong style={{ color: stateColor[entry.currentState] }}>{entry.currentState}</strong><p>{entry.userFacingExplanation}</p>
          <p><b>{labels.prerequisites}:</b> {entry.prerequisites.join('; ') || 'None'}</p><p><b>{labels.allowed}:</b> {entry.allowedActions.join('; ') || 'None'}</p><p><b>{labels.blocked}:</b> {entry.blockedActions.join('; ') || 'None'}</p><p><b>{labels.owner}:</b> {entry.authorityOwner}</p>
        </article>)}
      </div>
    </section>
  );
}
