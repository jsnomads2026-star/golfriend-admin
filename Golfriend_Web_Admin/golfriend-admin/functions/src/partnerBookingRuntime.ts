import * as admin from "firebase-admin";
import { randomBytes } from "node:crypto";
import { defineString } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { isActiveStaff } from "./authority.js";
import {
  assertNonFinancial,
  bookingMessageId,
  bookingReceiptId,
  BOOKING_SCHEMA,
  permissions,
  transition,
  version,
} from "./partnerBookingDomain.js";
import { validateCommand } from "./partnerActivationDomain.js";
import {
  BookingScopeError,
  derivePartnerBookingScope,
  PartnerBookingScope,
} from "./partnerBookingScope.js";
import { resolveEnterpriseBookingCourseAuthority } from "./enterpriseAuthorityRuntime.js";
import { resolveBookingCourseAuthority } from "./enterpriseAuthorityDomain.js";
import {bookingConfirmationPayloadDigest,bookingConfirmationTokenDigest,issueBookingConfirmation,verifyBookingConfirmation,type BookingConfirmationBinding}from"./partnerBookingConfirmation.js";
import{buildBookingReconciliationReceipt,replayBookingReconciliation,validateBookingReconciliationRequest}from"./partnerBookingReconciliation.js";
import {
  buildCompletedBookingOperation,
  buildPendingBookingOperation,
  buildUnsuccessfulBookingOperation,
  assertPendingBookingOperationClaim,
  bookingMessageDigest,
  bookingMessageOperationId,
  bookingOperationId,
  bookingRequestDigest,
  bookingRequestOperationId,
  cancelledBookedCount,
  operationResponse,
  replayCompletedBookingOperation,
  expirePendingBookingOperation,
  validateBookingOperationRequest,
  validateSlotCapacity,
} from "./partnerBookingReplay.js";
if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore(),
  notifier = defineString("PARTNER_NOTIFICATION_PROVIDER", { default: "" }),
  now = () => admin.firestore.FieldValue.serverTimestamp();
