import { onSchedule } from "firebase-functions/v2/scheduler";
import { onRequest, onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import * as functionsV1 from "firebase-functions/v1"; // 🔥 Explicitly target v1
import Stripe from "stripe";
import vision from "@google-cloud/vision"; // 🔥 ADDED

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const visionClient = new vision.ImageAnnotatorClient(); // 🔥 ADDED

// 🔐 Pulls the key securely from Google Secret Manager
// 🔐 Pulls the key securely from Google Secret Manager
const GOLF_API_KEY = defineSecret("GOLF_API_KEY");
const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET");

// ==========================================
// 🌙 THE NIGHTLY HEALER (Runs every day at 3:00 AM)
// ==========================================
export const nightlyCourseHealer = onSchedule({
  schedule: "0 3 * * *",
  timeZone: "Asia/Bangkok", // Aligned to Pattaya local time
  secrets: [GOLF_API_KEY],
  memory: "512MiB"
}, async (event) => {
  console.log("🌙 NIGHTLY HEALER: Waking up...");

  try {
    const snapshot = await db.collection("courses").get();
    const allCourses = snapshot.docs.map(doc => ({ docId: doc.id, ...(doc.data() as any) }));

    const brokenCourses = allCourses.filter((c: any) => 
      c.courseID && 
      !c.courseID.startsWith("manual_") && 
      c.requiresManualGPS !== true && // 🔥 THE FIX: Ignore quarantined courses
      (!c.latitude || c.latitude === 0 || !c.lat || c.lat === 0)
    );

    console.log(`⚠️ Found ${brokenCourses.length} broken courses.`);
    if (brokenCourses.length === 0) return console.log("✅ Vault is fully healed. Going back to sleep.");

    // Limit to 50 per night to strictly protect your Golf API quota
    const coursesToProcess = brokenCourses.slice(0, 50);
    let healedCount = 0;
    const apiKey = GOLF_API_KEY.value();
    const headers = { 'Authorization': `Bearer ${apiKey}` };

    for (let i = 0; i < coursesToProcess.length; i++) {
      const target: any = coursesToProcess[i];
      let exactLat = 0, exactLng = 0;
      let greenGrid = [], bunkerGrid = [], waterGrid = [];

      try {
        const shellRes = await fetch(`https://www.golfapi.io/api/v2.3/courses/${target.courseID}`, { headers });
        if (shellRes.ok) {
          const shellData = await shellRes.json();
          const shell = shellData.data || shellData;
          if (shell.latitude && shell.longitude) {
            exactLat = parseFloat(shell.latitude);
            exactLng = parseFloat(shell.longitude);
          }
        }

        const coordRes = await fetch(`https://www.golfapi.io/api/v2.3/coordinates/${target.courseID}`, { headers });
        if (coordRes.ok) {
          const coordData = await coordRes.json();
          const gpsGrid = coordData.data || coordData;
          greenGrid = gpsGrid.greens || [];
          bunkerGrid = gpsGrid.bunkers || [];
          waterGrid = gpsGrid.water || [];
        }

        if (exactLat !== 0 && exactLng !== 0) {
          await db.collection("courses").doc(target.docId).set({
            latitude: exactLat, longitude: exactLng,
            lat: exactLat, lng: exactLng,
            greenCoordinates: greenGrid, 
            bunkerCoordinates: bunkerGrid, 
            waterCoordinates: waterGrid,
            apiImported: true, 
            cachedAt: new Date().toISOString()
          }, { merge: true });
          
          healedCount++;
          console.log(`✅ HEALED: ${target.clubName}`);
        } else {
          // 🛑 QUARANTINE: Mark as un-healable to save API quota
          await db.collection("courses").doc(target.docId).set({
            requiresManualGPS: true,
            lastHealAttempt: new Date().toISOString()
          }, { merge: true });
          console.log(`🛑 QUARANTINED: ${target.clubName} (No API Data)`);
        }
      } catch (err: any) {
        console.error(`❌ FAILED on ${target.courseID}:`, err.message);
        // Also quarantine on hard crash
        await db.collection("courses").doc(target.docId).set({
          requiresManualGPS: true,
          lastHealAttempt: new Date().toISOString()
        }, { merge: true });
      }

      if (i < coursesToProcess.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }

    console.log(`🏁 NIGHTLY HEALER COMPLETE. Restored ${healedCount} courses.`);
  } catch (error) {
    console.error("❌ CRITICAL HEALER FAILURE:", error);
  }
});

// ==========================================
// 🧹 THE WEEKLY JANITOR (Runs every Sunday at 4:00 AM)
// ==========================================
export const weeklyVaultJanitor = onSchedule({
  schedule: "0 4 * * 0",
  timeZone: "Asia/Bangkok",
  memory: "512MiB"
}, async (event) => {
  console.log("🧹 WEEKLY JANITOR: Initializing deduplication sweep...");

  try {
    const snapshot = await db.collection("courses").get();
    const allCourses = snapshot.docs.map(doc => ({ docId: doc.id, ...(doc.data() as any) }));

    const seenClubs = new Set();
    const duplicatesToDelete: string[] = [];

    for (const course of allCourses as any[]) {
      const identifier = course.clubID || course.clubName;
      if (!identifier) continue;

      if (seenClubs.has(identifier)) {
        duplicatesToDelete.push(course.docId);
      } else {
        seenClubs.add(identifier);
      }
    }

    console.log(`⚠️ Janitor found ${duplicatesToDelete.length} duplicates to purge.`);
    if (duplicatesToDelete.length === 0) return;

    const batches = [];
    let currentBatch = db.batch();
    let operationCount = 0;

    for (const docId of duplicatesToDelete) {
      const docRef = db.collection("courses").doc(docId);
      currentBatch.delete(docRef);
      operationCount++;

      if (operationCount === 490) { 
        batches.push(currentBatch.commit());
        currentBatch = db.batch();
        operationCount = 0;
      }
    }

    if (operationCount > 0) {
      batches.push(currentBatch.commit());
    }

    await Promise.all(batches);
    console.log(`🏁 WEEKLY JANITOR COMPLETE. Vault optimized.`);
  } catch (error) {
    console.error("❌ CRITICAL JANITOR FAILURE:", error);
  }
});

// ==========================================
// 🏦 CENTRAL BANK: Hourly Treasury Reconciliation Sweep
// ==========================================
export const hourlyTreasurySweep = onSchedule({
  schedule: "0 * * * *", // Runs at minute 0 of every hour
  timeZone: "Asia/Bangkok",
  memory: "512MiB"
}, async (event) => {
  logger.info("🏦 CENTRAL BANK: Starting hourly reconciliation sweep...");

  try {
    // 1. Sweep the entire transaction vault
    const snap = await db.collection('transactions').get();

    let totalFiat = 0;
    let totalEscrow = 0;
    let totalVelocity = 0;

    // 2. Mathematically rebuild the global economy from scratch
    snap.docs.forEach(doc => {
      const data = doc.data();

      if (data.type === 'PHYSICAL_GOODS_PURCHASE' && data.product?.fiatPriceUsd) {
        totalFiat += data.product.fiatPriceUsd;
      }
      if (data.status === 'escrow_locked' && data.amount) {
        totalEscrow += Math.abs(data.amount);
      }
      if (data.status === 'completed' && data.amount) {
        totalVelocity += data.amount;
      }
    });

    // 3. Lock the audited numbers into the Master Treasury HUD
    await db.collection('platform').doc('treasury').set({
      totalFiatVolumeUsd: totalFiat,
      totalEscrowLocked: totalEscrow,
      netChipVelocity: totalVelocity,
      lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      reconciliationCount: snap.size
    }, { merge: true });

    logger.info(`✅ TREASURY RECONCILED: Fiat($${totalFiat}) Escrow(${totalEscrow}) Velocity(${totalVelocity}) from ${snap.size} records.`);
  } catch (error) {
    logger.error("❌ TREASURY SWEEP FAILED:", error);
  }
});

// ==========================================
// 💳 STRIPE B2B PAYMENT WEBHOOK
// ==========================================

export const stripeB2BWebhook = onRequest({ 
  cors: true,
  secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET]
}, async (req, res) => {
  const stripe = new Stripe(STRIPE_SECRET_KEY.value(), {
    apiVersion: "2026-06-24.dahlia" as any, 
  });
  const endpointSecret = STRIPE_WEBHOOK_SECRET.value();

  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.rawBody, sig as string, endpointSecret);
  } catch (err: any) {
    logger.error("🚨 Webhook signature verification failed.", err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    
    // 🔥 1. Pull the EXACT partner ID we injected into the frontend URL (Fallback to email just in case)
    const partnerId = session.client_reference_id || session.customer_details?.email;
    
    // 🔥 2. Extract Metadata from the Payment Link
    const metadata = session.metadata || {};
    const tier = metadata.tier || "small_business";
    const duration = metadata.duration || "monthly";

    if (partnerId) {
      try {
        const now = new Date();
        const contractStartDate = now.toISOString();
        
        // 🔥 3. DATE ENGINE: Mathematically calculating the exact expiration
        const expDate = new Date(now);
        if (duration === "6_months") expDate.setMonth(expDate.getMonth() + 6);
        else if (duration === "1_year") expDate.setFullYear(expDate.getFullYear() + 1);
        else expDate.setMonth(expDate.getMonth() + 1); // Default to Monthly
        
        const contractEndDate = expDate.toISOString();

        // 🔥 4. BADGE ENGINE
        const badge = tier === "enterprise" ? "verified_enterprise" : null;

        // 🔥 5. Execute the Multi-Schema Auto-Onboarding via Batch Write
        const batch = db.batch();

        // A. Create/Update the Corporate Contract in b2b_partners
        const partnerRef = db.collection("b2b_partners").doc(partnerId);
        batch.set(partnerRef, {
          tier: tier,
          status: "active_partner",
          partnerBadge: badge,
          contractDuration: duration,
          contractStartDate: contractStartDate,
          contractEndDate: contractEndDate,
          payment_date: admin.firestore.FieldValue.serverTimestamp(),
          stripe_session_id: session.id,
        }, { merge: true });

        // B. Upgrade the Player Profile & Mint 10k Initial Chips in users
        const userRef = db.collection("users").doc(partnerId);
        batch.set(userRef, {
          tier: "commercial",
          chips: admin.firestore.FieldValue.increment(10000)
        }, { merge: true });

        // C. Stamp the Immutable Ledger in transactions
        const txRef = db.collection("transactions").doc();
        batch.set(txRef, {
          userId: partnerId,
          title: `Stripe Auto-Onboarding: ${tier.toUpperCase()} Tier + 10k Chips`,
          amount: 10000,
          type: "STRIPE_AUTO_ONBOARD",
          status: "completed",
          enforcedBy: "SYSTEM",
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        await batch.commit();

        logger.info(`✅ Successfully auto-onboarded B2B contract & minted chips for ${partnerId}`);
      } catch (error) {
        logger.error("🚨 Error saving partner to Firestore", error);
      }
    }
  }

  res.status(200).send({ received: true });
});

// ==========================================
// 👔 HR MANAGEMENT: Secure Employee Provisioning
// ==========================================
export const inviteEmployee = onCall({ memory: "256MiB" }, async (request) => {
  // 1. SECURITY GATE: Ensure the person making this request is logged in
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError('unauthenticated', 'You must be logged in.');
  }

  const callerUid = request.auth.uid;
  const { email, displayName, role } = request.data || {};

  try {
    // 2. MASTER GATE: Ensure the caller is actually the Director
    const callerDoc = await db.collection('admin_users').doc(callerUid).get();
    if (!callerDoc.exists || callerDoc.data()?.role !== 'Director') {
      throw new HttpsError('permission-denied', 'Only the Director can hire staff.');
    }

    // 3. Generate a secure temporary password (e.g., Golfriend-123456!)
    const tempPassword = `Golfriend-${Math.floor(100000 + Math.random() * 900000)}!`;

    // 4. Create the Firebase Auth Account
    const userRecord = await admin.auth().createUser({
      email: email,
      password: tempPassword,
      displayName: displayName,
    });

    // 5. Stamp the Official Role into the admin_users Vault
    await db.collection('admin_users').doc(userRecord.uid).set({
      email: email,
      name: displayName,
      role: role, // e.g., 'Manager', 'Support'
      status: 'Active',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: callerUid
    });

    // 6. Return the temporary password to the UI
    return { 
      success: true, 
      uid: userRecord.uid, 
      tempPassword: tempPassword 
    };

  } catch (error: any) {
    logger.error("HR Management Error:", error);
    throw new HttpsError('internal', error.message);
  }
});

// ==========================================
// 💳 B2B CONTRACT CANCELLATION (Server-Authoritative Downgrade)
// ==========================================
// Clients MUST NOT write authoritative tier/badge/contract/settlement state.
// This callable is the sole path for the "Break Contract" / cancellation flow
// in WalletSettings. It mirrors the settlement authority of stripeB2BWebhook,
// but is self-scoped: a caller can only cancel their OWN contract, resolved
// from their authenticated identity (never a client-supplied id).
export const cancelB2BContract = onCall({ memory: "256MiB" }, async (request) => {
  // 1. SECURITY GATE: Must be authenticated.
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError('unauthenticated', 'You must be logged in.');
  }

  const callerUid = request.auth.uid;
  const callerEmail = (request.auth.token?.email || "").toLowerCase();

  try {
    // 2. RESOLVE the caller's own contract document. b2b_partners is keyed by
    //    uid OR email (see the onboarding webhook + auth listener), so we probe
    //    the same identities — but ONLY identities that belong to the caller.
    const candidateIds = [callerUid];
    if (callerEmail) {
      candidateIds.push(callerEmail);
      const capitalized = callerEmail.charAt(0).toUpperCase() + callerEmail.slice(1);
      candidateIds.push(capitalized);
    }

    let partnerRef: admin.firestore.DocumentReference | null = null;
    let partnerData: admin.firestore.DocumentData | null = null;
    for (const id of candidateIds) {
      const ref = db.collection('b2b_partners').doc(id);
      const snap = await ref.get();
      if (snap.exists) {
        partnerRef = ref;
        partnerData = snap.data() || {};
        break;
      }
    }

    if (!partnerRef || !partnerData) {
      throw new HttpsError('not-found', 'No active commercial contract found for this account.');
    }

    // 3. GUARD: Only locked-in (non-monthly) contracts can be "broken". A
    //    standard monthly account has nothing to cancel — reject rather than
    //    silently no-op, so the UI never misrepresents state.
    const currentDuration = partnerData.contractDuration || 'monthly';
    if (currentDuration === 'monthly') {
      throw new HttpsError('failed-precondition', 'This account is already on a standard monthly cycle; there is no locked-in contract to cancel.');
    }

    const previousTier = partnerData.tier || 'small_business';

    // 4. SETTLEMENT: Revoke tier/badge/contract and record the penalty. Written
    //    with the Admin SDK so it is authoritative and audit-stamped by SYSTEM.
    const batch = db.batch();

    batch.set(partnerRef, {
      tier: 'small_business',
      partnerBadge: null,
      contractDuration: 'monthly',
      contractStartDate: null,
      contractEndDate: null,
      penaltyApplied: true,
      status: 'active_partner',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    // Downgrade the linked player profile out of the commercial role. Keyed by
    // uid (the users collection is uid-keyed in the onboarding webhook).
    const userRef = db.collection('users').doc(callerUid);
    batch.set(userRef, {
      tier: 'standard',
    }, { merge: true });

    // Stamp the immutable audit ledger, mirroring the onboarding transaction.
    const txRef = db.collection('transactions').doc();
    batch.set(txRef, {
      userId: partnerRef.id,
      title: `B2B Contract Cancellation: ${previousTier.toUpperCase()} (${currentDuration}) → SMALL_BUSINESS (monthly)`,
      amount: 0,
      type: 'B2B_CONTRACT_CANCELLATION',
      status: 'completed',
      enforcedBy: 'SYSTEM',
      penaltyApplied: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await batch.commit();

    logger.info(`✅ B2B contract cancelled & downgraded for ${partnerRef.id} (was ${previousTier}/${currentDuration}).`);

    return {
      success: true,
      tier: 'small_business',
      contractDuration: 'monthly',
      partnerBadge: null,
    };
  } catch (error: any) {
    if (error instanceof HttpsError) throw error;
    logger.error("🚨 B2B contract cancellation failed:", error);
    throw new HttpsError('internal', error.message || 'Cancellation failed.');
  }
});

// ==========================================
// 🔒 ESCROW RESOLUTION (Server-Authoritative Settlement)
// ==========================================
// Resolving an escrow moves money (marks the hold + credits chips on refund).
// Clients must not finalize settlement state or choose the amount/recipient.
// This callable is the sole path: Director-only, derives uid/amount from the
// authoritative ledger doc (never the client), and resolves atomically & once
// (guards on status === 'escrow_locked') so a double-click or REFUND-then-PAYOUT
// cannot double-settle. A refund credit is stamped as its own audited ledger tx.
export const resolveEscrow = onCall({ memory: "256MiB" }, async (request) => {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError('unauthenticated', 'You must be logged in.');
  }

  const callerUid = request.auth.uid;
  const callerEmail = (request.auth.token?.email || "").toLowerCase();
  const { txId, resolution } = request.data || {};

  if (!txId || typeof txId !== 'string') {
    throw new HttpsError('invalid-argument', 'An escrow transaction id is required.');
  }
  if (resolution !== 'REFUND' && resolution !== 'PAYOUT') {
    throw new HttpsError('invalid-argument', 'Resolution must be REFUND or PAYOUT.');
  }

  // AUTHORIZATION: Director only. Accept the admin_users Director role (see
  // inviteEmployee) or the platform God-Mode identity used by the admin gate.
  const adminSnap = await db.collection('admin_users').doc(callerUid).get();
  const isDirector = adminSnap.exists && adminSnap.data()?.role === 'Director';
  const isGodMode = callerEmail === 'admin@golfriend.co';
  if (!isDirector && !isGodMode) {
    throw new HttpsError('permission-denied', 'Only the Director can resolve escrow holds.');
  }

  const txRef = db.collection('transactions').doc(txId);
  const refundTxRef = db.collection('transactions').doc(`escrow_refund_${txId}`);

  try {
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(txRef);
      if (!snap.exists) {
        throw new HttpsError('not-found', 'Escrow transaction not found.');
      }
      const data = snap.data() || {};
      // Idempotency / once-only guard: only an actively locked hold can resolve.
      if (data.status !== 'escrow_locked') {
        throw new HttpsError('failed-precondition', `Escrow is not locked (current status: ${data.status || 'unknown'}); it may already be resolved.`);
      }

      // Server-truth uid/amount from the ledger — never from the client.
      const uid = data.uid;
      const amount = Math.abs(Number(data.amount || 0));
      if (!uid) {
        throw new HttpsError('failed-precondition', 'Escrow record is missing an owner uid.');
      }

      // 1. Resolve the hold in the ledger.
      tx.update(txRef, {
        status: resolution === 'REFUND' ? 'failed' : 'completed',
        resolvedBy: 'DIRECTOR_OVERRIDE',
        resolvedByUid: callerUid,
        resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // 2. On refund, return the held chips to the buyer + stamp an audited tx.
      if (resolution === 'REFUND' && amount > 0) {
        const userRef = db.collection('users').doc(uid);
        tx.set(userRef, {
          chips: admin.firestore.FieldValue.increment(amount),
        }, { merge: true });

        tx.set(refundTxRef, {
          userId: uid,
          title: `Escrow Refund (hold ${txId})`,
          amount: amount,
          type: 'ESCROW_REFUND',
          status: 'completed',
          enforcedBy: 'SYSTEM',
          resolvedByUid: callerUid,
          sourceEscrowId: txId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      return { uid, amount, resolution };
    });

    logger.info(`🔒 Escrow ${txId} resolved via ${resolution} by ${callerUid} (uid ${result.uid}, amount ${result.amount}).`);
    return { success: true, ...result };
  } catch (error: any) {
    if (error instanceof HttpsError) throw error;
    logger.error("🔒 Escrow resolution failed:", error);
    throw new HttpsError('internal', error.message || 'Escrow resolution failed.');
  }
});

// ==========================================
// 🚨 PLAYER INCIDENT REPORT (Server-Authoritative Moderation)
// ==========================================
// The Course GM "Report Damage" action adjusts another user's authoritative
// reliability/reputation and stamps a moderation badge. Clients must not write
// another user's moderation/reputation state directly, choose the penalty
// amount, or bypass audit. This callable is the sole path: it authorizes the
// reporter, fixes the penalty server-side, verifies the target actually played
// in the referenced game, applies the change atomically (floored), and is
// idempotent per (game, target, reporter) so a double-click cannot double-dock.
const INCIDENT_PENALTY = 25; // Server-fixed; the client cannot influence this.

export const reportPlayerIncident = onCall({ memory: "256MiB" }, async (request) => {
  // 1. SECURITY GATE: Must be authenticated.
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError('unauthenticated', 'You must be logged in.');
  }

  const reporterUid = request.auth.uid;
  const reporterEmail = (request.auth.token?.email || "").toLowerCase();
  const { targetUid, gameId, reason } = request.data || {};

  if (!targetUid || typeof targetUid !== 'string') {
    throw new HttpsError('invalid-argument', 'A target player is required.');
  }
  if (!gameId || typeof gameId !== 'string') {
    throw new HttpsError('invalid-argument', 'A game/flight reference is required.');
  }
  if (targetUid === reporterUid) {
    throw new HttpsError('failed-precondition', 'You cannot report yourself.');
  }
  const safeReason = typeof reason === 'string' ? reason.slice(0, 500) : 'Course GM incident report';

  // 2. AUTHORIZATION: reporter must be platform staff (admin_users) OR an active
  //    commercial partner/course operator (b2b_partners keyed by uid/email).
  const candidateIds = [reporterUid];
  if (reporterEmail) {
    candidateIds.push(reporterEmail);
    candidateIds.push(reporterEmail.charAt(0).toUpperCase() + reporterEmail.slice(1));
  }

  let authorized = false;
  const adminSnap = await db.collection('admin_users').doc(reporterUid).get();
  if (adminSnap.exists && adminSnap.data()?.status !== 'Suspended') {
    authorized = true;
  }
  if (!authorized) {
    for (const id of candidateIds) {
      const pSnap = await db.collection('b2b_partners').doc(id).get();
      if (pSnap.exists && pSnap.data()?.status === 'active_partner') {
        authorized = true;
        break;
      }
    }
  }
  if (!authorized) {
    throw new HttpsError('permission-denied', 'Only course operators or platform staff can report an incident.');
  }

  // 3. IDEMPOTENCY: deterministic incident id prevents accidental double penalty.
  const incidentId = `${gameId}__${targetUid}__${reporterUid}`;
  const incidentRef = db.collection('moderation_incidents').doc(incidentId);
  const userRef = db.collection('users').doc(targetUid);
  const gameRef = db.collection('games').doc(gameId);

  try {
    const result = await db.runTransaction(async (tx) => {
      const existing = await tx.get(incidentRef);
      if (existing.exists) {
        // Already recorded — return prior outcome without re-penalizing.
        return { alreadyReported: true, newReliability: existing.data()?.resultingReliability ?? null };
      }

      const gameSnap = await tx.get(gameRef);
      if (!gameSnap.exists) {
        throw new HttpsError('not-found', 'Referenced game/flight does not exist.');
      }
      const players = (gameSnap.data()?.players || []) as Array<{ uid?: string }>;
      const isParticipant = players.some((p) => p && p.uid === targetUid);
      if (!isParticipant) {
        throw new HttpsError('failed-precondition', 'That player is not part of the referenced flight.');
      }

      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) {
        throw new HttpsError('not-found', 'Target player profile not found.');
      }
      const current = Number(userSnap.data()?.reliability_score ?? 0);
      const newReliability = Math.max(0, current - INCIDENT_PENALTY);

      // Authoritative reputation/moderation write (floored, server-fixed penalty).
      tx.set(userRef, {
        reliability_score: newReliability,
        behavior_badge: 'Flagged by Course GM',
        requiresManualReview: true,
      }, { merge: true });

      // Immutable moderation ledger + idempotency marker in one record.
      tx.set(incidentRef, {
        gameId,
        targetUid,
        reporterUid,
        reporterEmail: reporterEmail || null,
        reason: safeReason,
        penalty: INCIDENT_PENALTY,
        previousReliability: current,
        resultingReliability: newReliability,
        enforcedBy: 'SYSTEM',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { alreadyReported: false, newReliability };
    });

    logger.info(`🚨 Incident recorded for ${targetUid} by ${reporterUid} (game ${gameId}). Already=${result.alreadyReported}.`);
    return { success: true, ...result };
  } catch (error: any) {
    if (error instanceof HttpsError) throw error;
    logger.error("🚨 Incident report failed:", error);
    throw new HttpsError('internal', error.message || 'Incident report failed.');
  }
});

// ==========================================
// 👁️ PHOTO WATCHTOWER: Automated Vision AI Gatekeeper
// ==========================================
export const photoWatchtower = functionsV1
  .runWith({ memory: "512MB" })
  .storage.object()
  .onFinalize(async (object) => {
  const filePath = object.name;
  const contentType = object.contentType;

  // 1. Only process images uploaded to the avatars directory
  if (!filePath || !filePath.startsWith('avatars/') || !contentType || !contentType.startsWith('image/')) {
    return;
  }

  // 🔥 THE FIX: Extract the UID (Handles both {uid}.jpg and {uid}_{timestamp}.jpg)
  const fileName = filePath.split('/').pop();
  if (!fileName) return;
  
  // 1. Remove the file extension (.jpeg, .png, etc.)
  const rawName = fileName.split('.')[0];
  
  // 2. Split by underscore and grab the first part, isolating the true UID
  const uid = rawName.split('_')[0]; 

  const bucketName = object.bucket;
  const imageUri = `gs://${bucketName}/${filePath}`;

  logger.info(`👁️ Watchtower scanning new avatar for UID: ${uid}`);

  try {
    // 2. Run Vision AI Analysis (Face Detection + Safe Search)
    const [result] = await visionClient.annotateImage({
      image: { source: { imageUri } },
      features: [
        { type: 'FACE_DETECTION', maxResults: 1 },
        { type: 'SAFE_SEARCH_DETECTION' }
      ]
    });

    const faces = result.faceAnnotations;
    const safeSearch = result.safeSearchAnnotation;

    if (!safeSearch) {
      logger.warn(`Watchtower failed to get safe search data for UID: ${uid}`);
      return;
    }

    // 3. Define Validation Logic
    const hasHumanFace = faces && faces.length > 0;
    const isSafe = 
      safeSearch.adult !== 'VERY_LIKELY' && 
      safeSearch.adult !== 'LIKELY' &&
      safeSearch.spoof !== 'VERY_LIKELY' && 
      safeSearch.spoof !== 'LIKELY' &&
      safeSearch.violence !== 'VERY_LIKELY' &&
      safeSearch.violence !== 'LIKELY';

    // 4. Update the User's Firestore Document
    const userRef = db.collection('users').doc(uid);

    if (hasHumanFace && isSafe) {
      await userRef.update({
        photoValidated: true,
        requiresManualReview: false,
        'reliabilityScore.photoBonus': true
      });
      logger.info(`✅ Avatar auto-approved for UID: ${uid}`);
    } else {
      await userRef.update({
        photoValidated: false,
        requiresManualReview: true,
        flagReason: !hasHumanFace ? 'NO_FACE_DETECTED' : 'SAFE_SEARCH_FLAGGED'
      });
      logger.warn(`🛑 Avatar flagged for manual review for UID: ${uid}. Reason: ${!hasHumanFace ? 'NO_FACE' : 'UNSAFE'}`);
    }
    
  } catch (error) {
    logger.error("Watchtower AI Vision Error:", error);
  }
});