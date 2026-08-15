// Honest availability states for the four mounted acquisition capabilities.
// Pure model: no I/O, no transport. The UI renders exactly what this reports.
//
// The seven states are deliberately distinct. Collapsing "unconfigured" into "unavailable",
// or "preview_only" into "accepted_by_adapter", would let a preview run read as production
// work — the exact claim this surface must never make.
export const ADAPTER_UI_STATES=Object.freeze(['unconfigured','unavailable','preview_only','awaiting_human_approval','rejected','accepted_by_adapter','delivery_confirmed']);
/** Refusals that are a decision about the request, not a fault of the adapter. */
export const REJECTION_CODES=Object.freeze(['VALIDATION_FAILED','AUTHORIZATION_REQUIRED','PRIVACY_SCREEN_FAILED','NOT_ELIGIBLE','IDEMPOTENCY_CONFLICT','UPSTREAM_REJECTED']);
export const EXECUTION_MODES=Object.freeze(['preview','production']);
/** Only these states may ever be reached while running in preview mode. */
export const PREVIEW_PERMITTED_STATES=Object.freeze(['unconfigured','unavailable','preview_only','awaiting_human_approval','rejected']);

/**
 * Classify one adapter outcome into exactly one honest state.
 * `delivery_confirmed` is reachable ONLY in production mode with a confirmed receipt;
 * preview can never produce it, whatever an adapter returns.
 */
export function classifyAdapterOutcome({resolution=null,result=null,mode='preview',deliveryConfirmed=false}={}){
  const executionMode=EXECUTION_MODES.includes(mode)?mode:'preview';
  if(resolution&&resolution.available===false)return resolution.reason==='adapter_unavailable'?'unconfigured':'unavailable';
  if(!result)return 'unconfigured';
  if(result.ok!==true){
    const code=result.error?.code;
    if(code==='ADAPTER_UNAVAILABLE')return 'unavailable';
    return REJECTION_CODES.includes(code)?'rejected':'unavailable';
  }
  if(result.value?.state==='queued_for_human_approval')return 'awaiting_human_approval';
  if(executionMode!=='production')return 'preview_only';
  return deliveryConfirmed===true?'delivery_confirmed':'accepted_by_adapter';
}

/**
 * Deliverability requires ALL THREE independent conditions. An approved authorization is
 * necessary and never sufficient — this function exists so that rule is stated in one place
 * and cannot drift between the report model and the UI.
 */
export function deliverabilityState({screenValid=false,authorized=false,transmitterMounted=false}={}){
  const conditions=Object.freeze({screenValid:screenValid===true,authorized:authorized===true,transmitterMounted:transmitterMounted===true});
  const unmet=Object.entries(conditions).filter(([,met])=>!met).map(([name])=>name);
  return Object.freeze({deliverable:unmet.length===0,conditions,unmet,
    notice:unmet.length===0?'All three delivery conditions are satisfied.':`Delivery is blocked: ${unmet.join(', ')}.`});
}

/** True when a state asserts real-world effect. Preview mode must never reach one. */
export function claimsProductionEffect(state){return state==='accepted_by_adapter'||state==='delivery_confirmed';}

