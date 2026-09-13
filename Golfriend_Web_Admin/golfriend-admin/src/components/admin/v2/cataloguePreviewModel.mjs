const number=(value)=>typeof value==='number'&&Number.isFinite(value)?value:0;
const rows=(value)=>Array.isArray(value)?value:[];
export const METRICS=['courseRowsMeasured','provenClubHouses','safelyLinkableCourses','unchangedTrustedLinks','ambiguousGroups','invalidGeography','invalidProviderClubIdRows','providerContactFactsAvailable','bookingAuthorityUnavailable','enrichmentRequired','proposedWrites'];
export function emptyCataloguePreview(){return {pages:[],seenCursors:new Set(),providerClubIds:new Set(),ambiguous:new Map(),siam:[],seoul:[],totals:Object.fromEntries(METRICS.map(key=>[key,0]))};}
export function addCataloguePreviewPage(state,page,cursor){
  if(!page||typeof page!=='object'||page.mode!=='catalogue'||page.metrics?.productionWrites!==0)throw Error('CATALOGUE_PREVIEW_WRITE_BOUNDARY');
  const cursorKey=cursor||'__first__';if(state.seenCursors.has(cursorKey))return state;
  const next={...state,pages:[...state.pages,{cursor:cursorKey,planHash:String(page.planHash||''),sourceStateHash:String(page.sourceStateHash||'')}],seenCursors:new Set(state.seenCursors),providerClubIds:new Set(state.providerClubIds),ambiguous:new Map(state.ambiguous),siam:[...state.siam],seoul:[...state.seoul],totals:{...state.totals}};
  next.seenCursors.add(cursorKey);for(const id of rows(page.batch?.providerClubIds))if(typeof id==='string'&&id)next.providerClubIds.add(id);
  for(const key of METRICS)next.totals[key]+=number(page.metrics?.[key]);
  for(const item of rows(page.ambiguousGroups)){const id=`${item?.providerClubId||''}|${item?.providerPropertyId||''}|${item?.reason||''}|${rows(item?.providerCourseIds).join(',')}`;if(id!=='|||')next.ambiguous.set(id,item);}
  next.siam.push(...rows(page.siamEvidence));next.seoul.push(...rows(page.seoulEvidence));return next;
}
