import {httpsCallable} from "firebase/functions";
import { functions } from '../../firebaseConfig';
import {commandId} from "./partnerApplicationService";

export type CourseOnboardingDraft = {
  representative: {fullName: string; jobTitle: string; authorityBasis: string; authorityEvidenceId: string; businessEmail: string; phone: string};
  organization: {legalName: string; registrationNumber: string; country: string; registeredAddress: string};
  course: {courseId: string; legalName: string; publicName: string; address: string; website: string};
  profile: {description: string; holes: string; timezone: string; contactEmail: string; contactPhone: string};
  catalogue: {facilities: string; accessibility: string; dressCode: string; cancellationPolicy: string};
};

const call = async <T>(name: string, payload: Record<string, unknown> = {}) =>
  (await httpsCallable(functions, name)(payload)).data as T;

export const verifiedCourseOnboardingService = {
  load: () => call<any>("getMyVerifiedCourseOnboardingV2"),
  save: (draft: CourseOnboardingDraft, expectedVersion: number, locale: string) => call<any>("saveVerifiedCourseOnboardingDraftV2", {
    organization:draft.organization.legalName, organizationType:"golf_course", country:draft.organization.country, region:draft.organization.registeredAddress,
    contactName:draft.representative.fullName, contactEmail:draft.representative.businessEmail, contactPhone:draft.representative.phone, locale,
    courseName:draft.course.publicName, courseAddress:draft.course.address, courseWebsite:draft.course.website,
    organizationIdentity:{legalName:draft.organization.legalName,registrationId:draft.organization.registrationNumber,jurisdiction:draft.organization.country},
    courseProfile:{name:draft.course.publicName,address:draft.course.address,website:draft.course.website,holes:Number(draft.profile.holes),timeZone:draft.profile.timezone,catalogueLocales:["en","th","ko","ja","zh","es","fr","de"],description:draft.profile.description,contactEmail:draft.profile.contactEmail,contactPhone:draft.profile.contactPhone,facilities:draft.catalogue.facilities,accessibility:draft.catalogue.accessibility,dressCode:draft.catalogue.dressCode,cancellationPolicy:draft.catalogue.cancellationPolicy,canonicalCourseId:draft.course.courseId,legalName:draft.course.legalName},
    consent:true, terms:true, expectedVersion, commandId:commandId(),
  }),
  acceptAgreement: (draft: CourseOnboardingDraft) => call<any>("acceptVerifiedCourseOnboardingAgreementV2", {
    representative:{name:draft.representative.fullName,title:draft.representative.jobTitle,email:draft.representative.businessEmail,authorityEvidenceId:draft.representative.authorityEvidenceId,authorityConfirmed:true},
    agreement:{version:"golfriend.course-partner.v1",digest:"e16d5070c66bbf4b89beade4407b415def779076c71dbb48237db7b1157adc11",explicitlyAccepted:true,signerIsAuthorizedRepresentative:true}, commandId:commandId(),
  }),
  submit: () => call<any>("submitVerifiedCourseOnboardingV2", {commandId: commandId()}),
};
