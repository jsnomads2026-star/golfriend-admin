// Enterprise outreach draft domain — server-authoritative pure logic. No I/O, no transport.
//
// A draft is a bound object: it carries the exact prospect, jurisdiction, language, contact
// preference, consent state, purpose, evidence version and template version it was built from,
// plus an immutable content digest over all of them. Approval binds that digest, so changing
// any bound input produces a different draft that the old approval does not cover.
//
// Every gate here FAILS CLOSED. A missing consent authority is not "probably fine", and an
// unsupported jurisdiction is not "send it anyway" — an outreach message is a real-world
// contact with a real person under a real legal regime.
import{containsPersonalData,redactText,safeIdentifier,surrogateRef}from'./courseAcquisitionModel.mjs';
import{DRAFT_COPY,DRAFT_TYPES,SHARED_COPY_KEYS}from'./outreachDraftCopy.mjs';

export const DRAFT_SCHEMA='golfriend.admin.outreach-draft.v1';
export const DRAFT_VERSION=1;
export const TEMPLATE_VERSION='outreach-templates.2026-08-15.v1';
export{DRAFT_TYPES,SHARED_COPY_KEYS};

/** Jurisdictions with an approved outreach policy. Anything else fails closed. */
export const SUPPORTED_JURISDICTIONS=Object.freeze(['TH','JP','KR','CN','ES','FR','DE','GB','US']);
/** Contact channels a draft may be prepared for. A draft is never prepared without one. */
export const CONTACT_PREFERENCES=Object.freeze(['email','postal','in_person','portal_message']);
export const CONSENT_STATES=Object.freeze(['granted','withdrawn','never_given','unknown']);
/** Draft types that assert activity and therefore require authoritative evidence. */
export const EVIDENCE_BEARING_TYPES=Object.freeze(['played_evidence_opportunity']);
/** Claims a draft may never make without approved authoritative evidence or contract authority. */
export const PROHIBITED_CLAIMS=Object.freeze(['proof_of_play','commission','invoice','debt','payment_obligation','partnership']);

/** Refusal reasons. Each is a distinct, checkable condition — never a generic failure. */
export const DRAFT_REFUSALS=Object.freeze(['unknown_draft_type','unsupported_locale','missing_consent_authority','consent_withdrawn','do_not_contact','unsupported_jurisdiction','missing_contact_preference','stale_evidence','active_partner_status','prospect_deleted','conflicting_identity','evidence_required_but_unavailable','missing_purpose','unsafe_injected_content','prohibited_claim_in_content','no_prior_relationship','jurisdiction_compliance_block_unavailable','missing_evidence_summary','missing_recipient_address']);

/** Statuses from which outreach may be prepared. An ALLOWLIST: an unknown status is not a pass. */
export const CONTACTABLE_STATUSES=Object.freeze(['contact_ready','approval_required','contact_queued','contacted','responded','interested','trial_offered']);
/** Draft types that assert an existing relationship and therefore require one on record. */
export const RELATIONSHIP_BEARING_TYPES=Object.freeze(['partnership_follow_up','renewal_continuation']);

/**
 * Jurisdiction-specific mandatory content. Outreach law is not satisfied by a supported-country
 * allowlist: CAN-SPAM needs a postal address, a solicitation identifier and an operable opt-out;
 * GDPR Art. 14 needs a source-of-data notice, legal basis and an Art. 21 objection line; KR needs
 * a `(광고)` subject prefix. None of that content has been drafted or legally approved, so this
 * registry is EMPTY and every jurisdiction requiring a block refuses. That converts a silent
 * legal exposure into an explicit blocker — inventing the wording here would be worse than
 * refusing, because it would look compliant without having been reviewed.
 */
export const JURISDICTION_COMPLIANCE_BLOCKS=Object.freeze({});
export const JURISDICTIONS_REQUIRING_BLOCK=Object.freeze(['US','GB','ES','FR','DE','KR','JP','CN','TH']);

