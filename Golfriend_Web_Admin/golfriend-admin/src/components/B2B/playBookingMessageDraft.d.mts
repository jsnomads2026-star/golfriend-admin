export const PLAY_BOOKING_MESSAGE_DRAFT_TYPES:readonly ['request_received','information_needed','alternative_proposed','confirmed','declined','cancellation_received','cancellation_accepted','cancellation_declined','manual_support_required'];
export type PlayBookingMessageDraftType=typeof PLAY_BOOKING_MESSAGE_DRAFT_TYPES[number];
export type PlayBookingMessageDraftInput=Readonly<{type:PlayBookingMessageDraftType;bookingId:string;recipientRef:string;locale:'en'|'th'|'ko'|'ja'|'zh'|'es'|'fr'|'de';revision:number;status:'pending'|'changed'|'confirmed'|'rejected'|'cancelled'|'expired';slot:Readonly<{slotId:string;courseRef:string;date:string;time:string;timeZone:string}>;message:string}>;
export type PlayBookingMessageDraft=PlayBookingMessageDraftInput&Readonly<{schema:'golfriend.portal.play-booking-message-draft.v1';deliveryState:'awaiting_delivery_provider';authority:'draft_only';approval:Readonly<{digest:string;approvedDigest:string|null;approved:boolean}>;containsRecipientName:false}>;
export function playBookingMessageApprovalDigest(input:PlayBookingMessageDraftInput):string;
export function createPlayBookingMessageDraft(input:PlayBookingMessageDraftInput,approvedDigest?:string|null):PlayBookingMessageDraft;
export function approvePlayBookingMessageDraft(draft:PlayBookingMessageDraft,digest:string):PlayBookingMessageDraft;
export function validatePlayBookingMessageDraft(value:unknown):value is PlayBookingMessageDraft;
