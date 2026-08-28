'use strict';

// One V2 Admin authority contract, shared by the Admin shell and catalogue callables.
// It is deliberately pure: Firestore ownership remains with each server boundary.
const ACTIVE_ADMIN_STATUSES = Object.freeze(['active']);
const CANONICAL_ADMIN_ROLES = Object.freeze(['Director', 'Manager', 'Support']);
const KNOWN_INACTIVE_ADMIN_STATUSES = Object.freeze([
  'suspended', 'inactive', 'deactivated', 'revoked', 'expired',
  'disabled', 'deleted', 'removed', 'terminated', 'pending', 'unknown',
]);

function normalizeStaffStatus(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.normalize('NFC').trim().toLowerCase();
  return normalized || null;
}

function isCanonicalAdminRole(value) {
  return typeof value === 'string' && CANONICAL_ADMIN_ROLES.includes(value);
}

function isActiveV2Admin(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const status = normalizeStaffStatus(value.status);
  return status !== null && ACTIVE_ADMIN_STATUSES.includes(status) && isCanonicalAdminRole(value.role);
}

function isActiveV2Director(value) {
  return isActiveV2Admin(value) && value.role === 'Director';
}

module.exports = Object.freeze({
  ACTIVE_ADMIN_STATUSES,
  CANONICAL_ADMIN_ROLES,
  KNOWN_INACTIVE_ADMIN_STATUSES,
  normalizeStaffStatus,
  isCanonicalAdminRole,
  isActiveV2Admin,
  isActiveV2Director,
});
