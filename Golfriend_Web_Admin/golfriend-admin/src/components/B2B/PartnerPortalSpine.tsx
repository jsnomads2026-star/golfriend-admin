import {useEffect, useState} from "react";
import {onAuthStateChanged, signOut, type User} from "firebase/auth";
import {httpsCallable} from "firebase/functions";
import {auth, functions} from "../../firebaseConfig";
import {LocaleSwitcher} from "../../i18n/LocaleSwitcher";
import PartnerApplicationJourney from "./PartnerApplicationJourney";
import PartnerInvitationAcceptance from "./PartnerInvitationAcceptance";

type State = "loading" | "signed_out" | "pending" | "inactive" | "denied" | "ready" | "unavailable";

function stateFrom(error: unknown): State {
  const code = (error as {details?: {code?: string}} | undefined)?.details?.code;
  if (code === "PARTNER_CONTEXT_PENDING") return "pending";
  if (code === "PARTNER_CONTEXT_INACTIVE") return "inactive";
  if (code === "PARTNER_CONTEXT_UNLINKED" || code === "PARTNER_CONTEXT_UNAUTHORIZED") return "denied";
  return "unavailable";
}

export default function PartnerPortalSpine() {
  const [user, setUser] = useState<User | null>(null);
  const [state, setState] = useState<State>("loading");
  useEffect(() => onAuthStateChanged(auth, async next => {
    setUser(next);
    if (!next) { setState("signed_out"); return; }
    try { await httpsCallable(functions, "getPartnerPortalContext")({}); setState("ready"); }
    catch (error) { setState(stateFrom(error)); }
  }), []);
  const leave = async () => { await signOut(auth); location.assign("/"); };
  return <main className="partner-status" aria-live="polite">
    <header><a href="/" aria-label="Golfriend home">Golfriend</a><LocaleSwitcher/><button onClick={() => void leave()}>Sign out</button></header>
    {state === "loading" && <p>Loading your secure portal…</p>}
    {state === "signed_out" && <section><h1>Partner Portal</h1><p>Sign in to continue your partner application or organization workspace.</p><a href="/partner">Sign in</a></section>}
    {state === "pending" && user && <PartnerApplicationJourney onSignOut={leave}/>} 
    {state === "ready" && <section><h1>Partner Portal</h1><p>Your organization access is active. Your approved workspace is loading.</p><a href="/partner">Open workspace</a></section>}
    {state === "inactive" && <section><h1>Partner Portal unavailable</h1><p>Your organization is not active. No action was taken.</p></section>}
    {state === "denied" && <section><h1>Partner Portal unavailable</h1><p>This account is not linked to an approved organization.</p></section>}
    {state === "unavailable" && <section><h1>Partner Portal unavailable</h1><p>We could not verify access. No data was changed.</p></section>}
    {user && <PartnerInvitationAcceptance/>}
  </main>;
}
