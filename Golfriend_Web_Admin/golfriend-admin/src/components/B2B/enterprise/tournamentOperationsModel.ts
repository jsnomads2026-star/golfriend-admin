import type {AuthorityScope, EnterpriseRole} from "./organizationAuthorityModel.ts";

export const TOURNAMENT_OPERATIONS_SCHEMA = "golfriend.enterprise-tournament-operations.v1" as const;

export type TournamentOperationsState =
  | "loading"
  | "empty"
  | "current"
  | "stale"
  | "suspended"
  | "unavailable";

export type TournamentLifecycleState = "draft" | "pending_review" | "approved" | "active" | "cancelled" | "rejected";

export interface TournamentAuthorityContext {
  actorMembershipId: string;
  organizationId: string;
  propertyId: string;
  courseId: string;
  role: EnterpriseRole;
  scope: AuthorityScope;
  organizationStatus: "pending" | "active" | "suspended" | "unavailable";
}

export interface EnterpriseTournamentProjection {
  tournamentId: string;
  organizationId: string;
  propertyId: string;
  courseId: string;
  name: string;
  startsAt: string;
  capacity: number;
  participantCount: number;
  state: TournamentLifecycleState;
  version: number;
  updatedAt: string;
  responsibilityTermsVersion: string;
}

export interface ImmutableTournamentReference {
  referenceId: string;
  commandId: string;
  tournamentId: string;
  organizationId: string;
  propertyId: string;
  courseId: string;
  action: string;
  authorityVersion: number;
  occurredAt: string;
  immutable: true;
}

export interface TournamentOperationsProjection {
  schema: typeof TOURNAMENT_OPERATIONS_SCHEMA;
  producerSchema: typeof TOURNAMENT_OPERATIONS_SCHEMA;
  state: TournamentOperationsState;
  sourceUpdatedAt: string | null;
  retryable: boolean;
  supportReference: string | null;
  tournaments: readonly EnterpriseTournamentProjection[];
  references: readonly ImmutableTournamentReference[];
}

export function contextHasExactTournamentScope(context: TournamentAuthorityContext): boolean {
  return context.organizationStatus === "active"
    && (context.role === "course_manager" || context.role === "tournament_staff")
    && context.scope.kind === "course"
    && context.scope.organizationId === context.organizationId
    && context.scope.propertyId === context.propertyId
    && context.scope.courseId === context.courseId;
}

export function unavailableTournamentProjection(supportReference: string | null = null): TournamentOperationsProjection {
  return Object.freeze({
    schema: TOURNAMENT_OPERATIONS_SCHEMA,
    producerSchema: TOURNAMENT_OPERATIONS_SCHEMA,
    state: "unavailable",
    sourceUpdatedAt: null,
    retryable: true,
    supportReference,
    tournaments: Object.freeze([]),
    references: Object.freeze([]),
  });
}
