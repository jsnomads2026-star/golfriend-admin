import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import {
  quoteRate,
  validateIdempotencyKey,
  validateRateCard,
  type AuthoritativeEconomyRate,
} from "./economyLogic.js";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const ACTIVE_CARD = db.collection("economy_config").doc("active_rate_card");
const VERSIONS = db.collection("economy_rate_versions");
const WALLETS = db.collection("economy_wallets");
const LEDGER = db.collection("economy_ledger");
const USD_PER_TEE = 0.10;

async function requireDirector(uid: string) {
  const staff = await db.collection("admin_users").doc(uid).get();
  if (!staff.exists || staff.data()?.role !== "Director" || staff.data()?.status === "Suspended") {
    throw new HttpsError("permission-denied", "Only an active Director may publish Economy prices.");
  }
}

function asHttpsError(error: unknown): never {
  if (error instanceof HttpsError) throw error;
  const message = error instanceof Error ? error.message : "ECONOMY_OPERATION_FAILED";
  if (message.startsWith("INVALID_") || message.includes("MUST_") || message.includes("DUPLICATE_") || message.includes("EXCEEDS_")) {
    throw new HttpsError("invalid-argument", message);
  }
  if (message === "RATE_INACTIVE") throw new HttpsError("failed-precondition", message);
  throw new HttpsError("internal", message);
}

export const getEconomyRateCard = onCall({ memory: "256MiB" }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Authentication required.");
  const active = await ACTIVE_CARD.get();
  if (!active.exists) throw new HttpsError("failed-precondition", "ECONOMY_RATE_CARD_NOT_PUBLISHED");
  const data = active.data()!;
  return {
    version: data.version,
    effectiveAt: data.effectiveAt,
    usdPerTee: data.usdPerTee,
    rates: data.rates,
  };
});

export const publishEconomyRateCard = onCall({ memory: "256MiB" }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Authentication required.");
  await requireDirector(request.auth.uid);

  try {
    const reason = typeof request.data?.reason === "string" ? request.data.reason.trim() : "";
    const effectiveAt = typeof request.data?.effectiveAt === "string" ? request.data.effectiveAt : new Date().toISOString();
    const rates = validateRateCard(request.data?.rates as AuthoritativeEconomyRate[]);
    if (reason.length < 8 || reason.length > 500) throw new Error("INVALID_PUBLISH_REASON");
    if (Number.isNaN(Date.parse(effectiveAt))) throw new Error("INVALID_EFFECTIVE_AT");

    const versionRef = VERSIONS.doc();
    const version = versionRef.id;
    const now = admin.firestore.FieldValue.serverTimestamp();
    await db.runTransaction(async (tx) => {
      const current = await tx.get(ACTIVE_CARD);
      const previousVersion = current.exists ? current.data()?.version ?? null : null;
      const payload = {
        version,
        previousVersion,
        effectiveAt,
        usdPerTee: USD_PER_TEE,
        rates,
        reason,
        publishedByUid: request.auth!.uid,
        publishedAt: now,
      };
      tx.create(versionRef, payload);
      tx.set(ACTIVE_CARD, payload);
      tx.create(db.collection("economy_rate_audit").doc(), {
        type: "RATE_CARD_PUBLISHED",
        version,
        previousVersion,
        reason,
        actorUid: request.auth!.uid,
        createdAt: now,
      });
    });
    return { success: true, version, effectiveAt };
  } catch (error) {
    return asHttpsError(error);
  }
});

export const rollbackEconomyRateCard = onCall({ memory: "256MiB" }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Authentication required.");
  await requireDirector(request.auth.uid);

  try {
    const targetVersion = typeof request.data?.version === "string" ? request.data.version : "";
    const reason = typeof request.data?.reason === "string" ? request.data.reason.trim() : "";
    if (!targetVersion || reason.length < 8) throw new Error("INVALID_ROLLBACK_REQUEST");
    const target = await VERSIONS.doc(targetVersion).get();
    if (!target.exists) throw new HttpsError("not-found", "RATE_VERSION_NOT_FOUND");

    const now = admin.firestore.FieldValue.serverTimestamp();
    await db.runTransaction(async (tx) => {
      const current = await tx.get(ACTIVE_CARD);
      tx.set(ACTIVE_CARD, { ...target.data(), rolledBackFromVersion: current.data()?.version ?? null, rollbackReason: reason, rolledBackByUid: request.auth!.uid, rolledBackAt: now });
      tx.create(db.collection("economy_rate_audit").doc(), {
        type: "RATE_CARD_ROLLED_BACK",
        targetVersion,
        fromVersion: current.data()?.version ?? null,
        reason,
        actorUid: request.auth!.uid,
        createdAt: now,
      });
    });
    return { success: true, version: targetVersion };
  } catch (error) {
    return asHttpsError(error);
  }
});

