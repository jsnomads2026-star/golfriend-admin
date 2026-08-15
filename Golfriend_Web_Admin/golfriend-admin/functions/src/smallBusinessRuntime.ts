import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  canonicalizeLocationIdentity,
  commandKey,
  correctionTransition,
  digest,
  discoveryCard,
  inquiryTransition,
  normalizeProfile,
  normalizeDiscoveryFilter,
  normalizePromotion,
  prepareJhcc,
  promotionTransition,
  publicationAllowed,
  replay,
  requireSeparation,
  requireUniqueReportEvidence,
  resolvePlan,
  SMALL_BUSINESS_COMMAND_SCHEMA,
  SMALL_BUSINESS_CORRECTION_SCHEMA,
  SMALL_BUSINESS_PROMOTION_SCHEMA,
  SMALL_BUSINESS_RECEIPT_SCHEMA,
  SMALL_BUSINESS_SCHEMA,
  strictId,
  strictVersion,
  subscriptionIntent,
  transition,
  type SmallBusinessStatus,
} from "./smallBusinessDomain.js";
if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore(),
  stamp = () => admin.firestore.FieldValue.serverTimestamp();
const iso = (v: any) =>
  v?.toDate?.()?.toISOString?.() ||
  (typeof v === "string" && Number.isFinite(Date.parse(v))
    ? new Date(v).toISOString()
    : null);
