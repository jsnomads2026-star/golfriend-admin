import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const r = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8"),
  runtime = r("functions/src/partnerBookingRuntime.ts"),
  domain = r("functions/src/partnerBookingDomain.ts"),
  replay = r("functions/src/partnerBookingReplay.ts"),
  ui = r("src/components/B2B/PlayBookingLifecycleV2.tsx"),
  locale = r("src/i18n/partner/playBookingDesk.ts"),
  index = r("functions/src/index.ts"),
  small = r("src/components/B2B/SmallBusinessDashboard.tsx"),
  enterprise = r("src/components/B2B/EnterpriseDashboard.tsx"),
  app = r("src/App.tsx");
let n = 0;
const t = (x, f) => {
  f();
  console.log(`ok ${++n} - ${x}`);
};
t("five App Check callables", () =>
  assert.equal((runtime.match(/enforceAppCheck: true/g) || []).length, 5),
);
t("derived delegated scope", () => assert.match(runtime, /bookingScope\(caller\)/));
t("claimed course", () => assert.match(runtime, /course_operators/));
t("privacy projection", () => assert.match(runtime, /safeBooking/));
t("request", () => assert.match(runtime, /requestPlayBookingV2/));
t("confirmation", () => assert.match(domain, /confirm/));
t("alternative", () => assert.match(domain, /alternative_proposed/));
t("cancellation", () => assert.match(domain, /cancelled/));
t("completion", () => assert.match(domain, /completed/));
t("messages", () => assert.match(runtime, /sendPlayBookingMessageV2/));
t("versions", () => assert.match(runtime, /version\(/));
t("idempotent request", () => {
  assert.match(runtime, /play_booking_request_operations/);
  assert.match(runtime, /BOOKING_REQUEST_COMMAND_REUSE_CONFLICT/);
});
t("immutable operation receipts", () => {
  assert.match(runtime, /replayCompletedBookingOperation/);
  assert.match(runtime, /tx\.create\(receiptRef/);
  assert.match(replay, /immutable:\s*true/);
});
t("strict command allowlist", () =>
  assert.match(replay, /COMMAND_FIELDS_INVALID/),
);
t("destructive confirmation", () =>
  assert.match(replay, /CONFIRMATION_REQUIRED/),
);
t("same-command replay binding", () => {
  assert.match(replay, /COMMAND_REUSE_CONFLICT/);
  assert.match(replay, /actorUid.*bookingId.*action.*commandId/s);
});
t("ambiguous operation fails closed", () => {
  assert.match(replay, /OPERATION_PENDING/);
  assert.match(replay, /OPERATION_AMBIGUOUS/);
});
t("pending expiry and booking action lock", () => {
  assert.match(runtime, /expirePendingBookingOperation/);
  assert.match(runtime, /operationLocks\.\$\{action\}/);
  assert.match(runtime, /OPERATION_AMBIGUOUS/);
});
t("request exact immutable replay", () => {
  assert.match(runtime, /play_booking_request_operations/);
  assert.match(runtime, /prior\?\.receiptId !== bookingReceiptId/);
  assert.match(runtime, /BOOKING_REQUEST_COMMAND_REUSE_CONFLICT/);
});
t("message actor payload replay", () => {
  assert.match(runtime, /bookingMessageDigest/);
  assert.match(runtime, /play_booking_message_operations/);
  assert.match(runtime, /BOOKING_MESSAGE_COMMAND_REUSE_CONFLICT/);
  assert.ok(runtime.indexOf("if (priorOperation.exists)", runtime.indexOf("sendPlayBookingMessageV2")) < runtime.indexOf("lastMessageAt: now()", runtime.indexOf("sendPlayBookingMessageV2")));
});
t("cancel slot binding", () =>
  assert.match(runtime, /BOOKING_SLOT_BINDING_INVALID/),
);
t("alternative slot authority binding", () => {
  assert.match(runtime, /ALTERNATIVE_SLOT_UNAVAILABLE/);
  assert.match(runtime, /alternativeSlot\.data\(\)\?\.organizationId/);
  assert.match(runtime, /alternativeSlot\.data\(\)\?\.courseId/);
});
t("notification unavailable", () =>
  assert.match(runtime, /PROVIDER_UNCONFIGURED/),
);
t("financial fields denied", () => assert.match(runtime, /assertNonFinancial/));
t("legacy exports reconciled", () => {
  assert.match(index, /managePlayBookingV2 as respondBooking/);
  assert.match(index, /sendPlayBookingMessageV2 as sendBookingMessage/);
});
t("Portal small", () => assert.match(small, /PlayBookingLifecycleV2/));
t("Portal enterprise", () =>
  assert.match(enterprise, /PlayBookingLifecycleV2/),
);
t("Admin mounted", () => assert.match(app, /PlayBookingLifecycleV2 admin/));
t("eight locales", () =>
  ["en", "th", "ko", "ja", "zh", "es", "fr", "de"].forEach((x) =>
    assert.match(locale, new RegExp(`\\b${x}:`)),
  ),
);
t("accessible states", () => {
  assert.match(ui, /role="status"/);
  assert.match(ui, /role="alert"/);
});
console.log(`partner booking verifier: ${n} checks passed.`);
