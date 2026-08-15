import {
  TOURNAMENT_OPERATIONS_SCHEMA,
  contextHasExactTournamentScope,
  unavailableTournamentProjection,
  type TournamentAuthorityContext,
  type TournamentOperationsProjection,
} from "./tournamentOperationsModel.ts";

export interface EnterpriseTournamentProducer {
  readonly schema: typeof TOURNAMENT_OPERATIONS_SCHEMA;
  readonly financialAuthority: false;
  read(context: TournamentAuthorityContext): Promise<TournamentOperationsProjection>;
}

export class EnterpriseTournamentOperationsService {
  private readonly producer: EnterpriseTournamentProducer | null;

  constructor(producer: EnterpriseTournamentProducer | null = null) {
    this.producer = producer;
  }

  async read(context: TournamentAuthorityContext): Promise<TournamentOperationsProjection> {
    if (context.organizationStatus !== "active") {
      return Object.freeze({...unavailableTournamentProjection(), state: context.organizationStatus === "suspended" ? "suspended" : "unavailable", retryable: false});
    }
    if (!contextHasExactTournamentScope(context)) return unavailableTournamentProjection("TOURNAMENT_COURSE_SCOPE_DENIED");
    if (!this.producer || this.producer.schema !== TOURNAMENT_OPERATIONS_SCHEMA || this.producer.financialAuthority !== false) {
      return unavailableTournamentProjection("GF-SB-005/GF-SB-006:TOURNAMENT_PRODUCER_UNAVAILABLE");
    }
    const projection = await this.producer.read(context);
    if (projection.schema !== TOURNAMENT_OPERATIONS_SCHEMA || projection.producerSchema !== TOURNAMENT_OPERATIONS_SCHEMA) {
      return unavailableTournamentProjection("TOURNAMENT_PRODUCER_SCHEMA_INCOMPATIBLE");
    }
    const crossScope = projection.tournaments.some((item) => item.organizationId !== context.organizationId || item.propertyId !== context.propertyId || item.courseId !== context.courseId)
      || projection.references.some((item) => item.organizationId !== context.organizationId || item.propertyId !== context.propertyId || item.courseId !== context.courseId || item.immutable !== true);
    return crossScope ? unavailableTournamentProjection("TOURNAMENT_PROJECTION_SCOPE_REJECTED") : projection;
  }

}