/** Claim language that may never appear in rendered content, whatever the template says. */
const PROHIBITED_CLAIM_PATTERNS=Object.freeze([
  {claim:'invoice',pattern:/\b(invoice|facture|rechnung|factura|请求书|인보이스|ใบแจ้งหนี้|請求書)\b/i},
  {claim:'debt',pattern:/\b(owe[sd]?|debt|outstanding balance|arrears|deuda|schulden|欠款|채무|หนี้)\b/i},
  {claim:'commission',pattern:/\b(commission|comisión|provision|佣金|수수료|ค่าคอมมิชชั่น)\b/i},
  {claim:'payment_obligation',pattern:/\b(payment due|amount due|must pay|payable|zahlungspflicht|应付|지급 의무)\b/i},
  {claim:'proof_of_play',pattern:/\b(proof of play|played at your course|rounds played at)\b/i},
  {claim:'money',pattern:/(?:[$€£¥฿]|\b(?:USD|EUR|GBP|THB|JPY|KRW|CNY)\b)\s?\d/i},
]);
/** Screen a value that will be interpolated or appended into rendered content. */
export function screenInjectedContent(value){
  const text=typeof value==='string'?value:'';
  if(!text)return{safe:true,reason:null};
  if(containsPersonalData(text))return{safe:false,reason:'unsafe_injected_content'};
  const hit=PROHIBITED_CLAIM_PATTERNS.find((rule)=>rule.pattern.test(text));
  return hit?{safe:false,reason:'prohibited_claim_in_content',claim:hit.claim}:{safe:true,reason:null};
}
/** Derive the claims map from RENDERED text rather than asserting it. */
export function deriveClaims(renderedText){
  const found=new Set(PROHIBITED_CLAIM_PATTERNS.filter((rule)=>rule.pattern.test(renderedText)).map((rule)=>rule.claim));
  return Object.freeze(Object.fromEntries(PROHIBITED_CLAIMS.map((claim)=>[claim,found.has(claim)])));
}

