import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("onboarding and invitation clients use the region-bound portal callable client", async () => {
  const [application, invitation] = await Promise.all([
    read("src/components/B2B/partnerApplicationService.ts"),
    read("src/components/B2B/PartnerInvitationAcceptance.tsx"),
  ]);
  for (const source of [application, invitation]) assert.match(source, /from ["']\.\.\/\.\.\/firebaseConfig["']/);
  assert.match(application, /savePartnerApplicationDraftV2/);
  assert.match(application, /submitPartnerApplicationV2/);
  assert.match(invitation, /acceptPartnerInvitation/);
  assert.doesNotMatch(invitation, /getFunctions\(\)/);
});
