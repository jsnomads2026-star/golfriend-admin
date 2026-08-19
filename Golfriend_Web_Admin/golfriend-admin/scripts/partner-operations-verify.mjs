import assert from "node:assert/strict";
import fs from "node:fs";
import {
  decisionPreview,
  filterPartnerRequests,
  onboardingChecklist,
  PARTNER_LOCALES,
  PARTNER_STATUSES,
  PARTNER_TYPES,
  partnerSummary,
  normalizePartnerRequest,
} from "../src/components/admin/v2/partnerOperationsModel.mjs";

assert.deepEqual(PARTNER_LOCALES, ["en", "th", "ko", "ja", "zh", "es", "fr", "de"]);
assert.equal(PARTNER_TYPES.length, 6);
assert.equal(PARTNER_STATUSES.length, 7);

const rows = [
  normalizePartnerRequest({
    id: "1",
    organization: "Alpha",
    type: "golf_course",
    contactLocale: "th",
    submittedAt: "2026-01-02",
    status: "new",
    evidence: { identity: true },
  }),
  normalizePartnerRequest({ id: "2", organization: "Beta", status: "source_unavailable" }),
];
assert.equal(partnerSummary(rows).total, 2);
assert.deepEqual(filterPartnerRequests(rows, { query: "alpha", type: "golf_course", status: "new", locale: "th" }).map((x) => x.id), ["1"]);
assert.equal(onboardingChecklist(rows[0]).filter((x) => x.complete).length, 1);
assert.equal(decisionPreview(rows[0], "approve", "en").submissionAvailable, false);
assert.throws(() => decisionPreview(rows[0], "send", "en"));

const ui = fs.readFileSync(
  new URL("../src/components/admin/v2/V2PartnerOperations.tsx", import.meta.url),
  "utf8",
);
const provider = fs.readFileSync(
  new URL("../src/components/admin/v2/partnerOperationsProvider.ts", import.meta.url),
  "utf8",
);
const app = fs.readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const css = fs.readFileSync(
  new URL("../src/components/admin/v2/V2PartnerOperations.css", import.meta.url),
  "utf8",
);

const [, uiBodyRaw] = ui.split(/const localeValues/);
const uiBody = uiBodyRaw ? `const localeValues${uiBodyRaw}` : ui;
const uiWithoutCopy = ui.replace(
  /const COPY = \{[\s\S]*?\}\s*;\n+\s*const localeValues/,
  "const localeValues",
);

assert.match(uiBody, /const t = localeValues/);
assert.match(uiBody, /aria-label=\{t\.labels\.search\}/);
assert.match(uiBody, /aria-label=\{t\.labels\.typeFilter\}/);
assert.match(uiBody, /aria-label=\{t\.labels\.statusFilter\}/);
assert.match(uiBody, /aria-label=\{t\.labels\.localeFilter\}/);
assert.match(uiBody, /aria-label=\{t\.labels\.sortFilter\}/);
assert.match(uiBody, /aria-label=\{t\.labels\.decision\}/);
assert.match(uiBody, /aria-label=\{t\.labels\.summaryLocale\}/);
assert.match(uiBody, /\{t\.labels\.empty\}/);
assert.match(uiBody, /t\.labels\.copyExport/);
assert.match(uiBody, /t\.labels\.copiedNotice/);
assert.match(uiBody, /t\.labels\.submitUnavailable/);
assert.match(uiBody, /\{t\.labels\.allTypes\}/);
assert.match(uiBody, /\{t\.labels\.allStatuses\}/);
assert.match(uiBody, /\{t\.labels\.allLocales\}/);
assert.match(uiBody, /\{t\.labels\.typeFilter\}/);

assert.doesNotMatch(
  uiWithoutCopy,
  /"Partner type filter"|'Partner type filter'|Search partner requests|Preview decision|Submit decision unavailable|Copy \/ export summary|None verified|"Close"|'Close'|No requests match this view|Partner requests and onboarding/,
);
assert.doesNotMatch(ui + provider, /firebase|firestore|addDoc|setDoc|updateDoc|deleteDoc|httpsCallable/i);
assert.doesNotMatch(ui + provider, /email sent|account created|partner accepted|notification sent/i);

assert.match(app, /activeArea === 'partners' && <V2PartnerOperations/);
assert.match(provider, /decisionService:null/);
assert.match(provider, /source:'local-preview'/);
assert.match(css, /@media\(max-width:700px\)/);
console.log(
  "Partner operations verification PASS: eight locales, localized control labels, copy/read states, empty/permissions-safe behavior, and no writes.",
);
