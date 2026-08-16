import * as admin from "firebase-admin";
import {defineSecret} from "firebase-functions/params";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {bookingScope} from "./partnerBookingRuntime.js";
import {verifyEnterpriseCorrelationEvent} from "./enterpriseBookingCorrelation.js";
import {buildEnterpriseBookingCoordinationItem, buildEnterpriseBookingCoordinationProjection} from "./enterpriseBookingCoordinationProjection.js";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const OUTBOX=defineSecret("ENTERPRISE_BOOKING_OUTBOX_HMAC_V1"), ID=/^[A-Za-z0-9_-]{8,200}$/;
const verifiedEvent=(raw:Record<string,unknown>,secret:string,booking:Record<string,unknown>)=>{const{immutable,deliveryState,createdAt,...event}=raw;if(immutable!==true||deliveryState!=="awaiting_golfer_consumer"||!createdAt)throw new Error("COORDINATION_EVENT_INVALID");const value=verifyEnterpriseCorrelationEvent(event,secret)as Record<string,any>;if(value.correlationId!==booking.correlationId||value.enterpriseBooking?.bookingId!==booking.bookingId||value.course?.courseId!==booking.courseId)throw new Error("COORDINATION_EVENT_INVALID");return value;};
const verifiedReceipt=(raw:Record<string,any>,booking:Record<string,unknown>,eventIds:Set<string>)=>{if(raw.immutable!==true||raw.bookingId!==booking.bookingId||!ID.test(String(raw.receiptId||""))||!ID.test(String(raw.eventId||""))||!eventIds.has(String(raw.eventId)))throw new Error("COORDINATION_RECEIPT_INVALID");if(raw.schema==="golfriend.enterprise-booking-operation-receipt.v2"){if(!ID.test(String(raw.operationId||""))||!Number.isSafeInteger(raw.version)||raw.version<1)throw new Error("COORDINATION_RECEIPT_INVALID");}else if(raw.schema==="golfriend.enterprise-booking-system-transition-receipt.v2"){if(raw.correlationId!==booking.correlationId||!Number.isSafeInteger(raw.version)||raw.version<1)throw new Error("COORDINATION_RECEIPT_INVALID");}else throw new Error("COORDINATION_RECEIPT_INVALID");return{receiptId:String(raw.receiptId)};};
export const getEnterpriseBookingCoordinationPortalV2 = onCall({enforceAppCheck: true,secrets:[OUTBOX]}, async request => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
  const outboxSecret=OUTBOX.value();if(!outboxSecret)throw new HttpsError("unavailable","Booking coordination unavailable.");
  const scope = await bookingScope(request.auth.uid), snapshot = await db.collection("bookings").where("organizationId", "==", scope.organizationId).limit(201).get();
  if (snapshot.size > 200) throw new HttpsError("resource-exhausted", "Booking coordination unavailable.");
  const source = snapshot.docs.map(document => document.data()).filter(booking => booking.schema === "golfriend.enterprise-correlated-booking.v2" && scope.courseIds.includes(String(booking.courseId))).slice(0, 50), items = [];
  for (const booking of source) {
    const correlationRef = db.collection("enterprise_booking_correlations").doc(String(booking.correlationId || "")), [correlation, outbox, operationReceipts, systemReceipts] = await Promise.all([correlationRef.get(), db.collection("enterprise_booking_correlation_outbox").where("correlationId", "==", String(booking.correlationId || "")).limit(31).get(), db.collection("enterprise_booking_operation_receipts_v2").where("bookingId", "==", String(booking.bookingId || "")).limit(31).get(), db.collection("enterprise_booking_system_transition_receipts_v2").where("bookingId", "==", String(booking.bookingId || "")).limit(31).get()]);
    if (!correlation.exists) throw new HttpsError("unavailable", "Booking coordination unavailable.");
    try {const events=outbox.docs.map(document=>verifiedEvent(document.data(),outboxSecret,booking)),eventIds=new Set(events.map(event=>String(event.eventId))),receipts=[...operationReceipts.docs,...systemReceipts.docs].map(document=>verifiedReceipt(document.data(),booking,eventIds));items.push(buildEnterpriseBookingCoordinationItem({booking, correlation: correlation.data() || {}, outbox: events, receipts}));} catch {throw new HttpsError("unavailable", "Booking coordination unavailable.");}
  }
  try {return buildEnterpriseBookingCoordinationProjection(scope, items);} catch {throw new HttpsError("permission-denied", "Booking coordination unavailable.");}
});
