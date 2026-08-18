import {useCallback, useEffect, useState} from "react";
import {useLocale} from "../../i18n/hooks.ts";
import {applicantJourneyCopy, documentStatusLabel, evidenceKindLabel, EVIDENCE_KIND_KEYS, type ApplicantJourneyCopy} from "../../i18n/partner/applicantJourney";
import {APPLICANT_JOURNEY_LOCALES} from "../../i18n/partner/applicantJourney";
import type {ApplicantView} from "../../i18n/partner/applicant";
import {partnerApplicationService} from "./partnerApplicationService";
import "./PartnerApplicationJourney.css";
import VerifiedCourseOnboarding from "./VerifiedCourseOnboarding";
import EnterprisePartnerSupport from "./enterpriseSupport/EnterprisePartnerSupport";

// The applicant journey. It renders INSIDE the applicant zone landmark, so every block here is a
// section element — a second main landmark on the page would leave a screen-reader user with two
// competing page landmarks.
//
// Three rules this file keeps:
//  * it never decides authority. Verification, approval and activation are server facts that
//    arrive on the view; nothing here can mark its own document verified.
//  * it never shows a raw provider or server code. Failures map to localized sentences that
//    state the consequence.
//  * the checklist it displays is the SERVER checklist, derived from the same rule the submit
//    gate applies, so an applicant is never asked for something the server does not require.

const LOCKED_STATUSES = ["submitted", "under_review", "approved", "suspended"];

type Notice = {tone: "status" | "alert"; text: string} | null;

const blankDraft = {
  organization: "", organizationType: "golf_course", country: "", region: "",
  contactName: "", contactEmail: "", contactPhone: "", locale: "en",
  courseName: "", courseAddress: "", courseWebsite: "",
  legalName: "", registrationId: "", timeZone: "", holes: "18",
  catalogueLocales: [...APPLICANT_JOURNEY_LOCALES] as string[],
  representationBasis: "company",
  consent: false, terms: false,
};

/** Localized, code-free failure text. A provider code never reaches a human. */
function humanError(error: unknown, copy: ApplicantJourneyCopy): string {
  const message = String((error as {message?: unknown})?.message ?? "");
  if (typeof navigator !== "undefined" && navigator.onLine === false) return copy.offline;
  if (message.includes("PROVIDER_UNCONFIGURED")) return copy.storageUnavailable;
  return copy.loadError;
}

