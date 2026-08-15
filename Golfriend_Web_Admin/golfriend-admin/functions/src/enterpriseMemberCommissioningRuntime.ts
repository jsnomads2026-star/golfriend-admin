import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { resolveEnterpriseMemberAdminReviewer } from "./enterpriseMemberAdminRuntime.js";
import {
  canActivateTemplate,
  commissioningCommandId,
  commissioningDigest,
  commissioningReceiptId,
  COMMISSIONING_SCHEMA,
  JHCC_PORT_SCHEMA,
  nextApprovalState,
  normalizeApproval,
  normalizeReportEventIds,
  normalizeTemplateProposal,
  privacySafeReportSummary,
  templateApprovalId,
} from "./enterpriseMemberCommissioningDomain.js";
if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore(),
  stamp = () => admin.firestore.FieldValue.serverTimestamp();
const id = (v: unknown, label: string) => {
  const x = String(v || "");
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{2,127}$/.test(x))
    throw new HttpsError("invalid-argument", `${label}_INVALID`);
  return x;
};
const version = (v: unknown) => {
  if (!Number.isSafeInteger(v) || Number(v) < 1)
    throw new HttpsError("invalid-argument", "VERSION_INVALID");
  return Number(v);
};
const command = (a: any, r: any, action: string, payload: any) => {
  const commandId = id(r.data?.commandId, "COMMAND"),
    ref = db
      .collection("enterprise_member_commissioning_commands")
      .doc(commissioningCommandId(a.uid, commandId)),
    digest = commissioningDigest({
      action,
      payload,
      reviewerAuthorityVersion: a.authorityVersion,
    });
  return { commandId, ref, digest };
};
const projection = (d: any) => ({
  templateApprovalId: d.templateApprovalId,
  templateId: d.templateId,
  templateVersion: d.templateVersion,
  kind: d.kind,
  locale: d.locale,
  jurisdiction: d.jurisdiction,
  contentDigest: d.contentDigest,
  policyVersion: d.policyVersion,
  customerApprovalRequired: d.customerApprovalRequired === true,
  status: d.status,
  version: d.version,
  legalApproved: Boolean(d.legalApprovalReceiptRef),
  customerApproved: Boolean(d.customerApprovalReceiptRef),
  createdAt: d.createdAt?.toDate?.()?.toISOString?.() ?? null,
  updatedAt: d.updatedAt?.toDate?.()?.toISOString?.() ?? null,
});
export const getEnterpriseMemberCommissioningAdminV1 = onCall(
  { enforceAppCheck: true },
  async (r) => {
    await resolveEnterpriseMemberAdminReviewer(r);
    const [templates, dryRuns, reports, receipts] = await Promise.all([
      db.collection("enterprise_member_template_approvals").limit(200).get(),
      db.collection("enterprise_member_delivery_dry_runs").limit(100).get(),
      db.collection("enterprise_member_jhcc_validations").limit(100).get(),
      db
        .collection("enterprise_member_commissioning_receipts")
        .limit(300)
        .get(),
    ]);
    return {
      schema: COMMISSIONING_SCHEMA,
      state: templates.empty ? "empty" : "current",
      templates: templates.docs.map((d) => projection(d.data())),
      dryRuns: dryRuns.docs.map((d) => {
        const x = d.data();
        return {
          dryRunId: d.id,
          templateApprovalId: x.templateApprovalId,
          requestId: x.requestId,
          status: x.status,
          providerConfigured: false,
          transmitted: false,
          createdAt: x.createdAt?.toDate?.()?.toISOString?.() ?? null,
        };
      }),
      reportValidations: reports.docs.map((d) => {
        const x = d.data();
        return {
          validationId: d.id,
          eventCount: x.eventCount,
          status: x.status,
          commissioned: false,
          transmitted: false,
          createdAt: x.createdAt?.toDate?.()?.toISOString?.() ?? null,
        };
      }),
      commissioningReceipts: receipts.docs
        .map((d) => ({ id: d.id, x: d.data() }))
        .filter(
          ({ id, x }) =>
            x.immutable === true &&
            x.receiptId === id &&
            typeof x.action === "string" &&
            x.action.length <= 80,
        )
        .map(({ id, x }) => ({
          receiptId: id,
          templateApprovalId: x.templateApprovalId || null,
          subjectId: x.dryRunId || x.validationId || null,
          action: x.action,
          version: Number.isSafeInteger(x.version) ? x.version : null,
          createdAt: x.createdAt?.toDate?.()?.toISOString?.() ?? null,
          immutable: true,
        }))
        .sort(
          (a, b) =>
            String(a.createdAt).localeCompare(String(b.createdAt)) ||
            a.receiptId.localeCompare(b.receiptId),
        ),
      boundaries: {
        legalTextStored: false,
        providerConfigured: false,
        jhccCommissioned: false,
        notificationsSent: false,
        economyWrites: false,
      },
    };
  },
);
export const proposeEnterpriseMemberDeliveryTemplateAdminV1 = onCall(
  { enforceAppCheck: true },
  async (r) => {
    const a = await resolveEnterpriseMemberAdminReviewer(r),
      submitted = normalizeTemplateProposal({
        templateId: r.data?.templateId,
        templateVersion: r.data?.templateVersion,
        kind: r.data?.kind,
        locale: r.data?.locale,
        jurisdiction: r.data?.jurisdiction,
        contentDigest: r.data?.contentDigest,
        policyVersion: r.data?.policyVersion,
        customerApprovalRequired: false,
        effectiveAt: r.data?.effectiveAt,
        expiresAt: r.data?.expiresAt,
      }),
      policyRef = db
        .collection("enterprise_member_template_approval_policies")
        .doc(`${submitted.jurisdiction}:${submitted.kind}:${submitted.locale}`),
      policySeed = await policyRef.get(),
      ps = policySeed.data() || {};
    if (
      !policySeed.exists ||
      ps.status !== "active" ||
      ps.immutable !== true ||
      ps.policyVersion !== submitted.policyVersion ||
      ps.templateId !== submitted.templateId ||
      ps.templateVersion !== submitted.templateVersion ||
      ps.approvedContentDigest !== submitted.contentDigest ||
      ps.effectiveAt?.toDate?.()?.toISOString?.() !== submitted.effectiveAt ||
      ps.expiresAt?.toDate?.()?.toISOString?.() !== submitted.expiresAt ||
      ps.revokedAt ||
      ps.suspendedAt
    )
      throw new HttpsError(
        "failed-precondition",
        "TEMPLATE_POLICY_UNAVAILABLE",
      );
    const proposal = {
        ...submitted,
        customerApprovalRequired: ps.customerApprovalRequired === true,
      },
      policyDigest = commissioningDigest({
        policyVersion: ps.policyVersion,
        customerApprovalRequired: proposal.customerApprovalRequired,
        approvedContentDigest: ps.approvedContentDigest,
        effectiveAt: proposal.effectiveAt,
        expiresAt: proposal.expiresAt,
      }),
      approvalId = templateApprovalId(
        proposal.templateId,
        proposal.templateVersion,
        proposal.locale,
        proposal.jurisdiction,
      ),
      ref = db
        .collection("enterprise_member_template_approvals")
        .doc(approvalId),
      c = command(a, r, "template_propose", { proposal, policyDigest }),
      receiptId = commissioningReceiptId(
        approvalId,
        c.commandId,
        "template_proposed",
      );
    let replayed = false;
    await db.runTransaction(async (tx) => {
      const [prior, current, policy] = await Promise.all([
        tx.get(c.ref),
        tx.get(ref),
        tx.get(policyRef),
      ]);
      if (prior.exists) {
        if (prior.data()?.digest !== c.digest)
          throw new HttpsError("already-exists", "COMMAND_REPLAY_CONFLICT");
        replayed = true;
        return;
      }
      if (current.exists)
        throw new HttpsError("already-exists", "TEMPLATE_VERSION_EXISTS");
      if (
        commissioningDigest({
          policyVersion: policy.data()?.policyVersion,
          customerApprovalRequired:
            policy.data()?.customerApprovalRequired === true,
          approvedContentDigest: policy.data()?.approvedContentDigest,
          effectiveAt: policy.data()?.effectiveAt?.toDate?.()?.toISOString?.(),
          expiresAt: policy.data()?.expiresAt?.toDate?.()?.toISOString?.(),
        }) !== policyDigest
      )
        throw new HttpsError("aborted", "TEMPLATE_POLICY_STALE");
      tx.create(ref, {
        schema: COMMISSIONING_SCHEMA,
        templateApprovalId: approvalId,
        ...proposal,
        policyDigest,
        status: "pending_approval",
        version: 1,
        proposedByReviewerRef: a.reviewerRef,
        proposerAuthorityVersion: a.authorityVersion,
        legalTextStored: false,
        createdAt: stamp(),
        updatedAt: stamp(),
      });
      tx.create(
        db
          .collection("enterprise_member_commissioning_receipts")
          .doc(receiptId),
        {
          schema: "golfriend.enterprise-member-commissioning-receipt.v1",
          receiptId,
          templateApprovalId: approvalId,
          action: "template_proposed",
          reviewerRef: a.reviewerRef,
          version: 1,
          immutable: true,
          createdAt: stamp(),
        },
      );
      tx.create(c.ref, {
        commandId: c.commandId,
        digest: c.digest,
        result: {
          templateApprovalId: approvalId,
          receiptId,
          status: "pending_approval",
          version: 1,
        },
        immutable: true,
        createdAt: stamp(),
      });
    });
    return {
      schema: COMMISSIONING_SCHEMA,
      templateApprovalId: approvalId,
      receiptId,
      status: "pending_approval",
      version: 1,
      replayed,
      legalTextStored: false,
      approved: false,
    };
  },
);
export const recordEnterpriseMemberTemplateApprovalAdminV1 = onCall(
  { enforceAppCheck: true },
  async (r) => {
    const a = await resolveEnterpriseMemberAdminReviewer(r),
      approvalId = id(r.data?.templateApprovalId, "TEMPLATE_APPROVAL"),
      expected = version(r.data?.expectedVersion),
      approval = normalizeApproval({
        approvalKind: r.data?.approvalKind,
        approvalReceiptRef: r.data?.approvalReceiptRef,
        approvalDigest: r.data?.approvalDigest,
      }),
      ref = db
        .collection("enterprise_member_template_approvals")
        .doc(approvalId),
      registry = db
        .collection(
          approval.approvalKind === "legal"
            ? "enterprise_legal_approval_receipts"
            : "enterprise_customer_template_approval_receipts",
        )
        .doc(approval.approvalReceiptRef),
      c = command(a, r, "approval_record", { approvalId, expected, approval }),
      receiptId = commissioningReceiptId(
        approvalId,
        c.commandId,
        `${approval.approvalKind}_approval_recorded`,
      );
    let replayed = false,
      result: any;
    await db.runTransaction(async (tx) => {
      const [current, external, prior] = await Promise.all([
        tx.get(ref),
        tx.get(registry),
        tx.get(c.ref),
      ]);
      if (prior.exists) {
        if (prior.data()?.digest !== c.digest)
          throw new HttpsError("already-exists", "COMMAND_REPLAY_CONFLICT");
        replayed = true;
        result = prior.data()?.result;
        return;
      }
      const d = current.data() || {},
        e = external.data() || {};
      if (!current.exists || d.version !== expected)
        throw new HttpsError("aborted", "TEMPLATE_VERSION_STALE");
      if (d.proposedByReviewerRef === a.reviewerRef)
        throw new HttpsError("permission-denied", "SEPARATION_OF_DUTIES");
      if (
        !external.exists ||
        e.status !== "approved" ||
        e.approvalKind !== approval.approvalKind ||
        e.templateApprovalId !== approvalId ||
        e.contentDigest !== d.contentDigest ||
        e.jurisdiction !== d.jurisdiction ||
        e.approvalDigest !== approval.approvalDigest ||
        e.effectiveAt?.toDate?.()?.toISOString?.() !== d.effectiveAt ||
        e.expiresAt?.toDate?.()?.toISOString?.() !== d.expiresAt ||
        e.immutable !== true ||
        e.revokedAt ||
        e.suspendedAt ||
        !e.externalApproverRef ||
        e.externalApproverRef === d.legalExternalApproverRef ||
        e.externalApproverRef === d.customerExternalApproverRef
      )
        throw new HttpsError(
          "failed-precondition",
          "EXTERNAL_APPROVAL_UNAVAILABLE",
        );
      let next;
      try {
        next = nextApprovalState(d, approval.approvalKind);
      } catch {
        throw new HttpsError("failed-precondition", "APPROVAL_STATE_INVALID");
      }
      const update: any = { version: next.version, updatedAt: stamp() };
      update[`${approval.approvalKind}ApprovalReceiptRef`] =
        approval.approvalReceiptRef;
      update[`${approval.approvalKind}ApprovalDigest`] =
        approval.approvalDigest;
      update[`${approval.approvalKind}ApprovedByReviewerRef`] = a.reviewerRef;
      update[`${approval.approvalKind}ExternalApproverRef`] =
        e.externalApproverRef;
      result = {
        templateApprovalId: approvalId,
        status: "pending_approval",
        version: next.version,
        receiptId,
      };
      tx.update(ref, update);
      tx.create(
        db
          .collection("enterprise_member_commissioning_receipts")
          .doc(receiptId),
        {
          schema: "golfriend.enterprise-member-commissioning-receipt.v1",
          receiptId,
          templateApprovalId: approvalId,
          action: `${approval.approvalKind}_approval_recorded`,
          externalApprovalReceiptRef: approval.approvalReceiptRef,
          approvalDigest: approval.approvalDigest,
          reviewerRef: a.reviewerRef,
          version: next.version,
          immutable: true,
          createdAt: stamp(),
        },
      );
      tx.create(c.ref, {
        commandId: c.commandId,
        digest: c.digest,
        result,
        immutable: true,
        createdAt: stamp(),
      });
    });
    return {
      schema: COMMISSIONING_SCHEMA,
      ...result,
      replayed,
      approvalDecisionMadeByPortal: false,
    };
  },
);
export const activateEnterpriseMemberDeliveryTemplateAdminV1 = onCall(
  { enforceAppCheck: true },
  async (r) => {
    const a = await resolveEnterpriseMemberAdminReviewer(r),
      approvalId = id(r.data?.templateApprovalId, "TEMPLATE_APPROVAL"),
      expected = version(r.data?.expectedVersion),
      ref = db
        .collection("enterprise_member_template_approvals")
        .doc(approvalId),
      c = command(a, r, "template_activate", { approvalId, expected }),
      receiptId = commissioningReceiptId(
        approvalId,
        c.commandId,
        "template_activated",
      );
    let replayed = false,
      result: any;
    await db.runTransaction(async (tx) => {
      const [current, prior] = await Promise.all([tx.get(ref), tx.get(c.ref)]);
      if (prior.exists) {
        if (prior.data()?.digest !== c.digest)
          throw new HttpsError("already-exists", "COMMAND_REPLAY_CONFLICT");
        replayed = true;
        result = prior.data()?.result;
        return;
      }
      const d = current.data() || {};
      if (!current.exists || d.version !== expected)
        throw new HttpsError("aborted", "TEMPLATE_VERSION_STALE");
      if (d.proposedByReviewerRef === a.reviewerRef)
        throw new HttpsError("permission-denied", "SEPARATION_OF_DUTIES");
      if (
        d.legalApprovedByReviewerRef === a.reviewerRef ||
        d.customerApprovedByReviewerRef === a.reviewerRef
      )
        throw new HttpsError("permission-denied", "SEPARATION_OF_DUTIES");
      try {
        canActivateTemplate(d);
      } catch {
        throw new HttpsError("failed-precondition", "APPROVAL_INCOMPLETE");
      }
      const now = Date.now();
      if (Date.parse(d.effectiveAt) > now || Date.parse(d.expiresAt) <= now)
        throw new HttpsError("failed-precondition", "TEMPLATE_NOT_EFFECTIVE");
      const templateKey = `${d.templateId}:${d.templateVersion}:${d.locale}:${d.jurisdiction}`,
        templateRef = db
          .collection("enterprise_member_delivery_templates")
          .doc(templateKey),
        next = expected + 1;
      result = {
        templateApprovalId: approvalId,
        status: "active",
        version: next,
        receiptId,
      };
      tx.create(templateRef, {
        schema: "golfriend.enterprise-member-delivery-template.v1",
        templateApprovalId: approvalId,
        templateId: d.templateId,
        version: d.templateVersion,
        kind: d.kind,
        locale: d.locale,
        jurisdiction: d.jurisdiction,
        contentDigest: d.contentDigest,
        policyVersion: d.policyVersion,
        effectiveAt: admin.firestore.Timestamp.fromDate(
          new Date(d.effectiveAt),
        ),
        expiresAt: admin.firestore.Timestamp.fromDate(new Date(d.expiresAt)),
        status: "approved",
        jurisdictionsApproved: true,
        legalApprovalReceiptRef: d.legalApprovalReceiptRef,
        customerApprovalReceiptRef: d.customerApprovalReceiptRef || null,
        activatedByReviewerRef: a.reviewerRef,
        legalTextStored: false,
        createdAt: stamp(),
        immutable: true,
      });
      tx.update(ref, {
        status: "active",
        version: next,
        activatedByReviewerRef: a.reviewerRef,
        updatedAt: stamp(),
      });
      tx.create(
        db
          .collection("enterprise_member_commissioning_receipts")
          .doc(receiptId),
        {
          schema: "golfriend.enterprise-member-commissioning-receipt.v1",
          receiptId,
          templateApprovalId: approvalId,
          action: "template_activated",
          reviewerRef: a.reviewerRef,
          version: next,
          immutable: true,
          createdAt: stamp(),
        },
      );
      tx.create(c.ref, {
        commandId: c.commandId,
        digest: c.digest,
        result,
        immutable: true,
        createdAt: stamp(),
      });
    });
    return {
      schema: COMMISSIONING_SCHEMA,
      ...result,
      replayed,
      providerConfigured: false,
      sent: false,
    };
  },
);
async function changeTemplateState(r: any, action: "reject" | "retire") {
  const a = await resolveEnterpriseMemberAdminReviewer(r),
    approvalId = id(r.data?.templateApprovalId, "TEMPLATE_APPROVAL"),
    expected = version(r.data?.expectedVersion),
    reason = String(r.data?.reason || "").trim(),
    policyVersion = id(r.data?.policyVersion, "POLICY_VERSION");
  if (!reason || reason.length > 1000 || /[\u0000-\u001f\u007f]/.test(reason))
    throw new HttpsError("invalid-argument", "REASON_INVALID");
  const ref = db
      .collection("enterprise_member_template_approvals")
      .doc(approvalId),
    c = command(a, r, `template_${action}`, {
      approvalId,
      expected,
      reason,
      policyVersion,
    }),
    receiptId = commissioningReceiptId(
      approvalId,
      c.commandId,
      `template_${action}d`,
    );
  let replayed = false,
    result: any;
  await db.runTransaction(async (tx) => {
    const [current, prior] = await Promise.all([tx.get(ref), tx.get(c.ref)]);
    if (prior.exists) {
      if (prior.data()?.digest !== c.digest)
        throw new HttpsError("already-exists", "COMMAND_REPLAY_CONFLICT");
      replayed = true;
      result = prior.data()?.result;
      return;
    }
    const d = current.data() || {},
      required = action === "reject" ? "pending_approval" : "active";
    if (
      !current.exists ||
      d.version !== expected ||
      d.status !== required ||
      d.policyVersion !== policyVersion
    )
      throw new HttpsError("aborted", "TEMPLATE_STATE_STALE");
    if (d.proposedByReviewerRef === a.reviewerRef)
      throw new HttpsError("permission-denied", "SEPARATION_OF_DUTIES");
    if (
      action === "retire" &&
      [
        d.activatedByReviewerRef,
        d.legalApprovedByReviewerRef,
        d.customerApprovedByReviewerRef,
      ].includes(a.reviewerRef)
    )
      throw new HttpsError("permission-denied", "SEPARATION_OF_DUTIES");
    const status = action === "reject" ? "rejected" : "retired",
      next = expected + 1;
    result = {
      templateApprovalId: approvalId,
      status,
      version: next,
      receiptId,
    };
    tx.update(ref, {
      status,
      version: next,
      stateReason: reason,
      updatedAt: stamp(),
    });
    if (action === "retire")
      tx.create(
        db
          .collection("enterprise_member_delivery_template_retirements")
          .doc(
            `${d.templateId}:${d.templateVersion}:${d.locale}:${d.jurisdiction}`,
          ),
        {
          schema: "golfriend.enterprise-member-delivery-template-retirement.v1",
          templateApprovalId: approvalId,
          templateKey: `${d.templateId}:${d.templateVersion}:${d.locale}:${d.jurisdiction}`,
          policyVersion,
          reason,
          reviewerRef: a.reviewerRef,
          immutable: true,
          createdAt: stamp(),
        },
      );
    tx.create(
      db.collection("enterprise_member_commissioning_receipts").doc(receiptId),
      {
        schema: "golfriend.enterprise-member-commissioning-receipt.v1",
        receiptId,
        templateApprovalId: approvalId,
        action: `template_${action}d`,
        policyVersion,
        reviewerRef: a.reviewerRef,
        version: next,
        immutable: true,
        createdAt: stamp(),
      },
    );
    tx.create(c.ref, {
      commandId: c.commandId,
      digest: c.digest,
      result,
      immutable: true,
      createdAt: stamp(),
    });
  });
  return { schema: COMMISSIONING_SCHEMA, ...result, replayed };
}
export const rejectEnterpriseMemberDeliveryTemplateAdminV1 = onCall(
  { enforceAppCheck: true },
  (r) => changeTemplateState(r, "reject"),
);
export const retireEnterpriseMemberDeliveryTemplateAdminV1 = onCall(
  { enforceAppCheck: true },
  (r) => changeTemplateState(r, "retire"),
);
export const runEnterpriseMemberDeliveryDryRunAdminV1 = onCall(
  { enforceAppCheck: true },
  async (r) => {
    const a = await resolveEnterpriseMemberAdminReviewer(r),
      approvalId = id(r.data?.templateApprovalId, "TEMPLATE_APPROVAL"),
      expected = version(r.data?.expectedVersion),
      requestId = id(r.data?.requestId, "REQUEST"),
      providerCompositionId = id(
        r.data?.providerCompositionId,
        "PROVIDER_COMPOSITION",
      ),
      channel = String(r.data?.channel || ""),
      requestSeed = await db
        .collectionGroup("requests")
        .where("requestId", "==", requestId)
        .limit(2)
        .get();
    if (requestSeed.size !== 1 || !["email", "sms", "push"].includes(channel))
      throw new HttpsError("failed-precondition", "DRY_RUN_SOURCE_UNAVAILABLE");
    const requestRef = requestSeed.docs[0].ref,
      q0 = requestSeed.docs[0].data(),
      c = command(a, r, "delivery_dry_run", {
        approvalId,
        expected,
        requestId,
        providerCompositionId,
        channel,
      }),
      dryRunId = `emdr_${commissioningDigest([approvalId, requestId, c.commandId]).slice(0, 32)}`,
      ref = db.collection("enterprise_member_delivery_dry_runs").doc(dryRunId),
      receiptId = commissioningReceiptId(dryRunId, c.commandId, "dry_run");
    let replayed = false;
    await db.runTransaction(async (tx) => {
      const linkQuery = q0.memberReference
          ? db
              .collection("enterprise_member_links")
              .where("memberReference", "==", q0.memberReference)
              .limit(3)
          : null,
        [
          template,
          prior,
          request,
          composition,
          policy,
          organization,
          property,
          course,
          suppression,
          links,
        ] = await Promise.all([
          tx.get(
            db
              .collection("enterprise_member_template_approvals")
              .doc(approvalId),
          ),
          tx.get(c.ref),
          tx.get(requestRef),
          tx.get(
            db
              .collection("enterprise_member_delivery_provider_compositions")
              .doc(providerCompositionId),
          ),
          tx.get(
            db
              .collection("enterprise_member_delivery_policies")
              .doc(String(q0.action)),
          ),
          tx.get(
            db
              .collection("enterprise_organizations")
              .doc(String(q0.organizationId)),
          ),
          tx.get(
            db.collection("enterprise_properties").doc(String(q0.propertyId)),
          ),
          tx.get(db.collection("enterprise_courses").doc(String(q0.courseId))),
          tx.get(
            db
              .collection("enterprise_member_delivery_suppressions")
              .doc(String(q0.contactReference || "missing")),
          ),
          linkQuery ? tx.get(linkQuery) : Promise.resolve(null),
        ]);
      if (prior.exists) {
        if (prior.data()?.digest !== c.digest)
          throw new HttpsError("already-exists", "COMMAND_REPLAY_CONFLICT");
        replayed = true;
        return;
      }
      const d = template.data() || {};
      if (
        !template.exists ||
        d.status !== "active" ||
        d.version !== expected ||
        !request.exists
      )
        throw new HttpsError(
          "failed-precondition",
          "DRY_RUN_SOURCE_UNAVAILABLE",
        );
      const q = request.data() || {},
        provider = composition.data() || {},
        p = policy.data() || {},
        active = (s: any, parent?: { key: string; value: string }) => {
          const z = s.data() || {},
            ms = (v: any) => v?.toMillis?.() ?? Date.parse(String(v || ""));
          return (
            s.exists &&
            z.status === "active" &&
            !z.suspendedAt &&
            !z.revokedAt &&
            (!z.effectiveAt || ms(z.effectiveAt) <= Date.now()) &&
            (!z.expiresAt || ms(z.expiresAt) > Date.now()) &&
            (!parent || z[parent.key] === parent.value)
          );
        };
      if (
        q.schema !== "golfriend.enterprise-course-member-management.v1" ||
        q.requestId !== requestId ||
        q.status !== "awaiting_delivery_provider" ||
        Date.parse(d.effectiveAt) > Date.now() ||
        Date.parse(d.expiresAt) <= Date.now() ||
        q.locale !== d.locale ||
        (q.action !== d.kind &&
          !(q.action === "invitation" && d.kind === "invitation")) ||
        q.expiresAt?.toMillis?.() <= Date.now() ||
        !active(organization) ||
        !active(property, { key: "organizationId", value: q.organizationId }) ||
        !active(course, { key: "propertyId", value: q.propertyId }) ||
        String(course.data()?.jurisdiction || course.data()?.country) !==
          d.jurisdiction ||
        !policy.exists ||
        p.status !== "active" ||
        p.policyVersion !== d.policyVersion ||
        p.purpose !== q.purpose ||
        p.templateId !== d.templateId ||
        p.templateVersion !== d.templateVersion ||
        p.locale !== d.locale ||
        p.jurisdiction !== d.jurisdiction ||
        p.channel !== channel ||
        !composition.exists ||
        provider.status !== "dry_run_approved" ||
        provider.immutable !== true ||
        provider.revokedAt ||
        provider.suspendedAt ||
        provider.effectiveAt?.toMillis?.() > Date.now() ||
        provider.expiresAt?.toMillis?.() <= Date.now() ||
        provider.providerType !== p.providerType ||
        provider.adapterVersion !== p.adapterVersion ||
        !Array.isArray(provider.allowedChannels) ||
        !provider.allowedChannels.includes(channel) ||
        !/^secretref_[A-Za-z0-9_.:-]{8,127}$/.test(
          String(provider.credentialReference || ""),
        ) ||
        (suppression.exists &&
          ["dnc", "revoked", "suppressed"].includes(
            String(suppression.data()?.status),
          )) ||
        !/^ref_[a-f0-9]{12,64}$/.test(String(q.contactReference || "")) ||
        links?.docs?.some(
          (link: any) =>
            link.data()?.organizationId === q.organizationId &&
            link.data()?.propertyId === q.propertyId &&
            link.data()?.courseId === q.courseId &&
            ["declined", "expired", "revoked", "unlinked"].includes(
              String(link.data()?.state),
            ),
        )
      )
        throw new HttpsError("failed-precondition", "DRY_RUN_POLICY_MISMATCH");
      tx.create(ref, {
        schema: "golfriend.enterprise-member-delivery-dry-run.v1",
        dryRunId,
        templateApprovalId: approvalId,
        requestId,
        organizationId: q.organizationId,
        courseId: q.courseId,
        status: "provider_unconfigured",
        providerCompositionId,
        providerType: provider.providerType,
        adapterVersion: provider.adapterVersion,
        channel,
        credentialReferenceDigest: commissioningDigest(
          provider.credentialReference,
        ),
        providerConfigured: false,
        providerCalled: false,
        credentialsRead: false,
        messageRendered: false,
        destinationResolved: false,
        transmitted: false,
        reviewerRef: a.reviewerRef,
        immutable: true,
        createdAt: stamp(),
      });
      tx.create(
        db
          .collection("enterprise_member_commissioning_receipts")
          .doc(receiptId),
        {
          schema: "golfriend.enterprise-member-commissioning-receipt.v1",
          receiptId,
          dryRunId,
          action: "dry_run_provider_unconfigured",
          reviewerRef: a.reviewerRef,
          immutable: true,
          createdAt: stamp(),
        },
      );
      tx.create(c.ref, {
        commandId: c.commandId,
        digest: c.digest,
        result: { dryRunId, receiptId, status: "provider_unconfigured" },
        immutable: true,
        createdAt: stamp(),
      });
    });
    return {
      schema: COMMISSIONING_SCHEMA,
      dryRunId,
      receiptId,
      status: "provider_unconfigured",
      providerConfigured: false,
      providerCalled: false,
      transmitted: false,
      replayed,
    };
  },
);
export const validateEnterpriseMemberJHCCPortAdminV1 = onCall(
  { enforceAppCheck: true },
  async (r) => {
    const a = await resolveEnterpriseMemberAdminReviewer(r),
      eventIds = normalizeReportEventIds(r.data?.eventIds),
      schemaVersion = id(r.data?.expectedSchemaVersion, "SCHEMA_VERSION"),
      c = command(a, r, "jhcc_validate", { eventIds, schemaVersion }),
      validationId = `emjv_${commissioningDigest([eventIds, schemaVersion, c.commandId]).slice(0, 32)}`,
      ref = db
        .collection("enterprise_member_jhcc_validations")
        .doc(validationId),
      receiptId = commissioningReceiptId(
        validationId,
        c.commandId,
        "jhcc_validated",
      );
    if (schemaVersion !== JHCC_PORT_SCHEMA)
      throw new HttpsError("failed-precondition", "JHCC_SCHEMA_UNAVAILABLE");
    let replayed = false,
      result: any;
    await db.runTransaction(async (tx) => {
      const [prior, ...events] = await Promise.all([
        tx.get(c.ref),
        ...eventIds.map((x) =>
          tx.get(db.collection("enterprise_member_report_ready_events").doc(x)),
        ),
      ]);
      if (prior.exists) {
        if (prior.data()?.digest !== c.digest)
          throw new HttpsError("already-exists", "COMMAND_REPLAY_CONFLICT");
        replayed = true;
        result = prior.data()?.result;
        return;
      }
      if (events.some((x) => !x.exists))
        throw new HttpsError("failed-precondition", "REPORT_EVENT_UNAVAILABLE");
      let summary;
      try {
        summary = privacySafeReportSummary(events.map((x) => x.data()));
      } catch {
        throw new HttpsError("failed-precondition", "REPORT_EVENT_INVALID");
      }
      result = {
        validationId,
        receiptId,
        status: "validated_not_transmitted",
        ...summary,
      };
      tx.create(ref, {
        schema: "golfriend.enterprise-member-jhcc-validation.v1",
        validationId,
        expectedSchemaVersion: schemaVersion,
        eventIds,
        eventSetDigest: commissioningDigest(eventIds),
        ...summary,
        status: "validated_not_transmitted",
        commissioned: false,
        endpointConfigured: false,
        credentialsRead: false,
        transmitted: false,
        reviewerRef: a.reviewerRef,
        immutable: true,
        createdAt: stamp(),
      });
      tx.create(
        db
          .collection("enterprise_member_commissioning_receipts")
          .doc(receiptId),
        {
          schema: "golfriend.enterprise-member-commissioning-receipt.v1",
          receiptId,
          validationId,
          action: "jhcc_validated_not_transmitted",
          eventCount: summary.eventCount,
          reviewerRef: a.reviewerRef,
          immutable: true,
          createdAt: stamp(),
        },
      );
      tx.create(c.ref, {
        commandId: c.commandId,
        digest: c.digest,
        result,
        immutable: true,
        createdAt: stamp(),
      });
    });
    return {
      schema: COMMISSIONING_SCHEMA,
      ...result,
      replayed,
      commissioned: false,
      transmitted: false,
    };
  },
);