// --- content digest -------------------------------------------------------
// A 128-bit FNV-1a variant over the canonical serialization. This is an INTEGRITY binding, not
// a cryptographic commitment: it detects change, and makes accidental collision negligible, but
// a determined attacker who can choose content could search for a collision. The server layer
// must supply a cryptographic digest when these drafts are persisted — recorded as a deferred
// boundary rather than pretended away here.
const FNV_SEEDS=Object.freeze([0x811c9dc5,0x01000193,0x9e3779b1,0x85ebca6b]);
function fnvLane(text,seed){let hash=seed>>>0;for(let i=0;i<text.length;i+=1){hash^=text.charCodeAt(i);hash=Math.imul(hash,0x01000193)>>>0;}return hash.toString(16).padStart(8,'0');}
/** Canonical serialization: sorted keys, so key order can never change the digest. */
function canonical(value){
  if(value===null||typeof value!=='object')return JSON.stringify(value)??'null';
  if(Array.isArray(value))return`[${value.map(canonical).join(',')}]`;
  return`{${Object.keys(value).sort().map((key)=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}
export function contentDigest(bound){const text=canonical(bound);return`sha-lite:${FNV_SEEDS.map((seed)=>fnvLane(text,seed)).join('')}`;}
export const DIGEST_ALGORITHM='fnv1a-128-lite';


export const BOUND_FIELDS=Object.freeze(['draftType','locale','templateVersion','prospectId','country','jurisdiction','contactPreference','recipientIncluded','recipientRef','authorRef','consentState','consentAuthority','doNotContact','purpose','evidenceVersion','evidenceAuthoritative','complianceBlockVersion','complianceBlockApproved','subject','body']);
/** Re-project the bound subset from a draft, so a caller never hand-maintains the shape. */
export function boundFromDraft(draft){return Object.freeze(Object.fromEntries(BOUND_FIELDS.map((k)=>[k,draft?.[k]])));}

const nonEmpty=(v)=>typeof v==='string'&&v.trim().length>0;
const refuse=(reason,detail)=>Object.freeze({ok:false,reason,detail,draft:null});

/**
 * Build a draft. Returns either a refusal naming the exact failed condition, or a frozen draft
 * bound to every input that could change its meaning.
 */
export function buildOutreachDraft({draftType,locale,prospect,contact,consent,evidence,purpose,createdBy,createdAt,now,complianceBlocks=JURISDICTION_COMPLIANCE_BLOCKS}){
  if(!DRAFT_TYPES.includes(draftType))return refuse('unknown_draft_type',draftType);
  // `Object.hasOwn`, not a truthy lookup: `locale:'constructor'` would otherwise resolve on the
  // prototype chain, pass the guard and then throw.
  if(typeof locale!=='string'||!Object.hasOwn(DRAFT_COPY,locale))return refuse('unsupported_locale',locale);
  const copy=DRAFT_COPY[locale];
  // Deny flags accept ANY truthy value. `=== true` is right for an allow flag and backwards for
  // a deny flag: a JSON boundary yielding "true" or 1 would otherwise contact a DNC record.
  if(!prospect||prospect.deleted)return refuse('prospect_deleted',prospect?.prospectId??null);
  const status=typeof prospect.status==='string'?prospect.status.trim().toLowerCase():'';
  if(status==='active_partner')return refuse('active_partner_status','An active partner is served by the partner relationship, not by acquisition outreach.');
  // DNC is checked on every carrier, and the status check is an ALLOWLIST so an unknown status
  // is a refusal rather than a pass.
  if(status==='do_not_contact'||prospect.doNotContact||contact?.doNotContact||consent?.doNotContact)return refuse('do_not_contact',prospect.prospectId);
  if(!CONTACTABLE_STATUSES.includes(status))return refuse('do_not_contact',`status "${prospect.status}" is not a contactable status`);
  if(!nonEmpty(purpose))return refuse('missing_purpose','A recorded purpose is required before a person is contacted.');
  // Identity must agree across the prospect and the selected contact.
  if(contact&&nonEmpty(contact.prospectId)&&contact.prospectId!==prospect.prospectId)return refuse('conflicting_identity',`${prospect.prospectId} vs ${contact.prospectId}`);
  if(!contact||!CONTACT_PREFERENCES.includes(contact.preference))return refuse('missing_contact_preference',contact?.preference??null);
  if(!SUPPORTED_JURISDICTIONS.includes(prospect.jurisdiction))return refuse('unsupported_jurisdiction',prospect.jurisdiction??null);
  // Consent: an unknown state is not consent, and no authority is not consent either.
  if(!consent||!nonEmpty(consent.authority))return refuse('missing_consent_authority',consent?.authority??null);
  if(!CONSENT_STATES.includes(consent.state)||consent.state==='unknown'||consent.state==='never_given')return refuse('missing_consent_authority',consent?.state??null);
  if(consent.state==='withdrawn')return refuse('consent_withdrawn',prospect.prospectId);
  // Evidence-bearing drafts require current authoritative evidence.
  // A type that asserts an existing relationship requires one on record. Otherwise
  // `renewal_continuation` tells a cold prospect their arrangement is expiring.
  if(RELATIONSHIP_BEARING_TYPES.includes(draftType)&&prospect.priorRelationship!==true)return refuse('no_prior_relationship',draftType);
  // Jurisdiction-mandatory content must exist before a person in that jurisdiction is contacted.
  const blocks=complianceBlocks&&typeof complianceBlocks==='object'?complianceBlocks:{};
  if(JURISDICTIONS_REQUIRING_BLOCK.includes(prospect.jurisdiction)&&!Object.hasOwn(blocks,prospect.jurisdiction))return refuse('jurisdiction_compliance_block_unavailable',prospect.jurisdiction);
  const complianceBlock=Object.hasOwn(blocks,prospect.jurisdiction)?blocks[prospect.jurisdiction]:null;
  const requiresEvidence=EVIDENCE_BEARING_TYPES.includes(draftType);
  if(requiresEvidence){
    if(!evidence||evidence.authoritative!==true)return refuse('evidence_required_but_unavailable',draftType);
    if(evidence.stale)return refuse('stale_evidence',evidence.evidenceVersion??null);
    // A summary is mandatory for a type whose copy promises one, or the body summarises nothing.
    if(!nonEmpty(evidence.summary))return refuse('missing_evidence_summary',evidence.evidenceVersion??null);
    if(!nonEmpty(evidence.period))return refuse('missing_evidence_summary','a period is required for an evidence draft');
  }else if(evidence&&evidence.stale)return refuse('stale_evidence',evidence.evidenceVersion??null);
  // Every value that will reach rendered content is screened before it is interpolated.
  for(const candidate of [evidence?.summary,evidence?.period,purpose,contact?.recipientRole,consent?.authority]){
    const screen=screenInjectedContent(candidate);
    if(!screen.safe)return refuse(screen.reason,screen.claim??null);
  }
  // A recipient must be addressable, and the address must be BOUND so swapping it after approval
  // changes the digest.
  if(contact.recipientSelected===true&&!nonEmpty(contact.address))return refuse('missing_recipient_address',contact.preference);

  const recipient=contact.recipientSelected===true&&nonEmpty(contact.recipientRole)
    ?redactText(contact.recipientRole,copy.recipientFallback)
    :copy.recipientFallback;
  const tokens={recipient,courseName:redactText(prospect.courseName??'',copy.recipientFallback),country:redactText(prospect.country??'',copy.recipientFallback),period:evidence?.period??''};
  const template=copy[draftType];
  const fill=(text)=>text.replace(/\{(\w+)\}/g,(_,key)=>Object.hasOwn(tokens,key)?tokens[key]:`{${key}}`);
  const lines=[fill(template.body)];
  if(requiresEvidence)lines.push('',String(evidence.summary));
  // The `evidenceUnavailable` line used to be appended to every non-evidence type, which made
  // a follow-up offer to "share what we are seeing" and then immediately state there is nothing,
  // and made a first-contact introduction volunteer that we had checked our data on them.
  // It belongs only where the copy actually promises figures.
  lines.push('',copy.disclaimer);
  // The jurisdiction-mandatory block is its own trailing region so it cannot be buried in the
  // pitch: 'clear and conspicuous' is a legal requirement, not a formatting preference.
  if(complianceBlock)lines.push('',String(complianceBlock.text??''));

  const bound=Object.freeze({
    draftType,locale,templateVersion:TEMPLATE_VERSION,
    prospectId:safeIdentifier(prospect.prospectId,'prospect'),
    country:prospect.country??null,jurisdiction:prospect.jurisdiction,
    contactPreference:contact.preference,recipientIncluded:contact.recipientSelected===true,
    // The DESTINATION is bound (as a surrogate, never in clear): swapping the address after
    // approval must change the digest, or approval covers a recipient it never saw.
    recipientRef:nonEmpty(contact.address)?surrogateRef(contact.address,'rcpt'):null,
    authorRef:safeIdentifier(createdBy,'actor'),
    consentState:consent.state,consentAuthority:consent.authority,
    doNotContact:false,purpose,
    evidenceVersion:evidence?.evidenceVersion??null,evidenceAuthoritative:evidence?.authoritative===true,
    complianceBlockVersion:complianceBlock?.version??null,complianceBlockApproved:complianceBlock?.legallyApproved===true,
    subject:fill(template.subject),body:lines.join('\n'),
  });
  return Object.freeze({ok:true,reason:'draft_prepared',detail:null,draft:Object.freeze({
    schema:DRAFT_SCHEMA,version:DRAFT_VERSION,
    ...bound,
    digestAlgorithm:DIGEST_ALGORITHM,contentDigest:contentDigest(bound),
    createdBy:safeIdentifier(createdBy,'actor'),createdAt,preparedAt:now??createdAt,
    // Derived from the RENDERED text, not asserted. A hardcoded all-false map reads to a
    // reviewer as "we checked" when nothing was checked.
    claims:deriveClaims(`${bound.subject}\n${bound.body}`),
    deliveryAvailable:false,
    notice:'Draft only. No message has been sent and no delivery channel is connected.',
  })});
}

/** An accessible preview: ordered, labelled regions rather than one opaque blob of text. */
export function draftPreviewStructure(draft){
  return Object.freeze({
    lang:draft.locale,
    regions:Object.freeze([
      Object.freeze({id:'subject',role:'heading',label:'Subject',text:draft.subject}),
      Object.freeze({id:'body',role:'article',label:'Message body',text:draft.body}),
      Object.freeze({id:'binding',role:'note',label:'Binding',text:`${draft.draftType} · ${draft.locale} · ${draft.contactPreference} · ${draft.templateVersion}`}),
      Object.freeze({id:'status',role:'status',label:'Delivery',text:draft.notice}),
    ]),
  });
}

/** Locale fallback is EXACT: an unsupported locale is refused, never silently served in English. */
export function resolveDraftLocale(requested){return Object.hasOwn(DRAFT_COPY,requested)?{ok:true,locale:requested}:{ok:false,locale:null,reason:'unsupported_locale'};}

/** True when a draft carries no personal data outside an explicitly selected recipient. */
export function draftIsPrivacySafe(draft){
  // Screens the RENDERED content. The earlier version had a dead ternary and returned true
  // unconditionally once a recipient was selected, so it never screened anything.
  // An explicitly selected recipient is a lawful chosen contact, so its role line is exempt.
  const rendered=draft.subject+String.fromCharCode(10)+draft.body;
  if(!draft.recipientIncluded)return !containsPersonalData(rendered);
  const role=typeof draft.recipientRole==="string"?draft.recipientRole:null;
  const scanned=role?rendered.split(String.fromCharCode(10)).filter(function(line){return !line.includes(role);}).join(String.fromCharCode(10)):rendered;
  return !containsPersonalData(scanned);
}
