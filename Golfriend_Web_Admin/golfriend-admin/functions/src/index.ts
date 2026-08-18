import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import * as functionsV1 from "firebase-functions/v1"; // 🔥 Explicitly target v1
import vision from "@google-cloud/vision"; // 🔥 ADDED
import { classifyCourseSync, isValidProviderId, type ProviderCourse } from "./courseSync.js";
import { runSyncCoursesFromProviderPreview } from "./courseSyncPreview.js";
import { isSlotBookable, applySeatDelta, statusAfter, userStatusKeyFor } from "./bookingLogic.js";
import { isActiveStaff, isActiveDirector } from "./authority.js";
import {
  MEMBERSHIP_REGISTRY_VERSION,
  MEMBERSHIP_REGISTRY_COLLECTION,
  GRANT_AUDIT_COLLECTION,
  REMOVAL_AUDIT_COLLECTION,
  GRANT_COUNTER_COLLECTION,
  ENTERPRISE_STAFF_ROLES,
  REMOVAL_REASONS,
  isEnterpriseStaffRole,
  isRemovalReason,
  isValidCommandId,
  evaluateMembershipCandidate,
  decideMembershipAdmission,
  removalFingerprint,
} from "./enterpriseMembershipRegistry.js";
import { planDuplicatePurge, isLocked, canDeletePlannedCourse, type CourseRec } from "./janitorLogic.js";
import { normalizeManualCourseCorrection } from "./courseWriteAuthority.js";
import { validateSubmission, applyReview, statusOnSubmit, canSubmit, isReviewDecision, type SubmissionStatus } from "./partnerIntakeLogic.js";
// Modular FieldValue — robust under the Functions emulator, whose admin stub can
// drop the `admin.firestore.FieldValue` static. Used by the partner-intake callables.
import { FieldValue } from "firebase-admin/firestore";
import { createOutreachStore } from "./outreachStore.js";
import type { CallerContext as OutreachCallerContext } from "./outreachAuthority.js";
export {previewCourseRegionImport, commitCourseRegionImport} from "./courseIngestion.js";
export {listMarketingAssets,getMarketingAssetHistory,createMarketingAsset,uploadMarketingAssetVersion,transitionMarketingAsset,getMarketingAssetDownload} from "./marketingAssetRuntime.js";
export {savePartnerApplicationDraftV2, submitPartnerApplicationV2, getMyPartnerApplicationV2, uploadPartnerApplicationEvidenceV2, sendPartnerSupportMessageV2, listPartnerApplicationsV2, getPartnerApplicationAdminV2, sendAdminPartnerSupportMessageV2, reviewPartnerApplicationV2, getMyVerifiedCourseOnboardingV2, saveVerifiedCourseOnboardingDraftV2, acceptVerifiedCourseOnboardingAgreementV2, submitVerifiedCourseOnboardingV2, getPartnerAgreementV2, reviewPartnerApplicationEvidenceV2, approvePartnerContractV2} from "./partnerOnboardingRuntime.js";
export {activatePartner,claimCourseOperator,managePartnerStaff,acceptPartnerInvitation,transferPartnerOwnership,raisePartnerClaimDispute,setPartnerOrganizationStatus,getPartnerAuthorityState,listPartnerAuthorityAdmin,getPartnerTrialReceiptV1,getAdminPartnerTrialReceiptV1,cancelPartnerTrialV1} from "./partnerActivationRuntime.js";
export {reviewCourseOperatorClaim} from "./partnerClaimReviewRuntime.js";
export {manageCourseAvailabilityV2,manageCourseAvailabilityV2 as manageTeeTimeSlot,reviewCourseAvailabilityV2,getCourseAvailabilityV2,listCourseAvailabilityAdminV2} from "./partnerAvailabilityRuntime.js";
export {requestPlayBookingV2,previewPlayBookingActionV2,managePlayBookingV2,managePlayBookingV2 as respondBooking,managePlayBookingV2 as cancelBooking,sendPlayBookingMessageV2,sendPlayBookingMessageV2 as sendBookingMessage,getPlayBookingsPortalV2,getPlayBookingsAdminV2,getPlayBookingOperationV2,reconcilePlayBookingOperationV2} from "./partnerBookingRuntime.js";
export {intakeEnterpriseBookingCorrelationV2} from "./enterpriseBookingCorrelationRuntime.js";
export {getMyEnterpriseCorrelatedBookingV2} from "./enterpriseBookingGolferIdentityRuntime.js";
export {getEnterpriseBookingCoordinationPortalV2} from "./enterpriseBookingCoordinationRuntime.js";
export {previewEnterpriseBookingActionV2,manageEnterpriseBookingActionV2} from "./enterpriseBookingV2OperationRuntime.js";
export {manageEnterpriseBookingProducerV2,auditEnterpriseBookingProducerV2} from "./enterpriseBookingProducerLifecycleRuntime.js";
export {recoverPlayBookingConfirmationV2} from "./partnerBookingTokenRecoveryRuntime.js";
export {getBookingOperationsPortalV2,getBookingOperationsAdminV2,reconcileBookingOperationsV2,exportBookingOperationsV2,getBookingOperationsReceiptV2} from "./bookingReportingRuntime.js";
export {prepareBookingProviderPublicationV2,publishBookingProviderPublicationV2,getBookingProviderPublicationsV2} from "./bookingProviderPublicationRuntime.js";
export {configureEnterpriseBookingProviderV1,enqueueEnterpriseProviderOperationV1,dispatchEnterpriseProviderOutboxV1,enterpriseBookingProviderWebhookV1,submitEnterprisePlayedEvidenceV1,reviewEnterprisePlayedEvidenceV1,raiseEnterpriseCommissionDisputeV1,closeEnterpriseCommissionStatementsV1,authorizeEnterpriseCommissionInvoiceAdminV1,getEnterpriseCommercialOperationsV1} from "./enterpriseCommissionRuntime.js";
export {commissionEnterpriseBookingProviderAdminV1} from "./enterpriseProviderCommissioningRuntime.js";
export {getEnterpriseOrganizationAuthorityV2} from "./enterpriseAuthorityRuntime.js";
export {getEnterpriseCourseProfileV1,submitEnterpriseCourseProfileV1,getEnterpriseMemberLinksV1,getEnterpriseMemberLinkInvitationsForGolferV1,inviteKnownGolferEnterpriseMemberV1,unlinkEnterpriseMemberV1,revokeEnterpriseMemberLinkAsStaffV1,acceptEnterpriseMemberLinkV1,declineEnterpriseMemberLinkV1,revokeEnterpriseMemberLinkV1,unlinkEnterpriseMemberLinkAsGolferV1} from "./enterpriseOperationsRuntime.js";
export {getEnterpriseCourseOnboardingV1,saveEnterpriseCourseOnboardingDraftV1,previewEnterpriseAgreementV1,acceptEnterpriseAgreementV1,submitEnterpriseCourseOnboardingV1,withdrawEnterpriseCourseOnboardingV1,getEnterpriseApplicationReviewProjectionV1} from "./enterpriseOnboardingRuntime.js";
export {getEnterprisePartnerSupportV1,createEnterpriseSupportDraftV1,attachEnterpriseSupportEvidenceV1,submitEnterpriseSupportRequestV1,replyEnterpriseSupportRequestV1,withdrawEnterpriseSupportRequestV1,reopenEnterpriseSupportRequestV1,closeEnterpriseSupportRequestV1} from "./enterpriseSupportRuntime.js";
export {getEnterpriseCourseMembersV1,getEnterpriseCourseMemberV1,createEnterpriseMemberInvitationDraftV1,createEnterpriseMemberResendDraftV1,submitEnterpriseMemberInvitationRequestV1,submitEnterpriseMemberChangeRequestV1,previewEnterpriseMemberCsvImportV1,submitEnterpriseMemberCsvImportRequestV1} from "./enterpriseMemberManagementRuntime.js";
export {getEnterpriseMemberRequestsAdminV1,getEnterpriseMemberRequestAdminV1,decideEnterpriseMemberRequestAdminV1,resolveEnterpriseMemberCsvConflictsAdminV1,prepareEnterpriseMemberDeliveryAdminV1,getEnterpriseMemberDeliveryOutboxAdminV1} from "./enterpriseMemberAdminRuntime.js";
export {getEnterpriseMemberCommissioningAdminV1,proposeEnterpriseMemberDeliveryTemplateAdminV1,recordEnterpriseMemberTemplateApprovalAdminV1,activateEnterpriseMemberDeliveryTemplateAdminV1,rejectEnterpriseMemberDeliveryTemplateAdminV1,retireEnterpriseMemberDeliveryTemplateAdminV1,runEnterpriseMemberDeliveryDryRunAdminV1,validateEnterpriseMemberJHCCPortAdminV1} from "./enterpriseMemberCommissioningRuntime.js";
export {getSmallBusinessPortalV1,saveSmallBusinessProfileV1,submitSmallBusinessProfileV1,submitSmallBusinessApplicationV1,withdrawSmallBusinessApplicationV1,getSmallBusinessProfileCorrectionV1,saveSmallBusinessProfileCorrectionV1,submitSmallBusinessProfileCorrectionV1,withdrawSmallBusinessProfileCorrectionV1,prepareSmallBusinessPromotionV1,createSmallBusinessSubscriptionIntentV1,discoverSmallBusinessesV1,getSmallBusinessDetailV1,recordSmallBusinessEngagementV1,prepareSmallBusinessInquiryV1,listSmallBusinessApplicationsAdminV1,getSmallBusinessApplicationAdminV1,decideSmallBusinessApplicationAdminV1,listSmallBusinessProfileCorrectionsAdminV1,getSmallBusinessProfileCorrectionAdminV1,decideSmallBusinessProfileCorrectionAdminV1,reviewSmallBusinessPromotionAdminV1,getSmallBusinessReportingAdminV1,prepareSmallBusinessJhccReportAdminV1} from "./smallBusinessRuntime.js";
export {createSmallBusinessSubscriptionCheckoutV1,smallBusinessStripeWebhookV1,reconcileExpiredSmallBusinessTrialsV1,getSmallBusinessSubscriptionStateV1} from "./smallBusinessSubscriptionRuntime.js";
export {listCourseSyncReceipts, recoverExpiredCourseIngestionJobs, getCourseIngestionOperations, prepareCourseIngestionRetry} from "./courseIngestion.js";
export {getCountryUserAnalytics} from "./countryUserAnalytics.js";
export {getTeeEconomyAnalytics} from "./teeEconomyAnalytics.js";
export {getAdminControlProjectionV1,decidePartnerTrialAdminV1,previewEconomyConfigAdminV1,activateEconomyConfigAdminV1,rollbackEconomyConfigAdminV1} from "./adminControlRuntime.js";
export {prepareAdminJhccFinanceReportV1,transmitAdminJhccFinanceReportV1,getAdminJhccFinanceDeliveryV1} from "./financeReportRuntime.js";
export {getPartnerTournamentGovernanceV1,managePartnerTournamentGovernanceV1,getAdminTournamentGovernanceV1,manageAdminTournamentGovernanceV1} from "./tournamentGovernanceRuntime.js";
export {getCourseAcquisitionDashboard,previewCourseAcquisitionPlan,acquireCourseCandidates,decideCourseCandidate,publishCourseCandidate,submitCourseCorrectionRequest} from "./courseAcquisition.js";

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const visionClient = new vision.ImageAnnotatorClient(); // 🔥 ADDED

