export const FROZEN_CALLABLE_ALIASES = Object.freeze({
  manageTeeTimeSlot: Object.freeze({ source: "manageCourseAvailabilityV2", module: "./partnerAvailabilityRuntime.js", authority: ["uid(r)", "membership(caller)", "course_operators"], primaryCollection: "tee_time_slots", auditCollection: "availability_audits" }),
  respondBooking: Object.freeze({ source: "managePlayBookingV2", module: "./partnerBookingRuntime.js", authority: ["uid(r)", "exactBookingAuthority(caller,scope", "permissions(scope.role)"], primaryCollection: "bookings", auditCollection: "play_booking_audits" }),
  cancelBooking: Object.freeze({ source: "managePlayBookingV2", module: "./partnerBookingRuntime.js", authority: ["uid(r)", "exactBookingAuthority(caller,scope", "permissions(scope.role)"], primaryCollection: "bookings", auditCollection: "play_booking_audits" }),
  sendBookingMessage: Object.freeze({ source: "sendPlayBookingMessageV2", module: "./partnerBookingRuntime.js", authority: ["uid(r)", "exactBookingAuthority(caller,scope", "permissions(scope.role).message"], primaryCollection: "bookings", auditCollection: "play_booking_audits" }),
});

const escaped = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const callableBody = (source, name) => {
  const start = source.indexOf(`export const ${name}`);
  if (start < 0) return "";
  const next = source.indexOf("export const ", start + 13);
  return source.slice(start, next < 0 ? source.length : next);
};

export function validateFrozenAliases({ indexSource, moduleSources, rulesSource, authorityGateSource, deadExports = [] }) {
  const failures = [];
  const aliases = Object.entries(FROZEN_CALLABLE_ALIASES);
  for (const [alias, contract] of aliases) {
    const exact = new RegExp(`\\b${escaped(contract.source)}\\s+as\\s+${escaped(alias)}\\b`, "g");
    const matches = indexSource.match(exact) || [];
    if (matches.length !== 1) failures.push(`${alias}: exact alias must occur once`);
    const exportBlock = indexSource.match(new RegExp(`export\\s*\\{[^}]*\\b${escaped(contract.source)}\\s+as\\s+${escaped(alias)}\\b[^}]*\\}\\s*from\\s*["']${escaped(contract.module)}["']`));
    if (!exportBlock) failures.push(`${alias}: source/module mismatch`);
    if (deadExports.includes(contract.source) || deadExports.includes(alias)) failures.push(`${alias}: dead or quarantined export`);
    const runtime = moduleSources[contract.module] || "";
    const body = callableBody(runtime, contract.source);
    if (!body) failures.push(`${alias}: callable implementation missing`);
    if (!/onCall\s*\(\s*\{\s*enforceAppCheck\s*:\s*true\s*\}/.test(body)) failures.push(`${alias}: App Check missing`);
    for (const token of contract.authority) if (!body.includes(token)) failures.push(`${alias}: authority token missing: ${token}`);
    if (!authorityGateSource.includes(`'${contract.primaryCollection}'`)) failures.push(`${alias}: primary collection absent from client-write authority gate`);
    if (!rulesSource.includes(`match /${contract.auditCollection}/`) || !rulesSource.includes("allow read, write: if false")) failures.push(`${alias}: immutable audit deny rule missing`);
    if (/QUARANTINED|throw new HttpsError\(["']unavailable["']/.test(body)) failures.push(`${alias}: resolves to dead callable`);
  }
  const declaredAliasNames = [...indexSource.matchAll(/\bas\s+([A-Za-z_$][\w$]*)/g)].map((match) => match[1]);
  for (const alias of declaredAliasNames) {
    if (alias in FROZEN_CALLABLE_ALIASES) continue;
    if (["respondBooking", "cancelBooking", "sendBookingMessage", "manageTeeTimeSlot"].includes(alias)) failures.push(`${alias}: unapproved duplicate alias`);
  }
  return failures;
}
