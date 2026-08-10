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