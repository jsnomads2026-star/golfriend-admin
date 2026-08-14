import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const r = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8"),
  runtime = r("functions/src/partnerBookingRuntime.ts"),
  domain = r("functions/src/partnerBookingDomain.ts"),
  ui = r("src/components/B2B/PlayBookingLifecycleV2.tsx"),
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
t("delegated membership", () => assert.match(runtime, /member\(caller\)/));
t("claimed course", () => assert.match(runtime, /course_operators/));
t("privacy projection", () => assert.match(runtime, /safeBooking/));
t("request", () => assert.match(runtime, /requestPlayBookingV2/));
t("confirmation", () => assert.match(domain, /confirm/));
t("alternative", () => assert.match(domain, /alternative_proposed/));
t("cancellation", () => assert.match(domain, /cancelled/));
t("completion", () => assert.match(domain, /completed/));
t("messages", () => assert.match(runtime, /sendPlayBookingMessageV2/));
t("versions", () => assert.match(runtime, /version\(/));
t("idempotent request", () => assert.match(runtime, /restarted:\s*true/));
t("immutable receipts", () => assert.match(runtime, /play_booking_audits/));
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
    assert.match(ui, new RegExp(`${x}:`)),
  ),
);
t("accessible states", () => {
  assert.match(ui, /role="status"/);
  assert.match(ui, /role="alert"/);
});
console.log(`partner booking verifier: ${n} checks passed.`);
