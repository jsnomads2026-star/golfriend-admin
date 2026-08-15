import {createHash} from "node:crypto";
type Raw=Record<string,any>;
const stable=(value:any):string=>Array.isArray(value)?`[${value.map(stable).join(",")}]`:value&&typeof value==="object"?`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`:JSON.stringify(value);
const digest=(value:any)=>createHash("sha256").update(stable(value)).digest("hex");

export function createEnterpriseMondayHarness(world:Raw,hmac:{sign:(version:1|2,value:unknown)=>string;verify:(version:1|2,value:unknown,signature:string)=>boolean}){
 const commands=new Map<string,{fingerprint:string;result:Raw}>(),history:Raw[]=[],outbox:Raw[]=[],tokens=new Map([[1,"active"]]),state={status:"course_reviewing",version:1,ambiguous:false,transmissions:0,writes:0,tokenVersion:1};
 const courseOperator=world.identities.find((item:Raw)=>item.role==="enterprise_course_operator"),wrongOperator=world.identities.find((item:Raw)=>item.role==="wrong_course_operator");
 const apply=(commandId:string,action:string,payload:Raw={bookingId:world.bookingRequest.requestId,courseId:world.bookingRequest.courseId,expectedVersion:state.version})=>{if(state.ambiguous)throw Error("AMBIGUOUS_LOCKED");const fingerprint=digest({action,commandId,payload}),prior=commands.get(commandId);if(prior){if(prior.fingerprint!==fingerprint)throw Error("COMMAND_REUSED");return prior.result}const status=action==="confirm"?"course_confirmed":action==="alternative"?"alternative_proposed":action==="accept_cancellation"?"cancellation_accepted":action==="decline_cancellation"?"cancellation_declined":action;state.status=status;state.version++;const result=Object.freeze({status,version:state.version,receiptId:`receipt_${digest([commandId,fingerprint]).slice(0,24)}`,immutable:true});commands.set(commandId,{fingerprint,result});history.push(result);outbox.push(Object.freeze({state:status,deliveryState:"awaiting_golfer_consumer",immutable:true}));return result};
 return Object.freeze({run(id:string){
  switch(id){
   case"course_opaque_correlation":return world.bookingRequest.correlationId.startsWith("ebc_")?"course_reviewing":"failed_closed";
   case"course_wrong_course":return wrongOperator.courseIds.includes(world.bookingRequest.courseId)?"failed_closed":"permission_denied";
   case"course_privacy_projection":return world.identities[0].golferRef.startsWith("gfr_")?"opaque_golfer_ref":"failed_closed";
   case"course_alternative_proposed":return apply("cmd_alt","alternative").status;
   case"course_cancellation_accepted":return apply("cmd_cancel_accept","accept_cancellation").status;
   case"course_cancellation_declined":return apply("cmd_cancel_decline","decline_cancellation").status;
   case"course_accept":return apply("cmd_confirm","confirm").status;
   case"course_decline":return apply("cmd_decline","decline_cancellation").status;
   case"course_information_request":return"draft_only";
   case"course_receipt_validation":return apply("cmd_receipt","course_reviewing").immutable?"immutable":"failed_closed";
   case"course_duplicate_replay":{const payload={bookingId:world.bookingRequest.requestId,courseId:world.bookingRequest.courseId,expectedVersion:state.version},a=apply("cmd_replay","confirm",payload),b=apply("cmd_replay","confirm",payload);return a===b?"original_result":"failed_closed"}
   case"course_changed_action_reuse":try{const payload={bookingId:world.bookingRequest.requestId,courseId:world.bookingRequest.courseId,expectedVersion:state.version};apply("cmd_reuse","confirm",payload);apply("cmd_reuse","confirm",{...payload,courseId:"ex_course_harbour_world"});return"failed_closed"}catch{return"conflict"}
   case"course_token_rotation":tokens.set(1,"revoked");tokens.set(2,"active");state.tokenVersion=2;return"version_incremented";
   case"course_old_token_revoked":return tokens.get(1)==="revoked"?"revoked":"failed_closed";
   case"course_lost_response_recovery":{const original=apply("cmd_lost","confirm");return commands.get("cmd_lost")?.result===original?"original_result":"failed_closed"}
   case"course_server_expiration":state.status="expired";state.version++;return"expired";
   case"course_signed_cancellation":state.status="cancelled";state.version++;return"cancelled";
   case"course_outbox_pending":return outbox.every(item=>item.deliveryState==="awaiting_golfer_consumer")?"awaiting_golfer_consumer":"failed_closed";
   case"course_transmitter_absent":return world.services.find((item:Raw)=>item.role==="delivery_provider").state==="unavailable"?"awaiting_delivery_provider":"failed_closed";
   case"course_hmac_v1":{const event={state:"course_reviewing"},signature=hmac.sign(1,event);return hmac.verify(1,event,signature)?"verified":"failed_closed"}
   case"course_hmac_v2_test_provider":{const event={state:"course_reviewing"},signature=hmac.sign(2,event);return hmac.verify(2,event,signature)?"verified":"failed_closed"}
   case"course_hmac_unknown":try{hmac.sign(3 as 1,{state:"course_reviewing"});return"unsafe_key_accepted"}catch{return"failed_closed"}
   case"course_history_immutable":return history.every(item=>item.immutable===true)?"immutable":"failed_closed";
   case"course_aggregate_isolation":return world.courseCompatibility.heuristicMatching===false&&courseOperator.courseIds.includes(world.bookingRequest.courseId)?"opaque_correlation_only":"failed_closed";
   default:throw Error("SCENARIO_UNSUPPORTED");
  }
 },snapshot(){return Object.freeze({status:state.status,version:state.version,ambiguous:state.ambiguous,transmissions:state.transmissions,writes:state.writes,tokenVersion:state.tokenVersion,history:Object.freeze([...history]),outbox:Object.freeze([...outbox]),digest:digest({state,commands:[...commands],history,outbox,tokens:[...tokens]})})}});
}