function uid(r: any) {
  if (!r.auth?.uid)
    throw new HttpsError("unauthenticated", "Sign in required.");
  return r.auth.uid as string;
}
function command(r: any) {
  try {
    return validateCommand(r.data?.commandId);
  } catch {
    throw new HttpsError("invalid-argument", "Command invalid.");
  }
}
export async function bookingScope(id: string): Promise<PartnerBookingScope> {
  const bindings=await db.collection("enterprise_authority_bindings").doc(id).collection("memberships").limit(101).get(),courses = await db.collection("enterprise_courses").limit(201).get();
  try {
    if(bindings.empty||bindings.size>100||bindings.docs.some(x=>!activeAuthorityBinding(x.data())))throw new BookingScopeError("BOOKING_BINDING_UNAVAILABLE");
    if(courses.size>200)throw new BookingScopeError("BOOKING_COURSE_SCOPE_TRUNCATED");
    const decisions=[];
    for(const course of courses.docs){const value=course.data(),organizationId=String(value.organizationId||""),propertyId=String(value.propertyId||""),courseId=String(value.courseId||course.id);try{decisions.push(await resolveEnterpriseBookingCourseAuthority(id,organizationId,propertyId,courseId,"read"))}catch{/* Foreign or inactive courses are deliberately undisclosed. */}}
    return derivePartnerBookingScope(decisions);
  } catch (error) {
    const code = error instanceof BookingScopeError ? error.code : "SCOPE_INVALID";
    throw new HttpsError("permission-denied", `Booking scope unavailable: ${code}.`);
  }
}
function activeAuthorityBinding(value:any){const millis=(candidate:any)=>candidate?.toMillis instanceof Function?candidate.toMillis():Date.parse(candidate),nowMs=Date.now(),version=Number(value?.version);return typeof value?.membershipId==="string"&&Number.isSafeInteger(version)&&version>=1&&!value.revokedAt&&!value.suspendedAt&&(!value.effectiveAt||millis(value.effectiveAt)<=nowMs)&&(!value.expiresAt||millis(value.expiresAt)>nowMs)&&(value.status==null||value.status==="active");}
async function exactBookingAuthority(caller:string,scope:PartnerBookingScope,courseId:string,mode:"read"|"mutate"){const course=await db.collection("enterprise_courses").doc(courseId).get();if(!course.exists)throw new HttpsError("permission-denied","Booking unavailable.");const value=course.data()||{};try{const decision=await resolveEnterpriseBookingCourseAuthority(caller,String(value.organizationId||""),String(value.propertyId||""),String(value.courseId||course.id),mode);if(decision.membershipId!==scope.membershipId||decision.organizationId!==scope.organizationId||decision.role!==scope.role||!scope.courseIds.includes(decision.courseId))throw new Error("SCOPE_CHANGED");return decision}catch{throw new HttpsError("permission-denied","Booking unavailable.")}}
const confirmationPayload=(action:string,data:any)=>({action,...(action==="alternative"?{alternativeSlotId:String(data?.alternativeSlotId||""),message:String(data?.message||"").trim().slice(0,500)}:{})});
const confirmationBinding=(caller:string,decision:any,booking:any,action:any,data:any):BookingConfirmationBinding=>Object.freeze({actorUid:caller,membershipId:decision.membershipId,organizationId:decision.organizationId,propertyId:decision.propertyId,courseId:decision.courseId,bookingId:String(booking.bookingId),action,revision:Number(booking.version),payloadDigest:bookingConfirmationPayloadDigest(confirmationPayload(action,data)),authorityVersion:decision.sourceVersion});
export async function transactionBookingAuthority(tx:admin.firestore.Transaction,caller:string,scope:PartnerBookingScope,courseId:string,mode:"read"|"mutate"){
 const membershipRef=db.collection("enterprise_authority_memberships").doc(scope.membershipId),organizationRef=db.collection("enterprise_organizations").doc(scope.organizationId),courseRef=db.collection("enterprise_courses").doc(courseId),bindingQuery=db.collection("enterprise_authority_bindings").doc(caller).collection("memberships").where("membershipId","==",scope.membershipId).limit(2);
 const[membership,organization,course,binding]=await Promise.all([tx.get(membershipRef),tx.get(organizationRef),tx.get(courseRef),tx.get(bindingQuery)]);
 if(!membership.exists||!organization.exists||!course.exists||binding.size!==1||!activeAuthorityBinding(binding.docs[0].data()))throw new HttpsError("permission-denied","Booking unavailable.");
 const m=membership.data()||{},c=course.data()||{},propertyId=String(c.propertyId||""),property=await tx.get(db.collection("enterprise_properties").doc(propertyId)),grantIds=Array.isArray(m.grantIds)?m.grantIds.map(String):[],grants=await Promise.all(grantIds.map(id=>tx.get(db.collection("enterprise_authority_grants").doc(id))));
 if(!property.exists||grants.some(x=>!x.exists))throw new HttpsError("permission-denied","Booking unavailable.");
 const isoValue=(value:any)=>value?.toDate instanceof Function?value.toDate().toISOString():value;
 try{const decision=resolveBookingCourseAuthority(caller,[{...m,membershipId:membership.id,effectiveAt:isoValue(m.effectiveAt),expiresAt:m.expiresAt==null?null:isoValue(m.expiresAt)}],grants.map(x=>{const value=x.data()||{};return{...value,grantId:x.id,effectiveAt:isoValue(value.effectiveAt),expiresAt:value.expiresAt==null?null:isoValue(value.expiresAt)}}),{organizations:[{organizationId:organization.id,...organization.data()}],properties:[{propertyId:property.id,...property.data()}],courses:[{courseId:course.id,...c}]},{organizationId:scope.organizationId,propertyId,courseId,mode},new Date().toISOString());if(decision.membershipId!==scope.membershipId||decision.role!==scope.role)throw new Error("SCOPE_CHANGED");return decision}catch{throw new HttpsError("permission-denied","Booking unavailable.")}
}
async function staff(id: string) {
  const s = await db.collection("admin_users").doc(id).get();
  if (!s.exists || !isActiveStaff(s.data()))
    throw new HttpsError("permission-denied", "Admin required.");
  return String(s.data()?.role);
}
const bounded = (value: unknown, max: number) =>
  typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max)
    : "";