export default function PartnerApplicationJourney({view = "application", onSignOut}: {view?: ApplicantView; onSignOut: () => void}) {
  const locale = useLocale();
  const copy = applicantJourneyCopy(locale);

  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [server, setServer] = useState<any>(null);
  const [agreement, setAgreement] = useState<any>(null);
  const [draft, setDraft] = useState<any>(blankDraft);
  const [representative, setRepresentative] = useState({name: "", title: "", email: "", authorityEvidenceId: "", authorityConfirmed: false});
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [documentKind, setDocumentKind] = useState<string>(EVIDENCE_KIND_KEYS[0]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const [next, terms] = await Promise.all([partnerApplicationService.load(), partnerApplicationService.agreement()]);
      setServer(next);
      setAgreement(terms);
      const application = next?.application;
      if (application) {
        setDraft({
          organization: application.organization ?? "", organizationType: application.organizationType ?? "golf_course",
          country: application.country ?? "", region: application.region ?? "",
          contactName: application.contactName ?? "", contactEmail: application.contactEmail ?? "",
          contactPhone: application.contactPhone ?? "", locale: application.locale ?? locale,
          courseName: application.course?.name ?? "", courseAddress: application.course?.address ?? "",
          courseWebsite: application.course?.website ?? "",
          legalName: application.organizationIdentity?.legalName ?? "",
          registrationId: application.organizationIdentity?.registrationId ?? "",
          timeZone: application.courseProfile?.timeZone ?? "",
          holes: String(application.courseProfile?.holes ?? 18),
          catalogueLocales: application.courseProfile?.catalogueLocales?.length ? application.courseProfile.catalogueLocales : [...APPLICANT_JOURNEY_LOCALES],
          representationBasis: application.representationBasis ?? "company",
          consent: Boolean(application.consent), terms: Boolean(application.terms),
        });
        setRepresentative({
          name: application.representative?.name ?? "", title: application.representative?.title ?? "",
          email: application.representative?.email ?? application.contactEmail ?? "",
          authorityEvidenceId: application.representative?.authorityEvidenceId ?? "",
          authorityConfirmed: application.representative?.authorityConfirmed === true,
        });
        setAgreementAccepted(Boolean(application.agreement?.receiptId));
      }
      setState("ready");
    } catch {
      setState("error");
    }
  }, [locale]);

  useEffect(() => { void load(); }, [load]);

  const run = async (task: () => Promise<unknown>, success: string) => {
    setBusy(true); setNotice(null);
    try {
      await task();
      setNotice({tone: "status", text: success});
      await load();
    } catch (error) {
      setNotice({tone: "alert", text: humanError(error, copy)});
    } finally {
      setBusy(false);
    }
  };

  if (state === "loading") return <section className="partner-application" aria-busy="true"><p role="status" aria-live="polite">{copy.loading}</p></section>;
  if (state === "error") {
    return (
      <section className="partner-application">
        <p role="alert">{copy.loadError}</p>
        <button type="button" onClick={() => void load()}>{copy.retry}</button>
        <button type="button" onClick={onSignOut}>{copy.signOut}</button>
      </section>
    );
  }

  const application = server?.application ?? null;
  const applicationId: string = application?.applicationId ?? "";
  const checklist = server?.checklist ?? null;
  const documents: any[] = server?.evidence ?? [];
  const locked = LOCKED_STATUSES.includes(String(application?.status ?? ""));
  const alternativeRequest = application?.alternativeEvidenceRequest ?? null;
  const field = (key: string) => ({value: draft[key], onChange: (event: any) => setDraft({...draft, [key]: event.target.value})});

  const savePayload = () => ({
    organization: draft.organization, organizationType: draft.organizationType, country: draft.country,
    region: draft.region, contactName: draft.contactName, contactEmail: draft.contactEmail,
    contactPhone: draft.contactPhone, locale: draft.locale,
    courseName: draft.courseName, courseAddress: draft.courseAddress, courseWebsite: draft.courseWebsite,
    representationBasis: draft.representationBasis,
    organizationIdentity: {legalName: draft.legalName, registrationId: draft.registrationId, jurisdiction: draft.country},
    courseProfile: {
      name: draft.courseName, address: draft.courseAddress, website: draft.courseWebsite,
      holes: Number(draft.holes), timeZone: draft.timeZone, catalogueLocales: draft.catalogueLocales,
    },
    consent: draft.consent, terms: draft.terms,
  });

  const canAccept = Boolean(representative.name && representative.title && representative.email && representative.authorityEvidenceId && representative.authorityConfirmed && agreementAccepted && agreement?.version);
  const canSubmit = Boolean(application && checklist?.satisfied && application?.agreement?.receiptId && draft.consent && draft.terms && !locked);

  const step = (target: ApplicantView, label: string, href: string) => (
    <a className={view === target ? "applicant-step is-current" : "applicant-step"} aria-current={view === target ? "step" : undefined} href={href}>{label}</a>
  );

  return (
    <section className="partner-application" aria-label={copy.title}>
      <header className="partner-application-header">
        <h2>{copy.title}</h2>
        <p>{copy.lead}</p>
        <button type="button" onClick={onSignOut}>{copy.signOut}</button>
      </header>

      <nav className="applicant-steps" aria-label={copy.navReview}>
        {step("application", copy.navApplication, "/apply/small-business")}
        {applicationId ? step("documents", copy.navDocuments, `/apply/${applicationId}/documents`) : null}
        {applicationId ? step("agreement", copy.navAgreement, `/apply/${applicationId}/agreement`) : null}
        {applicationId ? step("review", copy.navReview, `/apply/${applicationId}/review`) : null}
        {step("status", copy.navStatus, "/apply/status")}
      </nav>

      {locked ? <p className="applicant-locked" role="note">{copy.locked}</p> : null}
      {alternativeRequest ? (
        <p role="alert">{copy.alternativeRequested} {String(alternativeRequest.reason ?? "")} {copy.resubmitLead}</p>
      ) : null}

      {view === "application" ? (
        <form onSubmit={(event) => {event.preventDefault(); void run(() => partnerApplicationService.save(savePayload()), copy.savedNotice);}}>
          <fieldset disabled={busy || locked}>
            <legend>{copy.organizationHeading}</legend>
            <label>{copy.organization}<input required {...field("organization")} /></label>
            <label>{copy.organizationType}
              {/* The chosen type is a DECLARATION, not a tier. The server classifies it: a
                  course-shaped organization is an Enterprise relationship whatever is picked
                  here, and everything else is Small Business unless Admin records otherwise. */}
              <select {...field("organizationType")}>
                <option value="golf_course">{copy.typeGolfCourse}</option>
                <option value="organizer">{copy.typeOrganizer}</option>
                <option value="cafe">{copy.typeCafe}</option>
                <option value="brand">{copy.typeBrand}</option>
              </select>
            </label>
            <label>{copy.country}<input required pattern="[A-Za-z]{2}" maxLength={2} {...field("country")} /></label>
            <label>{copy.region}<input {...field("region")} /></label>
            <label>{copy.legalName}<input required {...field("legalName")} /></label>
            <label>{copy.registrationId}<input {...field("registrationId")} /></label>
            <label>{copy.courseName}<input required {...field("courseName")} /></label>
            <label>{copy.courseAddress}<input {...field("courseAddress")} /></label>
            <label>{copy.courseWebsite}<input type="url" {...field("courseWebsite")} /></label>
            <label>{copy.timeZone}<input {...field("timeZone")} /></label>
            <label>{copy.holes}<input type="number" min={9} max={36} step={9} {...field("holes")} /></label>
            <fieldset>
              <legend>{copy.catalogueLocales}</legend>
              <p>{copy.catalogueHint}</p>
              {APPLICANT_JOURNEY_LOCALES.map((code) => (
                <label key={code}>
                  <input
                    type="checkbox"
                    checked={draft.catalogueLocales.includes(code)}
                    onChange={(event) => setDraft({
                      ...draft,
                      catalogueLocales: event.target.checked
                        ? [...new Set([...draft.catalogueLocales, code])]
                        : draft.catalogueLocales.filter((item: string) => item !== code),
                    })}
                  />
                  {code}
                </label>
              ))}
            </fieldset>
          </fieldset>

          <fieldset disabled={busy || locked}>
            <legend>{copy.contactHeading}</legend>
            <label>{copy.contactName}<input required {...field("contactName")} /></label>
            <label>{copy.contactEmail}<input required type="email" {...field("contactEmail")} /></label>
            <label>{copy.contactPhone}<input type="tel" {...field("contactPhone")} /></label>
            <label>{copy.preferredLanguage}
              <select {...field("locale")}>{APPLICANT_JOURNEY_LOCALES.map((code) => <option key={code} value={code}>{code}</option>)}</select>
            </label>
            <label><input type="checkbox" checked={draft.consent} onChange={(event) => setDraft({...draft, consent: event.target.checked})} />{copy.consent}</label>
            <label><input type="checkbox" checked={draft.terms} onChange={(event) => setDraft({...draft, terms: event.target.checked})} />{copy.terms}</label>
          </fieldset>

          <fieldset disabled={busy || locked}>
            <legend>{copy.representativeHeading}</legend>
            <p>{copy.representativeLead}</p>
            <label>{copy.representationBasis}
              <select {...field("representationBasis")}>
                <option value="company">{copy.basisCompany}</option>
                <option value="sole_proprietor">{copy.basisSoleProprietor}</option>
                <option value="approved_alternative">{copy.basisAlternative}</option>
              </select>
            </label>
          </fieldset>

          <button type="submit" disabled={busy}>{busy ? copy.busy : copy.save}</button>
        </form>
      ) : null}

      {view === "documents" ? (
        <>
          <h3>{copy.documentsHeading}</h3>
          <p>{copy.documentsLead}</p>

          <section aria-label={copy.checklistHeading}>
            <h4>{copy.checklistHeading}</h4>
            {checklist?.satisfied
              ? <p role="status">{copy.checklistSatisfied}</p>
              : (
                <>
                  <p role="status">{copy.checklistMissing}</p>
                  <ul>
                    {(checklist?.missing ?? []).map((group: string) => (
                      <li key={group}>{group.split("|").map((kind) => evidenceKindLabel(copy, kind)).join(" / ")}</li>
                    ))}
                  </ul>
                </>
              )}
          </section>

          {!server?.evidenceStorageConfigured ? <p role="status">{copy.storageUnavailable}</p> : null}
          <label>{copy.documentKind}
            <select value={documentKind} onChange={(event) => setDocumentKind(event.target.value)}>
              {EVIDENCE_KIND_KEYS.map((kind) => <option key={kind} value={kind}>{evidenceKindLabel(copy, kind)}</option>)}
            </select>
          </label>
          <label>{copy.uploadDocument}
            <input
              type="file" accept="application/pdf,image/png,image/jpeg,image/webp,.docx"
              disabled={busy || !server?.evidenceStorageConfigured}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void run(() => partnerApplicationService.upload(file, documentKind), copy.savedNotice);
              }}
            />
          </label>

          <table>
            <caption>{copy.documentsHeading}</caption>
            <thead>
              <tr><th scope="col">{copy.documentKind}</th><th scope="col">{copy.statusAwaiting}</th><th scope="col">{copy.reviewerNote}</th></tr>
            </thead>
            <tbody>
              {documents.length === 0
                ? <tr><td colSpan={3}>{copy.none}</td></tr>
                : documents.map((item: any) => (
                  <tr key={item.evidenceId}>
                    <th scope="row">{evidenceKindLabel(copy, String(item.kind ?? ""))} — {item.fileName}</th>
                    <td>{documentStatusLabel(copy, String(item.verificationStatus ?? ""))}</td>
                    <td>{item.reviewReason ?? ""}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </>
      ) : null}

      {view === "agreement" ? (
        <>
          <h3>{copy.agreementHeading}</h3>
          <p>{copy.agreementLead}</p>
          <dl>
            <dt>{copy.agreementVersionLabel}</dt><dd><code>{agreement?.version ?? ""}</code></dd>
            <dt>{copy.agreementDigestLabel}</dt><dd><code>{agreement?.digest ?? ""}</code></dd>
          </dl>
          <ul>
            <li>{copy.clauseScope}</li>
            <li>{copy.clauseCommission}</li>
            <li>{copy.clauseTrial}</li>
            <li>{copy.clauseDataProtection}</li>
            <li>{copy.clauseTermination}</li>
            <li>{copy.clauseGoverningLaw}</li>
          </ul>
          <p role="note">{copy.legalPending}</p>

          <fieldset disabled={busy || locked}>
            <legend>{copy.representativeHeading}</legend>
            <label>{copy.representativeName}<input required value={representative.name} onChange={(event) => setRepresentative({...representative, name: event.target.value})} /></label>
            <label>{copy.representativeTitle}<input required value={representative.title} onChange={(event) => setRepresentative({...representative, title: event.target.value})} /></label>
            <label>{copy.representativeEmail}<input required type="email" value={representative.email} onChange={(event) => setRepresentative({...representative, email: event.target.value})} />
              <small>{copy.representativeEmailHint}</small>
            </label>
            <label>{copy.authorityDocument}
              <select value={representative.authorityEvidenceId} onChange={(event) => setRepresentative({...representative, authorityEvidenceId: event.target.value})}>
                <option value="">{copy.none}</option>
                {documents.filter((item: any) => item.verificationStatus === "verified").map((item: any) => (
                  <option key={item.evidenceId} value={item.evidenceId}>{evidenceKindLabel(copy, String(item.kind ?? ""))} — {item.fileName}</option>
                ))}
              </select>
            </label>
            <label><input type="checkbox" checked={representative.authorityConfirmed} onChange={(event) => setRepresentative({...representative, authorityConfirmed: event.target.checked})} />{copy.authorityConfirm}</label>
            <label><input type="checkbox" checked={agreementAccepted} onChange={(event) => setAgreementAccepted(event.target.checked)} />{copy.acceptCheckbox}</label>
          </fieldset>

          {application?.agreement?.receiptId ? <p role="status">{copy.agreementAccepted}</p> : null}
          <button
            type="button" disabled={busy || locked || !canAccept}
            onClick={() => void run(
              () => partnerApplicationService.acceptAgreement(
                {name: representative.name, title: representative.title, email: representative.email, authorityEvidenceId: representative.authorityEvidenceId, authorityConfirmed: true},
                {version: agreement.version, digest: agreement.digest, explicitlyAccepted: true, signerIsAuthorizedRepresentative: true},
              ),
              copy.agreementAccepted,
            )}
          >{copy.acceptButton}</button>
        </>
      ) : null}

      {view === "review" ? (
        <>
          <h3>{copy.reviewHeading}</h3>
          <p>{copy.reviewLead}</p>
          <dl>
            <dt>{copy.organization}</dt><dd>{application?.organization ?? copy.none}</dd>
            <dt>{copy.legalName}</dt><dd>{application?.organizationIdentity?.legalName ?? copy.none}</dd>
            <dt>{copy.courseName}</dt><dd>{application?.course?.name ?? copy.none}</dd>
            <dt>{copy.catalogueLocales}</dt><dd>{(application?.courseProfile?.catalogueLocales ?? []).join(", ") || copy.none}</dd>
            <dt>{copy.representativeHeading}</dt><dd>{application?.representative?.name ?? copy.none} — {application?.representative?.title ?? ""}</dd>
            <dt>{copy.representationBasis}</dt><dd>{application?.representationBasis === "sole_proprietor" ? copy.basisSoleProprietor : application?.representationBasis === "approved_alternative" ? copy.basisAlternative : copy.basisCompany}</dd>
            <dt>{copy.documentsHeading}</dt><dd>{checklist?.satisfied ? copy.checklistSatisfied : copy.checklistMissing}</dd>
            <dt>{copy.agreementHeading}</dt><dd>{application?.agreement?.receiptId ? copy.agreementAccepted : copy.none}</dd>
          </dl>
          {!canSubmit ? <p role="status">{copy.submitBlocked}</p> : null}
          <button type="button" disabled={busy || !canSubmit} onClick={() => void run(partnerApplicationService.submit, copy.savedNotice)}>{copy.submitButton}</button>
        </>
      ) : null}

      {view === "status" ? (
        <>
          <h3>{copy.statusHeading}</h3>
          <p role="status" aria-live="polite">{application?.status ? documentStatusLabelFallback(copy, String(application.status)) : copy.none}</p>
          {application?.reviewNote ? <p>{copy.reviewerNote}: {application.reviewNote}</p> : null}

          <h4>{copy.messagesHeading}</h4>
          <ol>{(server?.messages ?? []).map((item: any) => <li key={item.id}><strong>{item.sender}</strong>: {item.message}</li>)}</ol>
          <form onSubmit={(event) => {event.preventDefault(); void run(async () => {const result = await partnerApplicationService.message(message); setMessage(""); return result;}, copy.savedNotice);}}>
            <label>{copy.messageLabel}<textarea required maxLength={2000} value={message} onChange={(event) => setMessage(event.target.value)} /></label>
            <button type="submit" disabled={busy || !message.trim()}>{copy.sendMessage}</button>
          </form>

          <h4>{copy.historyHeading}</h4>
          <ol>{(server?.audits ?? []).map((item: any) => <li key={item.id}>{item.kind}</li>)}</ol>

          <h4>{copy.materialsHeading}</h4>
          <ul>{(server?.materials ?? []).length === 0 ? <li>{copy.none}</li> : server.materials.map((item: any) => <li key={item.assetId ?? item.id}>{item.title}</li>)}</ul>

          {/* Two self-contained applicant surfaces carried over from the previous journey: the
              pre-partner course onboarding entry, and the partner support desk. Each renders its
              own honest loading/unavailable state, and neither is gated on having an application
              — a course operator may start here before saving anything. */}
          <VerifiedCourseOnboarding />
          <EnterprisePartnerSupport />
        </>
      ) : null}

      {notice ? <p role={notice.tone} aria-live="polite">{notice.text}</p> : null}
    </section>
  );
}

/**
 * Application status shown as a sentence, not as a stored token. The applicant zone already
 * renders the authoritative status line; this is the in-journey echo.
 */
function documentStatusLabelFallback(copy: ApplicantJourneyCopy, status: string): string {
  if (status === "info_needed") return copy.alternativeRequested;
  if (status === "submitted" || status === "under_review") return copy.locked;
  if (status === "approved") return copy.checklistSatisfied;
  return copy.savedNotice;
}
