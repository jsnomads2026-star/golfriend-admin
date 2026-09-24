import assert from "node:assert/strict";
import {transition} from "./partnerBookingDomain.js";
assert.equal(transition("pending", "decline"), "declined");
