import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {join} from "node:path";

const source=readFileSync(join(__dirname,"..","src","enterpriseBookingCoordinationRuntime.ts"),"utf8");
let count=0;const check=(name:string,fn:()=>void)=>{fn();console.log(`ok ${++count} - ${name}`);};
check("projection requires Auth App Check and the managed outbox signer",()=>{assert.match(source,/enforceAppCheck: true,secrets:\[OUTBOX\]/);assert.match(source,/if \(!request\.auth\)/);assert.match(source,/if\(!outboxSecret\)/);});
check("history verifies HMAC and exact aggregate bindings",()=>{assert.match(source,/verifyEnterpriseCorrelationEvent/);assert.match(source,/value\.correlationId!==booking\.correlationId/);assert.match(source,/enterpriseBooking\?\.bookingId!==booking\.bookingId/);assert.match(source,/course\?\.courseId!==booking\.courseId/);});
check("only immutable known receipts attached to signed events are projected",()=>{assert.match(source,/raw\.immutable!==true/);assert.match(source,/eventIds\.has/);assert.match(source,/enterprise-booking-operation-receipt\.v2/);assert.match(source,/enterprise-booking-system-transition-receipt\.v2/);});
console.log(`enterprise booking coordination runtime: ${count} checks passed.`);
