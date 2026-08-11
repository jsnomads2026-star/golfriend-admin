import { onSchedule } from "firebase-functions/v2/scheduler";
import { onRequest, onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import * as functionsV1 from "firebase-functions/v1"; // 🔥 Explicitly target v1
import Stripe from "stripe";
import vision from "@google-cloud/vision"; // 🔥 ADDED
import { classifyCourseSync, isValidProviderId, type ProviderCourse } from "./courseSync.js";

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
// 🏳️ COURSE OPERATOR ONBOARDING (Server-Authoritative Claim)
// ==========================================
// Small-business portal onboarding: an active commercial partner claims the
// course they operate, which authorizes them to author that course's tee-time
// availability/pricing (see manageTeeTimeSlot). Operator assignment is a role
// grant, so it is server-owned: the client cannot self-assign, claim a course
// that does not exist, or seize a course already operated by someone else.
export const claimCourseOperator = onCall({ memory: "256MiB" }, async (request) => {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError('unauthenticated', 'You must be logged in.');
  }

  const callerUid = request.auth.uid;
  const callerEmail = (request.auth.token?.email || "").toLowerCase();
  const { courseId } = request.data || {};

  if (!courseId || typeof courseId !== 'string') {
    throw new HttpsError('invalid-argument', 'A courseId is required.');
  }

  // Caller must be an active commercial partner (b2b_partners keyed by uid/email).
  const candidateIds = [callerUid];
  if (callerEmail) {
    candidateIds.push(callerEmail);
    candidateIds.push(callerEmail.charAt(0).toUpperCase() + callerEmail.slice(1));
  }
  let partnerId: string | null = null;
  for (const id of candidateIds) {
    const pSnap = await db.collection('b2b_partners').doc(id).get();
    if (pSnap.exists && pSnap.data()?.status === 'active_partner') {
      partnerId = id;
      break;
    }
  }
  if (!partnerId) {
    throw new HttpsError('permission-denied', 'Only an active commercial partner can onboard a course.');
  }

  // Course must exist in the vault.
  const courseSnap = await db.collection('courses').doc(courseId).get();
  if (!courseSnap.exists) {
    throw new HttpsError('not-found', 'Referenced course is not in the vault.');
  }
  const cData = courseSnap.data() || {};
  const courseName = cData.clubName || cData.name || courseId;

  const opRef = db.collection('course_operators').doc(courseId);
  const partnerRef = db.collection('b2b_partners').doc(partnerId);

  try {
    await db.runTransaction(async (tx) => {
      const opSnap = await tx.get(opRef);
      if (opSnap.exists && opSnap.data()?.operatorUid !== callerUid) {
        throw new HttpsError('already-exists', 'This course is already operated by another partner. Contact platform staff to reassign.');
      }
      tx.set(opRef, {
        courseId,
        courseName,
        operatorUid: callerUid,
        operatorPartnerId: partnerId,
        claimedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      // Denormalize onto the partner doc for quick portal listing.
      tx.set(partnerRef, {
        operatedCourseIds: admin.firestore.FieldValue.arrayUnion(courseId),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    });

    logger.info(`🏳️ Course ${courseId} claimed by operator ${callerUid} (partner ${partnerId}).`);
    return { success: true, courseId, courseName };
  } catch (error: any) {
    if (error instanceof HttpsError) throw error;
    logger.error("🏳️ Course claim failed:", error);
    throw new HttpsError('internal', error.message || 'Course claim failed.');
  }
});

// ==========================================
// ⛳ TEE-TIME INVENTORY (Server-Authoritative Supply)
// ==========================================
// Admin course/tee-time inventory management. Tee-time slots are the bookable
// supply that the portal booking flow consumes, so capacity and the booked
// counter are settlement-adjacent and must be server-owned: the client may not
// write slots directly, invent capacity/price, or attach a slot to a course
// that does not exist. This callable is the sole authoring path — staff-gated,
// validated against the real `courses` vault, deduped per (course,date,time),
// and it initializes bookedCount server-side so later booking transactions have
// an authoritative counter to increment.
export const manageTeeTimeSlot = onCall({ memory: "256MiB" }, async (request) => {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError('unauthenticated', 'You must be logged in.');
  }

  const callerUid = request.auth.uid;
  const callerEmail = (request.auth.token?.email || "").toLowerCase();

  // AUTHORIZATION: platform staff (any non-suspended admin_users) or God-Mode
  // may manage any course; otherwise the caller must be the claimed operator of
  // the specific course being touched (partner-scoped self-service authoring).
  const adminSnap = await db.collection('admin_users').doc(callerUid).get();
  const isStaff = adminSnap.exists && adminSnap.data()?.status !== 'Suspended';
  const isGodMode = callerEmail === 'admin@golfriend.co';
  const isPrivileged = isStaff || isGodMode;

  const assertCourseOperator = async (cid: string) => {
    const opSnap = await db.collection('course_operators').doc(cid).get();
    if (!opSnap.exists || opSnap.data()?.operatorUid !== callerUid) {
      throw new HttpsError('permission-denied', 'You do not operate this course.');
    }
  };

  const { action } = request.data || {};

  // ---- ACTION: create a bookable tee-time slot ----
  if (action === 'create') {
    const { courseId, date, time, capacity, priceChips } = request.data || {};

    if (!courseId || typeof courseId !== 'string') {
      throw new HttpsError('invalid-argument', 'A courseId is required.');
    }
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new HttpsError('invalid-argument', 'date must be YYYY-MM-DD.');
    }
    if (typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      throw new HttpsError('invalid-argument', 'time must be HH:mm (24h).');
    }
    // Reject slots in the past (date-only granularity, UTC day).
    const today = new Date().toISOString().slice(0, 10);
    if (date < today) {
      throw new HttpsError('failed-precondition', 'Cannot create a tee-time in the past.');
    }
    const cap = Number(capacity);
    if (!Number.isInteger(cap) || cap < 1 || cap > 8) {
      throw new HttpsError('invalid-argument', 'capacity must be an integer from 1 to 8.');
    }
    const price = Number(priceChips);
    if (!Number.isInteger(price) || price < 0) {
      throw new HttpsError('invalid-argument', 'priceChips must be a non-negative integer.');
    }

    // The slot must reference a real course in the vault (no invented inventory).
    const courseSnap = await db.collection('courses').doc(courseId).get();
    if (!courseSnap.exists) {
      throw new HttpsError('not-found', 'Referenced course is not in the vault.');
    }
    const cData = courseSnap.data() || {};
    const courseName = cData.clubName || cData.name || courseId;

    // Non-staff callers may only author for a course they operate.
    if (!isPrivileged) await assertCourseOperator(courseId);

    // Deterministic id → dedupe identical (course,date,time) slots.
    const slotId = `${courseId}_${date}_${time.replace(':', '')}`;
    const slotRef = db.collection('tee_time_slots').doc(slotId);

    const created = await db.runTransaction(async (tx) => {
      const existing = await tx.get(slotRef);
      if (existing.exists) {
        throw new HttpsError('already-exists', 'A tee-time slot for this course, date and time already exists.');
      }
      tx.set(slotRef, {
        courseId,
        courseName,
        date,
        time,
        capacity: cap,
        bookedCount: 0,          // server-owned; booking transactions increment this
        priceChips: price,
        status: 'open',
        createdByUid: callerUid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return { slotId };
    });

    logger.info(`⛳ Tee-time slot ${created.slotId} created by ${callerUid}.`);
    return { success: true, slotId: created.slotId };
  }

  // ---- ACTION: open/close an existing slot ----
  if (action === 'setStatus') {
    const { slotId, status } = request.data || {};
    if (!slotId || typeof slotId !== 'string') {
      throw new HttpsError('invalid-argument', 'A slotId is required.');
    }
    if (status !== 'open' && status !== 'closed') {
      throw new HttpsError('invalid-argument', 'status must be open or closed.');
    }
    const slotRef = db.collection('tee_time_slots').doc(slotId);
    const snap = await slotRef.get();
    if (!snap.exists) {
      throw new HttpsError('not-found', 'Tee-time slot not found.');
    }
    // Non-staff callers may only toggle slots for a course they operate.
    if (!isPrivileged) await assertCourseOperator(snap.data()?.courseId);
    await slotRef.set({
      status,
      updatedByUid: callerUid,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    logger.info(`⛳ Tee-time slot ${slotId} set to ${status} by ${callerUid}.`);
    return { success: true, slotId, status };
  }

  throw new HttpsError('invalid-argument', 'Unknown action. Use "create" or "setStatus".');
});

// ==========================================
// 📅 BOOKING LIFECYCLE (Server-Authoritative Request → Confirm/Reject)
// ==========================================
// The Golfriend booking flow: a player requests a published tee-time, the course
// operator confirms or rejects, and the player sees a localized status. Seats and
// funds are settlement state, so the whole lifecycle is server-owned:
//  - no double-book: bookedCount is checked against capacity in a transaction;
//  - the price is held in escrow (transactions/escrow_locked) at request time,
//    settled on confirm and refunded on reject — never a direct client wallet write;
//  - each booking carries a userStatusKey the client localizes.

// Player requests a booking for an open tee-time slot.
export const requestBooking = onCall({ memory: "256MiB" }, async (request) => {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError('unauthenticated', 'You must be logged in to book.');
  }
  const playerUid = request.auth.uid;
  const { slotId } = request.data || {};
  if (!slotId || typeof slotId !== 'string') {
    throw new HttpsError('invalid-argument', 'A slotId is required.');
  }

  const slotRef = db.collection('tee_time_slots').doc(slotId);
  const userRef = db.collection('users').doc(playerUid);
  const bookingId = `${slotId}__${playerUid}`;
  const bookingRef = db.collection('bookings').doc(bookingId);
  const holdRef = db.collection('transactions').doc(`booking_hold_${bookingId}`);

  try {
    const out = await db.runTransaction(async (tx) => {
      const slotSnap = await tx.get(slotRef);
      if (!slotSnap.exists) throw new HttpsError('not-found', 'Tee-time slot not found.');
      const slot = slotSnap.data() || {};
      if (slot.status !== 'open') throw new HttpsError('failed-precondition', 'This tee-time is not open for booking.');
      const capacity = Number(slot.capacity || 0);
      const bookedCount = Number(slot.bookedCount || 0);
      if (bookedCount >= capacity) throw new HttpsError('failed-precondition', 'This tee-time is fully booked.');

      const existing = await tx.get(bookingRef);
      if (existing.exists && ['pending', 'confirmed'].includes(existing.data()?.status)) {
        throw new HttpsError('already-exists', 'You already have an active booking for this tee-time.');
      }

      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) throw new HttpsError('not-found', 'Player profile not found.');
      const uData = userSnap.data() || {};
      const price = Number(slot.priceChips || 0);
      const chips = Number(uData.chips || 0);
      if (price > 0 && chips < price) {
        throw new HttpsError('failed-precondition', 'Insufficient chips to hold this booking.');
      }

      // Reserve the seat.
      tx.set(slotRef, { bookedCount: bookedCount + 1, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });

      // Hold the price in escrow (never settle on the client).
      if (price > 0) {
        tx.set(userRef, { chips: chips - price }, { merge: true });
        tx.set(holdRef, {
          uid: playerUid,
          amount: -price,
          status: 'escrow_locked',
          type: 'BOOKING_HOLD',
          bookingId,
          slotId,
          enforcedBy: 'SYSTEM',
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }

      // Create the booking in a pending state.
      tx.set(bookingRef, {
        slotId,
        courseId: slot.courseId || '',
        courseName: slot.courseName || slot.courseId || '',
        date: slot.date || '',
        time: slot.time || '',
        playerUid,
        playerName: uData.nickname || uData.name || 'Player',
        priceChips: price,
        status: 'pending',
        userStatusKey: 'booking_pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      return { bookingId, status: 'pending', priceHeld: price };
    });

    logger.info(`📅 Booking ${out.bookingId} requested by ${playerUid} (held ${out.priceHeld}).`);
    return { success: true, ...out };
  } catch (error: any) {
    if (error instanceof HttpsError) throw error;
    logger.error("📅 Booking request failed:", error);
    throw new HttpsError('internal', error.message || 'Booking request failed.');
  }
});

// Course operator (or staff) confirms or rejects a pending booking.
export const respondBooking = onCall({ memory: "256MiB" }, async (request) => {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError('unauthenticated', 'You must be logged in.');
  }
  const callerUid = request.auth.uid;
  const callerEmail = (request.auth.token?.email || "").toLowerCase();
  const { bookingId, decision } = request.data || {};
  if (!bookingId || typeof bookingId !== 'string') {
    throw new HttpsError('invalid-argument', 'A bookingId is required.');
  }
  if (decision !== 'confirm' && decision !== 'reject') {
    throw new HttpsError('invalid-argument', 'decision must be confirm or reject.');
  }

  const adminSnap = await db.collection('admin_users').doc(callerUid).get();
  const isStaff = adminSnap.exists && adminSnap.data()?.status !== 'Suspended';
  const isGodMode = callerEmail === 'admin@golfriend.co';
  const isPrivileged = isStaff || isGodMode;

  const bookingRef = db.collection('bookings').doc(bookingId);

  try {
    const out = await db.runTransaction(async (tx) => {
      const bSnap = await tx.get(bookingRef);
      if (!bSnap.exists) throw new HttpsError('not-found', 'Booking not found.');
      const booking = bSnap.data() || {};
      if (booking.status !== 'pending') {
        throw new HttpsError('failed-precondition', `Booking is already ${booking.status}.`);
      }

      // Authorize: staff/God-Mode, or the claimed operator of this course.
      if (!isPrivileged) {
        const opSnap = await tx.get(db.collection('course_operators').doc(booking.courseId));
        if (!opSnap.exists || opSnap.data()?.operatorUid !== callerUid) {
          throw new HttpsError('permission-denied', 'You do not operate this course.');
        }
      }

      const price = Number(booking.priceChips || 0);
      const holdRef = db.collection('transactions').doc(`booking_hold_${bookingId}`);
      const slotRef = db.collection('tee_time_slots').doc(booking.slotId);

      if (decision === 'confirm') {
        tx.set(bookingRef, {
          status: 'confirmed',
          userStatusKey: 'booking_confirmed',
          respondedByUid: callerUid,
          respondedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        // Settle the hold (seat stays counted).
        if (price > 0) {
          tx.set(holdRef, {
            status: 'completed',
            resolvedBy: 'OPERATOR_CONFIRM',
            resolvedByUid: callerUid,
            resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
        }
        return { bookingId, status: 'confirmed' };
      }

      // Reject: release the seat and refund the hold.
      const slotSnap = await tx.get(slotRef);
      if (slotSnap.exists) {
        const bookedCount = Number(slotSnap.data()?.bookedCount || 0);
        tx.set(slotRef, { bookedCount: Math.max(0, bookedCount - 1), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      }
      if (price > 0) {
        const playerRef = db.collection('users').doc(booking.playerUid);
        tx.set(playerRef, { chips: admin.firestore.FieldValue.increment(price) }, { merge: true });
        tx.set(holdRef, {
          status: 'failed',
          resolvedBy: 'OPERATOR_REJECT',
          resolvedByUid: callerUid,
          resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }
      tx.set(bookingRef, {
        status: 'rejected',
        userStatusKey: 'booking_rejected',
        respondedByUid: callerUid,
        respondedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      return { bookingId, status: 'rejected' };
    });

    logger.info(`📅 Booking ${out.bookingId} ${out.status} by ${callerUid}.`);
    return { success: true, ...out };
  } catch (error: any) {
    if (error instanceof HttpsError) throw error;
    logger.error("📅 Booking response failed:", error);
    throw new HttpsError('internal', error.message || 'Booking response failed.');
  }
});

// ==========================================
// 📖 ADMIN BOOKING OVERSIGHT (Force-Resolve: Confirm / Refund / Escalate)
// ==========================================
// Platform-staff override for the booking lifecycle. Seats and chips are
// settlement state, so this is server-owned: the client only names a decision;
// the seat release, wallet refund and hold settlement all happen here in a
// single transaction. Mirrors requestBooking/respondBooking exactly.
export const adminResolveBooking = onCall({ memory: "256MiB" }, async (request) => {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError('unauthenticated', 'You must be logged in.');
  }
  const callerUid = request.auth.uid;
  const callerEmail = (request.auth.token?.email || "").toLowerCase();
  const { bookingId, decision } = request.data || {};
  if (!bookingId || typeof bookingId !== 'string') {
    throw new HttpsError('invalid-argument', 'A bookingId is required.');
  }
  if (decision !== 'confirm' && decision !== 'refund' && decision !== 'escalate') {
    throw new HttpsError('invalid-argument', 'decision must be confirm, refund or escalate.');
  }

  // AUTHORIZATION: platform staff (any non-suspended admin_users) or God-Mode.
  const adminSnap = await db.collection('admin_users').doc(callerUid).get();
  const isStaff = adminSnap.exists && adminSnap.data()?.status !== 'Suspended';
  const isGodMode = callerEmail === 'admin@golfriend.co';
  if (!isStaff && !isGodMode) {
    throw new HttpsError('permission-denied', 'You are not authorized to resolve bookings.');
  }

  const bookingRef = db.collection('bookings').doc(bookingId);

  try {
    const out = await db.runTransaction(async (tx) => {
      const bSnap = await tx.get(bookingRef);
      if (!bSnap.exists) throw new HttpsError('not-found', 'Booking not found.');
      const booking = bSnap.data() || {};

      const price = Number(booking.priceChips || 0);
      const holdRef = db.collection('transactions').doc(`booking_hold_${bookingId}`);
      const slotRef = db.collection('tee_time_slots').doc(booking.slotId);

      // ---- CONFIRM: only a pending booking; settle the hold, seat stays counted ----
      if (decision === 'confirm') {
        if (booking.status !== 'pending') {
          throw new HttpsError('failed-precondition', `Booking is already ${booking.status}.`);
        }
        tx.set(bookingRef, {
          status: 'confirmed',
          userStatusKey: 'booking_confirmed',
          resolvedByUid: callerUid,
          resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        if (price > 0) {
          tx.set(holdRef, {
            status: 'completed',
            resolvedBy: 'ADMIN_CONFIRM',
            resolvedByUid: callerUid,
            resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
        }
        return { bookingId, status: 'confirmed' };
      }

      // ---- REFUND: release seat + refund player; idempotent guard ----
      if (decision === 'refund') {
        if (booking.status === 'refunded') {
          throw new HttpsError('failed-precondition', 'Booking is already refunded.');
        }
        if (booking.status !== 'pending' && booking.status !== 'confirmed' && booking.status !== 'disputed') {
          throw new HttpsError('failed-precondition', `A ${booking.status} booking cannot be refunded.`);
        }
        // Release the seat (only meaningful while it was still counted).
        if (booking.status === 'pending' || booking.status === 'confirmed') {
          const slotSnap = await tx.get(slotRef);
          if (slotSnap.exists) {
            const bookedCount = Number(slotSnap.data()?.bookedCount || 0);
            tx.set(slotRef, {
              bookedCount: Math.max(0, bookedCount - 1),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
          }
        }
        // Refund the player's held chips and fail the hold.
        if (price > 0) {
          const playerRef = db.collection('users').doc(booking.playerUid);
          tx.set(playerRef, { chips: admin.firestore.FieldValue.increment(price) }, { merge: true });
          tx.set(holdRef, {
            status: 'failed',
            resolvedBy: 'ADMIN_REFUND',
            resolvedByUid: callerUid,
            resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
        }
        tx.set(bookingRef, {
          status: 'refunded',
          userStatusKey: 'booking_refunded',
          resolvedByUid: callerUid,
          resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        return { bookingId, status: 'refunded' };
      }

      // ---- ESCALATE: mark disputed; flag hold for manual settlement (keep locked) ----
      if (booking.status === 'refunded') {
        throw new HttpsError('failed-precondition', 'A refunded booking cannot be escalated.');
      }
      tx.set(bookingRef, {
        status: 'disputed',
        userStatusKey: 'booking_disputed',
        resolvedByUid: callerUid,
        resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      tx.set(holdRef, {
        disputeFlagged: true,
        resolvedByUid: callerUid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      return { bookingId, status: 'disputed' };
    });

    logger.info(`📖 Booking ${out.bookingId} → ${out.status} by admin ${callerUid}.`);
    return { success: true, ...out };
  } catch (error: any) {
    if (error instanceof HttpsError) throw error;
    logger.error("📖 Admin booking resolution failed:", error);
    throw new HttpsError('internal', error.message || 'Admin booking resolution failed.');
  }
});

// ==========================================
// 🧑‍💼 ENTERPRISE STAFF & ROLES (Server-Authoritative Role Grant)
// ==========================================
// Enterprise portal staff management. Role assignment is authoritative state, so
// it is server-owned: the client cannot self-assign roles or write the roster.
// Only an ACTIVE ENTERPRISE partner may invite/remove staff on their own org.
// Roster lives at enterprise_staff/{enterpriseUid}/members/{staffUid}.
export const manageEnterpriseStaff = onCall({ memory: "256MiB" }, async (request) => {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError('unauthenticated', 'You must be logged in.');
  }

  const callerUid = request.auth.uid;
  const callerEmail = (request.auth.token?.email || "").toLowerCase();
  const { action, email, staffUid, role } = request.data || {};

  if (action !== 'invite' && action !== 'remove') {
    throw new HttpsError('invalid-argument', 'action must be "invite" or "remove".');
  }

  // Caller must be an ACTIVE ENTERPRISE partner (b2b_partners keyed by uid/email).
  const candidateIds = [callerUid];
  if (callerEmail) {
    candidateIds.push(callerEmail);
    candidateIds.push(callerEmail.charAt(0).toUpperCase() + callerEmail.slice(1));
  }
  let isEnterprisePartner = false;
  for (const id of candidateIds) {
    const pSnap = await db.collection('b2b_partners').doc(id).get();
    const pData = pSnap.data();
    if (pSnap.exists && pData?.status === 'active_partner' &&
        (pData?.tier === 'enterprise' || pData?.tier === 'Enterprise')) {
      isEnterprisePartner = true;
      break;
    }
  }
  if (!isEnterprisePartner) {
    throw new HttpsError('permission-denied', 'Only an active enterprise partner can manage staff.');
  }

  // The enterprise's roster is namespaced under the caller's uid.
  const membersCol = db.collection('enterprise_staff').doc(callerUid).collection('members');

  try {
    if (action === 'invite') {
      const cleanEmail = (email || "").toLowerCase().trim();
      if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        throw new HttpsError('invalid-argument', 'A valid staff email is required.');
      }
      const allowedRoles = ['manager', 'venue_staff', 'analyst'];
      const cleanRole = allowedRoles.includes(role) ? role : 'venue_staff';

      // Resolve an EXISTING Firebase Auth user; roles bind to a real uid.
      let staffRecord;
      try {
        staffRecord = await admin.auth().getUserByEmail(cleanEmail);
      } catch {
        throw new HttpsError('not-found', 'No Golfriend account exists for that email. Ask them to sign up first.');
      }
      if (staffRecord.uid === callerUid) {
        throw new HttpsError('failed-precondition', 'You cannot add yourself as staff.');
      }

      await membersCol.doc(staffRecord.uid).set({
        staffUid: staffRecord.uid,
        email: cleanEmail,
        role: cleanRole,
        status: 'active',
        enterpriseUid: callerUid,
        invitedAt: admin.firestore.FieldValue.serverTimestamp(),
        invitedBy: callerUid,
      }, { merge: true });

      logger.info(`🧑‍💼 Enterprise ${callerUid} added staff ${staffRecord.uid} (${cleanRole}).`);
      return { success: true, staffUid: staffRecord.uid, role: cleanRole };
    }

    // action === 'remove'
    if (!staffUid || typeof staffUid !== 'string') {
      throw new HttpsError('invalid-argument', 'A staffUid is required to remove a member.');
    }
    await membersCol.doc(staffUid).delete();
    logger.info(`🧑‍💼 Enterprise ${callerUid} removed staff ${staffUid}.`);
    return { success: true, staffUid };
  } catch (error: any) {
    if (error instanceof HttpsError) throw error;
    logger.error("🧑‍💼 Enterprise staff management failed:", error);
    throw new HttpsError('internal', error.message || 'Staff management failed.');
  }
});
// 🛰️ COURSE PROVIDER SYNC (Server-Authoritative, Credentialed)
// ==========================================
// Golf-API course coordinate sync moved fully server-side. The provider key is
// read from Secret Manager and never reaches the client. Every course is matched
// deterministically by provider id, coordinates are strictly validated, trusted
// manual corrections are never silently overwritten, batches are bounded and
// rate-limited with retry/backoff, last-known-good coordinates are preserved,
// and each applied change is audited (source, provider id, fetch time, updater,
// before/after). A "preview" mode returns the proposed diffs without writing.

// Fetch with bounded exponential backoff on 429/5xx (and transport errors).
async function fetchWithBackoff(url: string, headers: Record<string, string>, maxRetries = 3): Promise<Response | null> {
  let attempt = 0;
  let delayMs = 500;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const res = await fetch(url, { headers });
      if (res.status === 429 || (res.status >= 500 && res.status <= 599)) {
        if (attempt >= maxRetries) return res;
        await new Promise((r) => setTimeout(r, delayMs));
        delayMs *= 2;
        attempt += 1;
        continue;
      }
      return res;
    } catch (err) {
      if (attempt >= maxRetries) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
      delayMs *= 2;
      attempt += 1;
    }
  }
}

interface CourseSyncResultRow {
  courseId: string;
  result: string;
  message: string;
  before?: { latitude: number | null; longitude: number | null };
  after?: { latitude: number; longitude: number };
}

export const syncCoursesFromProvider = onCall(
  { secrets: [GOLF_API_KEY], memory: "512MiB", timeoutSeconds: 300 },
  async (request) => {
    if (!request.auth || !request.auth.uid) {
      throw new HttpsError('unauthenticated', 'You must be logged in.');
    }
    const callerUid = request.auth.uid;
    const callerEmail = (request.auth.token?.email || "").toLowerCase();

    // AUTHORIZATION: platform staff or God-Mode only.
    const adminSnap = await db.collection('admin_users').doc(callerUid).get();
    const isStaff = adminSnap.exists && adminSnap.data()?.status !== 'Suspended';
    if (!isStaff && callerEmail !== 'admin@golfriend.co') {
      throw new HttpsError('permission-denied', 'Only platform staff can run the course sync.');
    }

    const { mode, courseIds } = request.data || {};
    if (mode !== 'preview' && mode !== 'apply') {
      throw new HttpsError('invalid-argument', 'mode must be "preview" or "apply".');
    }
    // Bounded batch: explicit ids (deduped, capped) or a small auto-selected set
    // of courses with broken/missing coordinates.
    const limit = Math.min(Math.max(Number(request.data?.limit) || 10, 1), 25);

    interface Target { docId: string; courseID: string; data: FirebaseFirestore.DocumentData; }
    const targets: Target[] = [];

    if (Array.isArray(courseIds) && courseIds.length > 0) {
      const ids = Array.from(new Set(courseIds.filter((x: unknown) => isValidProviderId(x)))).slice(0, 25) as string[];
      for (const id of ids) {
        const snap = await db.collection('courses').doc(id).get();
        if (snap.exists) targets.push({ docId: snap.id, courseID: id, data: snap.data() || {} });
        else targets.push({ docId: id, courseID: id, data: {} });
      }
    } else {
      const snap = await db.collection('courses').get();
      for (const d of snap.docs) {
        const c = d.data() as any;
        const cid = c.courseID || d.id;
        if (!isValidProviderId(cid)) continue;
        if (c.requiresManualGPS === true) continue; // leave quarantined for manual flow
        const hasCoords = Number(c.latitude) || Number(c.lat);
        if (!hasCoords) targets.push({ docId: d.id, courseID: cid, data: c });
        if (targets.length >= limit) break;
      }
    }

    const apiKey = GOLF_API_KEY.value();
    const headers = { Authorization: `Bearer ${apiKey}` };
    const results: CourseSyncResultRow[] = [];
    const nowIso = new Date().toISOString();

    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      let provider: ProviderCourse | null = null;
      try {
        const res = await fetchWithBackoff(`https://www.golfapi.io/api/v2.3/courses/${t.courseID}`, headers);
        if (res && res.ok) {
          const body: any = await res.json();
          const shell = body.data || body;
          if (shell && (shell.latitude !== undefined && shell.longitude !== undefined)) {
            provider = { courseID: shell.courseID || shell.id || t.courseID, latitude: shell.latitude, longitude: shell.longitude };
          } else {
            provider = null; // missing coordinates
          }
        } else if (res && res.status === 404) {
          provider = null;
        } else {
          results.push({ courseId: t.courseID, result: 'error', message: `Provider HTTP ${res ? res.status : 'no-response'} after retries.` });
          continue;
        }
      } catch (err: any) {
        results.push({ courseId: t.courseID, result: 'error', message: `Fetch failed: ${err?.message || 'unknown'}` });
        continue;
      }

      const decision = classifyCourseSync(t.courseID, t.data, provider);
      const row: CourseSyncResultRow = { courseId: t.courseID, result: decision.result, message: decision.message, before: decision.before };
      if (decision.after) row.after = decision.after;

      if (mode === 'apply' && decision.result === 'updated' && decision.after) {
        try {
          await db.runTransaction(async (tx) => {
            const ref = db.collection('courses').doc(t.docId);
            const fresh = await tx.get(ref);
            const cur = fresh.data() || {};
            // Last-known-good preservation.
            const lastKnownGood = {
              latitude: cur.latitude ?? cur.lat ?? null,
              longitude: cur.longitude ?? cur.lng ?? null,
              at: cur.providerFetchedAt || cur.cachedAt || null,
            };
            tx.set(ref, {
              latitude: decision.after!.latitude,
              longitude: decision.after!.longitude,
              lat: decision.after!.latitude,
              lng: decision.after!.longitude,
              gpsSource: 'golfapi',
              providerId: t.courseID,
              providerFetchedAt: nowIso,
              updatedByUid: callerUid,
              lastKnownGood,
              apiImported: true,
              cachedAt: nowIso,
            }, { merge: true });

            // Audit record: source, provider id, fetch time, updater, before/after.
            const auditRef = db.collection('course_sync_audit').doc();
            tx.set(auditRef, {
              courseId: t.courseID,
              source: 'golfapi',
              providerId: t.courseID,
              fetchedAt: nowIso,
              updatedByUid: callerUid,
              before: decision.before,
              after: decision.after,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          });
          row.message = 'Coordinates updated from provider (audited).';
        } catch (err: any) {
          row.result = 'error';
          row.message = `Write failed: ${err?.message || 'unknown'}`;
        }
      }

      results.push(row);

      // Rate limit between provider calls (backoff already handles 429 bursts).
      if (i < targets.length - 1) await new Promise((r) => setTimeout(r, 400));
    }

    const summary = results.reduce((acc: Record<string, number>, r) => {
      acc[r.result] = (acc[r.result] || 0) + 1;
      return acc;
    }, {});

    logger.info(`🛰️ Course sync (${mode}) by ${callerUid}: ${JSON.stringify(summary)}`);
    return { success: true, mode, processed: results.length, summary, results };
  }
);

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