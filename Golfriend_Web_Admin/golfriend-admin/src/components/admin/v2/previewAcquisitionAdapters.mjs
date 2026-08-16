// Deterministic PREVIEW adapters. Local-only test doubles for the acceptance harness and the
// mounted Admin surface. These are not production adapters and must never become them:
// nothing here opens a connection, sends a message, writes data or contacts a course.
//
// Every scenario is deterministic — the same scenario always produces the same outcome — so
// the harness asserts behaviour rather than sampling it.
import{DEFAULT_ACQUISITION_ADAPTERS}from'./acquisitionAdapters.mjs';

export const PREVIEW_SCENARIOS=Object.freeze(['accept','approval_queue','reject','exception','malformed','missing_transmitter','stale_authorization','duplicate_command']);
/** An authorization deliberately outside its effective window, for the stale scenario. */
export const STALE_AUTHORIZATION=Object.freeze({approved:true,contractRef:'GOLFRIEND-JHCC-ACQUISITION-EXPIRED',effectiveFrom:'2025-01-01',effectiveUntil:'2025-12-31',scope:'aggregate_oversight_only'});

// Fixture rows carry NO personal data: the preview adapters exist to prove wiring, not to
// smuggle a realistic contact sheet into the repository.
const PREVIEW_ROWS=Object.freeze([
  Object.freeze({id:'preview-acq-01',courseName:'Riverbend Golf Club',courseId:'preview-course-riverbend',country:'Thailand',region:'Chonburi',stage:'meeting_held',contactRole:'Course operations manager',contactLocale:'th',lastContactedAt:'2026-08-04',demand:Object.freeze({attribution:'unverified',source:'Local preview fixture',searchInterest:41,bookingInterest:7})}),
  Object.freeze({id:'preview-acq-02',courseName:'Highland Pines Country Club',courseId:'preview-course-highland',country:'Japan',region:'Nagano',stage:'signed',contactRole:'General manager',contactLocale:'ja',lastContactedAt:'2026-08-09',demand:Object.freeze({attribution:'authoritative',source:'Preview attributed source',searchInterest:30,bookingInterest:11,confirmedBookings:9})}),
]);

/** An adapter DECLINE (a decision), distinct from a fault (an adapter failure). */
const decline=(reason)=>({rejected:true,reason});

/**
 * Build a deterministic preview adapter set for one scenario.
 * `missing_transmitter` returns a set whose JHCC transmitter is null, so the mounted surface
 * can demonstrate that an approved authorization alone still cannot deliver.
 */
export function createPreviewAdapters(scenario='accept'){
  if(!PREVIEW_SCENARIOS.includes(scenario))throw new Error(`Unknown preview scenario: ${scenario}`);
  const label=`local preview adapter (${scenario})`;
  const dataSource={label,async load({limit}){
    if(scenario==='exception')throw new Error('Preview data source is deliberately faulting.');
    if(scenario==='malformed')return 'not-an-array';
    return PREVIEW_ROWS.slice(0,limit);
  }};
  const outreach={async queueForApproval(){
    if(scenario==='exception')throw new Error('Preview outreach adapter is deliberately faulting.');
    if(scenario==='malformed')return{queuedId:{unexpected:'object'}};
    if(scenario==='reject')return decline('Preview outreach adapter declined the draft.');
    return{queuedId:`preview-queued-${scenario}`};
  }};
  const conversion={async submit(){
    if(scenario==='exception')throw new Error('Preview conversion adapter is deliberately faulting.');
    if(scenario==='reject')return decline('Preview conversion adapter declined the handoff.');
    // Deliberately claims a partner status the Admin surface must ignore.
    if(scenario==='malformed')return{handoffId:{partnerStatus:'active_partner'}};
    return{handoffId:`preview-handoff-${scenario}`,partnerStatus:'active_partner'};
  }};
  const transmitter={async transmit(){
    if(scenario==='exception')throw new Error('Preview transmitter is deliberately faulting.');
    if(scenario==='malformed')return{receiptId:{claimed:'JHCC received'}};
    if(scenario==='reject')return decline('Preview transmitter declined the payload.');
    return{receiptId:`preview-receipt-${scenario}`};
  }};
  return Object.freeze({
    ...DEFAULT_ACQUISITION_ADAPTERS,
    'acquisition.data-source':dataSource,
    'acquisition.outreach-delivery':outreach,
    'acquisition.portal-conversion':conversion,
    'acquisition.jhcc-transmitter':scenario==='missing_transmitter'?null:transmitter,
  });
}

/** The preview adapter set is never the production set: production stays null everywhere. */
export const PRODUCTION_ACQUISITION_ADAPTERS=DEFAULT_ACQUISITION_ADAPTERS;
