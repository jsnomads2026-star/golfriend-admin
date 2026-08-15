import * as admin from "firebase-admin";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {bookingScope} from "./partnerBookingRuntime.js";
import {buildEnterpriseBookingCoordinationItem, buildEnterpriseBookingCoordinationProjection} from "./enterpriseBookingCoordinationProjection.js";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
export const getEnterpriseBookingCoordinationPortalV2 = onCall({enforceAppCheck: true}, async request => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
  const scope = await bookingScope(request.auth.uid), snapshot = await db.collection("bookings").where("organizationId", "==", scope.organizationId).limit(201).get();
  if (snapshot.size > 200) throw new HttpsError("resource-exhausted", "Booking coordination unavailable.");
  const source = snapshot.docs.map(document => document.data()).filter(booking => booking.schema === "golfriend.enterprise-correlated-booking.v2" && scope.courseIds.includes(String(booking.courseId))).slice(0, 50), items = [];
  for (const booking of source) {
    const correlationRef = db.collection("enterprise_booking_correlations").doc(String(booking.correlationId || "")), [correlation, outbox, operationReceipts, systemReceipts] = await Promise.all([correlationRef.get(), db.collection("enterprise_booking_correlation_outbox").where("correlationId", "==", String(booking.correlationId || "")).limit(31).get(), db.collection("enterprise_booking_operation_receipts_v2").where("bookingId", "==", String(booking.bookingId || "")).limit(31).get(), db.collection("enterprise_booking_system_transition_receipts_v2").where("bookingId", "==", String(booking.bookingId || "")).limit(31).get()]);
    if (!correlation.exists) throw new HttpsError("unavailable", "Booking coordination unavailable.");
    try {items.push(buildEnterpriseBookingCoordinationItem({booking, correlation: correlation.data() || {}, outbox: outbox.docs.map(document => document.data()), receipts: [...operationReceipts.docs, ...systemReceipts.docs].map(document => document.data())}));} catch {throw new HttpsError("unavailable", "Booking coordination unavailable.");}
  }
  try {return buildEnterpriseBookingCoordinationProjection(scope, items);} catch {throw new HttpsError("permission-denied", "Booking coordination unavailable.");}
});