type CommandAuthority = {
  ref: any;
  kind: "representative" | "admin";
  businessId?: string;
};
function uid(r: any) {
  const x = String(r.auth?.uid || "");
  if (!x) throw new HttpsError("unauthenticated", "Authentication required.");
  if (r.auth?.token?.email_verified !== true)
    throw new HttpsError("permission-denied", "Verified identity required.");
  return x;
}
const actor = (u: string) => `actor_${digest(u).slice(0, 32)}`;
function current(x: any, now = Date.now()) {
  const start =
      x?.effectiveAt?.toMillis?.() ?? Date.parse(String(x?.effectiveAt || "")),
    end =
      x?.expiresAt?.toMillis?.() ??
      (x?.expiresAt ? Date.parse(String(x.expiresAt)) : Infinity);
  return (
    x?.status === "active" &&
    !x.suspendedAt &&
    Number.isFinite(start) &&
    start <= now &&
    end > now
  );
}
async function representative(r: any, businessId?: string) {
  const u = uid(r),
    matches = await db
      .collection("small_business_representative_bindings")
      .where("uid", "==", u)
      .limit(2)
      .get();
  if (matches.size !== 1)
    throw new HttpsError(
      "permission-denied",
      "One active representative binding required.",
    );
  const snap = matches.docs[0],
    x = snap.data(),
    actorRef = actor(u);
  if (
    !current(x) ||
    !Number.isSafeInteger(x.version) ||
    (businessId && x.businessId !== businessId)
  )
    throw new HttpsError(
      "permission-denied",
      "Active representative binding required.",
    );
  return {
    uid: u,
    actorRef,
    businessId: String(x.businessId),
    bindingVersion: x.version,
    commandAuthority: {
      ref: snap.ref,
      kind: "representative" as const,
      businessId: String(x.businessId),
    },
  };
}
async function reviewer(r: any) {
  const u = uid(r),
    snap = await db.collection("admin_users").doc(u).get(),
    x = snap.data(),
    actorRef = actor(u);
  if (
    !snap.exists ||
    !current(x) ||
    !["admin", "director", "reviewer"].includes(x!.role)
  )
    throw new HttpsError(
      "permission-denied",
      "Active reviewer authority required.",
    );
  return {
    uid: u,
    actorRef,
    role: x!.role,
    authorityVersion: String(x!.authorityVersion || x!.version || ""),
    commandAuthority: { ref: snap.ref, kind: "admin" as const },
  };
}
const fail = (e: any): never => {
  if (e instanceof HttpsError) throw e;
  const m = String(e?.message || e);
  if (/INVALID|CALLER|CHANGED|SEPARATION/.test(m))
    throw new HttpsError("invalid-argument", m);
  if (/VERSION|STATE|UNAVAILABLE|ELIGIBLE|PUBLISH/.test(m))
    throw new HttpsError("failed-precondition", m);
  throw new HttpsError("internal", "Small Business operation failed.");
};
async function business(id: string) {
  const s = await db.collection("small_businesses").doc(id).get();
  if (!s.exists) throw new HttpsError("not-found", "Business unavailable.");
  return { ref: s.ref, x: s.data()! };
}
function portal(x: any, extras: any = {}) {
  return {
    schema: SMALL_BUSINESS_SCHEMA,
    state: "current",
    business: {
      businessId: x.businessId,
      status: x.status,
      version: x.version,
      legalName: x.profile?.legalName,
      displayName: x.profile?.publicName,
      registrationReference: x.profile?.registrationReference,
      category: x.profile?.category,
      serviceDescription: x.profile?.serviceDescription,
      serviceArea: x.profile?.serviceArea,
      supportedLocales: x.profile?.supportedLocales || [],
      country: x.profile?.locations?.[0]?.countryCode,
      verificationState: x.verificationState || "unverified",
      subscriptionState: x.subscriptionState || "not_prepared",
    },
    locations: (x.profile?.locations || []).map((l: any) => ({
      locationId: l.locationId,
      name: l.name,
      label: l.name,
      address: l.address,
      city: l.city,
      countryCode: l.countryCode,
      country: l.countryCode,
      serviceArea: l.serviceArea,
      operatingHours: l.operatingHours,
      hours: l.operatingHours,
    })),
    evidenceReferences: (x.profile?.evidenceReferences || []).map((e: any) => ({
      evidenceId: e.evidenceId,
      kind: e.kind,
      objectReference: e.objectReference,
      contentDigest: e.contentDigest,
    })),
    profileCorrection: extras.profileCorrection || null,
    plans: extras.plans || [],
    subscriptionIntents: extras.subscriptionIntents || [],
    promotions: extras.promotions || [],
    receipts: extras.receipts || [],
    privacy: "minimum_necessary",
  };
}
async function command(
  tx: any,
  ref: any,
  input: any,
  ctx: { actorRef: string; action: string; authority: CommandAuthority },
): Promise<any> {
  const binding = ctx.authority,
    authority = await tx.get(binding.ref),
    authorityData = authority.data();
  if (
    !authority.exists ||
    !current(authorityData) ||
    (binding.kind === "representative" &&
      (authorityData?.businessId !== binding.businessId ||
        !Number.isSafeInteger(authorityData?.version))) ||
    (binding.kind === "admin" &&
      !["admin", "director", "reviewer"].includes(authorityData?.role))
  )
    throw new HttpsError(
      "permission-denied",
      "Authority changed during command.",
    );
  const commandId = strictId(input.commandId, "COMMAND"),
    payloadDigest = digest(input),
    key = commandKey(ctx.actorRef, commandId, ctx.action),
    c = db.collection("small_business_commands").doc(key),
    old = await tx.get(c);
  if (replay(old.exists ? old.data() : null, payloadDigest) === "exact")
    return { exact: true, result: old.data().result };
  tx.create(c, {
    schema: SMALL_BUSINESS_COMMAND_SCHEMA,
    commandId,
    action: ctx.action,
    actorRef: ctx.actorRef,
    payloadDigest,
    targetRef: ref.path,
    authorityVersion: authorityData?.authorityVersion || authorityData?.version,
    createdAt: stamp(),
    immutable: true,
  });
  return { exact: false, c, key, payloadDigest };
}
export const getSmallBusinessPortalV1 = onCall(
  { enforceAppCheck: true },
  async (r) => {
    const a = await representative(r),
      x = (await business(a.businessId)).x,
      jurisdiction = String(x.profile?.locations?.[0]?.countryCode || ""),
      [promotions, receipts, intents, plans] = await Promise.all([
        db
          .collection("small_business_promotions")
          .where("businessId", "==", a.businessId)
          .limit(50)
          .get(),
        db
          .collection("small_business_approval_receipts")
          .where("businessId", "==", a.businessId)
          .limit(50)
          .get(),
        db
          .collection("small_business_subscription_intents")
          .where("businessId", "==", a.businessId)
          .limit(20)
          .get(),
        economyCatalogue(jurisdiction),
      ]);
    return portal(x, {
      plans,
      subscriptionIntents: intents.docs.map((d) => {
        const z = d.data();
        return {
          intentId: z.intentId,
          planId: z.planId,
          planVersion: z.planVersion,
          status: z.state,
          createdAt: iso(z.createdAt),
          accountingState: z.accountingState,
          entitlementState: z.entitlementState,
          revenueState: z.revenueState,
        };
      }),
      promotions: promotions.docs.map((d) => {
        const z = d.data();
        return {
          promotionId: z.promotionId,
          status: z.status,
          version: z.version,
          locale: z.locales?.[0] || null,
          jurisdiction: z.jurisdictions?.[0] || null,
          contentDigest: z.contentDigest,
          disclosure:
            z.sponsoredDisclosure === true ? "sponsored_partner" : "partner",
          effectiveAt: iso(z.effectiveAt),
          expiresAt: iso(z.expiresAt),
        };
      }),
      receipts: receipts.docs.map((d) => {
        const z = d.data();
        return {
          receiptId: z.receiptId,
          action: z.action,
          status: z.status,
          version: z.businessVersion,
          occurredAt: iso(z.createdAt),
          immutable: true,
        };
      }),
    });
  },
);
export const saveSmallBusinessProfileV1 = onCall(
  { enforceAppCheck: true },
  async (r) => {
    try {
      const a = await representative(r),
        profile = normalizeProfile(r.data?.profile),
        expected = strictVersion(r.data?.expectedVersion),
        ref = db.collection("small_businesses").doc(a.businessId);
      return await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref),
          x = snap.data() || {},
          cmd = await command(tx, ref, r.data, {
            actorRef: a.actorRef,
            authority: a.commandAuthority,
            action: "save_profile",
          });
        if (cmd.exact) return cmd.result;
        if (
          (x.version || 0) !== expected ||
          ![undefined, "draft", "changes_requested"].includes(x.status)
        )
          throw new Error("VERSION_OR_STATE_INVALID");
        const result = {
          schema: SMALL_BUSINESS_SCHEMA,
          state: "current",
          businessId: a.businessId,
          status: x.status || "draft",
          version: expected + 1,
          profileDigest: digest(profile),
        };
        tx.set(
          ref,
          {
            schema: SMALL_BUSINESS_SCHEMA,
            businessId: a.businessId,
            representativeRef: a.actorRef,
            representativeBindingVersion: a.bindingVersion,
            status: x.status || "draft",
            version: expected + 1,
            profile,
            profileDigest: digest(profile),
            updatedAt: stamp(),
            createdAt: x.createdAt || stamp(),
          },
          { merge: true },
        );
        tx.update(cmd.c, { result });
        return result;
      });
    } catch (e) {
      fail(e);
    }
  },
);
export const submitSmallBusinessProfileV1 = saveSmallBusinessProfileV1;
export const saveSmallBusinessProfileCorrectionV1 = onCall(
  { enforceAppCheck: true },
  async (r) => {
    try {
      const a = await representative(r),
        commandId = strictId(r.data?.commandId, "COMMAND"),
        businessRecord = (await business(a.businessId)).x;
      if (!["approved", "active"].includes(businessRecord.status))
        throw new Error("BUSINESS_NOT_ELIGIBLE");
      const locations = canonicalizeLocationIdentity(
          businessRecord.profile.locations,
          r.data?.profile?.locations || [],
          a.businessId,
          commandId,
        ),
        profile = normalizeProfile({ ...r.data.profile, locations }),
        expected = strictVersion(r.data?.expectedVersion),
        ref = db
          .collection("small_business_profile_corrections")
          .doc(a.businessId);
      return await db.runTransaction(async (tx) => {
        const [currentBusiness, currentCorrection] = await Promise.all([
            tx.get(db.collection("small_businesses").doc(a.businessId)),
            tx.get(ref),
          ]),
          b = currentBusiness.data()!,
          x = currentCorrection.data() || {},
          cmd = await command(tx, ref, r.data, {
            actorRef: a.actorRef,
            authority: a.commandAuthority,
            action: "save_profile_correction",
          });
        if (cmd.exact) return cmd.result;
        const terminal = ["approved", "rejected", "withdrawn"].includes(
            String(x.status || ""),
          ),
          editable =
            !x.status || ["draft", "changes_requested"].includes(x.status);
        if (
          !["approved", "active"].includes(b.status) ||
          b.version !== businessRecord.version ||
          (x.version || 0) !== expected ||
          (!editable && !terminal)
        )
          throw new Error("VERSION_OR_STATE_INVALID");
        const cycle = terminal
            ? Number(x.cycle || 1) + 1
            : Number(x.cycle || 1),
          correctionId = `sbc_${digest([a.businessId, cycle]).slice(0, 32)}`,
          result = {
            schema: SMALL_BUSINESS_CORRECTION_SCHEMA,
            businessId: a.businessId,
            correctionId,
            status: "draft",
            version: expected + 1,
            cycle,
            baseBusinessVersion: b.version,
          };
        tx.set(
          ref,
          {
            ...result,
            profile,
            profileDigest: digest(profile),
            representativeRef: a.actorRef,
            createdAt: terminal || !x.createdAt ? stamp() : x.createdAt,
            submittedAt: terminal
              ? admin.firestore.FieldValue.delete()
              : x.submittedAt,
            reviewedByRef: terminal
              ? admin.firestore.FieldValue.delete()
              : x.reviewedByRef,
            reviewedAt: terminal
              ? admin.firestore.FieldValue.delete()
              : x.reviewedAt,
            updatedAt: stamp(),
          },
          { merge: true },
        );
        tx.update(cmd.c, { result });
        return result;
      });
    } catch (e) {
      fail(e);
    }
  },
);
export const getSmallBusinessProfileCorrectionV1 = onCall(
  { enforceAppCheck: true },
  async (r) => {
    const a = await representative(r),
      snap = await db
        .collection("small_business_profile_corrections")
        .doc(a.businessId)
        .get();
    if (!snap.exists)
      return {
        schema: SMALL_BUSINESS_CORRECTION_SCHEMA,
        state: "empty",
        correction: null,
      };
    const x = snap.data()!;
    return {
      schema: SMALL_BUSINESS_CORRECTION_SCHEMA,
      state: "current",
      correction: {
        correctionId: x.correctionId,
        businessId: x.businessId,
        status: x.status,
        version: x.version,
        baseBusinessVersion: x.baseBusinessVersion,
        cycle: x.cycle,
        profile: x.profile,
        profileDigest: x.profileDigest,
      },
      privacy: "applicant_owned",
    };
  },
);
export const submitSmallBusinessProfileCorrectionV1 = onCall(
  { enforceAppCheck: true },
  async (r) => {
    try {
      const a = await representative(r),
        expected = strictVersion(r.data?.expectedVersion),
        ref = db
          .collection("small_business_profile_corrections")
          .doc(a.businessId);
      return await db.runTransaction(async (tx) => {
        const [c, b] = await Promise.all([
          tx.get(ref),
          tx.get(db.collection("small_businesses").doc(a.businessId)),
        ]);
        if (!c.exists) throw new Error("CORRECTION_UNAVAILABLE");
        const x = c.data()!,
          businessData = b.data()!,
          cmd = await command(tx, ref, r.data, {
            actorRef: a.actorRef,
            authority: a.commandAuthority,
            action: "submit_profile_correction",
          });
        if (cmd.exact) return cmd.result;
        if (
          !["approved", "active"].includes(businessData.status) ||
          x.version !== expected ||
          x.baseBusinessVersion !== businessData.version
        )
          throw new Error("VERSION_OR_STATE_INVALID");
        const status = correctionTransition(x.status, "submit"),
          result = {
            schema: SMALL_BUSINESS_CORRECTION_SCHEMA,
            businessId: a.businessId,
            correctionId: x.correctionId,
            status,
            version: expected + 1,
            cycle: x.cycle,
            baseBusinessVersion: x.baseBusinessVersion,
          };
        tx.update(ref, {
          status,
          version: expected + 1,
          submittedAt: stamp(),
          updatedAt: stamp(),
        });
        tx.update(cmd.c, { result });
        return result;
      });
    } catch (e) {
      fail(e);
    }
  },
);
export const withdrawSmallBusinessProfileCorrectionV1 = onCall(
  { enforceAppCheck: true },
  async (r) => {
    try {
      const a = await representative(r),
        expected = strictVersion(r.data?.expectedVersion),
        ref = db
          .collection("small_business_profile_corrections")
          .doc(a.businessId);
      return await db.runTransaction(async (tx) => {
        const c = await tx.get(ref);
        if (!c.exists) throw new Error("CORRECTION_UNAVAILABLE");
        const x = c.data()!,
          cmd = await command(tx, ref, r.data, {
            actorRef: a.actorRef,
            authority: a.commandAuthority,
            action: "withdraw_profile_correction",
          });
        if (cmd.exact) return cmd.result;
        if (x.version !== expected) throw new Error("VERSION_INVALID");
        const status = correctionTransition(x.status, "withdraw"),
          result = {
            schema: SMALL_BUSINESS_CORRECTION_SCHEMA,
            businessId: a.businessId,
            correctionId: x.correctionId,
            status,
            version: expected + 1,
            cycle: x.cycle,
          };
        tx.update(ref, { status, version: expected + 1, updatedAt: stamp() });
        tx.update(cmd.c, { result });
        return result;
      });
    } catch (e) {
      fail(e);
    }
  },
);
async function representativeTransition(r: any, action: "submit" | "withdraw") {
  try {
    const a = await representative(r),
      expected = strictVersion(r.data?.expectedVersion),
      ref = db.collection("small_businesses").doc(a.businessId);
    return await db.runTransaction(async (tx) => {
      const s = await tx.get(ref);
      if (!s.exists) throw new Error("BUSINESS_UNAVAILABLE");
      const x = s.data()!,
        cmd = await command(tx, ref, r.data, {
          actorRef: a.actorRef,
          authority: a.commandAuthority,
          action,
        });
      if (cmd.exact) return cmd.result;
      if (x.version !== expected) throw new Error("VERSION_INVALID");
      const status = transition(x.status, action),
        result = {
          schema: SMALL_BUSINESS_SCHEMA,
          businessId: a.businessId,
          status,
          version: expected + 1,
        };
      tx.update(ref, {
        status,
        version: expected + 1,
        submittedAt: action === "submit" ? stamp() : x.submittedAt,
        updatedAt: stamp(),
      });
      tx.update(cmd.c, { result });
      return result;
    });
  } catch (e) {
    fail(e);
  }
}
export const submitSmallBusinessApplicationV1 = onCall(
  { enforceAppCheck: true },
  (r) => representativeTransition(r, "submit"),
);
export const withdrawSmallBusinessApplicationV1 = onCall(
  { enforceAppCheck: true },
  (r) => representativeTransition(r, "withdraw"),
);
export const prepareSmallBusinessPromotionV1 = onCall(
  { enforceAppCheck: true },
  async (r) => {
    try {
      const a = await representative(
          r,
          String(r.data?.promotion?.businessId || ""),
        ),
        p = normalizePromotion(r.data.promotion),
        expected = strictVersion(r.data.expectedVersion),
        b = (await business(a.businessId)).x;
      if (!["approved", "active"].includes(b.status))
        throw new Error("BUSINESS_NOT_ELIGIBLE");
      for (const id of p.locationIds)
        if (!b.profile.locations.some((x: any) => x.locationId === id))
          throw new Error("LOCATION_INVALID");
      const ref = db.collection("small_business_promotions").doc(p.promotionId);
      return await db.runTransaction(async (tx) => {
        const s = await tx.get(ref),
          x = s.data() || {},
          cmd = await command(tx, ref, r.data, {
            actorRef: a.actorRef,
            authority: a.commandAuthority,
            action: "prepare_promotion",
          });
        if (cmd.exact) return cmd.result;
        if (
          (x.version || 0) !== expected ||
          (x.status && x.status !== "draft" && x.status !== "changes_requested")
        )
          throw new Error("VERSION_OR_STATE_INVALID");
        const result = {
          schema: SMALL_BUSINESS_PROMOTION_SCHEMA,
          promotionId: p.promotionId,
          status: "draft",
          version: expected + 1,
        };
        tx.set(
          ref,
          {
            schema: SMALL_BUSINESS_PROMOTION_SCHEMA,
            ...p,
            status: "draft",
            version: expected + 1,
            preparedByRef: a.actorRef,
            updatedAt: stamp(),
            createdAt: x.createdAt || stamp(),
          },
          { merge: true },
        );
        tx.update(cmd.c, { result });
        return result;
      });
    } catch (e) {
      fail(e);
    }
  },
);
async function economyPlan(planId: string, jurisdiction: string) {
  const ps = await db
    .collection("enterprise_economy_config")
    .doc("current")
    .get();
  if (!ps.exists) throw new Error("ECONOMY_UNAVAILABLE");
  const pointer = ps.data(),
    vs = await db
      .collection("enterprise_economy_config_versions")
      .doc(String(pointer!.configurationId))
      .get();
  if (!vs.exists) throw new Error("ECONOMY_UNAVAILABLE");
  return resolvePlan(vs.data(), pointer, planId, jurisdiction);
}
async function economyCatalogue(jurisdiction: string) {
  const ps = await db
    .collection("enterprise_economy_config")
    .doc("current")
    .get();
  if (!ps.exists) return [];
  const pointer = ps.data(),
    vs = await db
      .collection("enterprise_economy_config_versions")
      .doc(String(pointer!.configurationId))
      .get(),
    configuration = vs.data();
  if (!vs.exists || !Array.isArray(configuration?.smallBusinessPlans))
    return [];
  const plans = [];
  for (const raw of configuration.smallBusinessPlans) {
    try {
      const p = resolvePlan(configuration, pointer, raw.planId, jurisdiction);
      plans.push({
        planId: p.planId,
        version: p.version,
        effectiveFrom: p.effectiveAt,
        effectiveUntil: p.expiresAt,
        features: p.features,
        status: "available",
      });
    } catch {
      continue;
    }
  }
  return plans;
}
export const createSmallBusinessSubscriptionIntentV1 = onCall(
  { enforceAppCheck: true },
  async (r) => {
    try {
      const a = await representative(r),
        b = (await business(a.businessId)).x,
        plan = await economyPlan(
          strictId(r.data?.planId, "PLAN"),
          String(b.profile.locations[0].countryCode),
        ),
        intent = subscriptionIntent({ intentId: r.data?.intentId }, plan, {
          businessId: a.businessId,
          status: b.status,
          countryCode: b.profile.locations[0].countryCode,
        }),
        ref = db
          .collection("small_business_subscription_intents")
          .doc(intent.intentId);
      return await db.runTransaction(async (tx) => {
        const old = await tx.get(ref),
          cmd = await command(tx, ref, r.data, {
            actorRef: a.actorRef,
            authority: a.commandAuthority,
            action: "subscription_intent",
          });
        if (cmd.exact) return cmd.result;
        if (old.exists) {
          if (old.data()!.intentDigest !== digest(intent))
            throw new Error("REPLAY_PAYLOAD_CHANGED");
          tx.update(cmd.c, { result: old.data() });
          return old.data();
        }
        const result = {
          ...intent,
          intentDigest: digest(intent),
          createdAt: stamp(),
          immutable: true,
        };
        tx.create(ref, result);
        tx.create(
          db
            .collection("small_business_subscription_outbox")
            .doc(intent.intentId),
          {
            ...intent,
            outboxState: "not_dispatched",
            providerCallAllowed: false,
            createdAt: stamp(),
            immutable: true,
          },
        );
        tx.update(cmd.c, { result: intent });
        return intent;
      });
    } catch (e) {
      fail(e);
    }
  },
);
export const listSmallBusinessApplicationsAdminV1 = onCall(
  { enforceAppCheck: true },
  async (r) => {
    await reviewer(r);
    const status = r.data?.status ? String(r.data.status) : null,
      limit = Math.min(Math.max(Number(r.data?.limit || 25), 1), 50),
      snap = await db.collection("small_businesses").limit(501).get();
    let items = snap.docs
      .map((d) => d.data())
      .filter(
        (x) =>
          x.schema === SMALL_BUSINESS_SCHEMA &&
          (!status || x.status === status),
      );
    return {
      schema: SMALL_BUSINESS_SCHEMA,
      state: items.length ? "current" : "empty",
      items: items.slice(0, limit).map((x) => ({
        businessId: x.businessId,
        status: x.status,
        version: x.version,
        displayName: x.profile?.publicName,
        category: x.profile?.category,
        country: x.profile?.locations?.[0]?.countryCode,
        evidenceCount: x.profile?.evidenceReferences?.length || 0,
      })),
      privacy: "minimum_necessary",
    };
  },
);
export const getSmallBusinessApplicationAdminV1 = onCall(
  { enforceAppCheck: true },
  async (r) => {
    await reviewer(r);
    const { id, x } = await (async () => {
      const id = strictId(r.data?.businessId, "BUSINESS");
      return { id, x: (await business(id)).x };
    })();
    const receipts = await db
      .collection("small_business_approval_receipts")
      .where("businessId", "==", id)
      .limit(100)
      .get();
    return {
      ...portal(x),
      representativeRef: x.representativeRef,
      evidenceReferences: x.profile?.evidenceReferences || [],
      history: receipts.docs.map((d) => {
        const z = d.data();
        return {
          receiptId: d.id,
          action: z.action,
          status: z.status,
          version: z.businessVersion,
          occurredAt: z.createdAt?.toDate?.()?.toISOString?.() || null,
          immutable: true,
        };
      }),
    };
  },
);
export const decideSmallBusinessApplicationAdminV1 = onCall(
  { enforceAppCheck: true },
  async (r) => {
    try {
      const a = await reviewer(r),
        id = strictId(r.data?.businessId, "BUSINESS"),
        decision = String(r.data?.decision),
        action = decision === "reactivate" ? "activate" : decision,
        expected = strictVersion(r.data?.expectedVersion),
        reason = String(r.data?.reason || "").trim();
      if (
        ![
          "request_changes",
          "approve",
          "reject",
          "activate",
          "suspend",
          "expire",
          "close",
        ].includes(action) ||
        !reason ||
        reason.length > 1000
      )
        throw new Error("DECISION_INVALID");
      const ref = db.collection("small_businesses").doc(id);
      return await db.runTransaction(async (tx) => {
        const s = await tx.get(ref);
        if (!s.exists) throw new Error("BUSINESS_UNAVAILABLE");
        const x = s.data()!;
        requireSeparation(x, a.actorRef);
        const cmd = await command(
          tx,
          ref,
          { ...r.data, decision },
          {
            actorRef: a.actorRef,
            authority: a.commandAuthority,
            action: decision,
          },
        );
        if (cmd.exact) return cmd.result;
        if (x.version !== expected) throw new Error("VERSION_INVALID");
        const status = transition(x.status as SmallBusinessStatus, action),
          version = expected + 1,
          receiptId = `sbr_${digest([id, r.data.commandId, decision]).slice(0, 40)}`,
          result = {
            schema: SMALL_BUSINESS_SCHEMA,
            businessId: id,
            status,
            version,
            receiptId,
          };
        tx.update(ref, {
          status,
          version,
          verificationState: ["approve", "activate"].includes(action)
            ? "admin_reviewed"
            : x.verificationState,
          updatedAt: stamp(),
        });
        tx.create(
          db.collection("small_business_approval_receipts").doc(receiptId),
          {
            schema: SMALL_BUSINESS_RECEIPT_SCHEMA,
            receiptId,
            businessId: id,
            action: decision,
            status,
            businessVersion: version,
            profileDigest: x.profileDigest,
            reviewerRef: a.actorRef,
            reviewerRole: a.role,
            authorityVersion: a.authorityVersion,
            reasonDigest: digest(reason),
            createdAt: stamp(),
            immutable: true,
          },
        );
        tx.update(cmd.c, { result });
        return result;
      });
    } catch (e) {
      fail(e);
    }
  },
);
export const listSmallBusinessProfileCorrectionsAdminV1 = onCall(
  { enforceAppCheck: true },
  async (r) => {
    await reviewer(r);
    const status = r.data?.status ? String(r.data.status) : null,
      snap = await db
        .collection("small_business_profile_corrections")
        .limit(101)
        .get();
    if (snap.size > 100)
      throw new HttpsError("resource-exhausted", "Narrow correction queue.");
    const items = snap.docs
      .map((d) => d.data())
      .filter((x) => !status || x.status === status)
      .map((x) => ({
        correctionId: x.correctionId,
        businessId: x.businessId,
        status: x.status,
        version: x.version,
        baseBusinessVersion: x.baseBusinessVersion,
        profileDigest: x.profileDigest,
      }));
    return {
      schema: SMALL_BUSINESS_CORRECTION_SCHEMA,
      state: items.length ? "current" : "empty",
      items,
      privacy: "minimum_necessary",
    };
  },
);
export const getSmallBusinessProfileCorrectionAdminV1 = onCall(
  { enforceAppCheck: true },
  async (r) => {
    await reviewer(r);
    const id = strictId(r.data?.businessId, "BUSINESS"),
      [c, b, receipts] = await Promise.all([
        db.collection("small_business_profile_corrections").doc(id).get(),
        db.collection("small_businesses").doc(id).get(),
        db
          .collection("small_business_profile_correction_receipts")
          .where("businessId", "==", id)
          .limit(100)
          .get(),
      ]);
    if (!c.exists || !b.exists)
      throw new HttpsError("not-found", "Correction unavailable.");
    const x = c.data()!,
      businessData = b.data()!;
    return {
      schema: SMALL_BUSINESS_CORRECTION_SCHEMA,
      state: "current",
      correction: {
        correctionId: x.correctionId,
        businessId: x.businessId,
        status: x.status,
        version: x.version,
        baseBusinessVersion: x.baseBusinessVersion,
        profile: x.profile,
        profileDigest: x.profileDigest,
      },
      canonical: {
        businessVersion: businessData.version,
        profile: businessData.profile,
        profileDigest: businessData.profileDigest,
        status: businessData.status,
      },
      history: receipts.docs.map((d) => {
        const z = d.data();
        return {
          receiptId: z.receiptId,
          decision: z.decision,
          status: z.status,
          correctionVersion: z.correctionVersion,
          appliedBusinessVersion: z.appliedBusinessVersion,
          occurredAt: iso(z.createdAt),
          immutable: true,
        };
      }),
      privacy: "review_necessary",
    };
  },
);
export const decideSmallBusinessProfileCorrectionAdminV1 = onCall(
  { enforceAppCheck: true },
  async (r) => {
    try {
      const a = await reviewer(r),
        id = strictId(r.data?.businessId, "BUSINESS"),
        decision = String(r.data?.decision),
        expected = strictVersion(r.data?.expectedVersion),
        reason = String(r.data?.reason || "").trim();
      if (
        !["approve", "request_changes", "reject"].includes(decision) ||
        !reason ||
        reason.length > 1000
      )
        throw new Error("DECISION_INVALID");
      const correctionRef = db
          .collection("small_business_profile_corrections")
          .doc(id),
        businessRef = db.collection("small_businesses").doc(id);
      return await db.runTransaction(async (tx) => {
        const [c, b] = await Promise.all([
          tx.get(correctionRef),
          tx.get(businessRef),
        ]);
        if (!c.exists || !b.exists) throw new Error("CORRECTION_UNAVAILABLE");
        const x = c.data()!,
          businessData = b.data()!;
        requireSeparation(businessData, a.actorRef);
        const cmd = await command(tx, correctionRef, r.data, {
          actorRef: a.actorRef,
          authority: a.commandAuthority,
          action: `profile_correction_${decision}`,
        });
        if (cmd.exact) return cmd.result;
        if (
          x.version !== expected ||
          x.baseBusinessVersion !== businessData.version ||
          !["approved", "active"].includes(businessData.status)
        )
          throw new Error("VERSION_OR_STATE_INVALID");
        const status = correctionTransition(x.status, decision),
          version = expected + 1,
          receiptId = `sbcr_${digest([id, r.data.commandId, decision]).slice(0, 40)}`,
          result = {
            schema: SMALL_BUSINESS_CORRECTION_SCHEMA,
            businessId: id,
            correctionId: x.correctionId,
            status,
            version,
            cycle: x.cycle,
            receiptId,
            businessVersion:
              businessData.version + (decision === "approve" ? 1 : 0),
          };
        if (decision === "approve") {
          const historyId = `sbh_${digest([id, businessData.version, businessData.profileDigest]).slice(0, 40)}`;
          tx.create(
            db.collection("small_business_profile_history").doc(historyId),
            {
              schema: SMALL_BUSINESS_SCHEMA,
              businessId: id,
              version: businessData.version,
              profile: businessData.profile,
              profileDigest: businessData.profileDigest,
              replacedByCorrectionId: x.correctionId,
              replacedByCorrectionCycle: x.cycle,
              createdAt: stamp(),
              immutable: true,
            },
          );
          tx.update(businessRef, {
            profile: x.profile,
            profileDigest: x.profileDigest,
            version: businessData.version + 1,
            updatedAt: stamp(),
          });
        }
        tx.update(correctionRef, {
          status,
          version,
          reviewedByRef: a.actorRef,
          updatedAt: stamp(),
        });
        tx.create(
          db
            .collection("small_business_profile_correction_receipts")
            .doc(receiptId),
          {
            schema: SMALL_BUSINESS_CORRECTION_SCHEMA,
            receiptId,
            businessId: id,
            correctionId: x.correctionId,
            correctionCycle: x.cycle,
            decision,
            status,
            correctionVersion: version,
            baseBusinessVersion: x.baseBusinessVersion,
            appliedBusinessVersion: result.businessVersion,
            profileDigest: x.profileDigest,
            reviewerRef: a.actorRef,
            reviewerRole: a.role,
            authorityVersion: a.authorityVersion,
            reasonDigest: digest(reason),
            createdAt: stamp(),
            immutable: true,
          },
        );
        tx.update(cmd.c, { result });
        return result;
      });
    } catch (e) {
      fail(e);
    }
  },
);
export const reviewSmallBusinessPromotionAdminV1 = onCall(
  { enforceAppCheck: true },
  async (r) => {
    try {
      const a = await reviewer(r),
        id = strictId(r.data?.promotionId, "PROMOTION"),
        decision = String(r.data?.decision),
        expected = strictVersion(r.data?.expectedVersion);
      if (
        !["approve", "request_changes", "retire", "publish"].includes(
          decision,
        ) ||
        r.data?.policyApprovalReceiptId !== undefined ||
        r.data?.contractApprovalReceiptId !== undefined
      )
        throw new Error("DECISION_INVALID");
      const ref = db.collection("small_business_promotions").doc(id);
      return await db.runTransaction(async (tx) => {
        const s = await tx.get(ref);
        if (!s.exists) throw new Error("PROMOTION_UNAVAILABLE");
        const x = s.data()!,
          businessRef = db.collection("small_businesses").doc(x.businessId),
          policyRef = db
            .collection("small_business_promotion_policy_approvals")
            .doc(id),
          contractRef = db
            .collection("small_business_contract_approvals")
            .doc(id),
          suppressionRef = db
            .collection("small_business_promotion_suppressions")
            .doc(x.businessId),
          dncRef = db
            .collection("small_business_delivery_suppressions")
            .doc(x.businessId),
          frequencyQuery = db
            .collection("small_business_promotion_publications")
            .where("promotionId", "==", id)
            .limit(Number(x.frequencyLimit || 0) + 1),
          [
            bs,
            policySnap,
            contractSnap,
            suppressionSnap,
            dncSnap,
            frequencySnap,
          ] = await Promise.all([
            tx.get(businessRef),
            tx.get(policyRef),
            tx.get(contractRef),
            tx.get(suppressionRef),
            tx.get(dncRef),
            tx.get(frequencyQuery),
          ]),
          b = bs.data()!;
        requireSeparation(b, a.actorRef);
        const cmd = await command(tx, ref, r.data, {
          actorRef: a.actorRef,
          authority: a.commandAuthority,
          action: `promotion_${decision}`,
        });
        if (cmd.exact) return cmd.result;
        if (x.version !== expected) throw new Error("VERSION_INVALID");
        const status = promotionTransition(String(x.status), decision);
        if (decision === "publish") {
          if (
            suppressionSnap.exists ||
            dncSnap.exists ||
            frequencySnap.size >= x.frequencyLimit
          )
            throw new Error("PROMOTION_SUPPRESSED_OR_FREQUENCY_LIMITED");
          publicationAllowed(
            {
              ...x,
              policyApprovalReceipt: policySnap.data(),
              contractApprovalReceipt: contractSnap.data(),
            },
            b,
          );
        }
        const version = expected + 1,
          result = {
            schema: SMALL_BUSINESS_PROMOTION_SCHEMA,
            promotionId: id,
            status,
            version,
          };
        tx.update(ref, {
          status,
          version,
          policyApprovalReceiptId:
            decision === "publish" ? policySnap.id : x.policyApprovalReceiptId,
          contractApprovalReceiptId:
            decision === "publish"
              ? contractSnap.id
              : x.contractApprovalReceiptId,
          reviewedByRef: a.actorRef,
          updatedAt: stamp(),
        });
        if (decision === "publish")
          tx.create(
            db
              .collection("small_business_promotion_publications")
              .doc(`sbp_${digest([id, version]).slice(0, 40)}`),
            {
              promotionId: id,
              businessId: x.businessId,
              version,
              contentDigest: x.contentDigest,
              frequencyOrdinal: frequencySnap.size + 1,
              deliveryAllowed: false,
              directMessagingAllowed: false,
              createdAt: stamp(),
              immutable: true,
            },
          );
        tx.update(cmd.c, { result });
        return result;
      });
    } catch (e) {
      fail(e);
    }
  },
);
export const discoverSmallBusinessesV1 = onCall(
  { enforceAppCheck: true },
  async (r) => {
    uid(r);
    const f = r.data?.filter || {};
    if (
      Object.keys(f).some(
        (k) => !["category", "city", "countryCode"].includes(k),
      ) ||
      r.data?.location !== undefined
    )
      throw new HttpsError(
        "invalid-argument",
        "Safe filters only; raw location is never accepted.",
      );
    const snap = await db
      .collection("small_businesses")
      .where("status", "==", "active")
      .limit(100)
      .get();
    let rows = snap.docs.map((d) => d.data());
    for (const k of ["category", "city", "countryCode"])
      if (f[k])
        rows = rows.filter((x) =>
          k === "category"
            ? x.profile?.category
            : x.profile?.locations?.some((l: any) => l[k] === f[k]),
        );
    return {
      schema: SMALL_BUSINESS_SCHEMA,
      state: rows.length ? "current" : "empty",
      items: rows.map((x) =>
        discoveryCard({
          businessId: x.businessId,
          status: x.status,
          publicName: x.profile.publicName,
          category: x.profile.category,
          city: x.profile.locations[0].city,
          countryCode: x.profile.locations[0].countryCode,
          serviceDescription: x.profile.serviceDescription,
          sponsored: false,
        }),
      ),
      rawLocationPersisted: false,
      returnRoute: "/lounge",
    };
  },
);
export const getSmallBusinessDetailV1 = onCall(
  { enforceAppCheck: true },
  async (r) => {
    uid(r);
    const x = (await business(strictId(r.data?.businessId, "BUSINESS"))).x,
      card = discoveryCard({
        businessId: x.businessId,
        status: x.status,
        publicName: x.profile.publicName,
        category: x.profile.category,
        city: x.profile.locations[0].city,
        countryCode: x.profile.locations[0].countryCode,
        serviceDescription: x.profile.serviceDescription,
        sponsored: false,
      });
    return {
      schema: SMALL_BUSINESS_SCHEMA,
      state: "current",
      ...card,
      locations: x.profile.locations.map((l: any) => ({
        locationId: l.locationId,
        name: l.name,
        city: l.city,
        countryCode: l.countryCode,
        operatingHours: l.operatingHours,
      })),
      supportedLocales: x.profile.supportedLocales,
      returnRoute: "/lounge",
    };
  },
);
export const recordSmallBusinessEngagementV1 = onCall(
  { enforceAppCheck: true },
  async (r) => {
    const u = uid(r),
      businessId = strictId(r.data?.businessId, "BUSINESS"),
      eventId = strictId(r.data?.eventId, "EVENT"),
      kind = String(r.data?.kind);
    if (
      !["impression", "view", "favorite", "dismiss"].includes(kind) ||
      r.data?.location !== undefined
    )
      throw new HttpsError("invalid-argument", "ENGAGEMENT_INVALID");
    const ref = db.collection("small_business_engagements").doc(eventId),
      material = {
        schema: "golfriend.small-business.engagement.v1",
        eventId,
        businessId,
        opaqueMemberRef: `member_${digest(u).slice(0, 32)}`,
        kind,
        rawLocationPersisted: false,
        immutable: true,
      },
      payloadDigest = digest(material);
    return db.runTransaction(async (tx) => {
      const s = await tx.get(ref);
      if (s.exists) {
        if (s.data()?.payloadDigest !== payloadDigest)
          throw new HttpsError("already-exists", "REPLAY_PAYLOAD_CHANGED");
        return { eventId, replayed: true };
      }
      tx.create(ref, { ...material, payloadDigest, createdAt: stamp() });
      return { eventId, replayed: false };
    });
  },
);
export const prepareSmallBusinessInquiryV1 = onCall(
  { enforceAppCheck: true },
  async (r) => {
    uid(r);
    const b = (await business(strictId(r.data?.businessId, "BUSINESS"))).x;
    if (b.status !== "active")
      throw new HttpsError("failed-precondition", "Business unavailable.");
    return {
      schema: "golfriend.small-business.inquiry.v1",
      state: "prepared",
      inquiryId: strictId(r.data?.inquiryId, "INQUIRY"),
      businessId: b.businessId,
      transmission: "disabled",
      requiresFreshOwnerValidation: true,
      requiresExplicitConfirmation: true,
      personalDataIncluded: false,
      navigationStarted: false,
      purchaseStarted: false,
      returnRoute: "/lounge",
    };
  },
);
const MOBILE_SCHEMA_V2="golfriend.small-business.mobile-integration.v2", MEMBER_ENGAGEMENT_KINDS = ["view", "favorite", "unfavorite"], MOBILE_LOCALES=["en","th","ko","ja","zh","es","fr","de"], FRESH_MS=5*60*1000;
const memberRef = (u: string) => `member_${digest(u).slice(0, 32)}`;
const localeV2=(v:any)=>{const x=String(v||"");if(!MOBILE_LOCALES.includes(x))throw new HttpsError("invalid-argument","LOCALE_INVALID");return x;};
const fingerprint=(provided:any,material:any)=>{const expected=digest(material);if(provided!==expected)throw new HttpsError("invalid-argument","PAYLOAD_FINGERPRINT_INVALID");return expected;};
function page(raw:any,scope:any,defaultLimit=20){const limit=raw?.limit===undefined?defaultLimit:strictVersion(raw.limit,"LIMIT");if(limit<1||limit>50)throw new HttpsError("invalid-argument","LIMIT_INVALID");let offset=0;if(raw?.cursor!==undefined){const parts=String(raw.cursor).split(".");if(parts.length!==2)throw new HttpsError("invalid-argument","CURSOR_INVALID");offset=Number.parseInt(Buffer.from(parts[0],"base64url").toString("utf8"),10);if(!Number.isSafeInteger(offset)||offset<0||parts[1]!==digest([scope,offset]))throw new HttpsError("invalid-argument","CURSOR_INVALID");}const cursor=(next:number)=>`${Buffer.from(String(next)).toString("base64url")}.${digest([scope,next])}`;return{limit,offset,cursor};}
const evidenceV2=(u:string,locale:string,state="current")=>{const now=Date.now();return{schema:MOBILE_SCHEMA_V2,version:2,state,locale,issuedAt:new Date(now).toISOString(),freshUntil:new Date(now+FRESH_MS).toISOString(),memberBinding:memberRef(u),authoritativeStatus:state==="current"?"active":"unavailable"};};
function exactKeys(raw: any, allowed: string[], label: string) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.keys(raw).some((k) => !allowed.includes(k)))
    throw new HttpsError("invalid-argument", `${label}_INVALID`);
}
function locationVersion(x:any,l:any){const stored=l?.version??x?.locationVersions?.[l?.locationId];if(stored!==undefined)return strictVersion(stored,"LOCATION_VERSION");return Number.parseInt(digest({locationId:l?.locationId,name:l?.name,address:l?.address,city:l?.city,countryCode:l?.countryCode,serviceArea:l?.serviceArea,operatingHours:l?.operatingHours}).slice(0,12),16)}
const locationActive=(l:any)=>l&&(l.status===undefined||l.status==="active");
function approvedCardV2(x: any,l=x.profile?.locations?.[0]) {
  if(x.status!=="active"||!locationActive(l))throw new Error("BUSINESS_OR_LOCATION_UNAVAILABLE");
  return {businessId:strictId(x.businessId,"BUSINESS"),profileVersion:strictVersion(x.version,"PROFILE_VERSION"),profileDigest:digest(normalizeProfile(x.profile)),locationId:strictId(l.locationId,"LOCATION"),locationVersion:locationVersion(x,l),displayName:String(x.profile.publicName),category:String(x.profile.category),city:String(l.city),country:String(l.countryCode),description:String(x.profile.serviceDescription),availability:x.availabilityAuthority?"known":"unknown",partner:true,sponsored:false,disclosure:"partner",authoritativeStatus:"active",returnRoute:"/v2"};
}
async function activeBusinessVersion(tx: any, businessId: string, expectedVersion: number, locationId?:string, expectedLocationVersion?:number) {
  const ref = db.collection("small_businesses").doc(businessId), snap = await tx.get(ref), x = snap.data();
  if (!snap.exists || x?.status !== "active") throw new HttpsError("failed-precondition", "BUSINESS_SUSPENDED_OR_UNAVAILABLE");
  if (strictVersion(x.version, "PROFILE_VERSION") !== expectedVersion) throw new HttpsError("failed-precondition", "PROFILE_VERSION_CHANGED");
  if(locationId){const l=x.profile?.locations?.find((z:any)=>z.locationId===locationId);if(!locationActive(l))throw new HttpsError("failed-precondition","LOCATION_UNAVAILABLE");if(locationVersion(x,l)!==expectedLocationVersion)throw new HttpsError("failed-precondition","LOCATION_VERSION_CHANGED");}
  return { ref, x };
}
export const discoverSmallBusinessesV2 = onCall({ enforceAppCheck: true }, async (r) => {
  const u=uid(r),locale=localeV2(r.data?.locale);
  exactKeys(r.data || {}, ["locale","filter","cursor","limit"], "DISCOVERY_REQUEST");
  let f:any; try { f=normalizeDiscoveryFilter(r.data?.filter); } catch(e) { fail(e); }
  const paging=page(r.data,["discovery",memberRef(u),locale,f]);
  const snap = await db.collection("small_businesses").where("status", "==", "active").limit(100).get();
  const rows = snap.docs.map((d) => d.data()).filter((x) =>
    (f.category === undefined || x.profile?.category === f.category) &&
    (f.city === undefined || x.profile?.locations?.some((l: any) => l.city === f.city)) &&
    (f.countryCode === undefined || x.profile?.locations?.some((l: any) => l.countryCode === f.countryCode)));
  const all:any[]=[];for(const x of rows)for(const l of (x.profile?.locations||[]).filter((z:any)=>locationActive(z)&&(f.city===undefined||z.city===f.city)&&(f.countryCode===undefined||z.countryCode===f.countryCode)))try{all.push(approvedCardV2(x,l));}catch{/* malformed producer document is unavailable, never leaked */}all.sort((a,b)=>a.businessId.localeCompare(b.businessId)||a.locationId.localeCompare(b.locationId));const items=all.slice(paging.offset,paging.offset+paging.limit),next=paging.offset+paging.limit<all.length?paging.cursor(paging.offset+paging.limit):undefined;
  return { ...evidenceV2(u,locale,items.length?"current":"empty"), items, ...(next&&{nextCursor:next}),rawLocationPersisted: false, returnRoute: "/v2" };
});
export const getSmallBusinessDetailV2 = onCall({ enforceAppCheck: true }, async (r) => {
  const u=uid(r),locale=localeV2(r.data?.locale); exactKeys(r.data, ["businessId", "expectedProfileVersion","locale"], "DETAIL_REQUEST");
  const x = (await business(strictId(r.data.businessId, "BUSINESS"))).x, expected = strictVersion(r.data.expectedProfileVersion, "EXPECTED_PROFILE_VERSION");
  if (x.status !== "active") throw new HttpsError("failed-precondition", "BUSINESS_SUSPENDED_OR_UNAVAILABLE");
  if (x.version !== expected) throw new HttpsError("failed-precondition", "PROFILE_VERSION_CHANGED");
  const promos=await db.collection("small_business_promotions").where("businessId","==",x.businessId).limit(50).get(),now=Date.now();
  return { ...evidenceV2(u,locale),items:x.profile.locations.filter(locationActive).map((l:any)=>approvedCardV2(x,l)),promotions:promos.docs.map(d=>d.data()).filter((p:any)=>p.status==="published"&&Date.parse(p.effectiveAt)<=now&&Date.parse(p.expiresAt)>now).map((p:any)=>({promotionId:p.promotionId,locationIds:p.locationIds,contentDigest:p.contentDigest,disclosure:"sponsored_partner",effectiveAt:iso(p.effectiveAt),expiresAt:iso(p.expiresAt)})),rawLocationPersisted:false,returnRoute:"/v2" };
});
export const recordSmallBusinessEngagementV2 = onCall({ enforceAppCheck: true }, async (r) => {
  const u=uid(r); exactKeys(r.data,["commandId","businessId","expectedProfileVersion","locationId","expectedLocationVersion","kind","payloadFingerprint"],"ENGAGEMENT_REQUEST");
  const commandId=strictId(r.data.commandId,"COMMAND"),businessId=strictId(r.data.businessId,"BUSINESS"),locationId=strictId(r.data.locationId,"LOCATION"),expectedProfileVersion=strictVersion(r.data.expectedProfileVersion,"EXPECTED_PROFILE_VERSION"),expectedLocationVersion=strictVersion(r.data.expectedLocationVersion,"EXPECTED_LOCATION_VERSION"), kind=String(r.data.kind),canonical={commandId,businessId,expectedProfileVersion,locationId,expectedLocationVersion,kind},payloadFingerprint=fingerprint(r.data.payloadFingerprint,canonical);
  if(!MEMBER_ENGAGEMENT_KINDS.includes(kind)) throw new HttpsError("invalid-argument","ENGAGEMENT_INVALID");
  const ref=db.collection("small_business_engagements_v2").doc(commandId), material={schema:MOBILE_SCHEMA_V2,commandId,businessId,savedProfileVersion:expectedProfileVersion,locationId,savedLocationVersion:expectedLocationVersion,opaqueMemberRef:memberRef(u),kind,payloadFingerprint,rawLocationPersisted:false,immutable:true};
  return db.runTransaction(async(tx)=>{const old=await tx.get(ref);if(old.exists){if(old.data()?.opaqueMemberRef!==memberRef(u))throw new HttpsError("permission-denied","MEMBER_BINDING_MISMATCH");if(old.data()?.payloadFingerprint!==payloadFingerprint)throw new HttpsError("already-exists","REPLAY_PAYLOAD_CHANGED");return old.data()?.result;}await activeBusinessVersion(tx,businessId,expectedProfileVersion,locationId,expectedLocationVersion);const result={schema:MOBILE_SCHEMA_V2,commandId,replayed:false};tx.create(ref,{...material,result,createdAt:stamp()});return result;});
});
async function listMemberEngagements(r:any, mode:"favorites"|"recents") {
  const u=uid(r),locale=localeV2(r.data?.locale); exactKeys(r.data||{},["locale","cursor","limit"],"ENGAGEMENT_LIST_REQUEST");
  const paging=page(r.data,[mode,memberRef(u),locale]);
  const snap=await db.collection("small_business_engagements_v2").where("opaqueMemberRef","==",memberRef(u)).limit(200).get(), latest=new Map<string,any>();
  for(const d of snap.docs){const x=d.data(), relevant=mode==="favorites"?["favorite","unfavorite"].includes(x.kind):x.kind==="view";if(!relevant)continue;const key=`${x.businessId}:${x.locationId}`,ms=x.createdAt?.toMillis?.()||0,old=latest.get(key);if(!old||ms>old.ms||ms===old.ms&&String(x.commandId)<String(old.commandId))latest.set(key,{...x,ms});}
  const candidates=[...latest.values()].filter((x)=>mode==="favorites"?x.kind==="favorite":true).sort((a,b)=>b.ms-a.ms||String(a.commandId).localeCompare(String(b.commandId))),items=[];
  for(const e of candidates.slice(paging.offset,paging.offset+paging.limit)){const s=await db.collection("small_businesses").doc(e.businessId).get(),x=s.data(),l=x?.profile?.locations?.find((z:any)=>z.locationId===e.locationId);if(s.exists&&x?.status==="active"&&locationActive(l))items.push({...approvedCardV2(x,l),savedProfileVersion:e.savedProfileVersion,currentProfileVersion:x.version,savedLocationVersion:e.savedLocationVersion,currentLocationVersion:locationVersion(x,l),state:x.version===e.savedProfileVersion&&locationVersion(x,l)===e.savedLocationVersion?"current":"stale"});else items.push({businessId:e.businessId,savedProfileVersion:e.savedProfileVersion,currentProfileVersion:x?.version??null,locationId:e.locationId,savedLocationVersion:e.savedLocationVersion,currentLocationVersion:locationActive(l)?locationVersion(x,l):null,state:"tombstone",authoritativeStatus:"unavailable",returnRoute:"/v2"});}
  const next=paging.offset+paging.limit<candidates.length?paging.cursor(paging.offset+paging.limit):undefined,state=items.some((x:any)=>x.state==="tombstone")?"tombstone":items.length?"current":"empty";return{...evidenceV2(u,locale,state),items,...(next&&{nextCursor:next}),rawLocationPersisted:false,returnRoute:"/v2"};
}
export const listSmallBusinessFavoritesV2=onCall({enforceAppCheck:true},async(r)=>listMemberEngagements(r,"favorites"));
export const listSmallBusinessRecentViewsV2=onCall({enforceAppCheck:true},async(r)=>listMemberEngagements(r,"recents"));
function inquiryView(u:string,locale:string,x:any){const expired=["prepared","awaiting_provider"].includes(x.state)&&Date.parse(x.expiresAt)<=Date.now(),state=expired?"expired":x.state;return{...evidenceV2(u,locale,expired?"stale":"current"),inquiryId:x.inquiryId,inquiryVersion:x.inquiryVersion,inquiryState:state,businessId:x.businessId,profileVersion:x.profileVersion,locationId:x.locationId,locationVersion:x.locationVersion,preview:"smallBusiness.inquiry.ownerValidationRequired",providerState:x.providerState||"not_commissioned",expiresAt:x.expiresAt,transmission:false,requiresFreshOwnerValidation:true,requiresExplicitConfirmation:true,personalDataIncluded:false,returnRoute:"/v2"};}
export const prepareSmallBusinessInquiryV2=onCall({enforceAppCheck:true},async(r)=>{
  const u=uid(r),locale=localeV2(r.data?.locale);exactKeys(r.data,["commandId","businessId","expectedProfileVersion","locationId","expectedLocationVersion","locale","payloadFingerprint"],"INQUIRY_REQUEST");
  const commandId=strictId(r.data.commandId,"COMMAND"),businessId=strictId(r.data.businessId,"BUSINESS"),profileVersion=strictVersion(r.data.expectedProfileVersion,"EXPECTED_PROFILE_VERSION"),locationId=strictId(r.data.locationId,"LOCATION"),locationVersionValue=strictVersion(r.data.expectedLocationVersion,"EXPECTED_LOCATION_VERSION"),canonical={commandId,businessId,expectedProfileVersion:profileVersion,locationId,expectedLocationVersion:locationVersionValue,locale},payloadFingerprint=fingerprint(r.data.payloadFingerprint,canonical),owner=memberRef(u),inquiryId=`sbi_${digest([owner,commandId]).slice(0,32)}`,ref=db.collection("small_business_inquiries_v2").doc(inquiryId),history=ref.collection("history").doc(commandId);
  return db.runTransaction(async(tx)=>{const h=await tx.get(history);if(h.exists){if(h.data()?.opaqueMemberRef!==owner)throw new HttpsError("permission-denied","MEMBER_BINDING_MISMATCH");if(h.data()?.payloadFingerprint!==payloadFingerprint)throw new HttpsError("already-exists","REPLAY_PAYLOAD_CHANGED");return h.data()?.result;}const old=await tx.get(ref);if(old.exists)throw new HttpsError("already-exists","INQUIRY_ID_REUSED");await activeBusinessVersion(tx,businessId,profileVersion,locationId,locationVersionValue);const issuedAt=new Date().toISOString(),expiresAt=new Date(Date.now()+15*60*1000).toISOString(),material={schema:MOBILE_SCHEMA_V2,inquiryId,inquiryVersion:1,businessId,profileVersion,locationId,locationVersion:locationVersionValue,locale,opaqueMemberRef:owner,state:"prepared",providerState:"not_commissioned",expiresAt,transmission:false,personalDataIncluded:false,payloadFingerprint,immutableRequest:true},result=inquiryView(u,locale,material);tx.create(ref,{...material,issuedAt,originalResult:result,createdAt:stamp(),updatedAt:stamp()});tx.create(history,{commandId,action:"prepare",opaqueMemberRef:owner,payloadFingerprint,inquiryVersion:1,state:"prepared",issuedAt,result,createdAt:stamp(),immutable:true});return result;});
});
async function ownedInquiry(r:any){const u=uid(r),id=strictId(r.data?.inquiryId,"INQUIRY"),s=await db.collection("small_business_inquiries_v2").doc(id).get();if(!s.exists||s.data()?.opaqueMemberRef!==memberRef(u))throw new HttpsError("not-found","Inquiry unavailable.");return{ref:s.ref,x:s.data()!};}
export const getSmallBusinessInquiryV2=onCall({enforceAppCheck:true},async(r)=>{const u=uid(r),locale=localeV2(r.data?.locale);exactKeys(r.data,["inquiryId","locale"],"INQUIRY_READ_REQUEST");const q=await ownedInquiry(r),s=await db.collection("small_businesses").doc(q.x.businessId).get(),b=s.data(),l=b?.profile?.locations?.find((z:any)=>z.locationId===q.x.locationId);if(!s.exists||b?.status!=="active"||!locationActive(l))return{...evidenceV2(u,locale,"tombstone"),inquiryId:q.x.inquiryId,inquiryVersion:q.x.inquiryVersion,inquiryState:q.x.state,businessId:q.x.businessId,profileVersion:q.x.profileVersion,locationId:q.x.locationId,locationVersion:q.x.locationVersion,preview:"smallBusiness.discovery.unavailable",providerState:"not_commissioned",expiresAt:q.x.expiresAt,transmission:false,returnRoute:"/v2"};return inquiryView(u,locale,q.x);});
export const listSmallBusinessInquiryHistoryV2=onCall({enforceAppCheck:true},async(r)=>{const u=uid(r),locale=localeV2(r.data?.locale);exactKeys(r.data,["locale","cursor","limit"],"INQUIRY_HISTORY_REQUEST");const paging=page(r.data,["inquiry-history",memberRef(u),locale]),snap=await db.collection("small_business_inquiries_v2").where("opaqueMemberRef","==",memberRef(u)).limit(200).get(),docs=snap.docs.sort((a,b)=>(b.data().createdAt?.toMillis?.()||0)-(a.data().createdAt?.toMillis?.()||0)||a.id.localeCompare(b.id)),items=[];for(const d of docs.slice(paging.offset,paging.offset+paging.limit)){const x=d.data(),s=await db.collection("small_businesses").doc(x.businessId).get(),b=s.data(),l=b?.profile?.locations?.find((z:any)=>z.locationId===x.locationId);items.push({businessId:x.businessId,savedProfileVersion:x.profileVersion,currentProfileVersion:b?.version??null,locationId:x.locationId,savedLocationVersion:x.locationVersion,currentLocationVersion:locationActive(l)?locationVersion(b,l):null,state:!s.exists||b?.status!=="active"||!locationActive(l)?"tombstone":Date.parse(x.expiresAt)<=Date.now()?"expired":x.state,issuedAt:x.issuedAt,freshUntil:x.expiresAt});}const next=paging.offset+paging.limit<docs.length?paging.cursor(paging.offset+paging.limit):undefined;return{...evidenceV2(u,locale,items.some((x:any)=>x.state==="tombstone")?"tombstone":items.length?"current":"empty"),items,...(next&&{nextCursor:next}),transmission:false,returnRoute:"/v2"};});
export const cancelSmallBusinessInquiryV2=onCall({enforceAppCheck:true},async(r)=>{const u=uid(r);exactKeys(r.data,["commandId","inquiryId","expectedVersion","payloadFingerprint"],"INQUIRY_CANCEL_REQUEST");const inquiryId=strictId(r.data.inquiryId,"INQUIRY"),commandId=strictId(r.data.commandId,"COMMAND"),expected=strictVersion(r.data.expectedVersion,"EXPECTED_VERSION"),canonical={commandId,inquiryId,expectedVersion:expected},payloadFingerprint=fingerprint(r.data.payloadFingerprint,canonical),ref=db.collection("small_business_inquiries_v2").doc(inquiryId),history=ref.collection("history").doc(commandId),owner=memberRef(u);return db.runTransaction(async(tx)=>{const h=await tx.get(history);if(h.exists){if(h.data()?.opaqueMemberRef!==owner)throw new HttpsError("permission-denied","MEMBER_BINDING_MISMATCH");if(h.data()?.payloadFingerprint!==payloadFingerprint)throw new HttpsError("already-exists","REPLAY_PAYLOAD_CHANGED");return h.data()?.result;}const s=await tx.get(ref),x=s.data();if(!s.exists||x?.opaqueMemberRef!==owner)throw new HttpsError("not-found","Inquiry unavailable.");await activeBusinessVersion(tx,x.businessId,x.profileVersion,x.locationId,x.locationVersion);if(x.inquiryVersion!==expected||Date.parse(x.expiresAt)<=Date.now())throw new HttpsError("failed-precondition","INQUIRY_TRANSITION_DENIED");const next=(()=>{try{return inquiryTransition(x.state,"cancel");}catch(e){return fail(e);}})(),version=expected+1,result=inquiryView(u,x.locale,{...x,state:next,inquiryVersion:version});tx.update(ref,{state:next,inquiryVersion:version,cancelledAt:stamp(),updatedAt:stamp()});tx.create(history,{commandId,action:"cancel",opaqueMemberRef:owner,payloadFingerprint,inquiryVersion:version,state:next,result,createdAt:stamp(),immutable:true});return result;});});
export const getSmallBusinessReportingAdminV1 = onCall(
  { enforceAppCheck: true },
  async (r) => {
    await reviewer(r);
    const snap = await db
      .collection("small_business_report_events")
      .limit(501)
      .get();
    if (snap.size > 500)
      throw new HttpsError("resource-exhausted", "Narrow reporting scope.");
    const events = requireUniqueReportEvidence(snap.docs.map((d) => d.data())),
      totals: any = {};
    for (const e of events)
      totals[e.metric] = (totals[e.metric] || 0) + e.count;
    return {
      schema: "golfriend.small-business.reporting.v1",
      state: events.length ? "current" : "empty",
      totals,
      semantics: {
        subscription_intent: "operational",
        provider_confirmed_subscription: "provider_evidence",
        golfriend_revenue: "accounting_evidence_only",
        external_commission: "external_non_golfriend",
        promotion_zero_revenue: "zero_revenue",
        sourceReceiptId: "globally_unique_authoritative_evidence",
        teeCirculationIsCashRevenue: false,
      },
      events,
    };
  },
);
export const prepareSmallBusinessJhccReportAdminV1 = onCall(
  { enforceAppCheck: true },
  async (r) => {
    await reviewer(r);
    const snap = await db
      .collection("small_business_report_events")
      .limit(501)
      .get();
    if (snap.size > 500)
      throw new HttpsError("resource-exhausted", "Report too large.");
    const batch = prepareJhcc(
        snap.docs.map((d) => d.data()),
        r.data?.batchId,
      ),
      ref = db
        .collection("small_business_jhcc_preparations")
        .doc(batch.batchId);
    return db.runTransaction(async (tx) => {
      const old = await tx.get(ref);
      if (old.exists) {
        if (old.data()?.eventDigest !== batch.eventDigest)
          throw new HttpsError("already-exists", "REPLAY_PAYLOAD_CHANGED");
        return batch;
      }
      tx.create(ref, { ...batch, createdAt: stamp(), immutable: true });
      return batch;
    });
  },
);