export const quoteEconomyAction = onCall({ memory: "256MiB" }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Authentication required.");
  try {
    const actionId = typeof request.data?.actionId === "string" ? request.data.actionId : "";
    const active = await ACTIVE_CARD.get();
    if (!active.exists) throw new HttpsError("failed-precondition", "ECONOMY_RATE_CARD_NOT_PUBLISHED");
    const card = active.data()!;
    const rate = (card.rates as AuthoritativeEconomyRate[]).find((item) => item.id === actionId);
    if (!rate) throw new HttpsError("not-found", "ECONOMY_ACTION_NOT_FOUND");
    return quoteRate(rate, card.version, card.usdPerTee);
  } catch (error) {
    return asHttpsError(error);
  }
});

export const settleEconomyAction = onCall({ memory: "256MiB" }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Authentication required.");
  const uid = request.auth.uid;

  try {
    const actionId = typeof request.data?.actionId === "string" ? request.data.actionId : "";
    const idempotencyKey = validateIdempotencyKey(request.data?.idempotencyKey);
    const ledgerRef = LEDGER.doc(`${uid}_${idempotencyKey}`);
    const walletRef = WALLETS.doc(uid);

    return await db.runTransaction(async (tx) => {
      const [existing, active, wallet] = await Promise.all([
        tx.get(ledgerRef),
        tx.get(ACTIVE_CARD),
        tx.get(walletRef),
      ]);
      if (existing.exists) return { success: true, replay: true, ...existing.data() };
      if (!active.exists) throw new HttpsError("failed-precondition", "ECONOMY_RATE_CARD_NOT_PUBLISHED");

      const card = active.data()!;
      const rate = (card.rates as AuthoritativeEconomyRate[]).find((item) => item.id === actionId);
      if (!rate) throw new HttpsError("not-found", "ECONOMY_ACTION_NOT_FOUND");
      const quote = quoteRate(rate, card.version, card.usdPerTee);
      const currentBalance = wallet.exists ? Number(wallet.data()?.balanceTees ?? 0) : 0;
      if (!Number.isSafeInteger(currentBalance) || currentBalance < 0) throw new HttpsError("data-loss", "INVALID_WALLET_BALANCE");
      if (currentBalance < quote.debitTees) throw new HttpsError("failed-precondition", "INSUFFICIENT_TEES");

      const balanceAfter = currentBalance + quote.netTees;
      const entry = {
        uid,
        idempotencyKey,
        actionId,
        rateVersion: quote.rateVersion,
        debitTees: quote.debitTees,
        rewardTees: quote.rewardTees,
        netTees: quote.netTees,
        balanceBefore: currentBalance,
        balanceAfter,
        revenueUsd: quote.revenueUsd,
        directCostUsd: quote.directCostUsd,
        marginUsd: quote.marginUsd,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      tx.create(ledgerRef, entry);
      tx.create(walletRef.collection("entries").doc(ledgerRef.id), entry);
      tx.set(walletRef, {
        uid,
        balanceTees: balanceAfter,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastLedgerId: ledgerRef.id,
      }, { merge: true });
      return { success: true, replay: false, ...entry, createdAt: new Date().toISOString() };
    });
  } catch (error) {
    return asHttpsError(error);
  }
});


export const getEconomyWallet = onCall({ memory: "256MiB" }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Authentication required.");
  const uid = request.auth.uid;
  const requestedUid = typeof request.data?.uid === "string" ? request.data.uid : uid;
  if (requestedUid !== uid) await requireDirector(uid);

  const walletRef = WALLETS.doc(requestedUid);
  const [wallet, entries] = await Promise.all([
    walletRef.get(),
    walletRef.collection("entries").orderBy("createdAt", "desc").limit(50).get(),
  ]);
  return {
    uid: requestedUid,
    balanceTees: wallet.exists ? Number(wallet.data()?.balanceTees ?? 0) : 0,
    entries: entries.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
  };
});