const timestamp = (value: any) => {
  const candidate = value?.toDate?.() || value;
  if (!(candidate instanceof Date) || !Number.isFinite(candidate.getTime()))
    return null;
  return candidate.toISOString();
};
const safeBooking = (x: any) => {
  const bookingId = bounded(x?.bookingId, 200),
    courseId = bounded(x?.courseId, 160),
    slotId = bounded(x?.slotId, 200),
    status = bounded(x?.status, 32),
    versionValue = Number(x?.version);
  if (
    !/^[A-Za-z0-9_-]{1,200}$/.test(bookingId) ||
    !/^[A-Za-z0-9_-]{1,160}$/.test(courseId) ||
    !/^[A-Za-z0-9_-]{1,200}$/.test(slotId) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(bounded(x?.date, 10)) ||
    !/^\d{2}:\d{2}(:\d{2})?$/.test(bounded(x?.time, 8)) ||
    !/^[A-Za-z0-9_+./:-]{1,80}$/.test(bounded(x?.timeZone, 80)) ||
    !["pending", "alternative_proposed", "confirmed", "cancelled", "completed"].includes(status) ||
    !Number.isInteger(versionValue) ||
    versionValue < 1
  )
    return null;
  const alternativeValue = bounded(x?.alternative?.slotId, 160),
    alternativeSlotId = /^[A-Za-z0-9_-]{1,160}$/.test(alternativeValue)
      ? alternativeValue
      : "";
  return {
    bookingId,
    courseId,
    slotId,
    date: bounded(x?.date, 10),
    time: bounded(x?.time, 8),
    timeZone: bounded(x?.timeZone, 80),
    status,
    version: versionValue,
    memberDisplayName: bounded(x?.memberDisplayName, 120) || "Golfriend member",
    alternative: alternativeSlotId ? { slotId: alternativeSlotId } : null,
    lastMessageAt: timestamp(x?.lastMessageAt),
  };
};
export const requestPlayBookingV2 = onCall(
  { enforceAppCheck: true },
  async (r) => {
    const memberUid = uid(r),
      cmd = command(r),
      slotId = String(r.data?.slotId || "");
    if (Object.keys(r.data || {}).some((key) => !["commandId", "slotId"].includes(key)))
      throw new HttpsError("invalid-argument", "Booking request fields invalid.");
    try {
      assertNonFinancial(r.data);
    } catch {
      throw new HttpsError(
        "invalid-argument",
        "Financial fields are prohibited.",
      );
    }
    const slotRef = db.collection("tee_time_slots").doc(slotId),
      id = `booking_${slotId}_${memberUid}`,
      ref = db.collection("bookings").doc(id),
      requestDigest = bookingRequestDigest({ memberUid, slotId, commandId: cmd }),
      operationRef = db.collection("play_booking_request_operations")
        .doc(bookingRequestOperationId(memberUid, cmd));
    return db.runTransaction(async (tx) => {
      const [slot, current, user, priorOperation] = await Promise.all([
        tx.get(slotRef),
        tx.get(ref),
        tx.get(db.collection("users").doc(memberUid)),
        tx.get(operationRef),
      ]);
      if (priorOperation.exists) {
        const prior = priorOperation.data();
        if (prior?.requestDigest !== requestDigest || prior?.memberUid !== memberUid ||
            prior?.slotId !== slotId || prior?.commandId !== cmd)
          throw new HttpsError("already-exists", "BOOKING_REQUEST_COMMAND_REUSE_CONFLICT");
        if (prior?.state !== "completed" || prior?.immutable !== true ||
            prior?.bookingId !== id || prior?.status !== "pending" ||
            prior?.version !== 1 || prior?.receiptId !== bookingReceiptId(id, cmd) ||
            !["queued", "PROVIDER_UNCONFIGURED"].includes(prior?.notificationStatus))
          throw new HttpsError("failed-precondition", "BOOKING_REQUEST_AMBIGUOUS");
        return {
          success: true, bookingId: prior.bookingId, status: prior.status,
          version: prior.version, receiptId: prior.receiptId,
          notificationStatus: prior.notificationStatus,
        };
      }
      if (
        !slot.exists ||
        slot.data()?.status !== "open" ||
        slot.data()?.publishToApp !== false
      )
        throw new HttpsError(
          "failed-precondition",
          "Approved provider availability required.",
        );
      if (current.exists) {
        throw new HttpsError("already-exists", "Booking exists.");
      }
      let slotCapacity: ReturnType<typeof validateSlotCapacity>;
      try {
        slotCapacity = validateSlotCapacity(slot.data()?.bookedCount, slot.data()?.capacity);
      } catch {
        throw new HttpsError("failed-precondition", "Availability capacity invalid.");
      }
      if (!slotCapacity.available)
        throw new HttpsError("resource-exhausted", "Availability full.");
      const receiptId = bookingReceiptId(id, cmd),
        notificationStatus = notifier.value() ? "queued" : "PROVIDER_UNCONFIGURED",
        result = { bookingId: id, status: "pending", version: 1, receiptId, notificationStatus };
      tx.update(slotRef, { bookedCount: slotCapacity.bookedCount + 1, updatedAt: now() });
      tx.create(ref, {
        schema: BOOKING_SCHEMA,
        bookingId: id,
        slotId,
        courseId: slot.data()?.courseId,
        organizationId: slot.data()?.organizationId,
        date: slot.data()?.date,
        time: slot.data()?.time,
        timeZone: slot.data()?.timeZone,
        memberUid,
        memberDisplayName: user.data()?.nickname || "Golfriend member",
        status: "pending",
        version: 1,
        commandId: cmd,
        providerNeutral: true,
        financialFields: false,
        createdAt: now(),
      });
      tx.create(db.collection("play_booking_audits").doc(receiptId), {
        ...result,
        schema: "golfriend.play-booking-request-receipt.v1",
        state: "completed",
        requestDigest,
        memberUid,
        slotId,
        commandId: cmd,
        kind: "requested",
        actorRole: "member",
        immutable: true,
        createdAt: now(),
      });
      tx.create(operationRef, {
        ...result,
        schema: "golfriend.play-booking-request-operation.v1",
        state: "completed", requestDigest, memberUid, slotId, commandId: cmd,
        immutable: true, createdAt: now(),
      });
      return {
        success: true,
        ...result,
      };
    });
  },
);
export const previewPlayBookingActionV2=onCall({enforceAppCheck:true},async r=>{const caller=uid(r),scope=await bookingScope(caller),id=String(r.data?.bookingId||""),action=String(r.data?.action||""),expectedVersion=Number(r.data?.expectedVersion);if(Object.keys(r.data||{}).some(key=>!["bookingId","action","expectedVersion","alternativeSlotId","message"].includes(key))||!["confirm","alternative","cancel"].includes(action)||!Number.isSafeInteger(expectedVersion))throw new HttpsError("invalid-argument","Booking preview invalid.");if(!(permissions(scope.role)as any)[action])throw new HttpsError("permission-denied","Booking unavailable.");const booking=await db.collection("bookings").doc(id).get();if(!booking.exists||booking.data()?.organizationId!==scope.organizationId||Number(booking.data()?.version)!==expectedVersion)throw new HttpsError("permission-denied","Booking unavailable.");const decision=await exactBookingAuthority(caller,scope,String(booking.data()?.courseId),"mutate"),binding=confirmationBinding(caller,decision,booking.data(),action,r.data),issued=issueBookingConfirmation(binding,Date.now()),ref=db.collection("play_booking_confirmation_tokens").doc(issued.record.tokenDigest);await ref.create({...issued.record,createdAt:now()});return{success:true,schema:issued.record.schema,bookingId:id,action,revision:expectedVersion,payloadDigest:binding.payloadDigest,expiresAt:new Date(issued.record.expiresAtMs).toISOString(),confirmationToken:issued.token}});
export const managePlayBookingV2 = onCall(
  { enforceAppCheck: true },
  async (r) => {
    const caller = uid(r),
      scope = await bookingScope(caller);
    try {
      assertNonFinancial(r.data);
    } catch {
      throw new HttpsError("invalid-argument", "Financial fields prohibited.");
    }
    let request: ReturnType<typeof validateBookingOperationRequest>;
    try {
      const validationData=r.data?.action==="confirm"?Object.fromEntries(Object.entries(r.data||{}).filter(([key])=>key!=="confirmationToken")):r.data||{};
      request = validateBookingOperationRequest(validationData, {
        actorUid: caller,
        organizationId: scope.organizationId,
      });
      if(r.data?.action==="confirm"){const token=String(r.data?.confirmationToken||"");if(!/^pbc_[A-Za-z0-9_-]{43,}$/.test(token))throw new Error("CONFIRMATION_REQUIRED");request={...request,confirmationToken:token}as typeof request;}
    } catch (error) {
      const reason = error instanceof Error ? error.message : "COMMAND_INVALID";
      throw new HttpsError("invalid-argument", `Booking command invalid: ${reason}.`);
    }
    const { action, bookingId: id, commandId: cmd, expectedVersion: expected } = request;
    const initialBooking=await db.collection("bookings").doc(id).get(),initialCourseId=String(initialBooking.data()?.courseId||"");
    if(!initialBooking.exists||initialBooking.data()?.organizationId!==scope.organizationId)throw new HttpsError("permission-denied","Booking unavailable.");
    const manageDecision=await exactBookingAuthority(caller,scope,initialCourseId,"mutate"),expectedConfirmation=confirmationBinding(caller,manageDecision,initialBooking.data(),action,r.data),confirmationDigest=bookingConfirmationTokenDigest(String(request.confirmationToken||""));
    const allowed = (permissions(scope.role) as any)[action];
    if (!allowed)
      throw new HttpsError(
        "permission-denied",
        "Role cannot perform this action.",
      );
    const ref = db.collection("bookings").doc(id),
      receiptId = bookingReceiptId(id, cmd),
      receiptRef = db.collection("play_booking_audits").doc(receiptId),confirmationRef=db.collection("play_booking_confirmation_tokens").doc(confirmationDigest),
      attemptToken = randomBytes(32).toString("hex");
    const claimResult = await db.runTransaction(async (tx) => {
      await transactionBookingAuthority(tx,caller,scope,initialCourseId,"mutate");
      const [booking, receipt,confirmation] = await Promise.all([tx.get(ref), tx.get(receiptRef),tx.get(confirmationRef)]);
      if (!booking.exists || booking.data()?.organizationId !== scope.organizationId ||
          String(booking.data()?.courseId)!==initialCourseId)
        throw new HttpsError("permission-denied", "Booking unavailable.");
      try{verifyBookingConfirmation(request.confirmationToken,confirmation.data(),expectedConfirmation,Date.now(),receipt.exists)}catch{throw new HttpsError("failed-precondition","CONFIRMATION_INVALID")}
      if (receipt.exists) {
        if (receipt.data()?.state === "pending") {
          try {
            const ambiguous = expirePendingBookingOperation(receipt.data(), request, Date.now());
            tx.set(receiptRef, { ...ambiguous, actorRole: scope.role, updatedAt: now() });
            tx.update(ref, { [`operationLocks.${action}`]: {
              operationId: ambiguous.operationId,
              state: "ambiguous",
              reason: ambiguous.reason,
            } });
            return { operationFailed: "OPERATION_AMBIGUOUS" };
          } catch (error) {
            const reason = error instanceof Error ? error.message : "OPERATION_PENDING";
            throw new HttpsError(
              reason === "COMMAND_REUSE_CONFLICT" ? "already-exists" : "failed-precondition",
              reason,
            );
          }
        }
        try {
          return { response: operationResponse(
            replayCompletedBookingOperation(receipt.data(), request),
          ) };
        } catch (error) {
          const reason = error instanceof Error ? error.message : "OPERATION_AMBIGUOUS";
          if (reason === "COMMAND_REUSE_CONFLICT")
            throw new HttpsError("already-exists", reason);
          if (reason.startsWith("OPERATION_FAILED:"))
            return { operationFailed: reason.slice("OPERATION_FAILED:".length) };
          throw new HttpsError("failed-precondition", reason);
        }
      }
      const operationId = bookingOperationId(request),
        actionLock = booking.data()?.operationLocks?.[action];
      if (actionLock?.state === "pending" || actionLock?.state === "ambiguous")
        throw new HttpsError(
          "failed-precondition",
          actionLock.state === "ambiguous" ? "OPERATION_AMBIGUOUS" : "OPERATION_PENDING",
          { operationId: String(actionLock.operationId || "") },
        );
      tx.create(receiptRef, {
        ...buildPendingBookingOperation(request, attemptToken, Date.now()),
        actorRole: scope.role,
        createdAt: now(),
      });
      tx.update(ref, { [`operationLocks.${action}`]: {
        operationId,
        state: "pending",
        receiptId,
      } });
      tx.update(confirmationRef,{used:true,usedByOperationId:operationId,usedAt:now()});
      return { claimed: true };
    });
    if ("response" in claimResult) return claimResult.response;
    if ("operationFailed" in claimResult) {
      const reason = String(claimResult.operationFailed);
      throw new HttpsError(
        reason === "VERSION_CONFLICT" ? "aborted" : "failed-precondition",
        reason,
        reason === "OPERATION_AMBIGUOUS" ? { operationId: bookingOperationId(request) } : undefined,
      );
    }
    const outcome = await db.runTransaction(async (tx) => {
      await transactionBookingAuthority(tx,caller,scope,initialCourseId,"mutate");
      const [booking, receipt] = await Promise.all([tx.get(ref),tx.get(receiptRef)]);
      if (
        !booking.exists ||
        booking.data()?.organizationId !== scope.organizationId ||
        String(booking.data()?.courseId)!==initialCourseId
      )
        throw new HttpsError("permission-denied","Booking unavailable.");
      if (receipt.exists) {
        try {
          assertPendingBookingOperationClaim(receipt.data(), request, attemptToken);
        } catch (error) {
          throw new HttpsError("failed-precondition", "OPERATION_CLAIM_MISMATCH");
        }
      } else throw new HttpsError("failed-precondition", "OPERATION_CLAIM_MISSING");
      let status: string;
      try {
        status = transition(String(booking.data()?.status), action);
      } catch {
        tx.set(receiptRef, {
          ...buildUnsuccessfulBookingOperation(request, "failed", "TRANSITION_DENIED"),
          actorRole: scope.role,
          createdAt: now(),
        });
        tx.update(ref, { [`operationLocks.${action}`]: admin.firestore.FieldValue.delete() });
        return { operationFailed: "TRANSITION_DENIED" };
      }
      let next: number;
      try {
        next = version(Number(booking.data()?.version || 0), expected);
      } catch {
        tx.set(receiptRef, {
          ...buildUnsuccessfulBookingOperation(request, "failed", "VERSION_CONFLICT"),
          actorRole: scope.role,
          createdAt: now(),
        });
        tx.update(ref, { [`operationLocks.${action}`]: admin.firestore.FieldValue.delete() });
        return { operationFailed: "VERSION_CONFLICT" };
      }
      const previousStatus = String(booking.data()?.status),
        previousVersion = Number(booking.data()?.version || 0),
        notificationStatus = notifier.value()
          ? "queued"
          : "PROVIDER_UNCONFIGURED",
        slotRef = db
          .collection("tee_time_slots")
          .doc(String(booking.data()?.slotId));
      let slotMutationApplied = false;
      if (action === "alternative") {
        const alternativeSlot = await tx.get(
          db.collection("tee_time_slots").doc(String(request.alternative?.slotId)),
        );
        let alternativeCapacity: ReturnType<typeof validateSlotCapacity> | null = null;
        try {
          if (alternativeSlot.exists)
            alternativeCapacity = validateSlotCapacity(
              alternativeSlot.data()?.bookedCount,
              alternativeSlot.data()?.capacity,
            );
        } catch {
          alternativeCapacity = null;
        }
        if (!alternativeSlot.exists ||
            alternativeSlot.data()?.organizationId !== scope.organizationId ||
            String(alternativeSlot.data()?.courseId) !== String(booking.data()?.courseId) ||
            alternativeSlot.data()?.status !== "open" ||
            alternativeSlot.data()?.publishToApp !== false ||
            !alternativeCapacity?.available) {
          tx.set(receiptRef, {
            ...buildUnsuccessfulBookingOperation(request, "failed", "ALTERNATIVE_SLOT_UNAVAILABLE"),
            actorRole: scope.role,
            createdAt: now(),
          });
          tx.update(ref, { [`operationLocks.${action}`]: admin.firestore.FieldValue.delete() });
          return { operationFailed: "ALTERNATIVE_SLOT_UNAVAILABLE" };
        }
      }
      if (action === "cancel") {
        const slot = await tx.get(slotRef);
        if (!slot.exists ||
            slot.data()?.organizationId !== scope.organizationId ||
            String(slot.data()?.courseId) !== String(booking.data()?.courseId) ||
            String(slot.id) !== String(booking.data()?.slotId))
        {
          tx.set(receiptRef, {
            ...buildUnsuccessfulBookingOperation(request, "ambiguous", "BOOKING_SLOT_BINDING_INVALID"),
            actorRole: scope.role,
            createdAt: now(),
          });
          tx.update(ref, { [`operationLocks.${action}`]: {
            operationId: bookingOperationId(request),
            state: "ambiguous",
            reason: "BOOKING_SLOT_BINDING_INVALID",
          } });
          return { operationFailed: "OPERATION_AMBIGUOUS" };
        }
        tx.update(slotRef, {
          bookedCount: cancelledBookedCount(slot.data()?.bookedCount || 0),
          updatedAt: now(),
        });
        slotMutationApplied = true;
      }
      tx.update(ref, {
        status,
        version: next,
        alternative: request.alternative,
        updatedAt: now(),
        [`operationLocks.${action}`]: admin.firestore.FieldValue.delete(),
      });
      const operation = buildCompletedBookingOperation({
        request,
        previousStatus,
        status,
        previousVersion,
        version: next,
        receiptId,
        notificationStatus,
        slotId: String(booking.data()?.slotId),
        slotMutationApplied,
      });
      tx.set(receiptRef, {
        ...operation,
        kind: action,
        actorRole: scope.role,
        createdAt: now(),
      });
      return operationResponse(operation);
    });
    if ("operationFailed" in outcome) {
      const reason = String(outcome.operationFailed);
      throw new HttpsError(
        reason === "VERSION_CONFLICT" ? "aborted" : "failed-precondition",
        reason,
        reason === "OPERATION_AMBIGUOUS" ? { operationId: bookingOperationId(request) } : undefined,
      );
    }
    return outcome;
  },
);
export const getPlayBookingOperationV2=onCall({enforceAppCheck:true},async r=>{const caller=uid(r),scope=await bookingScope(caller),bookingId=String(r.data?.bookingId||""),operationId=String(r.data?.operationId||"");if(Object.keys(r.data||{}).some(key=>!["bookingId","operationId"].includes(key))||!bookingId||!operationId)throw new HttpsError("invalid-argument","Operation projection invalid.");const booking=await db.collection("bookings").doc(bookingId).get();if(!booking.exists||booking.data()?.organizationId!==scope.organizationId)throw new HttpsError("permission-denied","Operation unavailable.");await exactBookingAuthority(caller,scope,String(booking.data()?.courseId),"read");const operations=await db.collection("play_booking_audits").where("operationId","==",operationId).limit(2).get();if(operations.size!==1||operations.docs[0].data()?.bookingId!==bookingId||operations.docs[0].data()?.organizationId!==scope.organizationId)throw new HttpsError("permission-denied","Operation unavailable.");const value=operations.docs[0].data(),mayReconcile=["organization_owner","organization_admin"].includes(scope.role)&&value.state==="ambiguous";let reconciliationToken:null|string=null,expiresAt:null|string=null;if(mayReconcile){reconciliationToken=`pbrt_${randomBytes(32).toString("base64url")}`;const digest=bookingConfirmationTokenDigest(reconciliationToken),expiresAtMs=Date.now()+120_000;await db.collection("play_booking_reconciliation_tokens").doc(digest).create({actorUid:caller,membershipId:scope.membershipId,organizationId:scope.organizationId,bookingId,operationId,tokenDigest:digest,used:false,issuedAtMs:Date.now(),expiresAtMs,createdAt:now()});expiresAt=new Date(expiresAtMs).toISOString()}return{success:true,bookingId,operationId,state:["pending","ambiguous","failed","completed"].includes(value.state)?value.state:"unavailable",action:String(value.action||""),expectedVersion:Number(value.expectedVersion||0),reason:typeof value.reason==="string"?value.reason:null,mayReconcile,reconciliationToken,expiresAt}});
export const reconcilePlayBookingOperationV2=onCall({enforceAppCheck:true},async r=>{
 const caller=uid(r),scope=await bookingScope(caller),clientKeys=["bookingId","operationId","commandId","reason","reconciliationToken","outcome","evidence"];
 if(!["organization_owner","organization_admin"].includes(scope.role))throw new HttpsError("permission-denied","Reconciliation unavailable.");
 if(Object.keys(r.data||{}).some(key=>!clientKeys.includes(key)))throw new HttpsError("invalid-argument","Reconciliation invalid.");
 let request;try{request=validateBookingReconciliationRequest({...r.data,actorUid:caller,role:scope.role,organizationId:scope.organizationId})}catch{throw new HttpsError("invalid-argument","Reconciliation invalid.")}
 const booking=await db.collection("bookings").doc(request.bookingId).get();if(!booking.exists||booking.data()?.organizationId!==scope.organizationId)throw new HttpsError("permission-denied","Reconciliation unavailable.");
 await exactBookingAuthority(caller,scope,String(booking.data()?.courseId),"mutate");
 const found=await db.collection("play_booking_audits").where("operationId","==",request.operationId).limit(2).get();if(found.size!==1||found.docs[0].data()?.bookingId!==request.bookingId||found.docs[0].data()?.state!=="ambiguous")throw new HttpsError("failed-precondition","Operation is not reconcilable.");
 const operationRef=found.docs[0].ref,tokenRef=db.collection("play_booking_reconciliation_tokens").doc(bookingConfirmationTokenDigest(request.reconciliationToken)),receipt=buildBookingReconciliationReceipt(request),receiptRef=db.collection("play_booking_reconciliations").doc(receipt.reconciliationId),bookingRef=db.collection("bookings").doc(request.bookingId);
 return db.runTransaction(async tx=>{await transactionBookingAuthority(tx,caller,scope,String(booking.data()?.courseId),"mutate");const[currentOperation,token,prior,currentBooking]=await Promise.all([tx.get(operationRef),tx.get(tokenRef),tx.get(receiptRef),tx.get(bookingRef)]);if(!currentOperation.exists||currentOperation.data()?.state!=="ambiguous"||!currentBooking.exists||currentBooking.id!==request.bookingId||currentBooking.data()?.organizationId!==scope.organizationId||String(currentBooking.data()?.courseId)!==String(booking.data()?.courseId))throw new HttpsError("failed-precondition","Operation is not reconcilable.");const tokenValue=token.data()||{},replay=prior.exists;if(!token.exists||tokenValue.used!==replay||tokenValue.actorUid!==caller||tokenValue.membershipId!==scope.membershipId||tokenValue.bookingId!==request.bookingId||tokenValue.operationId!==request.operationId||(!replay&&tokenValue.expiresAtMs<=Date.now()))throw new HttpsError("failed-precondition","Reconciliation token invalid.");if(prior.exists){try{return{success:true,...replayBookingReconciliation(prior.data(),request)}}catch{throw new HttpsError("already-exists","Reconciliation conflict.")}}tx.create(receiptRef,{...receipt,actorRole:scope.role,reason:request.reason,createdAt:now()});tx.update(tokenRef,{used:true,usedAt:now(),reconciliationId:receipt.reconciliationId});return{success:true,...receipt}})
});
export const sendPlayBookingMessageV2 = onCall(
  { enforceAppCheck: true },
  async (r) => {
    const caller = uid(r),
      cmd = command(r),
      id = String(r.data?.bookingId || ""),
      text = String(r.data?.message || "")
        .trim()
        .slice(0, 2000),
      booking = await db.collection("bookings").doc(id).get();
    if (Object.keys(r.data || {}).some((key) => !["bookingId", "commandId", "message"].includes(key)))
      throw new HttpsError("invalid-argument", "Booking message fields invalid.");
    if (!text)
      throw new HttpsError("invalid-argument", "Booking message invalid.");
    if (!booking.exists)
      throw new HttpsError("permission-denied", "Message denied.");
    let role = "member", staffScope: PartnerBookingScope | null = null;
    if (booking.data()?.memberUid !== caller) {
      const scope = await bookingScope(caller);
      if (
        scope.organizationId !== booking.data()?.organizationId ||
        !scope.courseIds.includes(String(booking.data()?.courseId)) ||
        !permissions(scope.role).message
      )
        throw new HttpsError("permission-denied", "Message denied.");
      await exactBookingAuthority(caller,scope,String(booking.data()?.courseId),"mutate");
      role = scope.role;
      staffScope = scope;
    }
    const messageId = bookingMessageId(id, cmd),
      digest = bookingMessageDigest({ actorUid: caller, bookingId: id, commandId: cmd, message: text }),
      operationRef = db.collection("play_booking_message_operations")
        .doc(bookingMessageOperationId(caller, cmd)),
      messageRef = db.collection("bookings").doc(id).collection("messages").doc(messageId),
      bookingRef = db.collection("bookings").doc(id);
    return db.runTransaction(async (tx) => {
      const [currentBooking, priorOperation, priorMessage] = await Promise.all([
        tx.get(bookingRef), tx.get(operationRef), tx.get(messageRef),
      ]);
      if (!currentBooking.exists ||
          (staffScope
            ? currentBooking.data()?.organizationId !== staffScope.organizationId ||
              !staffScope.courseIds.includes(String(currentBooking.data()?.courseId))
            : currentBooking.data()?.memberUid !== caller))
        throw new HttpsError("permission-denied", "Message denied.");
      if (staffScope) {
        const currentCourseId = String(currentBooking.data()?.courseId);
        await transactionBookingAuthority(tx,caller,staffScope,currentCourseId,"mutate");
        if (!permissions(staffScope.role).message)throw new HttpsError("permission-denied", "Message denied.");
      }
      if (priorOperation.exists) {
        const prior = priorOperation.data();
        if (prior?.requestDigest !== digest || prior?.actorUid !== caller ||
            prior?.bookingId !== id || prior?.commandId !== cmd)
          throw new HttpsError("already-exists", "BOOKING_MESSAGE_COMMAND_REUSE_CONFLICT");
        if (prior?.state !== "completed" || prior?.immutable !== true ||
            prior?.schema !== "golfriend.play-booking-message-operation.v1" ||
            prior?.messageId !== messageId || !priorMessage.exists ||
            priorMessage.data()?.requestDigest !== digest ||
            priorMessage.data()?.actorUid !== caller ||
            priorMessage.data()?.message !== text ||
            !["queued", "PROVIDER_UNCONFIGURED"].includes(prior?.notificationStatus))
          throw new HttpsError("failed-precondition", "BOOKING_MESSAGE_AMBIGUOUS");
        return { success: true, messageId, notificationStatus: prior.notificationStatus };
      }
      if (priorMessage.exists)
        throw new HttpsError("already-exists", "BOOKING_MESSAGE_COMMAND_REUSE_CONFLICT");
      const notificationStatus = notifier.value() ? "queued" : "PROVIDER_UNCONFIGURED";
      tx.create(messageRef, {
        messageId, senderRole: role, actorUid: caller, requestDigest: digest,
        message: text, createdAt: now(),
      });
      tx.create(operationRef, {
        schema: "golfriend.play-booking-message-operation.v1",
        state: "completed", actorUid: caller, bookingId: id, commandId: cmd,
        requestDigest: digest, messageId, notificationStatus,
        immutable: true, createdAt: now(),
      });
      tx.update(bookingRef, { lastMessageAt: now() });
      return { success: true, messageId, notificationStatus };
    });
  },
);
export const getPlayBookingsPortalV2 = onCall(
  { enforceAppCheck: true },
  async (r) => {
    const scope = await bookingScope(uid(r)),
      snap = await db
        .collection("bookings")
        .where("organizationId", "==", scope.organizationId)
        .limit(200)
        .get(),
      bookings = snap.docs
        .map((document) => document.data())
        .filter((booking) => scope.courseIds.includes(String(booking.courseId)))
        .map((booking) => safeBooking(booking))
        .filter((booking) => booking !== null);
    return {
      schema: BOOKING_SCHEMA,
      role: scope.role,
      permissions: permissions(scope.role),
      courseIds: scope.courseIds,
      delegatedCourseIds: scope.delegatedCourseIds,
      propertyIds: scope.propertyIds,
      membershipId: scope.membershipId,
      projectionVersion: scope.projectionVersion,
      sourceVersion: scope.sourceVersion,
      generatedAt: scope.generatedAt,
      expiresAt: scope.expiresAt,
      freshness: scope.freshness,
      bookings,
      notificationProviderConfigured: Boolean(notifier.value()),
      boundary: "PROVIDER_NEUTRAL_NO_FINANCIAL_OWNERSHIP",
    };
  },
);
export const getPlayBookingsAdminV2 = onCall(
  { enforceAppCheck: true },
  async (r) => {
    await staff(uid(r));
    const snap = await db.collection("bookings").limit(500).get();
    return {
      schema: BOOKING_SCHEMA,
      bookings: snap.docs
        .map((document) => safeBooking(document.data()))
        .filter((booking) => booking !== null),
      notificationProviderConfigured: Boolean(notifier.value()),
      boundary: "PROVIDER_NEUTRAL_NO_FINANCIAL_OWNERSHIP",
    };
  },
);
