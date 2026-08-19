import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const journey = read("src/components/B2B/PartnerApplicationJourney.tsx");
const copy = read("src/i18n/partner/applicantJourney.ts");
let checks = 0;

const check = (name, fn) => {
  fn();
  checks += 1;
  console.log(`ok ${checks} - ${name}`);
};

check(
  "journey remains locale-driven for all visible states and actions",
  () => {
    for (const marker of [
      "copy.loading",
      "copy.loadError",
      "copy.retry",
      "copy.signOut",
      "copy.save",
      "copy.busy",
      "copy.none",
      "copy.organizationHeading",
      "copy.documentsHeading",
      "copy.agreementHeading",
      "copy.reviewHeading",
      "copy.statusHeading",
      "copy.submitButton",
      "copy.sendMessage",
      "copy.messageLabel",
    ]) {
      assert.ok(journey.includes(marker), `missing ${marker}`);
    }
  },
);

check(
  "journey table headers are sourced from applicant copy",
  () => {
    for (const header of ["copy.documentKind", "copy.statusAwaiting", "copy.reviewerNote"]) {
      assert.ok(journey.includes(header), `missing ${header}`);
    }
  },
);

check(
  "journey has no hard-coded English loading/error/retry/action phrases",
  () => {
    for (const phrase of [
      "Loading your application",
      "Try again",
      "Sign out",
      "Save",
      "Working…",
      "Retry",
      "Submit for review",
      "Review and submit",
      "Send",
    ]) {
      assert.ok(!journey.includes(phrase), `unexpected hard-coded phrase found: ${phrase}`);
    }
  },
);

check(
  "applicant journey copy module includes all canonical locales",
  () => {
    for (const locale of ["en", "th", "ko", "ja", "zh", "es", "fr", "de"]) {
      assert.match(copy, new RegExp(`const ${locale}: ApplicantJourneyCopy`), `missing copy locale block: ${locale}`);
    }
    assert.match(copy, /Record<CanonicalLocale, ApplicantJourneyCopy>/, "copy catalog should define exhaustive locale record");
    assert.ok(copy.includes("APPLICANT_JOURNEY_LOCALES"), "journey locale constant missing");
  },
);

check(
  "journey imports and uses applicant copy module",
  () => {
    assert.ok(journey.includes("applicantJourneyCopy(locale)"), "journey copy selector missing");
    assert.ok(journey.includes("APPLICANT_JOURNEY_LOCALES"), "journey locale constant missing");
    assert.ok(journey.includes("documentStatusLabel(copy"), "document status should be localized");
    assert.ok(journey.includes("evidenceKindLabel(copy"), "document kind should be localized");
  },
);

check(
  "document status mapping uses localized copy",
  () => {
    assert.match(copy, /statusAwaiting|statusVerified|statusRejected|statusAlternative/, "status copy keys missing");
    assert.ok(journey.includes("documentStatusLabel(copy"), "status rendering not localized");
  },
);

console.log(`partner application journey locale verification passed (${checks}/${checks}).`);