// 🔐 Pulls the key securely from Google Secret Manager
// 🔐 Pulls the key securely from Google Secret Manager
const GOLF_API_KEY = defineSecret("GOLF_API_KEY");

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
    const allCourses: CourseRec[] = snapshot.docs.map(doc => ({ docId: doc.id, ...(doc.data() as any) }));

    // HARDENED: the pure core plans the safe subset. It NEVER plans deletion of a
    // manually-locked / trusted course, FAILS CLOSED on ambiguous duplicate groups,
    // selects a deterministic winner, and preserves last-known-good. See janitorLogic.ts.
    const plan = planDuplicatePurge(allCourses);

    // Preliminary defence in depth. Every candidate is re-read again inside its
    // deletion transaction so a concurrent manual/trusted correction wins.
    const byId = new Map(allCourses.map((c) => [c.docId, c]));
    const safeToDelete = plan.toDelete.filter((id) => !isLocked(byId.get(id)));

    console.log(`⚠️ Janitor plan: keep ${Object.keys(plan.keep).length}, delete ${safeToDelete.length}, skipped-ambiguous ${plan.ambiguous.length}, no-identifier ${plan.skippedNoIdentifier.length}.`);

    const deleted: string[] = [];
    const protectedAtCommit: string[] = [];
    for (const docId of safeToDelete) {
      const wasDeleted = await db.runTransaction(async (tx) => {
        const ref = db.collection("courses").doc(docId);
        const fresh = await tx.get(ref);
        const current = fresh.exists ? { ...(fresh.data() as CourseRec), docId: fresh.id } : null;
        if (!canDeletePlannedCourse(docId, current)) return false;
        tx.delete(ref);
        return true;
      });
      if (wasDeleted) deleted.push(docId); else protectedAtCommit.push(docId);
    }

    // Bounded audit evidence records the actual transaction-time outcome.
    await db.collection("course_maintenance_audit").doc(`janitor_${event.scheduleTime || new Date().toISOString()}`).set({
      job: "weeklyVaultJanitor",
      ranAt: admin.firestore.FieldValue.serverTimestamp(),
      keptCount: Object.keys(plan.keep).length,
      deletedCount: deleted.length,
      deleted: deleted.slice(0, 200),
      protectedAtCommit: protectedAtCommit.slice(0, 200),
      ambiguous: plan.ambiguous.slice(0, 200),
      skippedNoIdentifier: plan.skippedNoIdentifier.slice(0, 200),
      decisions: plan.audit.slice(0, 200),
    }, { merge: false });

    console.log(`🏁 WEEKLY JANITOR COMPLETE. Purged ${deleted.length}; protected ${protectedAtCommit.length} at commit; ${plan.ambiguous.length} ambiguous groups preserved.`);
  } catch (error) {
    console.error("❌ CRITICAL JANITOR FAILURE:", error);
  }
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
    // isActiveDirector, not a bare role comparison: the role string alone says nothing
    // about whether the account is still active.
    if (!isActiveDirector(callerDoc.exists ? callerDoc.data() : null)) {
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
      // Trimmed: isActiveDirector matches the role EXACTLY, so a stray space would make
      // someone hired as a Director silently not one, with no error at hire time.
      role: typeof role === 'string' ? role.trim() : role,
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
// const legacyClaimCourseOperator is intentionally not exported; retained below for migration comparison.
const _legacyClaimCourseOperator = onCall({ memory: "256MiB" }, async (request) => {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError('unauthenticated', 'You must be logged in.');
  }

  const callerUid = request.auth.uid;
  // GATED AT THE READ. An address only stands in for an identity once Firebase
  // says it was VERIFIED; anyone can register an address they do not control.
  const callerAddressVerified = request.auth.token?.email_verified === true;
  const callerEmail = callerAddressVerified ? (request.auth.token?.email || "").toLowerCase() : "";
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
void _legacyClaimCourseOperator;

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
const legacyManageTeeTimeSlot = onCall({ memory: "256MiB" }, async (request) => {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError('unauthenticated', 'You must be logged in.');
  }

  const callerUid = request.auth.uid;

  // AUTHORIZATION: active platform staff (server-owned admin_users role) may manage
  // any course; otherwise the caller must be the claimed operator of the specific
  // course being touched (partner-scoped self-service authoring). No email/God-Mode.
  const adminSnap = await db.collection('admin_users').doc(callerUid).get();
  const isPrivileged = isActiveStaff(adminSnap.exists ? adminSnap.data() : null);

  const assertCourseOperator = async (cid: string) => {
    const opSnap = await db.collection('course_operators').doc(cid).get();
    if (!opSnap.exists || opSnap.data()?.operatorUid !== callerUid) {
      throw new HttpsError('permission-denied', 'You do not operate this course.');
    }
  };

  const { action } = request.data || {};

  // ---- ACTION: create a bookable tee-time slot ----
  if (action === 'create') {
    const { courseId, date, time, capacity } = request.data || {};

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
        bookedCount: 0,          // server-owned; booking requests increment this (non-financial)
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
void legacyManageTeeTimeSlot;

// ==========================================
// 📅 BOOKING LIFECYCLE (Server-Authoritative, NON-FINANCIAL)
// ==========================================
// Per the Director's ruling the booking flow is strictly non-financial: NO
// priceChips, wallet debit, escrow hold, settlement, payout or refund. It is
// purely operational — availability, capacity, request/confirm/reject/cancel,
// messaging and an append-only audit trail:
//  - no double-book: bookedCount is checked against capacity in a transaction;
//  - seats are released on reject/cancel; no money ever moves;
//  - each state change appends a `booking_audit` record; each booking carries a
//    userStatusKey the client localizes.

// Append-only, non-financial audit of a booking state change.
function stampBookingAudit(
  tx: FirebaseFirestore.Transaction,
  bookingId: string,
  action: string,
  byUid: string,
  byRole: string,
) {
  const auditRef = db.collection('booking_audit').doc();
  tx.set(auditRef, {
    bookingId, action, byUid, byRole,
    at: admin.firestore.FieldValue.serverTimestamp(),
  });
}

// Player requests a booking for an open tee-time slot. No payment/hold.
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

  try {
    const out = await db.runTransaction(async (tx) => {
      const slotSnap = await tx.get(slotRef);
      if (!slotSnap.exists) throw new HttpsError('not-found', 'Tee-time slot not found.');
      const slot = slotSnap.data() || {};
      if (slot.status !== 'open') throw new HttpsError('failed-precondition', 'This tee-time is not open for booking.');
      const bookedCount = Number(slot.bookedCount || 0);
      if (!isSlotBookable(slot.status, bookedCount, slot.capacity)) throw new HttpsError('failed-precondition', 'This tee-time is fully booked.');

      const existing = await tx.get(bookingRef);
      if (existing.exists && ['pending', 'confirmed'].includes(existing.data()?.status)) {
        throw new HttpsError('already-exists', 'You already have an active booking for this tee-time.');
      }

      const userSnap = await tx.get(userRef);
      const uData = userSnap.exists ? (userSnap.data() || {}) : {};

      // Reserve the seat (capacity only — no wallet involvement).
      tx.set(slotRef, { bookedCount: applySeatDelta(bookedCount, +1), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });

      // Create the booking in a pending state (non-financial).
      tx.set(bookingRef, {
        slotId,
        courseId: slot.courseId || '',
        courseName: slot.courseName || slot.courseId || '',
        date: slot.date || '',
        time: slot.time || '',
        playerUid,
        playerName: uData.nickname || uData.name || 'Player',
        status: statusAfter('request'),
        userStatusKey: userStatusKeyFor(statusAfter('request')),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      stampBookingAudit(tx, bookingId, 'requested', playerUid, 'player');
      return { bookingId, status: 'pending' };
    });

    logger.info(`📅 Booking ${out.bookingId} requested by ${playerUid} (non-financial).`);
    return { success: true, ...out };
  } catch (error: any) {
    if (error instanceof HttpsError) throw error;
    logger.error("📅 Booking request failed:", error);
    throw new HttpsError('internal', error.message || 'Booking request failed.');
  }
});

// Course operator (or staff) confirms or rejects a pending booking. No settle/refund.
const legacyRespondBooking = onCall({ memory: "256MiB" }, async (request) => {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError('unauthenticated', 'You must be logged in.');
  }
  const callerUid = request.auth.uid;
  const { bookingId, decision } = request.data || {};
  if (!bookingId || typeof bookingId !== 'string') {
    throw new HttpsError('invalid-argument', 'A bookingId is required.');
  }
  if (decision !== 'confirm' && decision !== 'reject') {
    throw new HttpsError('invalid-argument', 'decision must be confirm or reject.');
  }

  // AUTHORIZATION: active platform staff (server-owned admin_users role) or the
  // claimed course operator. No email/God-Mode.
  const adminSnap = await db.collection('admin_users').doc(callerUid).get();
  const isPrivileged = isActiveStaff(adminSnap.exists ? adminSnap.data() : null);

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

      const slotRef = db.collection('tee_time_slots').doc(booking.slotId);

      if (decision === 'confirm') {
        tx.set(bookingRef, {
          status: 'confirmed',
          userStatusKey: 'booking_confirmed',
          respondedByUid: callerUid,
          respondedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        stampBookingAudit(tx, bookingId, 'confirmed', callerUid, isPrivileged ? 'staff' : 'operator');
        return { bookingId, status: 'confirmed' };
      }

      // Reject: release the seat. No refund (nothing was ever charged).
      const slotSnap = await tx.get(slotRef);
      if (slotSnap.exists) {
        const bookedCount = Number(slotSnap.data()?.bookedCount || 0);
        tx.set(slotRef, { bookedCount: applySeatDelta(bookedCount, -1), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      }
      tx.set(bookingRef, {
        status: 'rejected',
        userStatusKey: 'booking_rejected',
        respondedByUid: callerUid,
        respondedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      stampBookingAudit(tx, bookingId, 'rejected', callerUid, isPrivileged ? 'staff' : 'operator');
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

// Cancel a booking. The owning player, the course operator, or staff may cancel
// a pending/confirmed booking; the seat is released. Non-financial.
const legacyCancelBooking = onCall({ memory: "256MiB" }, async (request) => {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError('unauthenticated', 'You must be logged in.');
  }
  const callerUid = request.auth.uid;
  const { bookingId } = request.data || {};
  if (!bookingId || typeof bookingId !== 'string') {
    throw new HttpsError('invalid-argument', 'A bookingId is required.');
  }

  // AUTHORIZATION: booking owner, active platform staff (server-owned admin_users
  // role), or the claimed course operator. No email/God-Mode.
  const adminSnap = await db.collection('admin_users').doc(callerUid).get();
  const isPrivileged = isActiveStaff(adminSnap.exists ? adminSnap.data() : null);
  const bookingRef = db.collection('bookings').doc(bookingId);

  try {
    const out = await db.runTransaction(async (tx) => {
      const bSnap = await tx.get(bookingRef);
      if (!bSnap.exists) throw new HttpsError('not-found', 'Booking not found.');
      const booking = bSnap.data() || {};
      if (booking.status !== 'pending' && booking.status !== 'confirmed') {
        throw new HttpsError('failed-precondition', `A ${booking.status} booking cannot be cancelled.`);
      }

      const isOwner = booking.playerUid === callerUid;
      let role = isOwner ? 'player' : (isPrivileged ? 'staff' : 'operator');
      if (!isOwner && !isPrivileged) {
        const opSnap = await tx.get(db.collection('course_operators').doc(booking.courseId));
        if (!opSnap.exists || opSnap.data()?.operatorUid !== callerUid) {
          throw new HttpsError('permission-denied', 'You are not allowed to cancel this booking.');
        }
      }

      const slotSnap = await tx.get(db.collection('tee_time_slots').doc(booking.slotId));
      if (slotSnap.exists) {
        const bookedCount = Number(slotSnap.data()?.bookedCount || 0);
        tx.set(db.collection('tee_time_slots').doc(booking.slotId), {
          bookedCount: applySeatDelta(bookedCount, -1),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }
      tx.set(bookingRef, {
        status: 'cancelled',
        userStatusKey: 'booking_cancelled',
        cancelledByUid: callerUid,
        cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      stampBookingAudit(tx, bookingId, 'cancelled', callerUid, role);
      return { bookingId, status: 'cancelled' };
    });

    logger.info(`📅 Booking ${out.bookingId} cancelled by ${callerUid}.`);
    return { success: true, ...out };
  } catch (error: any) {
    if (error instanceof HttpsError) throw error;
    logger.error("📅 Booking cancel failed:", error);
    throw new HttpsError('internal', error.message || 'Booking cancel failed.');
  }
});

// Booking messaging: a participant (the player, the course operator, or staff)
// appends a message to the booking thread. Purely communicative, non-financial.
const legacySendBookingMessage = onCall({ memory: "256MiB" }, async (request) => {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError('unauthenticated', 'You must be logged in.');
  }
  const callerUid = request.auth.uid;
  const { bookingId, text } = request.data || {};
  if (!bookingId || typeof bookingId !== 'string') {
    throw new HttpsError('invalid-argument', 'A bookingId is required.');
  }
  if (typeof text !== 'string' || !text.trim()) {
    throw new HttpsError('invalid-argument', 'Message text is required.');
  }
  const cleanText = text.trim().slice(0, 2000);

  const bookingRef = db.collection('bookings').doc(bookingId);
  const bSnap = await bookingRef.get();
  if (!bSnap.exists) throw new HttpsError('not-found', 'Booking not found.');
  const booking = bSnap.data() || {};

  // AUTHORIZATION: booking owner, active platform staff (server-owned admin_users
  // role), or the claimed course operator. No email/God-Mode.
  const adminSnap = await db.collection('admin_users').doc(callerUid).get();
  const isStaff = isActiveStaff(adminSnap.exists ? adminSnap.data() : null);
  const isOwner = booking.playerUid === callerUid;
  let senderRole = isOwner ? 'player' : (isStaff ? 'staff' : 'operator');
  if (!isOwner && !isStaff) {
    const opSnap = await db.collection('course_operators').doc(booking.courseId).get();
    if (!opSnap.exists || opSnap.data()?.operatorUid !== callerUid) {
      throw new HttpsError('permission-denied', 'Only booking participants can message.');
    }
  }

  await bookingRef.collection('messages').add({
    senderUid: callerUid,
    senderRole,
    text: cleanText,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await bookingRef.set({ lastMessageAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });

  logger.info(`📅 Booking message on ${bookingId} by ${callerUid} (${senderRole}).`);
  return { success: true };
});
void legacyRespondBooking;
void legacyCancelBooking;
void legacySendBookingMessage;

// ==========================================
// 📖 ADMIN BOOKING OVERSIGHT (Non-Financial Force-Resolve: Confirm / Reject / Cancel)
// ==========================================
// Platform-staff override for the booking lifecycle. NON-FINANCIAL: no refund,
// payout, escrow or settlement — only seat/status transitions with audit. The
// client names a decision; the seat release + status change happen server-side.
export const adminResolveBooking = onCall({ memory: "256MiB" }, async (request) => {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError('unauthenticated', 'You must be logged in.');
  }
  const callerUid = request.auth.uid;
  const { bookingId, decision } = request.data || {};
  if (!bookingId || typeof bookingId !== 'string') {
    throw new HttpsError('invalid-argument', 'A bookingId is required.');
  }
  if (decision !== 'confirm' && decision !== 'reject' && decision !== 'cancel') {
    throw new HttpsError('invalid-argument', 'decision must be confirm, reject or cancel.');
  }

  // AUTHORIZATION: active platform staff only (server-owned admin_users role). No email/God-Mode.
  const adminSnap = await db.collection('admin_users').doc(callerUid).get();
  if (!isActiveStaff(adminSnap.exists ? adminSnap.data() : null)) {
    throw new HttpsError('permission-denied', 'You are not authorized to resolve bookings.');
  }

  const bookingRef = db.collection('bookings').doc(bookingId);

  try {
    const out = await db.runTransaction(async (tx) => {
      const bSnap = await tx.get(bookingRef);
      if (!bSnap.exists) throw new HttpsError('not-found', 'Booking not found.');
      const booking = bSnap.data() || {};
      const slotRef = db.collection('tee_time_slots').doc(booking.slotId);

      const releaseSeat = async () => {
        const slotSnap = await tx.get(slotRef);
        if (slotSnap.exists) {
          const bookedCount = Number(slotSnap.data()?.bookedCount || 0);
          tx.set(slotRef, {
            bookedCount: applySeatDelta(bookedCount, -1),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
        }
      };

      // ---- CONFIRM: only a pending booking; seat stays counted ----
      if (decision === 'confirm') {
        if (booking.status !== 'pending') {
          throw new HttpsError('failed-precondition', `Booking is already ${booking.status}.`);
        }
        tx.set(bookingRef, {
          status: 'confirmed', userStatusKey: 'booking_confirmed',
          resolvedByUid: callerUid,
          resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        stampBookingAudit(tx, bookingId, 'admin_confirmed', callerUid, 'staff');
        return { bookingId, status: 'confirmed' };
      }

      // ---- REJECT: only a pending booking; release the seat ----
      if (decision === 'reject') {
        if (booking.status !== 'pending') {
          throw new HttpsError('failed-precondition', `A ${booking.status} booking cannot be rejected.`);
        }
        await releaseSeat();
        tx.set(bookingRef, {
          status: 'rejected', userStatusKey: 'booking_rejected',
          resolvedByUid: callerUid,
          resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        stampBookingAudit(tx, bookingId, 'admin_rejected', callerUid, 'staff');
        return { bookingId, status: 'rejected' };
      }

      // ---- CANCEL: a pending/confirmed booking; release the seat ----
      if (booking.status !== 'pending' && booking.status !== 'confirmed') {
        throw new HttpsError('failed-precondition', `A ${booking.status} booking cannot be cancelled.`);
      }
      await releaseSeat();
      tx.set(bookingRef, {
        status: 'cancelled', userStatusKey: 'booking_cancelled',
        resolvedByUid: callerUid,
        resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      stampBookingAudit(tx, bookingId, 'admin_cancelled', callerUid, 'staff');
      return { bookingId, status: 'cancelled' };
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
// Retained only as an unexported migration reference. Canonical staff mutations
// are exported by enterpriseAuthorityRuntime through OrganizationAuthorityService.
const legacyManageEnterpriseStaff = onCall({ memory: "256MiB", enforceAppCheck: true }, async (request) => {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError('unauthenticated', 'You must be logged in.');
  }

  const callerUid = request.auth.uid;
  // A CONTACT ADDRESS MAY ONLY STAND IN FOR AN IDENTITY ONCE FIREBASE SAYS IT WAS
  // VERIFIED. b2b_partners is address-keyed during the webhook-buffer window, so an
  // unverified address was enough to be treated as that active partner — by
  // registering it. The uid is the identity; an address is only ever a lookup key.
  const callerAddressVerified = request.auth.token?.email_verified === true;
  const callerAddress = callerAddressVerified ? (request.auth.token?.email || "").toLowerCase() : "";
  const payload = (request.data || {}) as Record<string, unknown>;
  const { action, email, staffUid, role } = payload as {
    action?: unknown; email?: unknown; staffUid?: unknown; role?: unknown;
  };

  if (action !== 'invite' && action !== 'remove') {
    throw new HttpsError('invalid-argument', 'action must be "invite" or "remove".');
  }
  // SURPLUS FIELDS ARE REFUSED. An undeclared key means the caller and this handler
  // disagree about what was asked for, and the unsafe resolution is to act on the
  // half that was understood.
  const ALLOWED_FIELDS: Record<string, readonly string[]> = {
    invite: ['action', 'email', 'role'],
    remove: ['action', 'staffUid', 'reason', 'commandId'],
  };
  const surplusFields = Object.keys(payload).filter((key) => ALLOWED_FIELDS[action].indexOf(key) === -1);
  if (surplusFields.length > 0) {
    throw new HttpsError('invalid-argument', `Unexpected field(s) for ${action}: ${surplusFields.sort().join(', ')}.`);
  }

  // Caller must be an ACTIVE ENTERPRISE partner (b2b_partners keyed by uid/address).
  const candidateIds = [callerUid];
  if (callerAddress) {
    candidateIds.push(callerAddress);
    candidateIds.push(callerAddress.charAt(0).toUpperCase() + callerAddress.slice(1));
  }
  let isEnterprisePartner = false;
  // HOW the caller resolved is evidence, not an implementation detail: a uid match is
  // a strong binding, an address match is acceptable only because the address was
  // verified above. Recording it lets a later audit tell the two apart.
  let actorResolvedBy: 'uid' | 'verified_address' | null = null;
  let actorOrganizationId = '';
  for (const id of candidateIds) {
    const pSnap = await db.collection('b2b_partners').doc(id).get();
    const pData = pSnap.data();
    if (pSnap.exists && pData?.status === 'active_partner' &&
        (pData?.tier === 'enterprise' || pData?.tier === 'Enterprise')) {
      isEnterprisePartner = true;
      actorResolvedBy = id === callerUid ? 'uid' : 'verified_address';
      actorOrganizationId = String(pData?.organizationId || pSnap.id);
      break;
    }
  }
  if (!isEnterprisePartner || !actorResolvedBy) {
    throw new HttpsError('permission-denied', 'Only an active enterprise partner can manage staff.');
  }

  // The enterprise's roster is namespaced under the caller's uid.
  const membersCol = db.collection('enterprise_staff').doc(callerUid).collection('members');

  try {
    if (action === 'invite') {
      const cleanAddress = (typeof email === 'string' ? email : "").toLowerCase().trim();
      if (!cleanAddress || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanAddress)) {
        throw new HttpsError('invalid-argument', 'A valid staff email is required.');
      }
      // An unrecognized role used to be SILENTLY COERCED to 'venue_staff'. Coercing an
      // authorization input hides a caller error and grants something nobody asked for.
      if (!isEnterpriseStaffRole(role)) {
        throw new HttpsError('invalid-argument', `role must be one of: ${ENTERPRISE_STAFF_ROLES.join(', ')}.`);
      }
      const cleanRole = role as string;

      // Resolve an EXISTING Firebase Auth user; roles bind to a real uid.
      let staffRecord;
      try {
        staffRecord = await admin.auth().getUserByEmail(cleanAddress);
      } catch {
        throw new HttpsError('not-found', 'No Golfriend account exists for that email. Ask them to sign up first.');
      }
      // THE TARGET'S ADDRESS MUST BE VERIFIED. getUserByEmail resolves whoever
      // registered that address FIRST, and Firebase does not require verification to
      // register. Binding a role grant to that alone hands the grant to whoever got
      // there first — the same defect as trusting an unverified caller address,
      // pointed at the recipient instead.
      if (staffRecord.emailVerified !== true) {
        throw new HttpsError('failed-precondition', 'That account has not verified its email address yet. Ask them to verify it, then invite again.');
      }
      if (staffRecord.uid === callerUid) {
        throw new HttpsError('failed-precondition', 'You cannot add yourself as staff.');
      }

      // The registry is read at a KNOWN PATH — one document, no query, no index, and
      // no way for a same-named subcollection in another domain to appear in it.
      const registryRef = db.collection(MEMBERSHIP_REGISTRY_COLLECTION).doc(staffRecord.uid);
      // The page is BOUNDED and a FULL page fails closed: a bare limit silently
      // answered "no foreign membership" for anyone whose next document was the
      // foreign one.
      const MEMBERSHIP_PAGE = 50;
      let existingMembership;
      try {
        existingMembership = await db.collectionGroup('members')
          .where('staffUid', '==', staffRecord.uid).limit(MEMBERSHIP_PAGE).get();
      } catch {
        // Includes FAILED_PRECONDITION when the collection-group index is absent.
        // Refusing is correct: without the query we cannot rule out a foreign
        // enterprise, and assuming "unattached" is how a principal gets re-homed.
        throw new HttpsError('unavailable', 'Could not confirm existing staff membership. No change was made.');
      }

      // PATH-QUALIFIED, REGISTRY-VALIDATED ADMISSION. Every candidate is judged by
      // WHERE it is and whether it agrees with its own location — not by the fact that
      // a query for a subcollection named `members` returned it.
      const registrySnap = await registryRef.get();
      const registryVerdict = registrySnap.exists
        ? evaluateMembershipCandidate({
          path: `enterprise_staff/${String(registrySnap.data()?.enterpriseUid || '')}/members/${staffRecord.uid}`,
          data: registrySnap.data(),
          expectedStaffUid: staffRecord.uid,
          callerUid,
          callerOrganizationId: actorOrganizationId,
        })
        : null;
      const candidateVerdicts = existingMembership.docs.map((d) => evaluateMembershipCandidate({
        path: d.ref?.path,
        data: d.data(),
        expectedStaffUid: staffRecord.uid,
        callerUid,
        callerOrganizationId: actorOrganizationId,
      }));
      const admission = decideMembershipAdmission({
        registry: registryVerdict,
        candidates: candidateVerdicts,
        saturated: existingMembership.size >= MEMBERSHIP_PAGE,
      });
      if (admission.decision !== 'proceed') {
        logger.warn(`🧑‍💼 membership admission refused for ${staffRecord.uid}: ${JSON.stringify(admission.counts)}`);
        throw new HttpsError(admission.code as any, admission.reason);
      }

      // MEMBERSHIP AND EVIDENCE ARE ONE ATOMIC WRITE. Writing the member document
      // first and the audit afterwards means a failed audit leaves a real, unevidenced
      // grant behind while the caller is told nothing changed.
      //
      // grantSeq separates a REPLAY from a RE-GRANT, and it lives OUTSIDE the
      // membership: derived from the member document it would reset to zero on
      // removal, colliding with the original audit id and making a removed principal
      // permanently un-re-grantable. `remove` never touches this counter.
      const staffDocRef = membersCol.doc(staffRecord.uid);
      const auditCol = db.collection(GRANT_AUDIT_COLLECTION);
      const grantCounterRef = db.collection(GRANT_COUNTER_COLLECTION).doc(`${callerUid}__${staffRecord.uid}`);
      const outcome = await db.runTransaction(async (tx) => {
        const current = await tx.get(staffDocRef);
        const currentData = current.exists ? (current.data() || {}) : {};
        // An identical, already-active grant is a replay: no state change, no new evidence.
        if (current.exists && currentData.status === 'active' && currentData.role === cleanRole
            && String(currentData.enterpriseUid || '') === callerUid) {
          return { grantSeq: Number(currentData.grantSeq) || 1, replayed: true };
        }
        const counterSnap = await tx.get(grantCounterRef);
        const grantSeq = (Number(counterSnap.data()?.grants) || 0) + 1;
        const grantAuditId = `${callerUid}__${staffRecord.uid}__${cleanRole}__${grantSeq}`;
        // create() INSIDE the transaction: if this evidence cannot be written the whole
        // transaction aborts, so the grant cannot exist without its record.
        tx.create(auditCol.doc(grantAuditId), {
          grantId: grantAuditId,
          enterpriseUid: callerUid,
          organizationId: actorOrganizationId,
          staffUid: staffRecord.uid,
          role: cleanRole,
          grantSeq,
          previousRole: typeof currentData.role === 'string' ? currentData.role : null,
          actorUid: callerUid,
          actorResolvedBy,
          targetAddressVerified: true,
          grantedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        tx.set(staffDocRef, {
          staffUid: staffRecord.uid,
          contactAddress: cleanAddress,
          role: cleanRole,
          status: 'active',
          enterpriseUid: callerUid,
          // The organization binding and registry version are what make this record
          // evaluable later; without them it is indistinguishable from a legacy row.
          organizationId: actorOrganizationId,
          registryVersion: MEMBERSHIP_REGISTRY_VERSION,
          grantSeq,
          invitedAt: admin.firestore.FieldValue.serverTimestamp(),
          invitedBy: callerUid,
        }, { merge: true });
        tx.set(registryRef, {
          staffUid: staffRecord.uid,
          enterpriseUid: callerUid,
          organizationId: actorOrganizationId,
          role: cleanRole,
          status: 'active',
          registryVersion: MEMBERSHIP_REGISTRY_VERSION,
          grantSeq,
          invitedBy: callerUid,
          invitedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        tx.set(grantCounterRef, {
          enterpriseUid: callerUid,
          staffUid: staffRecord.uid,
          grants: grantSeq,
          lastGrantAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        return { grantSeq, replayed: false };
      });

      logger.info(`🧑‍💼 Enterprise ${callerUid} ${outcome.replayed ? 're-confirmed' : 'added'} staff ${staffRecord.uid} (${cleanRole}, grant #${outcome.grantSeq}) via ${actorResolvedBy}.`);
      return { success: true, staffUid: staffRecord.uid, role: cleanRole, grantSeq: outcome.grantSeq, replayed: outcome.replayed };
    }

    // action === 'remove'
    //
    // REMOVAL IS A TOMBSTONE, NOT A DELETE. The old path called delete() on the
    // membership: the grant vanished, the audit trail lost its subject, and nothing
    // recorded who removed whom, when, or why. Revoking authority is itself an
    // authority action and leaves the same evidence granting it does.
    if (!staffUid || typeof staffUid !== 'string' || staffUid.trim() === '') {
      throw new HttpsError('invalid-argument', 'A staffUid is required to remove a member.');
    }
    const { reason, commandId } = payload as { reason?: unknown; commandId?: unknown };
    if (!isRemovalReason(reason)) {
      throw new HttpsError('invalid-argument', `reason must be one of: ${REMOVAL_REASONS.join(', ')}.`);
    }
    // COMMAND IDENTITY. The caller names the command, so an interrupted removal can be
    // retried without removing twice and without a second evidence record.
    if (!isValidCommandId(commandId)) {
      throw new HttpsError('invalid-argument', 'A commandId of 8-64 characters (A-Z, a-z, 0-9, - or _) is required.');
    }
    const removalReason = reason as string;
    const removalCommandId = commandId as string;

    const targetRef = membersCol.doc(staffUid);
    const removalRegistryRef = db.collection(MEMBERSHIP_REGISTRY_COLLECTION).doc(staffUid);
    const removalAuditRef = db.collection(REMOVAL_AUDIT_COLLECTION)
      .doc(`${callerUid}__${staffUid}__${removalCommandId}`);
    const fingerprint = removalFingerprint({
      enterpriseUid: callerUid, staffUid, reason: removalReason, commandId: removalCommandId,
    });

    const removal = await db.runTransaction(async (tx) => {
      const priorAudit = await tx.get(removalAuditRef);
      if (priorAudit.exists) {
        const prior = priorAudit.data() || {};
        // AN ALTERED REPLAY IS NOT A REPLAY. Same command id, different content, means
        // the caller reused an identifier for a different action; honouring either
        // reading would be a guess about which one they meant.
        if (prior.fingerprint !== fingerprint) {
          throw new HttpsError('already-exists', 'That commandId was already used for a different removal.');
        }
        return { replayed: true, removalSeq: Number(prior.removalSeq) || 1 };
      }

      const current = await tx.get(targetRef);
      if (!current.exists) {
        throw new HttpsError('not-found', 'That account is not staff of this enterprise.');
      }
      const currentData = current.data() || {};
      // STALE AUTHORITY. The membership must still belong to this enterprise AND this
      // organization at the moment of removal — a record since re-bound elsewhere is
      // not this caller's to revoke.
      if (String(currentData.enterpriseUid || '') !== callerUid) {
        throw new HttpsError('permission-denied', 'That membership belongs to another enterprise.');
      }
      if (String(currentData.organizationId || '') !== actorOrganizationId) {
        throw new HttpsError('permission-denied', 'That membership is bound to a different organization.');
      }
      if (currentData.status === 'removed') {
        // Already tombstoned under a DIFFERENT command: report it honestly rather than
        // writing a second removal record for an authority that no longer exists.
        return { replayed: true, removalSeq: Number(currentData.removalSeq) || 1 };
      }

      const removalSeq = (Number(currentData.grantSeq) || 0) + 1;
      // IMMUTABLE EVIDENCE FIRST, INSIDE THE TRANSACTION. If this create() fails the
      // whole transaction aborts and the membership is untouched — there is no
      // ordering in which the state changes without its record.
      tx.create(removalAuditRef, {
        removalId: removalAuditRef.id,
        commandId: removalCommandId,
        fingerprint,
        enterpriseUid: callerUid,
        organizationId: actorOrganizationId,
        staffUid,
        removedRole: typeof currentData.role === 'string' ? currentData.role : null,
        grantSeq: Number(currentData.grantSeq) || null,
        removalSeq,
        reason: removalReason,
        actorUid: callerUid,
        actorResolvedBy,
        removedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      tx.set(targetRef, {
        status: 'removed',
        previousRole: typeof currentData.role === 'string' ? currentData.role : null,
        removedAt: admin.firestore.FieldValue.serverTimestamp(),
        removedBy: callerUid,
        removalCommandId,
        removalReason,
        removalSeq,
        registryVersion: MEMBERSHIP_REGISTRY_VERSION,
      }, { merge: true });
      tx.set(removalRegistryRef, {
        staffUid,
        enterpriseUid: callerUid,
        organizationId: actorOrganizationId,
        status: 'removed',
        registryVersion: MEMBERSHIP_REGISTRY_VERSION,
        removalSeq,
        removedBy: callerUid,
        removedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      return { replayed: false, removalSeq };
    });

    logger.info(`🧑‍💼 Enterprise ${callerUid} ${removal.replayed ? 're-confirmed removal of' : 'removed'} staff ${staffUid} (${removalReason}, #${removal.removalSeq}).`);
    return { success: true, staffUid, removalSeq: removal.removalSeq, replayed: removal.replayed };
  } catch (error: any) {
    if (error instanceof HttpsError) throw error;
    logger.error("🧑‍💼 Enterprise staff management failed:", error);
    throw new HttpsError('internal', error.message || 'Staff management failed.');
  }
});
void legacyManageEnterpriseStaff;
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

    // AUTHORIZATION: server-owned active platform staff ONLY, derived from the
    // admin_users/{uid} document — the same authority as the approved portal
    // role journey. No email break-glass / God-Mode / client role / env bypass.
    // Fail-closed for missing, inactive, suspended or unauthorized staff records.
    const adminSnap = await db.collection('admin_users').doc(callerUid).get();
    if (!isActiveStaff(adminSnap.exists ? adminSnap.data() : null)) {
      throw new HttpsError('permission-denied', 'Only active platform staff can run the course sync.');
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

      const decision = mode === 'preview'
        ? runSyncCoursesFromProviderPreview('preview', [{ courseId: t.courseID, existing: t.data }], new Map([
          [t.courseID, { kind: 'response' as const, course: provider }],
        ])).results[0]
        : classifyCourseSync(t.courseID, t.data, provider);
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

export const setManualCourseCoordinates = onCall({ memory: "256MiB" }, async (request) => {
  if (!request.auth || !request.auth.uid) throw new HttpsError('unauthenticated', 'You must be logged in.');
  const callerUid = request.auth.uid;
  const adminSnap = await db.collection('admin_users').doc(callerUid).get();
  if (!isActiveStaff(adminSnap.exists ? adminSnap.data() : null)) {
    throw new HttpsError('permission-denied', 'Only active platform staff can correct course coordinates.');
  }

  let correction;
  try { correction = normalizeManualCourseCorrection(request.data); }
  catch { throw new HttpsError('invalid-argument', 'Enter a valid course identifier and coordinates.'); }

  await db.runTransaction(async (tx) => {
    const ref = db.collection('courses').doc(correction.courseId);
    const fresh = await tx.get(ref);
    if (!fresh.exists) throw new HttpsError('not-found', 'Course record not found.');
    const current = fresh.data() || {};
    const before = {
      latitude: current.latitude ?? current.lat ?? null,
      longitude: current.longitude ?? current.lng ?? null,
      gpsSource: current.gpsSource ?? null,
    };
    tx.set(ref, {
      latitude: correction.latitude,
      longitude: correction.longitude,
      lat: correction.latitude,
      lng: correction.longitude,
      gpsSource: 'manual',
      manualLock: true,
      trusted: true,
      requiresManualGPS: false,
      manualCorrectedAt: new Date().toISOString(),
      updatedByUid: callerUid,
    }, { merge: true });
    tx.set(db.collection('course_sync_audit').doc(), {
      courseId: correction.courseId,
      source: 'manual',
      updatedByUid: callerUid,
      before,
      after: { latitude: correction.latitude, longitude: correction.longitude, gpsSource: 'manual' },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  return { success: true, courseId: correction.courseId, source: 'manual', locked: true };
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
  // GATED AT THE READ. An address only stands in for an identity once Firebase
  // says it was VERIFIED; anyone can register an address they do not control.
  const callerAddressVerified = request.auth.token?.email_verified === true;
  const callerEmail = callerAddressVerified ? (request.auth.token?.email || "").toLowerCase() : "";

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
// ⚖️ MODERATION STRIKE (Server-Authoritative Ban / Penalty)
// ==========================================
// A ToS strike bans users and finalizes their reputation/role state. Clients
// must not write another user's moderation/role state, choose the penalty, or
// compile PII into a blacklist. This callable is the sole path: Director-only,
// fixed per-tier penalties, target derived from the ticket, applied atomically
// and once (guarded on the ticket not already being struck) with a floored
// reliability and a server-read blacklist entry on a permanent ban.
const STRIKE_TIERS: Record<number, { delta: number; setZero: boolean; ban: boolean; badge: string }> = {
  1: { delta: -15, setZero: false, ban: false, badge: 'Warning: Policy Violation' },
  2: { delta: -25, setZero: false, ban: false, badge: 'Suspended: Unreliable' },
  3: { delta: 0, setZero: true, ban: true, badge: 'Banned: Zero Tolerance' },
};

export const applyModerationStrike = onCall({ memory: "256MiB" }, async (request) => {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError('unauthenticated', 'You must be logged in.');
  }

  const callerUid = request.auth.uid;
  const { ticketId, tier, reason } = request.data || {};

  const tierNum = Number(tier);
  if (!ticketId || typeof ticketId !== 'string') {
    throw new HttpsError('invalid-argument', 'A ticket id is required.');
  }
  if (![1, 2, 3].includes(tierNum)) {
    throw new HttpsError('invalid-argument', 'Strike tier must be 1, 2, or 3.');
  }
  if (!reason || typeof reason !== 'string' || !reason.trim()) {
    throw new HttpsError('invalid-argument', 'An audit reason is required.');
  }
  const safeReason = reason.trim().slice(0, 500);

  // AUTHORIZATION: active Director only (server-owned admin_users role). No email/God-Mode.
  const adminSnap = await db.collection('admin_users').doc(callerUid).get();
  if (!isActiveDirector(adminSnap.exists ? adminSnap.data() : null)) {
    throw new HttpsError('permission-denied', 'Only the Director can issue moderation strikes.');
  }

  const cfg = STRIKE_TIERS[tierNum];
  const ticketRef = db.collection('supportTickets').doc(ticketId);
  const strikeTxRef = db.collection('transactions').doc(`tos_strike_${ticketId}`);

  try {
    const result = await db.runTransaction(async (tx) => {
      const ticketSnap = await tx.get(ticketRef);
      if (!ticketSnap.exists) {
        throw new HttpsError('not-found', 'Support ticket not found.');
      }
      const ticket = ticketSnap.data() || {};
      // Idempotency: a ticket can be struck only once.
      if (ticket.status === 'closed_with_strike') {
        throw new HttpsError('failed-precondition', 'This ticket has already been resolved with a strike.');
      }

      // Target derived from the ticket (server truth), never the client.
      const targetUserId = ticket.reportedUserId || ticket.senderId;
      if (!targetUserId) {
        throw new HttpsError('failed-precondition', 'No target user is associated with this ticket.');
      }

      const userRef = db.collection('users').doc(targetUserId);
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) {
        throw new HttpsError('not-found', 'Target player profile not found.');
      }
      const uData = userSnap.data() || {};
      const current = Number(uData.reliability_score ?? 0);
      const newReliability = cfg.setZero ? 0 : Math.max(0, current + cfg.delta);

      const userUpdate: Record<string, unknown> = {
        reliability_score: newReliability,
        isVerified: false,
        behavior_badge: cfg.badge,
      };
      if (cfg.ban) userUpdate.isBanned = true;
      tx.set(userRef, userUpdate, { merge: true });

      // Permanent ban → server-read blacklist entry (PII compiled server-side,
      // never handed to or chosen by the client).
      if (cfg.ban) {
        const blacklistRef = db.collection('blacklist').doc(targetUserId);
        tx.set(blacklistRef, {
          uid: targetUserId,
          email: uData.email || 'NOT_CAPTURED',
          phone: uData.phone_number || 'NOT_CAPTURED',
          deviceId: uData.fcm_token || 'NOT_CAPTURED',
          reason: safeReason,
          bannedByUid: callerUid,
          bannedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }

      // Close the ticket.
      tx.update(ticketRef, {
        status: 'closed_with_strike',
        strikeTier: tierNum,
        strikeReason: safeReason,
        resolvedByUid: callerUid,
        resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Immutable audit receipt (deterministic id → idempotent).
      tx.set(strikeTxRef, {
        userId: targetUserId,
        title: `ToS STRIKE TIER ${tierNum}: ${safeReason}`,
        amount: 0,
        type: 'TOS_PENALTY',
        status: 'completed',
        enforcedBy: 'SYSTEM',
        resolvedByUid: callerUid,
        strikeTier: tierNum,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { targetUserId, tier: tierNum, newReliability, banned: cfg.ban };
    });

    logger.info(`⚖️ Strike T${result.tier} applied to ${result.targetUserId} by ${callerUid} (ticket ${ticketId}).`);
    return { success: true, ...result };
  } catch (error: any) {
    if (error instanceof HttpsError) throw error;
    logger.error("⚖️ Moderation strike failed:", error);
    throw new HttpsError('internal', error.message || 'Moderation strike failed.');
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
  // QUARANTINED (prohibited-financial): escrow settlement + chip refund is wallet/settlement authority.
  // Not a valid non-financial V2 operation — disabled with no privileged authority,
  // no email/God-Mode, and no financial/economy mutation. Prior implementation is
  // preserved in git history; a compliant V2 design (if the founder approves one)
  // must be built fresh, not re-enabled by re-authentication.
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError('unauthenticated', 'You must be logged in.');
  }
  throw new HttpsError('unavailable', 'resolveEscrow is disabled in the non-financial V2 world (quarantined: prohibited-financial).');
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
  // GATED AT THE READ. An address only stands in for an identity once Firebase
  // says it was VERIFIED; anyone can register an address they do not control.
  const reporterAddressVerified = request.auth.token?.email_verified === true;
  const reporterEmail = reporterAddressVerified ? (request.auth.token?.email || "").toLowerCase() : "";
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
  // Was an inline denylist ("anything that is not Suspended"), which authorized a
  // document with a missing, unknown or half-written status. Routed through the shared
  // allowlist so there is one definition of active staff, not one per call site.
  if (isActiveStaff(adminSnap.exists ? adminSnap.data() : null)) {
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
// ⚡ ADMIN USER OVERRIDE (Server-Authoritative Wallet + Reliability)
// ==========================================
// The God-Mode "Tactical Override" console mints/burns chips and rewrites a
// user's reliability/verification. That is wallet + reputation settlement state
// and must never be written from the client. This callable is the sole path:
// Director/God-Mode-gated, amounts/enums validated, chips floored at 0 on burn,
// and every change stamped to the immutable ledger with the audit reason.
export const adminOverrideUser = onCall({ memory: "256MiB" }, async (request) => {
  // QUARANTINED (prohibited-financial): mints/burns chips (wallet); coupled reliability path removed pending a non-financial moderation design.
  // Not a valid non-financial V2 operation — disabled with no privileged authority,
  // no email/God-Mode, and no financial/economy mutation. Prior implementation is
  // preserved in git history; a compliant V2 design (if the founder approves one)
  // must be built fresh, not re-enabled by re-authentication.
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError('unauthenticated', 'You must be logged in.');
  }
  throw new HttpsError('unavailable', 'adminOverrideUser is disabled in the non-financial V2 world (quarantined: prohibited-financial).');
});

// ==========================================
// 🤝 B2B PARTNER COMMAND (Server-Authoritative Tier + Wallet)
// ==========================================
// The B2B Partner Command Center grants commercial tier (role) and mints/adjusts
// chips (wallet) — settlement/role state that must never be client-written.
// Director/God-Mode only; transactional; adjustments floored at 0; audited.
export const adminManagePartner = onCall({ memory: "256MiB" }, async (request) => {
  // QUARANTINED (prohibited-financial): mints/adjusts chips (wallet) + commercial tier settlement.
  // Not a valid non-financial V2 operation — disabled with no privileged authority,
  // no email/God-Mode, and no financial/economy mutation. Prior implementation is
  // preserved in git history; a compliant V2 design (if the founder approves one)
  // must be built fresh, not re-enabled by re-authentication.
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError('unauthenticated', 'You must be logged in.');
  }
  throw new HttpsError('unavailable', 'adminManagePartner is disabled in the non-financial V2 world (quarantined: prohibited-financial).');
});

// ==========================================
// 👔 HR STATUS (Server-Authoritative Staff Access Control)
// ==========================================
// Suspending/restoring a staff member changes their dashboard access — a role/
// access grant that must not be client-written. Director-only; cannot suspend
// self; target must be an existing staff record. Mirrors inviteEmployee's gate.
export const setEmployeeStatus = onCall({ memory: "256MiB" }, async (request) => {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError('unauthenticated', 'You must be logged in.');
  }
  const callerUid = request.auth.uid;
  const { uid, status } = request.data || {};

  if (!uid || typeof uid !== 'string') {
    throw new HttpsError('invalid-argument', 'A target uid is required.');
  }
  if (status !== 'Active' && status !== 'Suspended') {
    throw new HttpsError('invalid-argument', 'status must be Active or Suspended.');
  }
  if (uid === callerUid) {
    throw new HttpsError('failed-precondition', 'You cannot change your own access status.');
  }

  try {
    // MASTER GATE: only the Director may change staff access.
    const callerDoc = await db.collection('admin_users').doc(callerUid).get();
    // isActiveDirector: a suspended Director must not be able to change anyone's access,
    // least of all to suspend the Directors who are still active.
    if (!isActiveDirector(callerDoc.exists ? callerDoc.data() : null)) {
      throw new HttpsError('permission-denied', 'Only the Director can change staff access.');
    }

    const targetRef = db.collection('admin_users').doc(uid);
    const targetSnap = await targetRef.get();
    if (!targetSnap.exists) {
      throw new HttpsError('not-found', 'Staff member not found.');
    }

    await targetRef.set({
      status,
      statusChangedByUid: callerUid,
      statusChangedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    logger.info(`👔 Staff ${uid} set to ${status} by ${callerUid}.`);
    return { success: true, uid, status };
  } catch (error: any) {
    if (error instanceof HttpsError) throw error;
    logger.error("👔 Staff status change failed:", error);
    throw new HttpsError('internal', error.message || 'Staff status change failed.');
  }
});

// ==========================================
// 💸 PLATFORM EXPENSE: Server-Authoritative OPEX Ledger Writer
// ==========================================
// The fiat P&L expense log feeds the treasury reconciliation sweep, so the
// ledger write is server-owned: Director/God-Mode only, validated, audit-stamped.
export const logPlatformExpense = onCall({ memory: "256MiB" }, async (request) => {
  // QUARANTINED (prohibited-financial): fiat OPEX / treasury ledger writer.
  // Not a valid non-financial V2 operation — disabled with no privileged authority,
  // no email/God-Mode, and no financial/economy mutation. Prior implementation is
  // preserved in git history; a compliant V2 design (if the founder approves one)
  // must be built fresh, not re-enabled by re-authentication.
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError('unauthenticated', 'You must be logged in.');
  }
  throw new HttpsError('unavailable', 'logPlatformExpense is disabled in the non-financial V2 world (quarantined: prohibited-financial).');
});

// ==========================================
// 🎁 RAFFLE ENGINE: Server-Authoritative Prize Draw
// ==========================================
// The winner is selected server-side over the real registrations and written to
// the authoritative tournament doc — a client can neither pick nor set the winner.
export const drawRaffleWinner = onCall({ memory: "256MiB" }, async (request) => {
  // QUARANTINED (unresolved): raffle prize draw (tournament economy); no approved non-financial V2 policy.
  // Not a valid non-financial V2 operation — disabled with no privileged authority,
  // no email/God-Mode, and no financial/economy mutation. Prior implementation is
  // preserved in git history; a compliant V2 design (if the founder approves one)
  // must be built fresh, not re-enabled by re-authentication.
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError('unauthenticated', 'You must be logged in.');
  }
  throw new HttpsError('unavailable', 'drawRaffleWinner is disabled in the non-financial V2 world (quarantined: unresolved).');
});

// ==========================================
// ⛳ TEE SHEET: Server-Authoritative Flight Check-In & Liability Lock
// ==========================================
// Booking/flight status finalization is server-owned: staff, God-Mode, or the
// course's claimed operator only, guarded on the flight being pending.
export const checkInFlight = onCall({ memory: "256MiB" }, async (request) => {
  // QUARANTINED (unresolved): flight/games check-in; outside non-financial booking scope; no approved V2 policy.
  // Not a valid non-financial V2 operation — disabled with no privileged authority,
  // no email/God-Mode, and no financial/economy mutation. Prior implementation is
  // preserved in git history; a compliant V2 design (if the founder approves one)
  // must be built fresh, not re-enabled by re-authentication.
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError('unauthenticated', 'You must be logged in.');
  }
  throw new HttpsError('unavailable', 'checkInFlight is disabled in the non-financial V2 world (quarantined: unresolved).');
});

// ==========================================
// 🏆 TOURNAMENT OPS: Server-Authoritative Registration + Flight State
// ==========================================
export const manageTournamentOps = onCall({ memory: "256MiB" }, async (request) => {
  // QUARANTINED (unresolved): tournament registration/flight ops; outside non-financial booking scope; no approved V2 policy.
  // Not a valid non-financial V2 operation — disabled with no privileged authority,
  // no email/God-Mode, and no financial/economy mutation. Prior implementation is
  // preserved in git history; a compliant V2 design (if the founder approves one)
  // must be built fresh, not re-enabled by re-authentication.
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError('unauthenticated', 'You must be logged in.');
  }
  throw new HttpsError('unavailable', 'manageTournamentOps is disabled in the non-financial V2 world (quarantined: unresolved).');
});

// ==========================================
// 📸 PHOTO VALIDATION RESOLVER (Server-Authoritative Wallet/Reputation/Moderation)
// ==========================================
// Manual photo approve/reject adjusts chips + reliability + verification/moderation
// on another user — settlement + moderation state that must not be client-written.
// Staff-gated; fixed server-side deltas floored at 0; audited.
export const resolvePhotoValidation = onCall({ memory: "256MiB" }, async (request) => {
  // QUARANTINED (prohibited-financial): adjusts chips +/-50 (wallet) alongside photo moderation.
  // Not a valid non-financial V2 operation — disabled with no privileged authority,
  // no email/God-Mode, and no financial/economy mutation. Prior implementation is
  // preserved in git history; a compliant V2 design (if the founder approves one)
  // must be built fresh, not re-enabled by re-authentication.
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError('unauthenticated', 'You must be logged in.');
  }
  throw new HttpsError('unavailable', 'resolvePhotoValidation is disabled in the non-financial V2 world (quarantined: prohibited-financial).');
});

// ==========================================
// 🚚 FULFILLMENT LEDGER: Server-Authoritative Order Lifecycle
// ==========================================
export const updateFulfillmentOrder = onCall({ memory: "256MiB" }, async (request) => {
  // QUARANTINED (prohibited-commerce): physical-goods order fulfillment lifecycle.
  // Not a valid non-financial V2 operation — disabled with no privileged authority,
  // no email/God-Mode, and no financial/economy mutation. Prior implementation is
  // preserved in git history; a compliant V2 design (if the founder approves one)
  // must be built fresh, not re-enabled by re-authentication.
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError('unauthenticated', 'You must be logged in.');
  }
  throw new HttpsError('unavailable', 'updateFulfillmentOrder is disabled in the non-financial V2 world (quarantined: prohibited-commerce).');
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

// ==========================================
// 📥 PARTNER APPLICATION INTAKE (metadata + checklist + consent + attestation)
// ==========================================
// Authority-compliant intake for the partner onboarding journey. A signed-in
// applicant submits a partner application; SUBMITTING NEVER GRANTS PARTNER STATUS.
// Staff review approves/rejects/requests info; approval only flags a provisioning
// HANDOFF — staff still provision the b2b_partners account separately. Binary
// file upload is not yet available (no Storage): intake captures the applicant's
// attestation that they hold each document. Server-authoritative; the client may
// only read its own partner_submissions/{uid} document.
export const submitPartnerApplication = onCall({ memory: "256MiB" }, async (request) => {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError('unauthenticated', 'You must be logged in.');
  }
  const callerUid = request.auth.uid;
  // GATED AT THE READ. An address only stands in for an identity once Firebase
  // says it was VERIFIED; anyone can register an address they do not control.
  const callerAddressVerified = request.auth.token?.email_verified === true;
  const callerEmail = callerAddressVerified ? (request.auth.token?.email || "").toLowerCase() : "";

  const validation = validateSubmission(request.data || {});
  if (!validation.ok || !validation.clean) {
    throw new HttpsError('invalid-argument', validation.errors.join(' ') || 'Invalid submission.');
  }
  const clean = validation.clean;
  const locale = typeof request.data?.locale === 'string' ? request.data.locale : 'en';

  const ref = db.collection('partner_submissions').doc(callerUid);
  try {
    const out = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const current = (snap.exists ? (snap.data()?.status ?? null) : null) as SubmissionStatus | null;
      if (!canSubmit(current)) {
        throw new HttpsError('failed-precondition', `An application in status "${current}" cannot be resubmitted.`);
      }
      const payload: Record<string, unknown> = {
        applicantUid: callerUid,
        applicantEmail: callerEmail,
        status: statusOnSubmit(),
        checklist: clean.checklist,
        missingDocuments: clean.missingDocuments,
        consentAccepted: true,
        attestationAccepted: true,
        note: clean.note,
        locale,
        // Binary files are NOT accepted yet (no Storage). Attestation only.
        fileUploadAvailable: false,
        submittedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (!snap.exists) payload.createdAt = FieldValue.serverTimestamp();
      tx.set(ref, payload, { merge: true });
      return { status: statusOnSubmit() };
    });
    logger.info(`📥 Partner application submitted by ${callerUid}.`);
    return { success: true, status: out.status };
  } catch (error: any) {
    if (error instanceof HttpsError) throw error;
    logger.error("📥 Partner application submit failed:", error);
    throw new HttpsError('internal', error.message || 'Submission failed.');
  }
});

// Staff review of a partner application. Active-staff only (server-owned
// admin_users role; NO email/God-Mode). Approval flags a provisioning handoff
// but NEVER creates b2b_partners or assigns partner status — provisioning stays
// staff-controlled and separate.
export const reviewPartnerSubmission = onCall({ memory: "256MiB" }, async (request) => {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError('unauthenticated', 'You must be logged in.');
  }
  const callerUid = request.auth.uid;
  const { submissionId, decision, reviewNote } = request.data || {};
  if (!submissionId || typeof submissionId !== 'string') {
    throw new HttpsError('invalid-argument', 'A submissionId is required.');
  }
  if (!isReviewDecision(decision)) {
    throw new HttpsError('invalid-argument', 'A valid review decision is required.');
  }

  // AUTHORIZATION: active platform staff only (server-owned admin_users role).
  const adminSnap = await db.collection('admin_users').doc(callerUid).get();
  if (!isActiveStaff(adminSnap.exists ? adminSnap.data() : null)) {
    throw new HttpsError('permission-denied', 'You are not authorized to review partner applications.');
  }

  const ref = db.collection('partner_submissions').doc(submissionId);
  try {
    const out = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new HttpsError('not-found', 'Partner application not found.');
      const current = (snap.data()?.status ?? null) as SubmissionStatus | null;
      const outcome = applyReview(current, decision);
      if (!outcome.ok || !outcome.status) {
        throw new HttpsError('failed-precondition', outcome.error || 'Invalid review transition.');
      }
      const update: Record<string, unknown> = {
        status: outcome.status,
        reviewNote: typeof reviewNote === 'string' ? reviewNote.trim().slice(0, 2000) : '',
        reviewedBy: callerUid,
        reviewedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };
      // Provisioning HANDOFF only — approval does not assign partner status here.
      if (outcome.readyForProvisioning) {
        update.readyForProvisioning = true;
        update.provisioningStatus = 'pending_staff_provisioning';
      }
      tx.set(ref, update, { merge: true });
      return { status: outcome.status, readyForProvisioning: !!outcome.readyForProvisioning };
    });
    logger.info(`🧾 Partner application ${submissionId} reviewed by staff ${callerUid} → ${out.status}.`);
    return { success: true, status: out.status, readyForProvisioning: out.readyForProvisioning };
  } catch (error: any) {
    if (error instanceof HttpsError) throw error;
    logger.error("🧾 Partner application review failed:", error);
    throw new HttpsError('internal', error.message || 'Review failed.');
  }
});

// Staff-only listing of partner applications for the Admin ingestion queue.
// Active-staff authorization (server-owned admin_users role); Admin SDK read so
// it does not depend on client Firestore rules. Read-only.
export const listPartnerSubmissions = onCall({ memory: "256MiB" }, async (request) => {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError('unauthenticated', 'You must be logged in.');
  }
  const adminSnap = await db.collection('admin_users').doc(request.auth.uid).get();
  if (!isActiveStaff(adminSnap.exists ? adminSnap.data() : null)) {
    throw new HttpsError('permission-denied', 'You are not authorized to view partner applications.');
  }
  try {
    const snap = await db.collection('partner_submissions').get();
    const items = snap.docs.map((d) => {
      const s = d.data() || {};
      return {
        id: d.id,
        status: s.status || 'submitted',
        applicantEmail: s.applicantEmail || '',
        note: s.note || '',
        missingDocuments: Array.isArray(s.missingDocuments) ? s.missingDocuments : [],
        reviewNote: s.reviewNote || '',
        readyForProvisioning: s.readyForProvisioning === true,
      };
    });
    return { success: true, items };
  } catch (error: any) {
    logger.error("🧾 listPartnerSubmissions failed:", error);
    throw new HttpsError('internal', error.message || 'Could not list applications.');
  }
});

// ==========================================
// 🧾 ENTERPRISE OUTREACH — AUTHORITATIVE DRAFT / APPROVAL CALLABLES
//
// The smallest authoritative surface the Admin application needs. EVERY state
// transition happens on this trusted boundary, inside a Firestore transaction, using
// server-resolved identity and roles. The client cannot transition a draft, cannot
// assign itself as reviewer, cannot supply its own role or digest, and cannot approve
// its own work — those decisions are made in outreachAuthority.ts from persisted values.
//
// Refusals return a STABLE error code the Admin UI localizes into all eight locales.
// No record field, reviewer identity, stack or internal message crosses the boundary,
// so an error string can never become an identity-disclosure channel.
//
// NO EMAIL IS SENT. NO COURSE IS CONTACTED. NO PARTNER STATUS IS CHANGED. Approval
// records an approval; TRANSMISSION_ENABLED is false and there is no transmitter here.
// ==========================================
const outreachStore = createOutreachStore(db);

/** Server clock. A caller-supplied timestamp could walk a draft past its own expiry. */
const outreachNow = () => new Date().toISOString();

/** Caller context assembled from VERIFIED runtime values only — never from request.data. */
function outreachCaller(request: { auth?: { uid?: string } | null; app?: unknown }): OutreachCallerContext {
  return {
    uid: request.auth && typeof request.auth.uid === 'string' ? request.auth.uid : null,
    // Resolved inside the transaction from admin_users; never taken from the client.
    adminDoc: null,
    appCheckVerified: !!request.app,
  };
}

export const outreachDraftCommand = onCall({ memory: "256MiB" }, async (request) => {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError('unauthenticated', 'You must be logged in.');
  }
  const caller = outreachCaller(request);
  const data = (request.data || {}) as Record<string, unknown>;
  const op = data.op;
  const now = outreachNow();

  try {
    if (op === 'create') {
      return await outreachStore.createDraft({
        caller, draftId: data.draftId, content: data.content,
        jurisdiction: data.jurisdiction, expiresAt: data.expiresAt ?? null,
        commandId: data.commandId, now,
      });
    }
    if (op === 'assign') {
      return await outreachStore.assignReviewer({
        caller, draftId: data.draftId, expectedVersion: data.expectedVersion,
        reviewerUid: data.reviewerUid, commandId: data.commandId, now,
      });
    }
    if (op === 'transition') {
      return await outreachStore.transition({
        caller, draftId: data.draftId, expectedVersion: data.expectedVersion,
        requestedState: data.requestedState,
        // No content: the server reads the persisted content and re-derives the digest.
        commandId: data.commandId, now,
      });
    }
    return { ok: false, code: 'payload_rejected', replayed: false, draftId: null, state: null, version: null, receiptId: null };
  } catch (error: any) {
    // The underlying message is logged server-side and NEVER returned: a store error
    // string can carry document paths and field values.
    logger.error('🧾 Outreach draft command failed:', error);
    return { ok: false, code: 'internal_error', replayed: false, draftId: null, state: null, version: null, receiptId: null };
  }
});

/** Read-only projection for the Admin surface. Carries no identity but the caller's own. */
export const listOutreachDrafts = onCall({ memory: "256MiB" }, async (request) => {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError('unauthenticated', 'You must be logged in.');
  }
  try {
    const limit = typeof (request.data || {}).limit === 'number' ? (request.data as any).limit : 50;
    return await outreachStore.listDrafts(outreachCaller(request), limit);
  } catch (error: any) {
    logger.error('🧾 Outreach draft listing failed:', error);
    return { ok: false, code: 'internal_error', rows: [] };
  }
});
