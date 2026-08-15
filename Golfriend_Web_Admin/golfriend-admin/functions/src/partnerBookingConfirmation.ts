import {createHash,randomBytes,timingSafeEqual} from "node:crypto";

export const BOOKING_CONFIRMATION_SCHEMA="golfriend.partner-booking-confirmation.v1" as const;
export type BookingConfirmationAction="cancel"|"alternative";
export type BookingConfirmationBinding=Readonly<{actorUid:string;membershipId:string;organizationId:string;propertyId:string;courseId:string;bookingId:string;action:BookingConfirmationAction;revision:number;payloadDigest:string;authorityVersion:string}>;
export type BookingConfirmationRecord=BookingConfirmationBinding&Readonly<{schema:typeof BOOKING_CONFIRMATION_SCHEMA;tokenDigest:string;issuedAtMs:number;expiresAtMs:number;used:false}>;
const ID=/^[A-Za-z0-9_-]{1,200}$/,SHA=/^[a-f0-9]{64}$/;
const digest=(value:string)=>createHash("sha256").update(value).digest("hex");
const valid=(input:BookingConfirmationBinding)=>ID.test(input.actorUid)&&ID.test(input.membershipId)&&ID.test(input.organizationId)&&ID.test(input.propertyId)&&ID.test(input.courseId)&&ID.test(input.bookingId)&&["cancel","alternative"].includes(input.action)&&Number.isInteger(input.revision)&&input.revision>=1&&SHA.test(input.payloadDigest)&&ID.test(input.authorityVersion);
const same=(left:BookingConfirmationBinding,right:BookingConfirmationBinding)=>Object.keys(right).every(key=>(left as unknown as Record<string,unknown>)[key]===(right as unknown as Record<string,unknown>)[key]);

export function issueBookingConfirmation(input:BookingConfirmationBinding,nowMs:number,ttlMs=120_000,entropy:()=>Buffer=()=>randomBytes(32)){
 if(!valid(input)||!Number.isSafeInteger(nowMs)||nowMs<1||!Number.isSafeInteger(ttlMs)||ttlMs<1||ttlMs>300_000)throw new Error("CONFIRMATION_INPUT_INVALID");
 const secret=entropy();if(secret.length<32)throw new Error("CONFIRMATION_ENTROPY_INVALID");
 const token=`pbc_${secret.toString("base64url")}`,record:BookingConfirmationRecord=Object.freeze({...input,schema:BOOKING_CONFIRMATION_SCHEMA,tokenDigest:digest(token),issuedAtMs:nowMs,expiresAtMs:nowMs+ttlMs,used:false});
 return Object.freeze({token,record});
}
export function verifyBookingConfirmation(token:unknown,record:unknown,expected:BookingConfirmationBinding,nowMs:number){
 const value=record as BookingConfirmationRecord;if(typeof token!=="string"||!/^pbc_[A-Za-z0-9_-]{43,}$/.test(token)||!value||value.schema!==BOOKING_CONFIRMATION_SCHEMA||!valid(expected)||!valid(value)||value.used!==false||!Number.isSafeInteger(nowMs)||nowMs<value.issuedAtMs||nowMs>=value.expiresAtMs||!same(value,expected))throw new Error("CONFIRMATION_INVALID");
 const actual=Buffer.from(digest(token)),stored=Buffer.from(value.tokenDigest||"");if(actual.length!==stored.length||!timingSafeEqual(actual,stored))throw new Error("CONFIRMATION_INVALID");
 return Object.freeze({...value,used:true as const});
}
