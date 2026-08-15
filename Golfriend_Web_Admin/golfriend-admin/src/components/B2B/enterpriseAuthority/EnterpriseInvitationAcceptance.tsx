import {useRef, useState} from "react";
import {useLocale} from "../../../i18n/hooks";
import {ENTERPRISE_AUTHORITY_COPY, ENTERPRISE_AUTHORITY_LOCALES, type EnterpriseAuthorityLocale} from "../../../i18n/partner/enterpriseAuthority";
import {newAuthorityCommandId, organizationAuthorityService} from "../enterprise/organizationAuthorityService";

export default function EnterpriseInvitationAcceptance() {
  const rawLocale = useLocale();
  const locale: EnterpriseAuthorityLocale = ENTERPRISE_AUTHORITY_LOCALES.includes(rawLocale as EnterpriseAuthorityLocale) ? rawLocale as EnterpriseAuthorityLocale : "en";
  const copy = ENTERPRISE_AUTHORITY_COPY[locale];
  const query = new URLSearchParams(location.search);
  const invitationId = query.get("enterpriseInvitation") || "";
  const invitationVersion = Number(query.get("invitationVersion"));
  const commandId = useRef(newAuthorityCommandId());
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  if (!invitationId) return null;
  const valid = /^invite_[A-Za-z0-9_-]{8,120}$/.test(invitationId) && Number.isInteger(invitationVersion) && invitationVersion > 0;
  const accept = async () => {
    if (!valid) { setState("error"); return; }
    setState("busy");
    try {
      await organizationAuthorityService.acceptInvitation(invitationId, invitationVersion, commandId.current);
      setState("done");
      location.assign("/partner");
    } catch { setState("error"); }
  };
  return <section aria-labelledby="enterprise-invitation-title" className="partner-status">
    <h2 id="enterprise-invitation-title">{copy.invitations}</h2><p>{copy.namesWarning}</p>
    {state === "error" && <p role="alert">{copy.unavailable} {copy.safeRetry}</p>}
    {state === "done" ? <p role="status">{copy.accepted}</p> : <button type="button" disabled={state === "busy" || !valid} onClick={() => void accept()}>{state === "busy" ? copy.loading : copy.accepted}</button>}
    {state === "error" && <button type="button" onClick={() => void accept()}>{copy.retry}</button>}
  </section>;
}
