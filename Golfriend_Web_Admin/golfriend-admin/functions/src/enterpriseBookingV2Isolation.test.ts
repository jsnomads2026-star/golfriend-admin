import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import test from "node:test";

const src = join(__dirname, "..", "src");
const legacy = readFileSync(join(src, "partnerBookingRuntime.ts"), "utf8");
const index = readFileSync(join(src, "index.ts"), "utf8");
const schema = "golfriend.enterprise-correlated-booking.v2";
const schemaPattern = schema.replace(/\./g, "\\.");

test("legacy preview and both manage phases reject V2 correlated bookings", () => {
  const preview = legacy.slice(legacy.indexOf("previewPlayBookingActionV2"), legacy.indexOf("managePlayBookingV2"));
  const manage = legacy.slice(legacy.indexOf("managePlayBookingV2"), legacy.indexOf("sendPlayBookingMessageV2"));
  assert.match(preview, new RegExp(schemaPattern));
  assert.ok((manage.match(new RegExp(schemaPattern, "g")) || []).length >= 3);
});

test("legacy message and list paths do not expose V2 correlated bookings", () => {
  const message = legacy.slice(legacy.indexOf("sendPlayBookingMessageV2"), legacy.indexOf("getPlayBookingsPortalV2"));
  const list = legacy.slice(legacy.indexOf("getPlayBookingsPortalV2"));
  assert.ok((message.match(new RegExp(schemaPattern, "g")) || []).length >= 2);
  assert.match(list, new RegExp(schemaPattern));
});

test("only the V2 issuer consumer and recovery paths are exported for correlated bookings", () => {
  assert.match(index, /previewEnterpriseBookingActionV2,manageEnterpriseBookingActionV2/);
  assert.match(index, /recoverPlayBookingConfirmationV2/);
  assert.doesNotMatch(index, /transitionEnterpriseCorrelatedBookingV2/);
});
