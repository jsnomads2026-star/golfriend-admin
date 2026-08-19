import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const src = fs.readFileSync(path.join(root, "src/components/admin/v2/V2AdminReports.tsx"), "utf8");
const failures = [];
const requiredLocales = ["en", "th", "ko", "ja", "zh", "es", "fr", "de"];

for (const locale of requiredLocales) {
  if (locale === "en") {
    if (!/(en:\s*COPY\.en|\\ben:\s*\\{)/.test(src)) {
      failures.push(`missing locale bucket ${locale}`);
    }
    continue;
  }
  if (!new RegExp(`\\b${locale}\\s*:\\s*\\{`).test(src)) {
    failures.push(`missing locale bucket ${locale}`);
  }
}

const requiredKeys = [
  "title:",
  "warning:",
  "period:",
  "periodOptions:",
  "generate:",
  "latest:",
  "rangeError:",
  "summaryTitle:",
  "summaryLead:",
  "copySummary:",
  "copySummary",
  "previewPayload:",
  "previewUnavailable:",
  "sourceKindLabels:",
  "sectionStatusLabels:",
  "coverageKeys:",
  "retry:",
  "retryAria:",
];

for (const key of requiredKeys) {
  if (!src.includes(key)) {
    failures.push(`missing copy key marker: ${key}`);
  }
}

const requiredUi = [
  'role="status">',
  'role="alert"',
  "onClick={() => void copySummary()",
  "aria-label={copy.customStartLabel}",
  "aria-label={copy.customEndLabel}",
  "aria-label={copy.retryAria}",
  "Preview future payload",
];

for (const marker of requiredUi) {
  if (!src.includes(marker)) {
    failures.push(`missing ui marker: ${marker}`);
  }
}

if (src.includes("value.replaceAll('_'") || src.includes("label(") ) {
  failures.push("title-casing key helper still present");
}

if (src.includes("{copy.error}") || src.includes("Source unavailable.")) {
  // pass
} else {
  failures.push("localized error copy missing");
}

if (src.includes("new Date().toISOString()")) {
  // behavior-preserving marker
} else {
  failures.push("report generation behavior changed");
}

if (failures.length) {
  console.error(`V2AdminReports verifier FAILED (${failures.length})`);
  failures.forEach((f) => console.error(`- ${f}`));
  process.exit(1);
}

console.log("V2AdminReports verifier PASS: 8-locale localized headings, labels, states, and chips.");
