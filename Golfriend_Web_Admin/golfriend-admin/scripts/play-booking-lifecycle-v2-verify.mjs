import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PLAY_BOOKING_DESK } from "../src/i18n/partner/playBookingDesk.ts";

const ui = readFileSync(new URL("../src/components/B2B/PlayBookingLifecycleV2.tsx", import.meta.url), "utf8");
const locales = ["en", "th", "ko", "ja", "zh", "es", "fr", "de"];
const hardCodedEnglish = [
  "Loading booking requests…",
  "No booking requests are available.",
  "Reload bookings",
  "Try again",
  "Preview confirmation",
  "Review the exact booking",
  "Message the member",
  "Recovery and retry",
];

const usedKeys = [...new Set([...ui.matchAll(/t\('([^']+)'\)/g)].map((m) => m[1]))];
const outcomeKeys = [
  "recoveryOutcomeFailedNoEffect",
  "recoveryOutcomeReleasedWithoutExecution",
  "recoveryOutcomeCompletedVerifiedReceipt",
  "recoveryOutcomeExternalReview",
];

let checks = 0;
const check = (name, fn) => {
  fn();
  checks += 1;
  console.log(`ok ${checks} - ${name}`);
};

check("SP-06 lifecycle copy usage remains locale-driven", () => {
  assert.ok(usedKeys.length >= 30, `too few localized keys used in lifecycle UI: ${usedKeys.length}`);
assert.ok(/draftTypeLabel\(t, x\)/.test(ui));
assert.ok(/outcomeLabel\(t, x\)/.test(ui));
assert.ok(/aria-label=\{t\('messageTitle'\)\}/.test(ui));
assert.ok(/aria-label=\{t\('dialogCloseLabel'\)\}/.test(ui));
});

check("SP-06 locale catalog includes eight locales and required recovery outcomes", () => {
  assert.deepEqual(Object.keys(PLAY_BOOKING_DESK), locales);
  for (const key of [...outcomeKeys, ...usedKeys]) {
    for (const locale of locales) {
      assert.equal(typeof PLAY_BOOKING_DESK[locale][key], "string", `${locale}.${key} missing`);
      assert.ok(PLAY_BOOKING_DESK[locale][key].trim().length > 0, `${locale}.${key} is blank`);
    }
  }
});

check("SP-06 has no hard-coded fallback English in verified copy surfaces", () => {
  for (const phrase of hardCodedEnglish) {
    assert.ok(!ui.includes(phrase), `unexpected hard-coded phrase: ${phrase}`);
  }
});

console.log(`play booking lifecycle verifier passed (${checks}/${checks}).`);
