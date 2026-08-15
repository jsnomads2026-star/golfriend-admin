import * as admin from "firebase-admin";
import {randomBytes} from "node:crypto";
import {defineSecret} from "firebase-functions/params";
import {HttpsError,onCall} from "firebase-functions/v2/https";
import {bookingScope,transactionBookingAuthority} from "./partnerBookingRuntime.js";
import {ENTERPRISE_BOOKING_AUTHORIZATION_SCHEMA,ENTERPRISE_BOOKING_TOKEN_SCHEMA,validateStoredEnterpriseBookingAuthorization} from "./enterpriseBookingV2Operation.js";
import {BOOKING_TOKEN_RECOVERY_KEY_VERSION,bookingTokenRotationId,buildBookingTokenRotation,replayBookingTokenRotation,validateBookingRecoveryIntent,validateBookingTokenRecoveryRequest} from "./partnerBookingTokenRecovery.js";

if(!admin.apps.length)admin.initializeApp();
const db=admin.firestore(),TOKEN=defineSecret("BOOKING_CONFIRMATION_HMAC_V2");
const stamp=()=>admin.firestore.FieldValue.serverTimestamp();
export const BOOKING_TOKEN_RECOVERY_COMMISSIONED=true as const;

export const recoverPlayBookingConfirmationV2=onCall({enforceAppCheck:true,secrets:[TOKEN]},async request=>{
 if(!request.auth)throw new HttpsError("unauthenticated","Authentication required.");
 const secret=TOKEN.value();if(!secret)throw new HttpsError("unavailable","booking_token_recovery_authority_unavailable");
 let recovery;try{recovery=validateBookingTokenRecoveryRequest(request.data||{})}catch{throw new HttpsError("invalid-argument","Booking token recovery invalid.")}
 const caller=request.auth.uid,scope=await bookingScope(caller),authorizationRef=db.collection("enterprise_booking_operation_authorizations_v2").doc(recovery.operationId),bookingRef=db.collection("bookings").doc(recovery.bookingId),receiptRef=db.collection("enterprise_booking_token_rotation_receipts_v2").doc(bookingTokenRotationId(recovery.operationId,recovery.recoveryCommandId));
 return db.runTransaction(async tx=>{
  const[authorization,booking,prior]=await Promise.all([tx.get(authorizationRef),tx.get(bookingRef),tx.get(receiptRef)]),a=authorization.data()||{},b=booking.data()||{};
  if(!authorization.exists||a.schema!==ENTERPRISE_BOOKING_AUTHORIZATION_SCHEMA||a.actorUid!==caller||a.bookingId!==recovery.bookingId||a.operationId!==recovery.operationId||a.intentDigest!==recovery.expectedOperationDigest)throw new HttpsError("permission-denied","Booking recovery unavailable.");
  let intent;try{validateStoredEnterpriseBookingAuthorization(a);intent=validateBookingRecoveryIntent(a)}catch{throw new HttpsError("failed-precondition","Booking recovery unavailable.")}
  const authority=await transactionBookingAuthority(tx,caller,scope,intent.courseId,"mutate"),currentCourse=await tx.get(db.collection("enterprise_courses").doc(intent.courseId)),nowMs=Date.now();
  if(!booking.exists||!currentCourse.exists||b.schema!=="golfriend.enterprise-correlated-booking.v2"||authority.membershipId!==intent.membershipId||authority.organizationId!==intent.organizationId||authority.propertyId!==intent.propertyId||authority.courseId!==intent.courseId||authority.sourceVersion!==intent.authoritySourceVersion||b.organizationId!==intent.organizationId||b.propertyId!==intent.propertyId||b.courseId!==intent.courseId||b.courseVersion!==currentCourse.data()?.version||b.version!==intent.expectedVersion||a.state!=="active"||a.recoverableUntilMs<=nowMs||a.signerKeyVersion!==BOOKING_TOKEN_RECOVERY_KEY_VERSION||["pending","ambiguous","ambiguous_locked"].includes(String(b.operationLocks?.[intent.action]?.state)))throw new HttpsError("failed-precondition","Booking recovery unavailable.");
  if(prior.exists){
   const p=prior.data()||{},replayed=replayBookingTokenRotation(p,{intent,request:recovery,previousTokenDigest:String(p.previousTokenDigest||""),previousTokenVersion:Number(p.previousTokenVersion),nextTokenVersion:Number(p.tokenVersion),nonce:String(p.nonce||""),signerKeyVersion:Number(p.signerKeyVersion),secret});
   if(a.currentTokenDigest!==replayed.receipt.tokenDigest||a.tokenVersion!==replayed.receipt.tokenVersion)throw new HttpsError("failed-precondition","Booking recovery replay unavailable.");
   return{success:true,schema:replayed.receipt.schema,operationId:intent.operationId,operationDigest:intent.intentDigest,bookingId:intent.bookingId,tokenVersion:replayed.receipt.tokenVersion,confirmationToken:replayed.token,rotationId:replayed.receipt.rotationId,restarted:true};
  }
  const oldTokenRef=db.collection("enterprise_booking_confirmation_tokens_v2").doc(String(a.currentTokenDigest||"")),oldToken=await tx.get(oldTokenRef),old=oldToken.data()||{};
  if(!oldToken.exists||old.schema!==ENTERPRISE_BOOKING_TOKEN_SCHEMA||old.operationId!==intent.operationId||old.operationDigest!==intent.intentDigest||old.tokenDigest!==a.currentTokenDigest||old.tokenVersion!==a.tokenVersion||old.signerKeyVersion!==a.signerKeyVersion||old.state!=="active")throw new HttpsError("failed-precondition","Booking recovery unavailable.");
  const nextVersion=Number(a.tokenVersion)+1,nonce=randomBytes(32).toString("hex"),candidate=buildBookingTokenRotation({intent,request:recovery,previousTokenDigest:String(a.currentTokenDigest),previousTokenVersion:Number(a.tokenVersion),nextTokenVersion:nextVersion,nonce,signerKeyVersion:BOOKING_TOKEN_RECOVERY_KEY_VERSION,secret}),newTokenRef=db.collection("enterprise_booking_confirmation_tokens_v2").doc(candidate.receipt.tokenDigest),createdAt=stamp();
  tx.update(oldTokenRef,{state:"revoked",revokedAt:createdAt,revokedByRotationId:candidate.receipt.rotationId});
  tx.create(newTokenRef,{schema:ENTERPRISE_BOOKING_TOKEN_SCHEMA,operationId:intent.operationId,operationDigest:intent.intentDigest,tokenVersion:nextVersion,tokenDigest:candidate.receipt.tokenDigest,signerKeyVersion:BOOKING_TOKEN_RECOVERY_KEY_VERSION,state:"active",issuedAtMs:nowMs,expiresAtMs:nowMs+120000,createdAt});
  tx.update(authorizationRef,{tokenVersion:nextVersion,currentTokenDigest:candidate.receipt.tokenDigest,currentNonce:nonce,signerKeyVersion:BOOKING_TOKEN_RECOVERY_KEY_VERSION,tokenExpiresAtMs:nowMs+120000,version:Number(a.version||0)+1,updatedAt:createdAt});
  tx.create(receiptRef,{...candidate.receipt,createdAt});
  return{success:true,schema:candidate.receipt.schema,operationId:intent.operationId,operationDigest:intent.intentDigest,bookingId:intent.bookingId,tokenVersion:nextVersion,confirmationToken:candidate.token,rotationId:candidate.receipt.rotationId,restarted:false};
 });
});
