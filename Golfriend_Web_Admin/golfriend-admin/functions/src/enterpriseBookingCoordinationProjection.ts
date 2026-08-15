import {createHash} from "node:crypto";
import type {PartnerBookingScope} from "./partnerBookingScope.js";

type Json = Record<string, any>;
export const ENTERPRISE_BOOKING_COORDINATION_PROJECTION = "golfriend.enterprise-booking-coordination-portal.v2" as const;
export const ENTERPRISE_BOOKING_COORDINATION_STATUSES = ["course_reviewing", "course_confirmed", "alternative_proposed", "cancellation_requested", "cancellation_accepted", "cancellation_declined", "cancelled", "expired", "ambiguous_locked"] as const;
const ID = /^[A-Za-z0-9_-]{8,200}$/;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const text = (value: unknown, max: number) => typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max) : "";
const iso = (value: any) => {const candidate = value?.toDate?.() || value, date = candidate instanceof Date ? candidate : new Date(candidate); return Number.isFinite(date.getTime()) ? date.toISOString() : null;};
const validStatus = (value: unknown) => ENTERPRISE_BOOKING_COORDINATION_STATUSES.includes(value as any);

export function buildEnterpriseBookingCoordinationItem(input: Readonly<{booking: Json; correlation: Json; outbox: readonly Json[]; receipts: readonly Json[]}>) {
  const {booking: b, correlation: c} = input;
  if (b.schema !== "golfriend.enterprise-correlated-booking.v2" || c.schema !== "golfriend.enterprise-booking-correlation.v1" || b.bookingId !== c.bookingId || b.correlationId !== c.correlationId || b.courseId !== c.course?.courseId || b.version !== c.version || b.status !== c.status || !ID.test(String(b.bookingId)) || !ID.test(String(b.courseId)) || !validStatus(b.status) || !Number.isSafeInteger(b.version) || b.version < 1) throw new Error("COORDINATION_SOURCE_INVALID");
  const request = c.request || {}, window = request.timeWindow || {}, preferences = request.preferences || {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(request.date)) || !/^\d{2}:\d{2}$/.test(String(window.start)) || !/^\d{2}:\d{2}$/.test(String(window.end)) || !ID.test(String(c.golferRef)) || !Number.isSafeInteger(request.partySize) || request.partySize < 1 || request.partySize > 8 || !Array.isArray(preferences.allowedChannels) || preferences.allowedChannels.some((value: unknown) => !["course_phone", "course_email", "provider_redirect"].includes(String(value)))) throw new Error("COORDINATION_SOURCE_INVALID");
  const locked = Object.entries(b.operationLocks || {}).find(([, value]: any) => ["ambiguous", "ambiguous_locked"].includes(String(value?.state))), status = locked ? "ambiguous_locked" : b.status;
  const history = input.outbox.map(event => ({eventId: text(event.eventId, 200), status: text(event.state, 40), version: Number(event.enterpriseBooking?.version), at: iso(event.occurredAt)})).filter(event => ID.test(event.eventId) && validStatus(event.status) && Number.isSafeInteger(event.version) && event.version > 0 && event.at).sort((a, d) => a.version - d.version).slice(-30);
  const receipts = input.receipts.map(receipt => text(receipt.receiptId, 200)).filter(value => ID.test(value)).slice(0, 30);
  const alternative = c.alternativeSlot && typeof c.alternativeSlot === "object" ? {slotId: text(c.alternativeSlot.slotId, 200), date: text(c.alternativeSlot.date, 10), time: text(c.alternativeSlot.time, 5), timeZone: text(c.alternativeSlot.timeZone, 80), slotVersion: Number(c.alternativeSlot.slotVersion)} : null;
  const item = {bookingId: String(b.bookingId), correlationId: String(b.correlationId), courseId: String(b.courseId), propertyId: String(b.propertyId), version: Number(b.version), status, golferRef: String(c.golferRef), authorizedCourseRecipientRef: `ecr_${hash(`${b.correlationId}|${b.courseId}`).slice(0, 40)}`, request: {date: String(request.date), timeWindow: {start: String(window.start), end: String(window.end), timeZone: String(window.timeZone)}, partySize: Number(request.partySize), preferences: {locale: text(preferences.locale, 2), allowedChannels: [...new Set(preferences.allowedChannels.map((value: unknown) => text(value, 40)))], shareContact: preferences.shareContact === true}}, alternative, history, receipts, operation: locked ? {action: text(locked[0], 40), state: "ambiguous_locked", operationId: text((locked[1] as Json)?.operationId, 200)} : null, sourceVersions: {booking: Number(b.version), course: Number(b.courseVersion), golfer: Number(b.f7SourceVersion)}};
  return Object.freeze(item);
}

export function buildEnterpriseBookingCoordinationProjection(scope: PartnerBookingScope, items: readonly ReturnType<typeof buildEnterpriseBookingCoordinationItem>[], nowMs = Date.now()) {
  if (!scope || scope.projectionVersion !== "golfriend.enterprise-booking-scope.v1" || scope.freshness !== "fresh" || Date.parse(scope.expiresAt) <= nowMs || items.some(item => !scope.courseIds.includes(item.courseId) || !scope.propertyIds.includes(item.propertyId))) throw new Error("COORDINATION_SCOPE_INVALID");
  const permissions = {confirm: ["organization_owner", "organization_admin", "course_manager", "booking_staff"].includes(scope.role), alternative: ["organization_owner", "organization_admin", "course_manager", "booking_staff"].includes(scope.role), respondCancellation: ["organization_owner", "organization_admin", "course_manager", "booking_staff"].includes(scope.role), readOnly: scope.role === "analyst_viewer"};
  return Object.freeze({schema: ENTERPRISE_BOOKING_COORDINATION_PROJECTION, projectionVersion: ENTERPRISE_BOOKING_COORDINATION_PROJECTION, membershipId: scope.membershipId, role: scope.role, organizationId: scope.organizationId, propertyIds: scope.propertyIds, courseIds: scope.courseIds, delegatedCourseIds: scope.delegatedCourseIds, sourceVersion: scope.sourceVersion, generatedAt: new Date(nowMs).toISOString(), expiresAt: scope.expiresAt, freshness: "fresh", permissions, bookings: Object.freeze([...items]), boundary: "COURSE_SCOPED_COORDINATION_NO_CONTACT_PROVIDER_OR_FINANCIAL_AUTHORITY"});
}
