import assert from "node:assert/strict";
import {buildProviderPublication,publicationId,publicationReceiptId,publishWithAdapter,unconfiguredBookingPublicationAdapter} from "./bookingProviderPublicationDomain.js";
let count=0;
const test=async(name:string,fn:()=>unknown|Promise<unknown>)=>{await fn();count++;console.log(`PASS ${name}`)};
const base:any={organizationId:"org_1",courseId:"course_1",sourceVersion:"a".repeat(64),timeZone:"Asia/Bangkok",availability:[{slotId:"s1",date:"2026-08-14",time:"09:00",timeZone:"Asia/Bangkok",capacity:4,bookedCount:1,status:"open",version:2}],bookings:[{bookingId:"b1",slotId:"s1",courseId:"course_1",date:"2026-08-14",time:"09:00",timeZone:"Asia/Bangkok",status:"confirmed",version:3}],messages:[{messageId:"m1",bookingId:"b1",senderRole:"course_staff",status:"recorded"}],reconciliation:{counts:{confirmed:1},anomalies:[]}};
const keys=(value:any):string[]=>!value||typeof value!=="object"?[]:Array.isArray(value)?value.flatMap(keys):Object.entries(value).flatMap(([key,nested])=>[key.toLowerCase(),...keys(nested)]);
async function main(){
 await test("versioned payload",()=>assert.match(buildProviderPublication(base).schema,/\.v1$/));
 await test("deterministic publication",()=>assert.equal(publicationId("o","c","v"),publicationId("o","c","v")));
 await test("deterministic receipt",()=>assert.equal(publicationReceiptId("p","c","prepare"),publicationReceiptId("p","c","prepare")));
 await test("availability allowlist",()=>assert.deepEqual(Object.keys(buildProviderPublication(base).availability[0]),["slotId","date","time","timeZone","capacity","bookedCount","status","version"]));
 await test("booking allowlist",()=>assert(!("memberUid" in buildProviderPublication({...base,bookings:[{...base.bookings[0],memberUid:"secret"}]}).bookings[0])));
 await test("message excludes text",()=>assert(!("text" in buildProviderPublication({...base,messages:[{...base.messages[0],text:"private"}]}).messages[0])));
 for(const field of["payment","fee","wallet","ledger","settlement","trip"])await test(`${field} excluded`,()=>assert(!keys(buildProviderPublication({...base,reconciliation:{...base.reconciliation,[field]:1}})).includes(field)));
 await test("unconfigured fails closed",()=>assert.rejects(()=>publishWithAdapter(unconfiguredBookingPublicationAdapter(),buildProviderPublication(base),"k"),/PROVIDER_UNCONFIGURED/));
 let calls=0;const adapter={configured:true,async publish(_:any,key:string){calls++;return{providerReceiptId:key}}};
 await test("injected adapter executes",async()=>assert.equal((await publishWithAdapter(adapter,buildProviderPublication(base),"same")).providerReceiptId,"same"));
 await test("single provider call",()=>assert.equal(calls,1));
 await test("invalid source version rejected",()=>assert.throws(()=>buildProviderPublication({...base,sourceVersion:"client"})));
 console.log(`${count}/${count} provider publication tests PASS`);
}
void main();
