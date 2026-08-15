import {MEMBER_LINKING_SCHEMA, hasExactMemberLinkingScope, unavailableMemberLinkingProjection, type InviteKnownGolferCommand, type MemberLinkingContext, type MemberLinkingProjection, type UnlinkMemberCommand} from "./memberLinkingModel.ts";
import {getFunctions,httpsCallable} from "firebase/functions";

export interface EnterpriseMemberLinkingProducer {
  readonly schema: typeof MEMBER_LINKING_SCHEMA;
  readonly supportsDirectorySearch: false;
  readonly infersAdditionalConsent: false;
  read(context: MemberLinkingContext): Promise<MemberLinkingProjection>;
  inviteKnownGolfer(context: MemberLinkingContext, command: InviteKnownGolferCommand): Promise<MemberLinkingProjection>;
  unlink(context: MemberLinkingContext, command: UnlinkMemberCommand): Promise<MemberLinkingProjection>;
}
export class EnterpriseMemberLinkingService {
  private readonly producer: EnterpriseMemberLinkingProducer | null;
  constructor(producer: EnterpriseMemberLinkingProducer | null = null) { this.producer = producer; }

  private eligible(context: MemberLinkingContext): MemberLinkingProjection | null {
    if (context.organizationStatus !== "active" || context.courseStatus !== "active") return Object.freeze({...unavailableMemberLinkingProjection(), state: context.organizationStatus === "suspended" || context.courseStatus === "suspended" ? "suspended" : "unavailable", retryable: false});
    if (!hasExactMemberLinkingScope(context)) return unavailableMemberLinkingProjection("MEMBER_LINKING_COURSE_SCOPE_DENIED");
    if (!this.producer || this.producer.schema !== MEMBER_LINKING_SCHEMA || this.producer.supportsDirectorySearch !== false || this.producer.infersAdditionalConsent !== false) return unavailableMemberLinkingProjection();
    return null;
  }

  private validate(context: MemberLinkingContext, projection: MemberLinkingProjection): MemberLinkingProjection {
    if (projection.schema !== MEMBER_LINKING_SCHEMA || projection.producerSchema !== MEMBER_LINKING_SCHEMA) return unavailableMemberLinkingProjection("MEMBER_LINKING_PRODUCER_SCHEMA_INCOMPATIBLE");
    const linkStates = new Set(["invited", "accepted", "declined", "expired", "revoked", "unlinked"]);
    const actorKinds = new Set(["verified_golfer", "verified_course_staff", "system"]);
    const crossScope = projection.links.some(item => item.organizationId !== context.organizationId || item.propertyId !== context.propertyId || item.courseId !== context.courseId)
      || projection.receipts.some(item => item.organizationId !== context.organizationId || item.propertyId !== context.propertyId || item.courseId !== context.courseId || item.immutable !== true)
      || projection.links.some(item => !linkStates.has(item.state) || !item.linkId || !item.memberReference || !item.golferDisplayLabel || item.consentVersion < 1)
      || projection.receipts.some(item => !linkStates.has(item.action) || !actorKinds.has(item.actorKind) || !item.receiptId || !item.linkId || item.consentVersion < 1);
    if (crossScope) return unavailableMemberLinkingProjection("MEMBER_LINKING_PROJECTION_SCOPE_REJECTED");
    return Object.freeze({
      schema: MEMBER_LINKING_SCHEMA, producerSchema: MEMBER_LINKING_SCHEMA, state: projection.state,
      sourceUpdatedAt: projection.sourceUpdatedAt, retryable: projection.retryable, supportReference: projection.supportReference,
      links: Object.freeze(projection.links.map(item => Object.freeze({linkId:item.linkId,organizationId:item.organizationId,propertyId:item.propertyId,courseId:item.courseId,memberReference:item.memberReference,golferDisplayLabel:item.golferDisplayLabel,state:item.state,consentVersion:item.consentVersion,expiresAt:item.expiresAt,updatedAt:item.updatedAt}))),
      receipts: Object.freeze(projection.receipts.map(item => Object.freeze({receiptId:item.receiptId,linkId:item.linkId,organizationId:item.organizationId,propertyId:item.propertyId,courseId:item.courseId,action:item.action,consentVersion:item.consentVersion,actorKind:item.actorKind,occurredAt:item.occurredAt,immutable:true as const}))),
    });
  }

  async read(context: MemberLinkingContext): Promise<MemberLinkingProjection> {
    const denied = this.eligible(context); if (denied) return denied;
    try { return this.validate(context, await this.producer!.read(context)); }
    catch { return unavailableMemberLinkingProjection("MEMBER_LINKING_PRODUCER_READ_FAILED"); }
  }
  async inviteKnownGolfer(context: MemberLinkingContext, command: InviteKnownGolferCommand): Promise<MemberLinkingProjection> {
    const denied = this.eligible(context); if (denied) return denied;
    if (!command.commandId.trim() || !command.knownGolferId.trim() || command.consentVersion < 1 || command.organizationId !== context.organizationId || command.propertyId !== context.propertyId || command.courseId !== context.courseId) return unavailableMemberLinkingProjection("MEMBER_LINKING_COMMAND_REJECTED");
    try { return this.validate(context, await this.producer!.inviteKnownGolfer(context, command)); }
    catch { return unavailableMemberLinkingProjection("MEMBER_LINKING_PRODUCER_INVITE_FAILED"); }
  }
  async unlink(context: MemberLinkingContext, command: UnlinkMemberCommand): Promise<MemberLinkingProjection> {
    const denied = this.eligible(context); if (denied) return denied;
    if (!command.commandId.trim() || !command.linkId.trim() || command.consentVersion < 1 || command.organizationId !== context.organizationId || command.propertyId !== context.propertyId || command.courseId !== context.courseId) return unavailableMemberLinkingProjection("MEMBER_LINKING_COMMAND_REJECTED");
    try { return this.validate(context, await this.producer!.unlink(context, command)); }
    catch { return unavailableMemberLinkingProjection("MEMBER_LINKING_PRODUCER_UNLINK_FAILED"); }
  }
}
const call=async(name:string,payload:Record<string,unknown>)=>(await httpsCallable(getFunctions(),name)(payload)).data as MemberLinkingProjection;
const payload=(context:MemberLinkingContext)=>({actorMembershipId:context.actorMembershipId,organizationId:context.organizationId,propertyId:context.propertyId,courseId:context.courseId});
export const firebaseMemberLinkingProducer:EnterpriseMemberLinkingProducer={schema:MEMBER_LINKING_SCHEMA,supportsDirectorySearch:false,infersAdditionalConsent:false,read:context=>call("getEnterpriseMemberLinksV1",payload(context)),inviteKnownGolfer:(context,command)=>call("inviteKnownGolferEnterpriseMemberV1",{...payload(context),...command}),unlink:(context,command)=>call("unlinkEnterpriseMemberV1",{...payload(context),...command})};
export const enterpriseMemberLinkingService=new EnterpriseMemberLinkingService(firebaseMemberLinkingProducer);