// Eight-locale state labels. The canonical locale set stays owned by `src/i18n/locales.ts`;
// these are the per-locale entries and the gate asserts the key set matches it exactly.
export const ADAPTER_STATE_COPY=Object.freeze({
en:{unconfigured:'Not configured — no adapter is mounted',unavailable:'Unavailable — the adapter could not serve this request',preview_only:'Preview only — nothing left this system',awaiting_human_approval:'Awaiting human approval — not sent',rejected:'Rejected — the request was refused',accepted_by_adapter:'Accepted by adapter',delivery_confirmed:'Delivery confirmed by the mounted transmitter',modePreview:'Preview mode',modeProduction:'Production mode'},
th:{unconfigured:'ยังไม่ได้ตั้งค่า — ไม่มีอะแดปเตอร์ที่ติดตั้ง',unavailable:'ไม่พร้อมใช้งาน — อะแดปเตอร์ไม่สามารถให้บริการคำขอนี้ได้',preview_only:'ตัวอย่างเท่านั้น — ไม่มีสิ่งใดออกจากระบบนี้',awaiting_human_approval:'รอการอนุมัติจากมนุษย์ — ยังไม่ได้ส่ง',rejected:'ถูกปฏิเสธ — คำขอไม่ได้รับการยอมรับ',accepted_by_adapter:'อะแดปเตอร์ยอมรับแล้ว',delivery_confirmed:'ยืนยันการส่งโดยตัวส่งข้อมูลที่ติดตั้งแล้ว',modePreview:'โหมดตัวอย่าง',modeProduction:'โหมดการใช้งานจริง'},
ko:{unconfigured:'구성되지 않음 — 마운트된 어댑터가 없습니다',unavailable:'사용할 수 없음 — 어댑터가 이 요청을 처리할 수 없습니다',preview_only:'미리보기 전용 — 이 시스템 밖으로 나간 것이 없습니다',awaiting_human_approval:'사람의 승인 대기 중 — 전송되지 않았습니다',rejected:'거부됨 — 요청이 거절되었습니다',accepted_by_adapter:'어댑터가 수락했습니다',delivery_confirmed:'마운트된 전송 구성 요소가 전달을 확인했습니다',modePreview:'미리보기 모드',modeProduction:'운영 모드'},
ja:{unconfigured:'未設定 — アダプターがマウントされていません',unavailable:'利用不可 — アダプターがこの要求を処理できません',preview_only:'プレビューのみ — このシステムから何も出ていません',awaiting_human_approval:'人による承認待ち — 送信されていません',rejected:'拒否 — 要求は受け付けられませんでした',accepted_by_adapter:'アダプターが受理しました',delivery_confirmed:'マウントされた送信コンポーネントが配信を確認しました',modePreview:'プレビューモード',modeProduction:'本番モード'},
zh:{unconfigured:'未配置 — 没有挂载适配器',unavailable:'不可用 — 适配器无法处理此请求',preview_only:'仅预览 — 没有任何内容离开本系统',awaiting_human_approval:'等待人工批准 — 尚未发送',rejected:'已拒绝 — 请求未被接受',accepted_by_adapter:'适配器已接受',delivery_confirmed:'已挂载的发送组件确认送达',modePreview:'预览模式',modeProduction:'生产模式'},
es:{unconfigured:'Sin configurar: no hay ningún adaptador montado',unavailable:'No disponible: el adaptador no pudo atender esta solicitud',preview_only:'Solo vista previa: nada ha salido de este sistema',awaiting_human_approval:'Pendiente de aprobación humana: no enviado',rejected:'Rechazado: la solicitud fue denegada',accepted_by_adapter:'Aceptado por el adaptador',delivery_confirmed:'Entrega confirmada por el transmisor montado',modePreview:'Modo de vista previa',modeProduction:'Modo de producción'},
fr:{unconfigured:"Non configuré : aucun adaptateur monté",unavailable:"Indisponible : l'adaptateur n'a pas pu traiter cette demande",preview_only:"Aperçu uniquement : rien n'a quitté ce système",awaiting_human_approval:"En attente d'approbation humaine : non envoyé",rejected:"Refusé : la demande a été rejetée",accepted_by_adapter:"Accepté par l'adaptateur",delivery_confirmed:"Livraison confirmée par le transmetteur monté",modePreview:"Mode aperçu",modeProduction:"Mode production"},
de:{unconfigured:'Nicht konfiguriert — kein Adapter eingebunden',unavailable:'Nicht verfügbar — der Adapter konnte diese Anfrage nicht bedienen',preview_only:'Nur Vorschau — nichts hat dieses System verlassen',awaiting_human_approval:'Wartet auf menschliche Freigabe — nicht gesendet',rejected:'Abgelehnt — die Anfrage wurde zurückgewiesen',accepted_by_adapter:'Vom Adapter angenommen',delivery_confirmed:'Zustellung durch den eingebundenen Sender bestätigt',modePreview:'Vorschaumodus',modeProduction:'Produktionsmodus'},
});

/** Localized label for a state, falling back to the state id rather than to English prose. */
export function adapterStateLabel(state,locale){const copy=ADAPTER_STATE_COPY[locale];return copy&&copy[state]?copy[state]:state;}
