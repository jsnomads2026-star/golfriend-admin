# Enterprise staff role mapping

`EnterpriseAuthorityPortal` and `OrganizationAuthorityService` are the only
enterprise staff authority surface. Legacy Admin-acquisition names are accepted
only as migration inputs and map to the least-privileged canonical role:

| Legacy name | Canonical role | Required scope |
| --- | --- | --- |
| `manager` | `course_manager` | Explicit property and course |
| `venue_staff` | `booking_staff` | Explicit property and course |
| `analyst` | `analyst_viewer` | Explicit property and course |

No legacy name maps to `organization_owner`, `organization_admin`,
`tournament_staff`, or `marketing_content_staff`. Unknown names and any mapping
that would broaden scope must fail closed. Invitations, revocations, ownership
transfers and receipts remain versioned and server-confirmed through the
canonical service.
