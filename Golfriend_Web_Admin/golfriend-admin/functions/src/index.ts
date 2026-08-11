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
// 🏆 TOURNAMENT OPS: Server-Authoritative Registration + Flight State
// ==========================================
export const manageTournamentOps = onCall({ memory: "256MiB" }, async (request) => {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError('unauthenticated', 'You must be logged in.');
  }
  const callerUid = request.auth.uid;
  const callerEmail = (request.auth.token?.email || '').toLowerCase();
  const { tournamentId, action } = request.data || {};

  if (typeof tournamentId !== 'string' || !tournamentId.trim()) {
    throw new HttpsError('invalid-argument', 'A valid tournamentId is required.');
  }
  const VALID_ACTIONS = ['setDisplayState', 'setRegistration', 'resetFlights', 'assignFlights'];
  if (typeof action !== 'string' || !VALID_ACTIONS.includes(action)) {
    throw new HttpsError('invalid-argument', 'Unknown or missing action.');
  }

  try {
    const tournamentRef = db.collection('tournaments').doc(tournamentId);
    const tournamentSnap = await tournamentRef.get();
    if (!tournamentSnap.exists) {
      throw new HttpsError('not-found', 'Tournament not found.');
    }
    const tournamentData = tournamentSnap.data() || {};

    // AUTHORIZATION: platform staff OR God-Mode OR the tournament host.
    let authorized = false;
    const staffDoc = await db.collection('admin_users').doc(callerUid).get();
    if (staffDoc.exists && staffDoc.data()?.status !== 'Suspended') authorized = true;
    if (!authorized && callerEmail === 'admin@golfriend.co') authorized = true;
    if (!authorized && tournamentData.hostUid && tournamentData.hostUid === callerUid) authorized = true;
    if (!authorized) {
      throw new HttpsError('permission-denied', 'You are not authorized to manage this tournament.');
    }

    if (action === 'setDisplayState') {
      const { displayState } = request.data || {};
      if (typeof displayState !== 'string' || !displayState.trim()) {
        throw new HttpsError('invalid-argument', 'displayState must be a non-empty string.');
      }
      await tournamentRef.set({ displayState }, { merge: true });
    } else if (action === 'setRegistration') {
      const { status } = request.data || {};
      if (status !== 'registration_open' && status !== 'registration_closed') {
        throw new HttpsError('invalid-argument', 'Invalid registration status.');
      }
      await tournamentRef.set({ status }, { merge: true });
    } else if (action === 'resetFlights') {
      const regsSnap = await tournamentRef.collection('registrations').get();
      const docs = regsSnap.docs;
      for (let i = 0; i < docs.length; i += 450) {
        const batch = db.batch();
        docs.slice(i, i + 450).forEach((d) => {
          batch.update(d.ref, { flightNumber: null, status: 'waiting' });
        });
        await batch.commit();
      }
      await tournamentRef.set({ opBy: callerUid, opAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    } else if (action === 'assignFlights') {
      const { assignments } = request.data || {};
      if (!Array.isArray(assignments)) {
        throw new HttpsError('invalid-argument', 'assignments must be an array.');
      }
      const clean: { registrationId: string; flightNumber: number }[] = [];
      for (const a of assignments) {
        const registrationId = a?.registrationId;
        const flightNumber = a?.flightNumber;
        if (typeof registrationId !== 'string' || !registrationId.trim()) {
          throw new HttpsError('invalid-argument', 'Each assignment needs a non-empty registrationId.');
        }
        if (typeof flightNumber !== 'number' || !Number.isInteger(flightNumber) || flightNumber <= 0) {
          throw new HttpsError('invalid-argument', 'Each assignment needs a positive integer flightNumber.');
        }
        clean.push({ registrationId, flightNumber });
      }
      for (let i = 0; i < clean.length; i += 450) {
        const batch = db.batch();
        clean.slice(i, i + 450).forEach(({ registrationId, flightNumber }) => {
          const pRef = tournamentRef.collection('registrations').doc(registrationId);
          batch.update(pRef, { flightNumber, status: 'locked' });
        });
        await batch.commit();
      }
      await tournamentRef.set({ opBy: callerUid, opAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    }

    return { success: true, action };
  } catch (error: any) {
    if (error instanceof HttpsError) throw error;
    logger.error("Tournament Ops Error:", error);
    throw new HttpsError('internal', error?.message || 'Failed to manage tournament ops.');
  }
});

// ==========================================
// 📸 PHOTO VALIDATION RESOLVER (Server-Authoritative Wallet/Reputation/Moderation)
// ==========================================
// Manual photo approve/reject adjusts chips + reliability + verification/moderation
// on another user — settlement + moderation state that must not be client-written.
// Staff-gated; fixed server-side deltas floored at 0; audited.
export const resolvePhotoValidation = onCall({ memory: "256MiB" }, async (request) => {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError('unauthenticated', 'You must be logged in.');
  }
  const callerUid = request.auth.uid;

  try {
    const callerEmail = (request.auth.token?.email || '').toLowerCase();
    const callerDoc = await db.collection('admin_users').doc(callerUid).get();
    const isActiveStaff = callerDoc.exists && callerDoc.data()?.status !== 'Suspended';
    const isMasterAdmin = callerEmail === 'admin@golfriend.co';
    if (!isActiveStaff && !isMasterAdmin) {
      throw new HttpsError('permission-denied', 'Only active platform staff may resolve photo validations.');
    }

    const { targetUid, decision, source } = request.data || {};
    if (typeof targetUid !== 'string' || targetUid.trim() === '') {
      throw new HttpsError('invalid-argument', 'A valid targetUid is required.');
    }
    if (decision !== 'approve' && decision !== 'reject') {
      throw new HttpsError('invalid-argument', "decision must be 'approve' or 'reject'.");
    }
    const resolvedSource = source === undefined ? 'review' : source;
    if (resolvedSource !== 'review' && resolvedSource !== 'override') {
      throw new HttpsError('invalid-argument', "source must be 'review' or 'override'.");
    }

    const userRef = db.collection('users').doc(targetUid);
    const txRef = db.collection('transactions').doc();

    const result = await db.runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) {
        throw new HttpsError('not-found', 'Target user does not exist.');
      }
      const data = userSnap.data() || {};
      const currentChips = typeof data.chips === 'number' ? data.chips : 0;
      const currentRel = typeof data.reliability_score === 'number' ? data.reliability_score : 0;

      const chipsDelta = decision === 'approve' ? 50 : -50;
      const relDelta = decision === 'approve' ? 10 : -25;
      const newChips = Math.max(0, currentChips + chipsDelta);
      const newRel = Math.max(0, currentRel + relDelta);
      const appliedChipsDelta = newChips - currentChips;

      if (decision === 'approve') {
        tx.update(userRef, {
          isVerified: true, verification_status: 'verified', photoValidated: true,
          requiresManualReview: false, behavior_badge: 'Verified Member',
          star_rating_display: 'New Member', chips: newChips, reliability_score: newRel,
        });
      } else {
        tx.update(userRef, {
          isVerified: false, verification_status: 'rejected', photoValidated: false,
          requiresManualReview: false, behavior_badge: 'Flagged: Invalid Photo',
          photo_url: '', chips: newChips, reliability_score: newRel,
        });
      }

      tx.set(txRef, {
        userId: targetUid, type: 'PHOTO_VALIDATION', amount: appliedChipsDelta,
        status: 'completed', enforcedBy: 'SYSTEM', resolvedByUid: callerUid,
        decision, source: resolvedSource,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { newChips, newRel };
    });

    return { success: true, decision, chips: result.newChips, reliability_score: result.newRel };
  } catch (error: any) {
    if (error instanceof HttpsError) throw error;
    logger.error("Photo Validation Resolver Error:", error);
    throw new HttpsError('internal', error.message || 'Photo validation failed.');
  }
});

// ==========================================
// 🚚 FULFILLMENT LEDGER: Server-Authoritative Order Lifecycle
// ==========================================
export const updateFulfillmentOrder = onCall({ memory: "256MiB" }, async (request) => {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError('unauthenticated', 'You must be logged in.');
  }
  const callerUid = request.auth.uid;
  const callerEmail = (request.auth.token?.email || '').toLowerCase();
  const { orderId, action, courier, tracking } = request.data || {};

  try {
    const callerDoc = await db.collection('admin_users').doc(callerUid).get();
    const isActiveStaff = callerDoc.exists && callerDoc.data()?.status !== 'Suspended';
    if (!isActiveStaff && callerEmail !== 'admin@golfriend.co') {
      throw new HttpsError('permission-denied', 'You are not authorized to manage fulfillment orders.');
    }
    if (typeof orderId !== 'string' || orderId.trim() === '') {
      throw new HttpsError('invalid-argument', 'A valid orderId is required.');
    }
    if (action !== 'dispatch' && action !== 'confirmShipment') {
      throw new HttpsError('invalid-argument', 'action must be "dispatch" or "confirmShipment".');
    }

    const orderRef = db.collection('fulfillment_orders').doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
      throw new HttpsError('not-found', 'Fulfillment order does not exist.');
    }
    const order = orderSnap.data() || {};
    const currentStatus = order.status;
    let newStatus: string;

    if (action === 'dispatch') {
      if (currentStatus === 'shipped' || currentStatus === 'delivered' || currentStatus === 'awaiting_vendor') {
        throw new HttpsError('failed-precondition', `Order cannot be dispatched from status "${currentStatus}".`);
      }
      newStatus = 'shipped';
      const vendorId = order.vendorId;
      if (typeof vendorId === 'string' && vendorId.trim() !== '') {
        const vendorSnap = await db.collection('vendors').doc(vendorId).get();
        if (vendorSnap.exists) {
          const protocol = vendorSnap.data()?.fulfillmentProtocol;
          if (protocol === 'email_manifest' || protocol === 'daily_csv') newStatus = 'awaiting_vendor';
        }
      }
      await orderRef.set({
        status: newStatus, dispatchedByUid: callerUid,
        dispatchedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    } else {
      if (typeof courier !== 'string' || courier.trim() === '' || typeof tracking !== 'string' || tracking.trim() === '') {
        throw new HttpsError('invalid-argument', 'Both courier and tracking are required.');
      }
      newStatus = 'shipped';
      await orderRef.set({
        status: newStatus, courier, trackingNumber: tracking, shippedByUid: callerUid,
        shippedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    return { success: true, status: newStatus };
  } catch (error: any) {
    if (error instanceof HttpsError) throw error;
    logger.error("Fulfillment Ledger Error:", error);
    throw new HttpsError('internal', error.message || 'Fulfillment update failed.');
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