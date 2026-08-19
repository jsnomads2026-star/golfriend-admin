import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const ui = read("src/components/B2B/PartnerInvitationAcceptance.tsx");

let checks = 0;
const test = (name, fn) => {
  fn();
  console.log(`ok ${++checks} - ${name}`);
};

const locales = ["en", "th", "ko", "ja", "zh", "es", "fr", "de"];
const keys = [
  "title",
  "lead",
  "accept",
  "accepting",
  "retry",
  "success",
  "error",
  "retryHint",
  "stateIdle",
  "stateBusy",
  "stateDone",
  "sectionLabel",
  "acceptAria",
  "retryAria",
];

const localeBlock = (locale) => {
  const start = ui.indexOf(`  ${locale}: {`);
  if (start < 0) return "";
  const bodyStart = ui.indexOf("{", start);
  const afterStart = ui.slice(bodyStart + 1);
  const rest = locales
    .filter((item) => item !== locale)
    .map((item) => afterStart.indexOf(`  ${item}:`))
    .filter((idx) => idx >= 0)
    .concat(afterStart.indexOf("} satisfies"));
  const next = Math.min(...rest);
  return afterStart.slice(0, next);
};

test("component-local copy has all canonical locale records", () => {
  locales.forEach((locale) => {
    assert.match(ui, new RegExp(`\\n\\s*${locale}: \\{`));
  });
});

test("all locales define complete visible/action keys", () => {
  locales.forEach((locale) => {
    const block = localeBlock(locale);
    assert.ok(block, `${locale} block missing`);
    keys.forEach((key) => {
      assert.match(block, new RegExp(`\\n\\s*${key}:`), `${locale} missing key ${key}`);
    });
  });
});

test("accept/retry copy is wired through copy records", () => {
  assert.match(ui, /aria-label=\{copy\.acceptAria\}/);
  assert.match(ui, /aria-label=\{copy\.retryAria\}/);
  assert.match(ui, /stateCopy\(copy, state\)/);
  assert.match(ui, /role=\{state === "busy" \? "status" : "note"\}/);
  assert.match(ui, /role="alert"/);
});

console.log(`partner invitation acceptance verifier: ${checks} checks passed.`);
