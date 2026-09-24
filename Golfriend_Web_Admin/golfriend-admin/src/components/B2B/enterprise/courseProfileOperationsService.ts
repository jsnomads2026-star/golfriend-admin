import { functions } from '../../../firebaseConfig';
import {COURSE_PROFILE_OPERATIONS_SCHEMA,hasCompleteLocalizedProfile,hasExactCourseProfileScope,unavailableCourseProfile,type CourseProfileAuthorityContext,type CourseProfileProjection,type SubmitCourseProfileEdit} from "./courseProfileOperationsModel.ts";
import {httpsCallable} from "firebase/functions";
export interface CourseProfileProducer {readonly schema:typeof COURSE_PROFILE_OPERATIONS_SCHEMA; read(context:CourseProfileAuthorityContext):Promise<CourseProfileProjection>; submit(context:CourseProfileAuthorityContext,command:SubmitCourseProfileEdit):Promise<CourseProfileProjection>;}
export class CourseProfileOperationsService {
  private readonly producer:CourseProfileProducer|null;
  constructor(producer:CourseProfileProducer|null=null){this.producer=producer;}
  async read(context:CourseProfileAuthorityContext):Promise<CourseProfileProjection>{
    if(context.organizationStatus==="suspended"||context.courseStatus==="suspended")return {...unavailableCourseProfile(context.courseId),state:"suspended",retryable:false};
    if(!hasExactCourseProfileScope(context))return unavailableCourseProfile(context.courseId,"COURSE_PROFILE_SCOPE_DENIED");
    if(!this.producer||this.producer.schema!==COURSE_PROFILE_OPERATIONS_SCHEMA)return unavailableCourseProfile(context.courseId);
    try{return this.validate(context,await this.producer.read(context));}catch{return unavailableCourseProfile(context.courseId,"COURSE_PROFILE_PRODUCER_READ_FAILED");}
  }
  async submit(context:CourseProfileAuthorityContext,command:SubmitCourseProfileEdit):Promise<CourseProfileProjection>{
    if(!hasExactCourseProfileScope(context))return unavailableCourseProfile(context.courseId,"COURSE_PROFILE_SCOPE_DENIED");
    if(command.canonicalCourseId!==context.courseId||!command.commandId||command.attemptVersion<1||command.baseVersion<0||!hasCompleteLocalizedProfile(command.content))return unavailableCourseProfile(context.courseId,"COURSE_PROFILE_COMMAND_REJECTED");
    if(!this.producer||this.producer.schema!==COURSE_PROFILE_OPERATIONS_SCHEMA)return unavailableCourseProfile(context.courseId);
    try{return this.validate(context,await this.producer.submit(context,command));}catch{return unavailableCourseProfile(context.courseId,"COURSE_PROFILE_PRODUCER_SUBMIT_FAILED");}
  }
  private validate(context:CourseProfileAuthorityContext,p:CourseProfileProjection):CourseProfileProjection{
    const wrong=p.schema!==COURSE_PROFILE_OPERATIONS_SCHEMA||p.producerSchema!==COURSE_PROFILE_OPERATIONS_SCHEMA||p.canonicalCourseId!==context.courseId
      ||!!p.approvedProfile&&(p.approvedProfile.courseId!==context.courseId||p.approvedProfile.organizationId!==context.organizationId||p.approvedProfile.propertyId!==context.propertyId||!hasCompleteLocalizedProfile(p.approvedProfile.content))
      ||!!p.editAttempt&&(p.editAttempt.courseId!==context.courseId||p.editAttempt.organizationId!==context.organizationId||p.editAttempt.propertyId!==context.propertyId||!hasCompleteLocalizedProfile(p.editAttempt.content))
      ||p.references.some(r=>r.immutable!==true||r.courseId!==context.courseId||r.organizationId!==context.organizationId||r.propertyId!==context.propertyId);
    return wrong?unavailableCourseProfile(context.courseId,"COURSE_PROFILE_PROJECTION_REJECTED"):p;
  }
}
const call=async(name:string,payload:Record<string,unknown>)=>(await httpsCallable(functions,name)(payload)).data as CourseProfileProjection;
const payload=(context:CourseProfileAuthorityContext)=>({actorMembershipId:context.actorMembershipId,organizationId:context.organizationId,propertyId:context.propertyId,courseId:context.courseId});
export const firebaseCourseProfileProducer:CourseProfileProducer={schema:COURSE_PROFILE_OPERATIONS_SCHEMA,read:context=>call("getEnterpriseCourseProfileV1",payload(context)),submit:(context,command)=>call("submitEnterpriseCourseProfileV1",{...payload(context),...command})};
export const courseProfileOperationsService=new CourseProfileOperationsService(firebaseCourseProfileProducer);
