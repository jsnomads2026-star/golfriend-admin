import { onCall, HttpsError } from "firebase-functions/v2/https";

// A dedicated HMAC secret and v2 operation-authorization records are prerequisites.
// They are deliberately uncommissioned here; no legacy v1 receipt is reinterpreted.
export const BOOKING_TOKEN_RECOVERY_COMMISSIONED=false as const;
export const recoverPlayBookingConfirmationV2=onCall({enforceAppCheck:true},async request=>{
 if(!request.auth)throw new HttpsError("unauthenticated","Authentication required.");
 throw new HttpsError("unavailable","booking_token_recovery_authority_unavailable");
});
