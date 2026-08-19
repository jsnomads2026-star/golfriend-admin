import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const file = "src/components/B2B/PartnerAuthorityConsole.tsx";
const src = fs.readFileSync(path.join(root, file), "utf8");

const requiredLocales = ["en", "th", "ko", "ja", "zh", "es", "fr", "de"];
const requiredKeys = [
  "organization:",
  "status:",
  "yourRole:",
  "version:",
  "claims:",
  "approvedMaterials:",
  "retry:",
  "actionApprove:",
  "actionReject:",
  "claimStatusLabel:",
];
const requiredText = [
  "copy.retry",
  "aria-label={copy.retryLabel}",
  "Organization",
  "Status",
  "Your role",
  "Approved materials",
  "roleLabel",
  "tierLabel",
];

const failures = [];

for (const locale of requiredLocales) {
  const bucket = new RegExp(`\\b${locale}\\s*:\\s*(\\{|EN)`, "m");
  if (!bucket.test(src)) {
    failures.push(`Missing locale bucket: ${locale}`);
  }
}

for (const key of requiredKeys) {
  if (!src.includes(key)) failures.push(`Missing copy key: ${key}`);
}

for (const text of requiredText) {
  if (!src.includes(text)) failures.push(`Missing visible copy/accessibility marker: ${text}`);
}

if (!/copy.error/.test(src)) failures.push("Missing localized error copy usage");
if (!/type=\"submit\"[^>]*aria-label/.test(src)) failures.push("Missing aria-label on submit button");
if (!/role=\"alert\"/.test(src)) failures.push("Missing alert role for error state");
if (!/Retry/.test(src)) failures.push("Missing retry label text");
if (!/actionApprove/.test(src) || !/actionReject/.test(src)) failures.push("Missing approve/reject action labels");

if (failures.length) {
  console.error(`PartnerAuthorityConsole verifier FAILED (${failures.length})`);
  failures.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

console.log("PartnerAuthorityConsole verifier PASS: 8-locale coverage and localized labels, actions, error semantics.");
