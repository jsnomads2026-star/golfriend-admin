import { useMemo, useState } from 'react';
import { useAdminLocale } from './AdminLocaleContext';
import { COMMISSIONING_LOCALES, COMMISSIONING_REGISTRY, type ReadinessState } from './commissioningContracts';
import './CommissioningReadiness.css';

const COMMISSIONING_READINESS_COPY = {
  en:{eyebrow:'COMMISSIONING CONTRACTS',title:'Commissioning Readiness',intro:'Contract readiness is not production commissioning.',filter:'Filter state',all:'All states',capability:'Capability',state:'Truthful state',source:'Trusted source / evidence',prerequisites:'Missing prerequisites',allowed:'Allowed operations',blocked:'Blocked operations',details:'Readiness details'},
  th:{eyebrow:'สัญญาการเปิดใช้งาน',title:'ความพร้อมในการเปิดใช้งาน',intro:'สัญญาพร้อมไม่ได้หมายถึงเปิดใช้งานจริง',filter:'กรองสถานะ',all:'ทุกสถานะ',capability:'ความสามารถ',state:'สถานะจริง',source:'แหล่งที่มา / หลักฐาน',prerequisites:'ข้อกำหนดที่ขาด',allowed:'การดำเนินการที่อนุญาต',blocked:'การดำเนินการที่ถูกบล็อก',details:'รายละเอียดความพร้อม'},
  ko:{eyebrow:'커미셔닝 계약',title:'커미셔닝 준비 상태',intro:'계약 준비는 운영 커미셔닝을 의미하지 않습니다.',filter:'상태 필터',all:'모든 상태',capability:'기능',state:'확인된 상태',source:'신뢰 출처 / 증거',prerequisites:'누락된 전제 조건',allowed:'허용 작업',blocked:'차단 작업',details:'준비 상태 상세'},
  ja:{eyebrow:'コミッショニング契約',title:'コミッショニング準備状況',intro:'契約準備完了は本番稼働を意味しません。',filter:'状態で絞り込み',all:'すべての状態',capability:'機能',state:'正確な状態',source:'信頼できる情報源 / 証拠',prerequisites:'不足している前提条件',allowed:'許可された操作',blocked:'禁止された操作',details:'準備状況の詳細'},
  zh:{eyebrow:'投产合同',title:'投产准备矩阵',intro:'合同就绪并不代表已经投产。',filter:'筛选状态',all:'全部状态',capability:'能力',state:'真实状态',source:'可信来源 / 证据',prerequisites:'缺少的前提条件',allowed:'允许的操作',blocked:'禁止的操作',details:'准备详情'},
  es:{eyebrow:'CONTRATOS DE PUESTA EN SERVICIO',title:'Preparación para puesta en servicio',intro:'Contrato listo no significa servicio en producción.',filter:'Filtrar estado',all:'Todos los estados',capability:'Capacidad',state:'Estado veraz',source:'Fuente / evidencia fiable',prerequisites:'Requisitos pendientes',allowed:'Operaciones permitidas',blocked:'Operaciones bloqueadas',details:'Detalles de preparación'},
  fr:{eyebrow:'CONTRATS DE MISE EN SERVICE',title:'État de préparation',intro:'Un contrat prêt ne signifie pas une mise en service réelle.',filter:'Filtrer le statut',all:'Tous les statuts',capability:'Capacité',state:'État réel',source:'Source / preuve fiable',prerequisites:'Prérequis manquants',allowed:'Opérations autorisées',blocked:'Opérations bloquées',details:'Détails de préparation'},
  de:{eyebrow:'INBETRIEBNAHMEVERTRÄGE',title:'Inbetriebnahmebereitschaft',intro:'Vertragsbereit bedeutet nicht produktiv in Betrieb.',filter:'Status filtern',all:'Alle Status',capability:'Fähigkeit',state:'Belegter Status',source:'Vertrauenswürdige Quelle / Nachweis',prerequisites:'Fehlende Voraussetzungen',allowed:'Erlaubte Vorgänge',blocked:'Gesperrte Vorgänge',details:'Bereitschaftsdetails'},
} as const;

