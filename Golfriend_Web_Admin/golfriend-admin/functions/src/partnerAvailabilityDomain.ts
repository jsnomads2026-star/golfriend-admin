import{createHash}from"node:crypto";
import{assertExactCallableEnvelope}from"./callableEnvelope.js";
export const AVAILABILITY_SCHEMA="golfriend.course-availability.v2",SLOT_STATES=["pending_admin","open","closed","cancelled"]as const;
const hash=(v:string)=>createHash("sha256").update(v).digest("hex");
export const slotId=(courseId:string,date:string,time:string)=>`slot_${hash(`${courseId}|${date}|${time}`).slice(0,32)}`;
export const availabilityReceiptId=(slot:string,command:string)=>`sar_${hash(`${slot}|${command}`).slice(0,32)}`;
export function validateSlot(x:any){assertExactCallableEnvelope(x,["action","courseId","date","time","timeZone","capacity","expectedVersion","commandId"]);const courseId=String(x.courseId||""),date=String(x.date||""),time=String(x.time||""),timeZone=String(x.timeZone||""),capacity=Number(x.capacity);if(x.action!=="create"||!/^[A-Za-z0-9_-]{2,120}$/.test(courseId)||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)||!/^([A-Za-z_]+\/[A-Za-z_+-]+|UTC)$/.test(timeZone)||!Number.isInteger(capacity)||capacity<1||capacity>8)throw new Error("SLOT_INVALID");return{courseId,date,time,timeZone,capacity}}
export const canWrite=(role:string)=>["primary_owner","manager","course_staff"].includes(role);
export const canAdminTransition=(from:string,to:string)=>from==="pending_admin"&&["open","cancelled"].includes(to)||from==="open"&&["closed","cancelled"].includes(to)||from==="closed"&&["open","cancelled"].includes(to);
export function nextSlotVersion(current:number,expected:number){if(current!==expected)throw new Error("VERSION_CONFLICT");return current+1}
