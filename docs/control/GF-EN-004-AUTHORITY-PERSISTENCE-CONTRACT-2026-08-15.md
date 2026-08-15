# GF-EN-004 authoritative persistence contract

Schema: `golfriend.enterprise-organization-authority.v1` (`schemaVersion: 1`). This Functions-owned namespace is the only authority source for GF-EN-004/005/006. Legacy `partner_identity_bindings` and `partner_memberships` are excluded.

## Collections

- `enterprise_authority_bindings/{uid}/memberships/{bindingId}`: immutable UID lookup containing only `membershipId`, effective/expiry/revocation metadata and version. One UID may bind multiple memberships and organizations.
- `enterprise_authority_memberships/{membershipId}`: immutable ID, `bindingUid`, organization ID, role, exact organization or course scope, lifecycle status, server-authoritative effective/expiry timestamps, version and grant IDs.
- `enterprise_authority_grants/{grantId}`: membership ID, exact organization/property/course IDs, explicit capabilities, lifecycle status, effective/expiry timestamps and version.
- `enterprise_organizations/{organizationId}`: immutable organization ID, display name, lifecycle status, version and immutable `propertyIds` relationship.
- `enterprise_properties/{propertyId}`: immutable parent organization ID, property ID, display name, lifecycle status, version and immutable `courseIds` relationship.
- `enterprise_courses/{courseId}`: immutable organization/property/course IDs, canonical course ID, display name, lifecycle status and version.
- `enterprise_authority_receipts/{receiptId}`: deterministic, create-only, minimum-necessary authority decision receipt.
- `enterprise_authority_commands/{commandId}`: deterministic command digest/result ledger for authority mutations. Same command and payload may replay; changed payload conflicts.
- `enterprise_verified_golfers/{uid}`: server-owned exact-ID verification registry used only for consent invitations; clients cannot list, read, or write it.

All records are server-owned. Direct client reads and writes are denied. Display names, client claims and legacy records never establish authority. The resolver starts at the authenticated UID binding, validates every referenced record, intersects exact course grants, and fails the complete decision closed for missing, malformed, duplicate, conflicting, inactive, not-yet-effective, expired, revoked or suspended data.

## Test fixture boundary

`fixtures/gf-en-004-authority.v1.json` is fixture-only. It may be loaded only into a `demo-` Firebase project on loopback with an explicit apply flag. Runtime Functions never import or seed it.