export const refundEconomyTransaction = onCall({ memory: "256MiB" }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Authentication required.");
  await requireDirector(request.auth.uid);

  try {
    const originalLedgerId = typeof request.data?.ledgerId === "string" ? request.data.ledgerId : "";
    const reason = typeof request.data?.reason === "string" ? request.data.reason.trim() : "";
    if (!originalLedgerId || reason.length < 8 || reason.length > 500) throw new Error("INVALID_REFUND_REQUEST");

    const originalRef = LEDGER.doc(originalLedgerId);
    const refundRef = LEDGER.doc(`refund_${originalLedgerId}`);
    const auditRef = db.collection("economy_refund_audit").doc(originalLedgerId);

    return await db.runTransaction(async (tx) => {
      const original = await tx.get(originalRef);
      if (!original.exists) throw new HttpsError("not-found", "ECONOMY_TRANSACTION_NOT_FOUND");
      const originalData = original.data()!;
      if (typeof originalData.uid !== "string" || Number(originalData.netTees) >= 0) {
        throw new HttpsError("failed-precondition", "TRANSACTION_NOT_REFUNDABLE");
      }

      const walletRef = WALLETS.doc(originalData.uid);
      const [existingRefund, wallet] = await Promise.all([tx.get(refundRef), tx.get(walletRef)]);
      if (existingRefund.exists) return { success: true, replay: true, ...existingRefund.data() };

      const refundTees = Math.abs(Number(originalData.netTees));
      const balanceBefore = wallet.exists ? Number(wallet.data()?.balanceTees ?? 0) : 0;
      if (!Number.isSafeInteger(balanceBefore) || balanceBefore < 0) throw new HttpsError("data-loss", "INVALID_WALLET_BALANCE");
      const balanceAfter = balanceBefore + refundTees;
      const entry = {
        uid: originalData.uid,
        type: "REFUND",
        actionId: originalData.actionId,
        originalLedgerId,
        rateVersion: originalData.rateVersion,
        debitTees: 0,
        rewardTees: refundTees,
        netTees: refundTees,
        balanceBefore,
        balanceAfter,
        revenueUsd: -Number(originalData.revenueUsd ?? 0),
        directCostUsd: 0,
        marginUsd: -Number(originalData.marginUsd ?? 0),
        reason,
        actorUid: request.auth!.uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      tx.create(refundRef, entry);
      tx.create(walletRef.collection("entries").doc(refundRef.id), entry);
      tx.create(auditRef, {
        originalLedgerId,
        refundLedgerId: refundRef.id,
        uid: originalData.uid,
        refundTees,
        reason,
        actorUid: request.auth!.uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      tx.set(walletRef, {
        uid: originalData.uid,
        balanceTees: balanceAfter,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastLedgerId: refundRef.id,
      }, { merge: true });
      return { success: true, replay: false, ...entry, createdAt: new Date().toISOString() };
    });
  } catch (error) {
    return asHttpsError(error);
  }
});

export const getEconomyProfitability = onCall({ memory: "256MiB", timeoutSeconds: 60 }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Authentication required.");
  await requireDirector(request.auth.uid);

  const sinceRaw = typeof request.data?.since === "string" ? request.data.since : "";
  const sinceDate = sinceRaw ? new Date(sinceRaw) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(sinceDate.getTime())) throw new HttpsError("invalid-argument", "INVALID_SINCE");

  const snapshot = await LEDGER.where("createdAt", ">=", admin.firestore.Timestamp.fromDate(sinceDate))
    .orderBy("createdAt", "desc")
    .limit(5000)
    .get();

  const byAction: Record<string, { transactions: number; debitTees: number; rewardTees: number; revenueUsd: number; directCostUsd: number; marginUsd: number }> = {};
  for (const doc of snapshot.docs) {
    const row = doc.data();
    const actionId = typeof row.actionId === "string" ? row.actionId : "unknown";
    const bucket = byAction[actionId] ?? { transactions: 0, debitTees: 0, rewardTees: 0, revenueUsd: 0, directCostUsd: 0, marginUsd: 0 };
    bucket.transactions += 1;
    bucket.debitTees += Number(row.debitTees ?? 0);
    bucket.rewardTees += Number(row.rewardTees ?? 0);
    bucket.revenueUsd += Number(row.revenueUsd ?? 0);
    bucket.directCostUsd += Number(row.directCostUsd ?? 0);
    bucket.marginUsd += Number(row.marginUsd ?? 0);
    byAction[actionId] = bucket;
  }

  const totals = Object.values(byAction).reduce((sum, row) => ({
    transactions: sum.transactions + row.transactions,
    debitTees: sum.debitTees + row.debitTees,
    rewardTees: sum.rewardTees + row.rewardTees,
    revenueUsd: sum.revenueUsd + row.revenueUsd,
    directCostUsd: sum.directCostUsd + row.directCostUsd,
    marginUsd: sum.marginUsd + row.marginUsd,
  }), { transactions: 0, debitTees: 0, rewardTees: 0, revenueUsd: 0, directCostUsd: 0, marginUsd: 0 });

  return {
    since: sinceDate.toISOString(),
    capped: snapshot.size === 5000,
    totals,
    byAction: Object.entries(byAction)
      .map(([actionId, values]) => ({ actionId, ...values }))
      .sort((a, b) => b.revenueUsd - a.revenueUsd),
  };
});
