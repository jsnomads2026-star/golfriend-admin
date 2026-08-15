import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  activeAdminRecord,
  ADMIN_MEMBER_SCHEMA,
  adminCommandDocumentId,
  adminReceiptId,
  decisionAllowed,
  digest,
  minimumAdminRequest,
  minimumOutbox,
  normalizeCsvResolutions,
  normalizeDecision,
  normalizeDelivery,
  outboxId,
  strictId,
  strictVersion,
} from "./enterpriseMemberAdminDomain.js";
import { ENTERPRISE_MEMBER_MANAGEMENT_SCHEMA } from "./enterpriseMemberManagementDomain.js";
if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore(),
  stamp = () => admin.firestore.FieldValue.serverTimestamp();
function auth(r: any) {
  const uid = String(r.auth?.uid || "");
  if (!uid) throw new HttpsError("unauthenticated", "Authentication required.");
  if (r.auth?.token?.email_verified !== true)
    throw new HttpsError(
      "permission-denied",
      "Verified Admin identity required.",
    );
  return uid;
}
async function reviewer(r: any) {
  const uid = auth(r),
    [snap, user] = await Promise.all([
      db.collection("admin_users").doc(uid).get(),
      admin.auth().getUser(uid),
    ]),
    x = snap.data();
  if (
    user.disabled ||
    user.emailVerified !== true ||
    !snap.exists ||
    !activeAdminRecord(x)
  )
    throw new HttpsError(
      "permission-denied",
      "Active Enterprise reviewer authority required.",
    );
  return {
    uid,
    reviewerRef: `admin_${digest(uid).slice(0, 24)}`,
    role: String(x!.role),
    authorityVersion: String(
      x!.authorityVersion || x!.version || "unversioned",
    ),
  };
}
async function requestById(id: string) {
  const snap = await db
    .collectionGroup("requests")
    .where("requestId", "==", id)
    .limit(2)
    .get();
  if (snap.size !== 1)
    throw new HttpsError("not-found", "Request unavailable.");
  const doc = snap.docs[0],
    x = doc.data();
  if (x.schema !== ENTERPRISE_MEMBER_MANAGEMENT_SCHEMA || x.requestId !== id)
    throw new HttpsError("unavailable", "Malformed request.");
  return { doc, x };
}
const iso = (v: any) => v?.toDate?.()?.toISOString?.() ?? null;
function publicHistory(docs: any[], x: any) {
  return docs
    .filter((d) => {
      const z = d.data();
      return (
        z.requestId === x.requestId &&
        z.organizationId === x.organizationId &&
        z.propertyId === x.propertyId &&
        z.courseId === x.courseId &&
        z.immutable === true
      );
    })
    .map((d) => {
      const z = d.data();
      return {
        receiptId: d.id,
        action: z.action || z.decision,
        status: z.status || null,
        reviewerRole: z.reviewerRole || null,
        occurredAt: iso(z.occurredAt || z.createdAt),
        immutable: true,
      };
    });
}
export const getEnterpriseMemberRequestsAdminV1 = onCall(
  { enforceAppCheck: true },
  async (r) => {
    await reviewer(r);
    const f = r.data?.filter || {};
    if (
      Object.keys(f).some(
        (k) =>
          ![
            "status",
            "action",
            "organizationId",
            "courseId",
            "search",
          ].includes(k),
      )
    )
      throw new HttpsError("invalid-argument", "FILTER_INVALID");
    const limit = Number(r.data?.limit ?? 25);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50)
      throw new HttpsError("invalid-argument", "LIMIT_INVALID");
    const snap = await db.collectionGroup("requests").limit(501).get();
    if (snap.size > 500)
      throw new HttpsError(
        "resource-exhausted",
        "Queue requires narrower filtering.",
      );
    let items = snap.docs
      .map((d) => d.data())
      .filter((x) => x.schema === ENTERPRISE_MEMBER_MANAGEMENT_SCHEMA);
    for (const k of ["status", "action", "organizationId", "courseId"])
      if (f[k]) items = items.filter((x) => x[k] === f[k]);
    const q = String(f.search || "")
      .trim()
      .toLowerCase();
    if (q) {
      if (q.length < 3 || q.length > 80)
        throw new HttpsError("invalid-argument", "SEARCH_INVALID");
      items = items.filter((x) =>
        [x.requestId, x.memberReference, x.courseId, x.organizationId].some(
          (v) => String(v || "").toLowerCase() === q,
        ),
      );
    }
    items.sort((a, b) =>
      String(a.requestId).localeCompare(String(b.requestId)),
    );
    const binding = digest({ f, version: 1 }),
      cursor = String(r.data?.cursor || ""),
      start = cursor
        ? items.findIndex(
            (_: any, i: number) => digest([binding, i + 1]) === cursor,
          ) + 1
        : 0;
    if (cursor && start === 0)
      throw new HttpsError("invalid-argument", "CURSOR_INVALID");
    const page = items.slice(start, start + limit);
    return {
      schema: ADMIN_MEMBER_SCHEMA,
      state: page.length ? "current" : "empty",
      items: page.map(minimumAdminRequest),
      nextCursor:
        start + limit < items.length ? digest([binding, start + limit]) : null,
      privacy: "minimum_necessary",
    };
  },
);
export const getEnterpriseMemberRequestAdminV1 = onCall(
  { enforceAppCheck: true },
  async (r) => {
    await reviewer(r);
    const id = strictId(r.data?.requestId, "REQUEST"),
      { x } = await requestById(id),
      receipts = await db
        .collection("enterprise_member_management_receipts")
        .where("requestId", "==", id)
        .limit(100)
        .get(),
      adminReceipts = await db
        .collection("enterprise_member_admin_receipts")
        .where("requestId", "==", id)
        .limit(100)
        .get(),
      outbox = await db
        .collection("enterprise_member_delivery_outbox")
        .where("requestId", "==", id)
        .limit(20)
        .get(),
      preview = x.previewId
        ? await db
            .collection("enterprise_member_import_previews")
            .doc(String(x.previewId))
            .get()
        : null,
      links = x.memberReference
        ? await db
            .collection("enterprise_member_links")
            .where("memberReference", "==", x.memberReference)
            .limit(2)
            .get()
        : null,
      px = preview?.data() || {};
    return {
      schema: ADMIN_MEMBER_SCHEMA,
      state: "current",
      request: minimumAdminRequest(x),
      evidenceDigest: digest({
        requestId: id,
        version: x.version,
        commandDigest: x.commandDigest || null,
        previewId: x.previewId || null,
        rowDigest: x.rowDigest || null,
        evidenceReferences: x.evidenceReferences || [],
      }),
      history: publicHistory([...receipts.docs, ...adminReceipts.docs], x),
      delivery: outbox.docs
        .filter((d) => {
          const z = d.data();
          return (
            z.organizationId === x.organizationId &&
            z.propertyId === x.propertyId &&
            z.courseId === x.courseId
          );
        })
        .map((d) => minimumOutbox(d.data())),
      csv:
        preview?.exists &&
        px.organizationId === x.organizationId &&
        px.propertyId === x.propertyId &&
        px.courseId === x.courseId
          ? {
              previewId: preview.id,
              rowDigest: px.rowDigest,
              rows: (px.rows || [])
                .slice(0, 100)
                .map((row: any) => ({
                  row: row.row,
                  memberReference: row.memberReference,
                  locale: row.locale,
                  conflict: row.result,
                })),
            }
          : null,
      lifecycle:
        links &&
        links.size === 1 &&
        links.docs[0].data()?.organizationId === x.organizationId &&
        links.docs[0].data()?.propertyId === x.propertyId &&
        links.docs[0].data()?.courseId === x.courseId
          ? {
              consentState: links.docs[0].data()?.state,
              consentVersion: links.docs[0].data()?.consentVersion,
            }
          : { consentState: "not_available", consentVersion: null },
      internalNotesExcluded: true,
      contactDataExcluded: true,
      economy: {
        teeMutation: false,
        cashRevenue: false,
        internalInfrastructureOnly: true,
      },
      reporting: { status: "report_ready_not_transmitted" },
    };
  },
);
export const decideEnterpriseMemberRequestAdminV1 = onCall(
  { enforceAppCheck: true },
  async (r) => {
    const a = await reviewer(r),
      requestId = strictId(r.data?.requestId, "REQUEST"),
      command = strictId(r.data?.commandId, "COMMAND"),
      expected = strictVersion(r.data?.expectedVersion),
      decision = normalizeDecision({
        decision: r.data?.decision,
        reason: r.data?.reason,
        existingMemberReference: r.data?.existingMemberReference,
        policyVersion: r.data?.policyVersion,
        evidenceDigest: r.data?.evidenceDigest,
      }),
      commandRef = db
        .collection("enterprise_member_admin_commands")
        .doc(adminCommandDocumentId(a.uid, command)),
      rid = adminReceiptId(requestId, command, decision.decision),
      receiptRef = db.collection("enterprise_member_admin_receipts").doc(rid),
      reportRef = db
        .collection("enterprise_member_report_ready_events")
        .doc(`emre_${digest([rid]).slice(0, 32)}`),
      { doc, x } = await requestById(requestId),
      payloadDigest = digest({
        requestId,
        expected,
        decision,
        reviewerAuthorityVersion: a.authorityVersion,
      });
    let replayed = false,
      result: any;
    await db.runTransaction(async (tx) => {
      const selfBinding = db
          .collection("enterprise_authority_bindings")
          .doc(a.uid)
          .collection("memberships")
          .doc(String(x.representativeMembershipId)),
        memberRef = decision.existingMemberReference
          ? doc.ref.parent
              .parent!.collection("members")
              .doc(decision.existingMemberReference)
          : null,
        [current, prior, self, member] = await Promise.all([
          tx.get(doc.ref),
          tx.get(commandRef),
          tx.get(selfBinding),
          memberRef ? tx.get(memberRef) : Promise.resolve(null),
        ]),
        d = current.data() || {},
        authoritativeEvidenceDigest = digest({
          requestId,
          version: d.version,
          commandDigest: d.commandDigest || null,
          previewId: d.previewId || null,
          rowDigest: d.rowDigest || null,
          evidenceReferences: d.evidenceReferences || [],
        });
      if (prior.exists) {
        if (prior.data()?.digest !== payloadDigest)
          throw new HttpsError("already-exists", "COMMAND_REPLAY_CONFLICT");
        replayed = true;
        result = prior.data()?.result;
        return;
      }
      if (decision.evidenceDigest !== authoritativeEvidenceDigest)
        throw new HttpsError("aborted", "EVIDENCE_DIGEST_STALE");
      if (
        d.requestId !== requestId ||
        d.organizationId !== x.organizationId ||
        d.propertyId !== x.propertyId ||
        d.courseId !== x.courseId ||
        d.version !== expected
      )
        throw new HttpsError("aborted", "STALE_REQUEST");
      if (
        self.exists ||
        d.representativeUid === a.uid ||
        d.createdByUid === a.uid
      )
        throw new HttpsError("permission-denied", "SEPARATION_OF_DUTIES");
      if (d.expiresAt?.toMillis?.() <= Date.now())
        throw new HttpsError("failed-precondition", "REQUEST_EXPIRED");
      if (
        decision.decision === "approve_delivery" &&
        !["invitation", "resend"].includes(d.action)
      )
        throw new HttpsError("failed-precondition", "DELIVERY_ACTION_INVALID");
      if (
        member &&
        (!member.exists ||
          member.data()?.organizationId !== d.organizationId ||
          member.data()?.propertyId !== d.propertyId ||
          member.data()?.courseId !== d.courseId)
      )
        throw new HttpsError(
          "failed-precondition",
          "EXISTING_MEMBER_UNAVAILABLE",
        );
      const status = decisionAllowed(String(d.status), decision.decision),
        version = expected + 1;
      result = {
        requestId,
        status,
        adminResolutionStatus: decision.decision,
        version,
        receiptId: rid,
      };
      tx.update(doc.ref, {
        status,
        version,
        adminResolutionStatus: decision.decision,
        reviewedByAdminRole: a.role,
        reviewedAt: stamp(),
        updatedAt: stamp(),
      });
      tx.create(receiptRef, {
        schema: "golfriend.enterprise-member-admin-receipt.v1",
        receiptId: rid,
        requestId,
        organizationId: d.organizationId,
        propertyId: d.propertyId,
        courseId: d.courseId,
        representativeMembershipId: d.representativeMembershipId,
        requestVersion: version,
        decision: decision.decision,
        policyVersion: decision.policyVersion,
        evidenceDigest: authoritativeEvidenceDigest,
        reviewerRef: a.reviewerRef,
        reviewerRole: a.role,
        reviewerAuthorityVersion: a.authorityVersion,
        immutable: true,
        occurredAt: stamp(),
      });
      tx.create(reportRef, {
        schema: "golfriend.enterprise-member-report-ready.v1",
        eventId: reportRef.id,
        requestId,
        organizationId: d.organizationId,
        courseId: d.courseId,
        event: decision.decision,
        status,
        contactData: false,
        csvContents: false,
        economyEvent: false,
        transmitted: false,
        immutable: true,
        createdAt: stamp(),
      });
      tx.create(commandRef, {
        commandId: command,
        digest: payloadDigest,
        result,
        immutable: true,
        createdAt: stamp(),
      });
    });
    return {
      schema: ADMIN_MEMBER_SCHEMA,
      ...result,
      replayed,
      deliveryCreated: false,
      accountCreated: false,
      consentChanged: false,
      economyEventCreated: false,
    };
  },
);
export const prepareEnterpriseMemberDeliveryAdminV1 = onCall(
  { enforceAppCheck: true },
  async (r) => {
    const a = await reviewer(r),
      requestId = strictId(r.data?.requestId, "REQUEST"),
      command = strictId(r.data?.commandId, "COMMAND"),
      expected = strictVersion(r.data?.expectedVersion),
      delivery = normalizeDelivery({
        channel: r.data?.channel,
        templateId: r.data?.templateId,
        templateVersion: r.data?.templateVersion,
        locale: r.data?.locale,
        legalBasisReference: r.data?.legalBasisReference,
      }),
      commandRef = db
        .collection("enterprise_member_admin_commands")
        .doc(adminCommandDocumentId(a.uid, command)),
      { doc, x } = await requestById(requestId),
      policyRef = db
        .collection("enterprise_member_delivery_policies")
        .doc(String(x.action)),
      organizationRef = db
        .collection("enterprise_organizations")
        .doc(String(x.organizationId)),
      propertyRef = db
        .collection("enterprise_properties")
        .doc(String(x.propertyId)),
      courseRef = db.collection("enterprise_courses").doc(String(x.courseId)),
      memberRef = x.memberReference
        ? doc.ref.parent
            .parent!.collection("members")
            .doc(String(x.memberReference))
        : null,
      linkQuery = x.memberReference
        ? db
            .collection("enterprise_member_links")
            .where("memberReference", "==", x.memberReference)
            .limit(3)
        : null,
      oid = outboxId(requestId, delivery.channel, command),
      outRef = db.collection("enterprise_member_delivery_outbox").doc(oid),
      rid = adminReceiptId(requestId, command, "delivery_prepared"),
      dg = digest({
        requestId,
        expected,
        delivery,
        reviewerAuthorityVersion: a.authorityVersion,
      });
    let replayed = false;
    await db.runTransaction(async (tx) => {
      const selfBinding = db
          .collection("enterprise_authority_bindings")
          .doc(a.uid)
          .collection("memberships")
          .doc(String(x.representativeMembershipId)),
        [
          current,
          prior,
          template,
          suppression,
          self,
          policy,
          organization,
          property,
          course,
          member,
          linkState,
        ] = await Promise.all([
          tx.get(doc.ref),
          tx.get(commandRef),
          tx.get(
            db
              .collection("enterprise_member_delivery_templates")
              .doc(
                `${delivery.templateId}:${delivery.templateVersion}:${delivery.locale}`,
              ),
          ),
          tx.get(
            db
              .collection("enterprise_member_delivery_suppressions")
              .doc(
                String(
                  x.contactReferenceHash || x.contactReference || "missing",
                ),
              ),
          ),
          tx.get(selfBinding),
          tx.get(policyRef),
          tx.get(organizationRef),
          tx.get(propertyRef),
          tx.get(courseRef),
          memberRef ? tx.get(memberRef) : Promise.resolve(null),
          linkQuery ? tx.get(linkQuery) : Promise.resolve(null),
        ]);
      if (prior.exists) {
        if (prior.data()?.digest !== dg)
          throw new HttpsError("already-exists", "COMMAND_REPLAY_CONFLICT");
        replayed = true;
        return;
      }
      const d = current.data() || {};
      if (
        d.version !== expected ||
        d.status !== "awaiting_delivery_provider" ||
        d.expiresAt?.toMillis?.() <= Date.now()
      )
        throw new HttpsError("aborted", "DELIVERY_SOURCE_STALE");
      if (
        self.exists ||
        d.representativeUid === a.uid ||
        d.createdByUid === a.uid
      )
        throw new HttpsError("permission-denied", "SEPARATION_OF_DUTIES");
      const t = template.data() || {},
        p = policy.data() || {},
        active = (snapshot: any, parent?: { id: string; value: string }) => {
          const z = snapshot.data() || {},
            ms = (v: any) => v?.toMillis?.() ?? Date.parse(String(v || ""));
          return (
            snapshot.exists &&
            ["active", "approved"].includes(String(z.status)) &&
            !z.suspendedAt &&
            !z.revokedAt &&
            (!z.effectiveAt || ms(z.effectiveAt) <= Date.now()) &&
            (!z.expiresAt || ms(z.expiresAt) > Date.now()) &&
            (!parent || z[parent.id] === parent.value)
          );
        };
      if (
        !active(organization) ||
        !active(property, { id: "organizationId", value: d.organizationId }) ||
        !active(course, { id: "propertyId", value: d.propertyId })
      )
        throw new HttpsError(
          "failed-precondition",
          "ENTERPRISE_SCOPE_SUSPENDED",
        );
      if (
        member &&
        member.exists &&
        ["inactive", "unavailable"].includes(String(member.data()?.state))
      )
        throw new HttpsError("failed-precondition", "MEMBER_DEACTIVATED");
      if (
        linkState?.docs?.some(
          (link: any) =>
            link.data()?.organizationId === d.organizationId &&
            link.data()?.propertyId === d.propertyId &&
            link.data()?.courseId === d.courseId &&
            ["declined", "expired", "revoked", "unlinked"].includes(
              String(link.data()?.state),
            ),
        )
      )
        throw new HttpsError("failed-precondition", "CONSENT_REVOKED");
      if (
        !policy.exists ||
        p.status !== "active" ||
        p.action !== d.action ||
        p.purpose !== d.purpose ||
        p.locale !== d.locale ||
        p.templateId !== delivery.templateId ||
        p.templateVersion !== delivery.templateVersion ||
        p.legalBasisReference !== delivery.legalBasisReference ||
        delivery.locale !== d.locale
      )
        throw new HttpsError("failed-precondition", "DELIVERY_POLICY_MISMATCH");
      if (!/^ref_[a-f0-9]{12,64}$/.test(String(d.contactReference || "")))
        throw new HttpsError(
          "failed-precondition",
          "OPAQUE_DESTINATION_REQUIRED",
        );
      if (
        !template.exists ||
        t.status !== "approved" ||
        t.locale !== delivery.locale ||
        t.version !== delivery.templateVersion ||
        t.jurisdictionsApproved !== true
      )
        throw new HttpsError("failed-precondition", "TEMPLATE_UNAVAILABLE");
      if (
        suppression.exists &&
        ["dnc", "revoked", "suppressed"].includes(
          String(suppression.data()?.status),
        )
      )
        throw new HttpsError("failed-precondition", "DELIVERY_SUPPRESSED");
      tx.create(outRef, {
        schema: "golfriend.enterprise-member-delivery-outbox.v1",
        outboxId: oid,
        requestId,
        organizationId: d.organizationId,
        propertyId: d.propertyId,
        courseId: d.courseId,
        memberReference: d.memberReference || null,
        destinationReference: d.contactReference || null,
        destinationStoredAsOpaqueReference: true,
        ...delivery,
        status: "awaiting_delivery_provider",
        providerState: "unconfigured",
        providerConfigured: false,
        attempts: 0,
        maxAttempts: 5,
        requestVersion: expected,
        requestCommandDigest: d.commandDigest || null,
        consentState: "pending",
        expiresAt: d.expiresAt,
        createdAt: stamp(),
        immutableCommand: true,
      });
      tx.create(db.collection("enterprise_member_admin_receipts").doc(rid), {
        schema: "golfriend.enterprise-member-admin-receipt.v1",
        receiptId: rid,
        requestId,
        organizationId: d.organizationId,
        propertyId: d.propertyId,
        courseId: d.courseId,
        action: "delivery_prepared",
        outboxId: oid,
        reviewerRef: a.reviewerRef,
        reviewerRole: a.role,
        immutable: true,
        occurredAt: stamp(),
      });
      tx.create(commandRef, {
        commandId: command,
        digest: dg,
        result: {
          requestId,
          outboxId: oid,
          receiptId: rid,
          status: "awaiting_delivery_provider",
        },
        immutable: true,
        createdAt: stamp(),
      });
    });
    return {
      schema: ADMIN_MEMBER_SCHEMA,
      requestId,
      outboxId: oid,
      receiptId: rid,
      status: "awaiting_delivery_provider",
      providerConfigured: false,
      sent: false,
      delivered: false,
      consentAccepted: false,
      membershipActivated: false,
      replayed,
    };
  },
);
export const getEnterpriseMemberDeliveryOutboxAdminV1 = onCall(
  { enforceAppCheck: true },
  async (r) => {
    await reviewer(r);
    const requestId = strictId(r.data?.requestId, "REQUEST"),
      { x } = await requestById(requestId),
      snap = await db
        .collection("enterprise_member_delivery_outbox")
        .where("requestId", "==", requestId)
        .limit(20)
        .get();
    return {
      schema: ADMIN_MEMBER_SCHEMA,
      providerConfigured: false,
      items: snap.docs
        .filter((d) => {
          const z = d.data();
          return (
            z.organizationId === x.organizationId &&
            z.propertyId === x.propertyId &&
            z.courseId === x.courseId
          );
        })
        .map((d) => minimumOutbox(d.data())),
    };
  },
);
export const resolveEnterpriseMemberCsvConflictsAdminV1 = onCall(
  { enforceAppCheck: true },
  async (r) => {
    const a = await reviewer(r),
      requestId = strictId(r.data?.requestId, "REQUEST"),
      command = strictId(r.data?.commandId, "COMMAND"),
      expected = strictVersion(r.data?.expectedVersion),
      previewId = strictId(r.data?.previewId, "PREVIEW"),
      rowDigest = String(r.data?.rowDigest || ""),
      policyVersion = strictId(r.data?.policyVersion, "POLICY_VERSION"),
      resolutions = normalizeCsvResolutions(r.data?.resolutions),
      { doc, x } = await requestById(requestId),
      previewRef = db
        .collection("enterprise_member_import_previews")
        .doc(previewId),
      cmdRef = db
        .collection("enterprise_member_admin_commands")
        .doc(adminCommandDocumentId(a.uid, command)),
      dg = digest({
        requestId,
        expected,
        previewId,
        rowDigest,
        policyVersion,
        resolutions,
        reviewerAuthorityVersion: a.authorityVersion,
      }),
      rid = adminReceiptId(requestId, command, "csv_resolved");
    let replayed = false;
    await db.runTransaction(async (tx) => {
      const selfBinding = db
          .collection("enterprise_authority_bindings")
          .doc(a.uid)
          .collection("memberships")
          .doc(String(x.representativeMembershipId)),
        [current, preview, prior, self] = await Promise.all([
          tx.get(doc.ref),
          tx.get(previewRef),
          tx.get(cmdRef),
          tx.get(selfBinding),
        ]);
      if (prior.exists) {
        if (prior.data()?.digest !== dg)
          throw new HttpsError("already-exists", "COMMAND_REPLAY_CONFLICT");
        replayed = true;
        return;
      }
      const d = current.data() || {},
        p = preview.data() || {};
      if (self.exists)
        throw new HttpsError("permission-denied", "SEPARATION_OF_DUTIES");
      if (
        d.version !== expected ||
        d.status !== "conflict_review" ||
        d.previewId !== previewId ||
        p.rowDigest !== rowDigest ||
        d.rowDigest !== rowDigest ||
        p.expiresAt?.toMillis?.() <= Date.now()
      )
        throw new HttpsError("aborted", "CSV_PREVIEW_STALE");
      if (
        p.organizationId !== d.organizationId ||
        p.propertyId !== d.propertyId ||
        p.courseId !== d.courseId
      )
        throw new HttpsError("permission-denied", "CSV_SCOPE_MISMATCH");
      const rows = new Map((p.rows || []).map((z: any) => [z.row, z])),
        priorResolved = Array.isArray(d.resolvedRows)
          ? d.resolvedRows.map(Number)
          : [],
        memberDocs = await Promise.all(
          resolutions.map((z) =>
            tx.get(
              doc.ref.parent
                .parent!.collection("members")
                .doc(
                  String(
                    z.existingMemberReference ||
                      (rows.get(z.row) as any)?.memberReference,
                  ),
                ),
            ),
          ),
        );
      resolutions.forEach((z, i) => {
        const row: any = rows.get(z.row),
          member = memberDocs[i];
        if (priorResolved.includes(z.row))
          throw new HttpsError("already-exists", "CSV_ROW_ALREADY_RESOLVED");
        if (!row)
          throw new HttpsError("invalid-argument", "CSV_ROW_UNAVAILABLE");
        if (
          z.decision === "mark_duplicate" &&
          (!member.exists ||
            member.data()?.organizationId !== d.organizationId ||
            member.data()?.propertyId !== d.propertyId ||
            member.data()?.courseId !== d.courseId)
        )
          throw new HttpsError(
            "failed-precondition",
            "DUPLICATE_MEMBER_UNAVAILABLE",
          );
        if (
          z.decision === "approve_delivery" &&
          (member.exists ||
            row.result !== "valid" ||
            !/^ref_[a-f0-9]{12,64}$/.test(String(row.contactReference || "")))
        )
          throw new HttpsError("aborted", "CSV_CONFLICT_CHANGED");
      });
      const resolvedRows = [
          ...priorResolved,
          ...resolutions.map((z) => z.row),
        ].sort((a, b) => a - b),
        remainingRows =
          Number(p.rowCount || p.rows?.length || 0) - resolvedRows.length,
        adminResolutionStatus =
          remainingRows === 0 ? "resolved" : "partially_resolved";
      tx.update(doc.ref, {
        status: "conflict_review",
        adminResolutionStatus,
        resolvedRows,
        remainingRows,
        version: expected + 1,
        updatedAt: stamp(),
      });
      tx.create(db.collection("enterprise_member_admin_receipts").doc(rid), {
        schema: "golfriend.enterprise-member-admin-receipt.v1",
        receiptId: rid,
        requestId,
        organizationId: d.organizationId,
        propertyId: d.propertyId,
        courseId: d.courseId,
        action: "csv_resolved",
        rowDigest,
        policyVersion,
        rowCounts: resolutions.reduce(
          (o: any, z: any) => ((o[z.decision] = (o[z.decision] || 0) + 1), o),
          {},
        ),
        csvContents: false,
        reviewerRef: a.reviewerRef,
        reviewerRole: a.role,
        immutable: true,
        occurredAt: stamp(),
      });
      for (const z of resolutions) {
        const row: any = rows.get(z.row);
        tx.create(
          db
            .collection("enterprise_member_admin_receipts")
            .doc(`${rid}_${z.row}`),
          {
            schema: "golfriend.enterprise-member-admin-row-receipt.v1",
            receiptId: `${rid}_${z.row}`,
            requestId,
            row: z.row,
            decision: z.decision,
            existingMemberReference: z.existingMemberReference,
            organizationId: d.organizationId,
            courseId: d.courseId,
            csvContents: false,
            reviewerRef: a.reviewerRef,
            immutable: true,
            occurredAt: stamp(),
          },
        );
        if (z.decision === "approve_delivery")
          tx.create(
            db
              .collection("enterprise_member_delivery_workflows")
              .doc(`emdw_${digest([rid, z.row]).slice(0, 32)}`),
            {
              schema: "golfriend.enterprise-member-delivery-workflow.v1",
              requestId,
              row: z.row,
              organizationId: d.organizationId,
              propertyId: d.propertyId,
              courseId: d.courseId,
              memberReference: row.memberReference,
              destinationReference: row.contactReference,
              destinationStoredAsOpaqueReference: true,
              locale: row.locale,
              status: "awaiting_template_approval",
              providerConfigured: false,
              accountCreated: false,
              invitationSent: false,
              consentState: "pending",
              reviewerRef: a.reviewerRef,
              immutable: true,
              createdAt: stamp(),
            },
          );
      }
      tx.create(cmdRef, {
        commandId: command,
        digest: dg,
        result: {
          requestId,
          status: "conflict_review",
          adminResolutionStatus,
          remainingRows,
          version: expected + 1,
          receiptId: rid,
        },
        immutable: true,
        createdAt: stamp(),
      });
    });
    return {
      schema: ADMIN_MEMBER_SCHEMA,
      requestId,
      status: "conflict_review",
      version: expected + 1,
      receiptId: rid,
      replayed,
      accountsCreated: 0,
      invitationsSent: 0,
      acceptedRowsCreateWorkflowOnly: true,
    };
  },
);
