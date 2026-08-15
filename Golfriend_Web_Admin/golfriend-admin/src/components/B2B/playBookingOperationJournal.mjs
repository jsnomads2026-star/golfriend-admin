const SCHEMA='golfriend.portal.play-booking-operation-journal.v1';
const ID=/^[A-Za-z0-9][A-Za-z0-9:._-]{0,199}$/;
const ACTIONS=new Set(['confirm','alternative','cancel','message']);
const PRIVATE=/(member|email|phone|contact|name|message|note|text)/i;
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value)}return value};
const bytes=value=>new TextEncoder().encode(value);
const hex=value=>Array.from(new Uint8Array(value),x=>x.toString(16).padStart(2,'0')).join('');
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;

async function sha256(value,digest){return hex(await digest(bytes(value)))}
function safePayload(value,seen=new Set){
 if(value===null||['string','boolean'].includes(typeof value))return true;
 if(typeof value==='number')return Number.isFinite(value);
 if(!value||typeof value!=='object'||seen.has(value))return false;
 seen.add(value);
 if(Array.isArray(value))return value.length<=32&&value.every(item=>safePayload(item,seen));
 const keys=Object.keys(value);return keys.length<=32&&keys.every(key=>!PRIVATE.test(key)&&safePayload(value[key],seen));
}
function parse(raw){try{const value=JSON.parse(raw||'null');return value?.schema===SCHEMA&&Array.isArray(value.operations)?value:null}catch{return null}}

export function createPlayBookingOperationJournal({storage,randomUUID=()=>globalThis.crypto?.randomUUID?.(),digest=value=>globalThis.crypto.subtle.digest('SHA-256',value),now=()=>Date.now()}={}){
 if(!storage||typeof storage.getItem!=='function'||typeof storage.setItem!=='function'||typeof storage.removeItem!=='function')throw new TypeError('Storage is required.');
 let active=null;
 const marker='golfriend.play-booking-operation-journal.scope.v1';
 const key=scope=>`golfriend.play-booking-operation-journal.${scope}.v1`;
 async function activateScope(scopeOpaque){
  if(!ID.test(scopeOpaque||''))throw new TypeError('Opaque authority scope is required.');
  const scope=await sha256(scopeOpaque,digest),prior=storage.getItem(marker);
  if(prior&&prior!==scope)storage.removeItem(key(prior));
  storage.setItem(marker,scope);active=scope;return freeze({scopeKey:scope});
 }
 function requireScope(){if(!active||storage.getItem(marker)!==active)throw new Error('AUTHORITY_SCOPE_CHANGED')}
 function read(){requireScope();return parse(storage.getItem(key(active)))||{schema:SCHEMA,operations:[]}}
 function write(operations){storage.setItem(key(active),JSON.stringify({schema:SCHEMA,operations:operations.slice(-24)}))}
 async function prepare(input){
  requireScope();const bookingId=input?.bookingId,action=input?.action,revision=input?.revision,payload=input?.payload??{};
  if(!ID.test(bookingId||'')||!ACTIONS.has(action)||!Number.isInteger(revision)||revision<1||!safePayload(payload))return freeze({state:'invalid'});
  const confirmation=input.confirmation;
  if(['cancel','alternative'].includes(action)&&(!confirmation||!ID.test(confirmation.slot||'')||!Number.isSafeInteger(confirmation.expiresAt)||confirmation.expiresAt<=now()))return freeze({state:'invalid'});
  const bookingKey=await sha256(bookingId,digest),payloadDigest=await sha256(JSON.stringify(canonical(payload)),digest),slot=`${bookingKey}:${action}`,journal=read(),existing=journal.operations.find(item=>item.slot===slot);
  if(existing){
   if(existing.revision!==revision||existing.payloadDigest!==payloadDigest)return freeze({state:'conflict'});
   if(existing.state==='in_flight'||existing.state==='ambiguous')return freeze({state:'ambiguous',commandId:existing.commandId});
   return freeze({state:'retry',commandId:existing.commandId});
  }
  const raw=randomUUID();if(typeof raw!=='string')return freeze({state:'unavailable'});const commandId=raw.replaceAll('-','_');if(!ID.test(commandId))return freeze({state:'unavailable'});
  const operation=freeze({slot,bookingKey,action,revision,payloadDigest,commandId,state:'prepared',createdAt:now(),confirmation:confirmation?freeze({slot:confirmation.slot,expiresAt:confirmation.expiresAt}):null});
  write([...journal.operations,operation]);return freeze({state:'prepared',commandId});
 }
 function transition(commandId,state){const journal=read(),index=journal.operations.findIndex(item=>item.commandId===commandId);if(index<0)return false;const next=[...journal.operations];next[index]={...next[index],state};write(next);return true}
 function recover(){const journal=read(),next=journal.operations.map(item=>item.state==='in_flight'?{...item,state:'ambiguous'}:item);write(next);return freeze(next.filter(item=>item.state==='ambiguous').map(item=>freeze({commandId:item.commandId,action:item.action,revision:item.revision})))}
 function purge(){if(active)storage.removeItem(key(active));storage.removeItem(marker);active=null}
 return freeze({activateScope,prepare,markInFlight:id=>transition(id,'in_flight'),markAmbiguous:id=>transition(id,'ambiguous'),markCompleted:id=>transition(id,'completed'),recover,purge});
}

export {SCHEMA as PLAY_BOOKING_OPERATION_JOURNAL_SCHEMA};
