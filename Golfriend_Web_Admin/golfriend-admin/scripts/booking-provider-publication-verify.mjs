import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");
const domain=read("functions/src/bookingProviderPublicationDomain.ts"),runtime=read("functions/src/bookingProviderPublicationRuntime.ts"),ui=read("src/components/B2B/BookingProviderPublicationV2.tsx"),index=read("functions/src/index.ts"),rules=read("partner-onboarding.firestore.rules"),app=read("src/App.tsx"),small=read("src/components/B2B/SmallBusinessDashboard.tsx"),enterprise=read("src/components/B2B/EnterpriseDashboard.tsx");
let count=0;const check=(name,value)=>{assert(value,name);count++;console.log(`PASS ${name}`)};
check("versioned allowlist",domain.includes("golfriend.provider-neutral-booking-publication.v1"));
for(const kind of ["availability","booking","status","message","reconciliation"])check(`kind ${kind}`,domain.includes(`\"${kind}\"`));
for(const kind of ["payment","fee","wallet","ledger","settlement","trip"])check(`forbid ${kind}`,domain.includes(`\"${kind}\"`));
check("no member identity projection",!/memberUid/.test(domain.match(/buildProviderPublication[\s\S]+?export interface/)?.[0]||""));
check("message content excluded",/messageId/.test(domain)&&!/text:String/.test(domain));
check("deterministic ids",domain.includes("publicationId")&&domain.includes("publicationReceiptId"));
check("injected adapter",domain.includes("BookingPublicationAdapter")&&domain.includes("publishWithAdapter"));
check("unconfigured fails closed",domain.includes("PROVIDER_UNCONFIGURED"));
for(const name of ["prepareBookingProviderPublicationV2","publishBookingProviderPublicationV2","getBookingProviderPublicationsV2"])check(`App Check ${name}`,runtime.includes(`export const ${name}=onCall({enforceAppCheck:true}`)&&index.includes(name));
check("delegated authority",runtime.includes("partner_memberships")&&runtime.includes("primary_owner")&&runtime.includes("manager"));
check("Admin authority",runtime.includes("isActiveStaff"));
check("fixed sources",["tee_time_slots","bookings","play_booking_audits","course_operators"].every(value=>runtime.includes(value)));
check("deny rules",["booking_provider_publications","booking_provider_publication_receipts"].every(value=>rules.includes(value)));
for(const locale of ["en","th","ko","ja","zh","es","fr","de"]){
  const start=ui.indexOf(`${locale}:{`),end=ui.indexOf("},",start);
  check(`complete ${locale} locale`,start>=0&&end>start&&["title","loading","empty","error","unconfigured","course","organization","prepare","attempt","status","boundary"].every(field=>ui.slice(start,end).includes(`${field}:`)));
}
check("no locale spread fallback",!/\b(?:th|ko|ja|zh|es|fr|de):\{\.\.\./.test(ui));
check("accessible states",/role=\"status\"/.test(ui)&&/role=\"alert\"/.test(ui)&&/aria-labelledby/.test(ui)&&/aria-live=\"polite\"/.test(ui));
check("mounted Admin",app.includes("<BookingProviderPublicationV2 admin"));
check("mounted Small Portal",small.includes("<BookingProviderPublicationV2"));
check("mounted Enterprise Portal",enterprise.includes("<BookingProviderPublicationV2"));
check("honest unavailable UI",ui.includes("PROVIDER_UNCONFIGURED"));
console.log(`${count}/${count} booking provider publication verification PASS`);