const COMMISSIONING_STATE_COPY: Record<(typeof COMMISSIONING_LOCALES)[number], Record<ReadinessState, string>> = {
  en:{unavailable:'Unavailable',local_preview:'Local preview',contract_ready:'Contract ready',commissioned:'Commissioned',degraded:'Degraded'},
  th:{unavailable:'ไม่พร้อมใช้งาน',local_preview:'ตัวอย่างในเครื่อง',contract_ready:'สัญญาพร้อม',commissioned:'เปิดใช้งานแล้ว',degraded:'ทำงานลดลง'},
  ko:{unavailable:'사용 불가',local_preview:'로컬 미리보기',contract_ready:'계약 준비됨',commissioned:'가동됨',degraded:'성능 저하'},
  ja:{unavailable:'利用不可',local_preview:'ローカルプレビュー',contract_ready:'契約準備完了',commissioned:'稼働済み',degraded:'機能低下'},
  zh:{unavailable:'不可用',local_preview:'本地预览',contract_ready:'合同就绪',commissioned:'已投产',degraded:'降级'},
  es:{unavailable:'No disponible',local_preview:'Vista previa local',contract_ready:'Contrato listo',commissioned:'En servicio',degraded:'Degradado'},
  fr:{unavailable:'Indisponible',local_preview:'Aperçu local',contract_ready:'Contrat prêt',commissioned:'En service',degraded:'Dégradé'},
  de:{unavailable:'Nicht verfügbar',local_preview:'Lokale Vorschau',contract_ready:'Vertrag bereit',commissioned:'In Betrieb',degraded:'Beeinträchtigt'},
};

const STATES: readonly ReadinessState[] = ['unavailable','local_preview','contract_ready','commissioned','degraded'];

export default function CommissioningReadiness() {
  const locale = useAdminLocale();
  const copy = COMMISSIONING_READINESS_COPY[locale];
  const [filter, setFilter] = useState<ReadinessState | 'all'>('all');
  const entries = useMemo(() => COMMISSIONING_REGISTRY.filter((entry) => filter === 'all' || entry.currentState === filter), [filter]);
  return <section className="commissioning-readiness" aria-labelledby="commissioning-title">
    <header><div><span>{copy.eyebrow}</span><h3 id="commissioning-title">{copy.title}</h3><p>{copy.intro}</p></div><label>{copy.filter}<select value={filter} onChange={(event) => setFilter(event.target.value as ReadinessState | 'all')}><option value="all">{copy.all}</option>{STATES.map((state) => <option key={state} value={state}>{COMMISSIONING_STATE_COPY[locale][state]}</option>)}</select></label></header>
    <div className="commissioning-table-wrap" tabIndex={0} aria-label={copy.details}>
      <table><caption className="sr-only">{copy.title}</caption><thead><tr><th scope="col">{copy.capability}</th><th scope="col">{copy.state}</th><th scope="col">{copy.source}</th><th scope="col">{copy.prerequisites}</th><th scope="col">{copy.allowed}</th><th scope="col">{copy.blocked}</th></tr></thead>
        <tbody>{entries.map((entry) => <tr key={entry.capabilityId}><th scope="row"><code>{entry.capabilityId}</code><small>{entry.explanation}</small><small>{entry.lastVerifiedBuild}</small></th><td><span className={`readiness-state is-${entry.currentState}`}>{COMMISSIONING_STATE_COPY[locale][entry.currentState]}</span></td><td>{entry.sourceEvidence}</td><td><ul>{entry.missingPrerequisites.map((item) => <li key={item}>{item}</li>)}</ul></td><td><ul>{entry.allowedActions.map((item) => <li key={item}>{item}</li>)}</ul></td><td><ul>{entry.blockedActions.map((item) => <li key={item}>{item}</li>)}</ul></td></tr>)}</tbody>
      </table>
    </div>
  </section>;
}
