import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { calculateCourseCommission, validateCommissionBps, validateTeePurchase } from "./economyCommercialLogic.js";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const WALLETS = db.collection("economy_wallets");
const LEDGER = db.collection("economy_ledger");
const PROVIDER_EVENTS = db.collection("economy_provider_events");
const BOOKING_EVENTS = db.collection("economy_booking_events");
const AGREEMENTS = db.collection("economy_course_agreements");

async function requireDirector(uid: string) {
  const staff = await db.collection("admin_users").doc(uid).get();
  if (!staff.exists || staff.data()?.role !== "Director" || staff.data()?.status === "Suspended") {
    throw new HttpsError("permission-denied", "Only an active Director may manage commercial Economy records.");
  }
}

function safeId(value: unknown, code: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{3,128}$/.test(value)) throw new HttpsError("invalid-argument", code);
  return value;
}

export const claimVerifiedTeePurchase = onCall({ memory: "256MiB" }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Authentication required.");
  const uid = request.auth.uid;
  const providerEventId = safeId(request.data?.providerEventId, "INVALID_PROVIDER_EVENT_ID");
  const eventRef = PROVIDER_EVENTS.doc(providerEventId);
  const ledgerRef = LEDGER.doc(`purchase_${providerEventId}`);
  const walletRef = WALLETS.doc(uid);

  return db.runTransaction(async (tx) => {
    const [event, existing, wallet] = await Promise.all([tx.get(eventRef), tx.get(ledgerRef), tx.get(walletRef)]);
    if (existing.exists) return { success: true, replay: true, ...existing.data() };
    if (!event.exists) throw new HttpsError("not-found", "VERIFIED_PURCHASE_EVENT_NOT_FOUND");
    const data = event.data()!;
    if (data.status !== "verified" || data.uid !== uid || data.consumedAt) {
      throw new HttpsError("failed-precondition", "PURCHASE_EVENT_NOT_CLAIMABLE");
    }
    const purchase = validateTeePurchase(data.grossMinor, data.tees);
    const balanceBefore = wallet.exists ? Number(wallet.data()?.balanceTees ?? 0) : 0;
    if (!Number.isSafeInteger(balanceBefore) || balanceBefore < 0) throw new HttpsError("data-loss", "INVALID_WALLET_BALANCE");
    const balanceAfter = balanceBefore + purchase.tees;
    const entry = {
      type: "PURCHASE",
      uid,
      provider: data.provider,
      providerEventId,
      currency: data.currency ?? "USD",
      grossMinor: purchase.grossMinor,
      providerFeeMinor: Number(data.providerFeeMinor ?? 0),
      debitTees: 0,
      rewardTees: purchase.tees,
      netTees: purchase.tees,
      balanceBefore,
      balanceAfter,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    tx.create(ledgerRef, entry);
    tx.create(walletRef.collection("entries").doc(ledgerRef.id), entry);
    tx.set(walletRef, { uid, balanceTees: balanceAfter, lastLedgerId: ledgerRef.id, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    tx.update(eventRef, { consumedAt: admin.firestore.FieldValue.serverTimestamp(), consumedByUid: uid, ledgerId: ledgerRef.id });
    return { success: true, replay: false, ...entry, createdAt: new Date().toISOString() };
  });
});

export const publishCourseCommissionAgreement = onCall({ memory: "256MiB" }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Authentication required.");
  await requireDirector(request.auth.uid);
  const courseId = safeId(request.data?.courseId, "INVALID_COURSE_ID");
  const commissionBps = validateCommissionBps(request.data?.commissionBps);
  const contractRef = typeof request.data?.contractRef === "string" ? request.data.contractRef.trim() : "";
  const startsAt = typeof request.data?.startsAt === "string" ? request.data.startsAt : new Date().toISOString();
  const endsAt = typeof request.data?.endsAt === "string" ? request.data.endsAt : null;
  if (contractRef.length < 5 || Number.isNaN(Date.parse(startsAt)) || (endsAt && Number.isNaN(Date.parse(endsAt)))) {
    throw new HttpsError("invalid-argument", "INVALID_COURSE_AGREEMENT");
  }

  const agreementRef = AGREEMENTS.doc(courseId);
  const versionRef = agreementRef.collection("versions").doc();
  const payload = {
    courseId,
    commissionBps,
    contractRef,
    startsAt,
    endsAt,
    active: request.data?.active !== false,
    version: versionRef.id,
    publishedByUid: request.auth.uid,
    publishedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  await db.runTransaction(async (tx) => {
    tx.create(versionRef, payload);
    tx.set(agreementRef, payload);
  });
  return { success: true, courseId, version: versionRef.id, commissionBps };
});

export const settleVerifiedBookingCommission = onCall({ memory: "256MiB" }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Authentication required.");
  await requireDirector(request.auth.uid);
  const bookingEventId = safeId(request.data?.bookingEventId, "INVALID_BOOKING_EVENT_ID");
  const eventRef = BOOKING_EVENTS.doc(bookingEventId);
  const settlementRef = db.collection("economy_course_commissions").doc(bookingEventId);

  return db.runTransaction(async (tx) => {
    const [event, existing] = await Promise.all([tx.get(eventRef), tx.get(settlementRef)]);
    if (existing.exists) return { success: true, replay: true, ...existing.data() };
    if (!event.exists) throw new HttpsError("not-found", "VERIFIED_BOOKING_EVENT_NOT_FOUND");
    const data = event.data()!;
    if (data.status !== "verified" || data.consumedAt) throw new HttpsError("failed-precondition", "BOOKING_EVENT_NOT_SETTLEABLE");
    const courseId = safeId(data.courseId, "INVALID_COURSE_ID");
    const agreementRef = AGREEMENTS.doc(courseId);
    const agreement = await tx.get(agreementRef);
    if (!agreement.exists || agreement.data()?.active !== true) throw new HttpsError("failed-precondition", "COURSE_COMMISSION_AGREEMENT_NOT_ACTIVE");
    const agreementData = agreement.data()!;
    const now = Date.now();
    if (Date.parse(agreementData.startsAt) > now || (agreementData.endsAt && Date.parse(agreementData.endsAt) < now)) {
      throw new HttpsError("failed-precondition", "COURSE_COMMISSION_AGREEMENT_OUTSIDE_TERM");
    }

    const calculation = calculateCourseCommission(data.grossMinor, agreementData.commissionBps);
    const settlement = {
      bookingEventId,
      bookingId: data.bookingId,
      courseId,
      currency: data.currency ?? "USD",
      agreementVersion: agreementData.version,
      contractRef: agreementData.contractRef,
      ...calculation,
      evidenceRef: data.evidenceRef ?? null,
      settledByUid: request.auth!.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    tx.create(settlementRef, settlement);
    tx.create(agreementRef.collection("commissions").doc(bookingEventId), settlement);
    tx.update(eventRef, { consumedAt: admin.firestore.FieldValue.serverTimestamp(), settlementId: settlementRef.id });
    return { success: true, replay: false, ...settlement, createdAt: new Date().toISOString() };
  });
});

export const getCourseCommissionStatement = onCall({ memory: "256MiB" }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Authentication required.");
  await requireDirector(request.auth.uid);
  const courseId = safeId(request.data?.courseId, "INVALID_COURSE_ID");
  const rows = await AGREEMENTS.doc(courseId).collection("commissions").orderBy("createdAt", "desc").limit(500).get();
  const commissions = rows.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const totalsByCurrency: Record<string, { bookings: number; grossMinor: number; commissionMinor: number; courseNetMinor: number }> = {};
  for (const row of rows.docs) {
    const data = row.data();
    const currency = typeof data.currency === "string" ? data.currency : "USD";
    const total = totalsByCurrency[currency] ?? { bookings: 0, grossMinor: 0, commissionMinor: 0, courseNetMinor: 0 };
    total.bookings += 1;
    total.grossMinor += Number(data.grossMinor ?? 0);
    total.commissionMinor += Number(data.commissionMinor ?? 0);
    total.courseNetMinor += Number(data.courseNetMinor ?? 0);
    totalsByCurrency[currency] = total;
  }
  return { courseId, capped: rows.size === 500, totalsByCurrency, commissions };
});
