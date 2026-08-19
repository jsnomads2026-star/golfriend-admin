import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const r = (p) =>
  readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const runtime = r("functions/src/partnerAvailabilityRuntime.ts");
const domain = r("functions/src/partnerAvailabilityDomain.ts");
const ui = r("src/components/B2B/CourseAvailabilityV2.tsx");
const index = r("functions/src/index.ts");
const small = r("src/components/B2B/SmallBusinessDashboard.tsx");
const enterprise = r("src/components/B2B/EnterpriseDashboard.tsx");
const app = r("src/App.tsx");

let n = 0;
const t = (name, check) => {
  check();
  console.log(`ok ${++n} - ${name}`);
};

t("four App Check callables", () =>
  assert.equal((runtime.match(/enforceAppCheck:true/g) || []).length, 4),
);
t("delegated membership", () => assert.match(runtime, /membership\(caller\)/));
t("claimed course scope", () => assert.match(runtime, /course_operators/));
t("pending Admin review", () => assert.match(runtime, /pending_admin/));
t("versions", () => assert.match(runtime, /nextSlotVersion/));
t("idempotent retry", () => assert.match(runtime, /restarted:true/));
t("duplicate denied", () => assert.match(runtime, /Duplicate course\/date\/time slot/));
t("timezone validation", () => assert.match(domain, /timeZone/));
t("immutable audits", () => assert.match(runtime, /availability_audits/));
t("no financial fields", () => assert.match(runtime, /financialFields:false/));
t("provider neutral", () => assert.match(runtime, /providerNeutral:true/));
t("no direct publish", () => assert.match(runtime, /publishToApp:false/));
t("legacy export reconciled", () => assert.match(index, /manageCourseAvailabilityV2 as manageTeeTimeSlot/));
t("Portal small mounted", () => assert.match(small, /CourseAvailabilityV2/));
t("Portal enterprise mounted", () => assert.match(enterprise, /CourseAvailabilityV2/));
t("Admin mounted", () => assert.match(app, /CourseAvailabilityV2 admin/));
t("exact 8 locale entries", () =>
  ["en", "th", "ko", "ja", "zh", "es", "fr", "de"].forEach((x) =>
    assert.match(ui, new RegExp(`${x}:`)),
  ),
);
t("component-local locale selector", () => assert.match(ui, /pickLocale\(admin\)/));
t("copy table is used", () => assert.match(ui, /copy\.labels\.courseId/));
t("loading state is localized", () => assert.match(ui, /copy\.loading/));
t("empty state is localized", () => assert.match(ui, /copy\.empty/));
t("error/retry state is localized", () =>
  assert.match(ui, /copy\.error/),
);
t("error exposes retry action", () => assert.match(ui, /{copy\.retry}/));
t("action labels use localization", () =>
  assert.match(ui, /{copy\.create}|{copy\.approve}|{copy\.close}|{copy\.reopen}/),
);
t("status label uses localization", () => assert.match(ui, /copy\.status/));
t("availability controls labels use localization", () =>
  assert.match(ui, /copy\.labels\.(courseId|date|localTime|timeZone|capacity)/),
);
t("from/to labeling is localized", () =>
  assert.match(ui, /copy\.from|copy\.to/),
);
t("accessible states are present", () => {
  assert.match(ui, /role="status"/);
  assert.match(ui, /role="alert"/);
});

console.log(`partner availability verifier: ${n} checks passed.`);
