import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "../../../i18n/hooks";
import {
  COURSE_MEMBER_COPY,
  COURSE_MEMBER_LOCALES,
  type CourseMemberLocale,
} from "../../../i18n/partner/enterpriseCourseMembers";
import { organizationAuthorityService } from "../enterprise/organizationAuthorityService";
import type { EnterpriseAuthorityProjection } from "../enterprise/organizationAuthorityModel";
import {
  courseMemberService,
  newMemberCommandId,
  validCsvPreview,
  validMemberDirectory,
  type CsvPreview,
  type MemberContext,
  type MemberDirectory,
  type MemberDraft,
  type MemberState,
} from "./enterpriseCourseMemberService";
const states: MemberState[] = [
    "invitation_draft",
    "awaiting_delivery_provider",
    "invited",
    "joined",
    "active",
    "inactive",
    "change_requested",
    "conflict_review",
    "unavailable",
  ],
  button = { minHeight: 48, padding: "10px 16px" } as const;
export default function EnterpriseCourseMemberManagement() {
  const raw = useLocale() as CourseMemberLocale,
    locale = COURSE_MEMBER_LOCALES.includes(raw) ? raw : "en",
    t = COURSE_MEMBER_COPY[locale];
  const [authority, setAuthority] =
      useState<EnterpriseAuthorityProjection | null>(null),
    [scopeKey, setScopeKey] = useState(""),
    [view, setView] = useState<MemberDirectory | null>(null),
    [phase, setPhase] = useState<
      "loading" | "ready" | "offline" | "unavailable"
    >("loading"),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const [query, setQuery] = useState(""),
    [status, setStatus] = useState<MemberState | "">(""),
    [memberRef, setMemberRef] = useState(""),
    [displayName, setDisplayName] = useState(""),
    [contactReference, setContactReference] = useState(""),
    [purpose, setPurpose] = useState("course_membership"),
    [role, setRole] = useState("member"),
    [csv, setCsv] = useState(""),
    [preview, setPreview] = useState<CsvPreview | null>(null),
    [bulkConfirmed, setBulkConfirmed] = useState(false),
    [detail, setDetail] = useState<MemberDirectory | null>(null),
    [draftResult, setDraftResult] = useState<MemberDraft | null>(null);
  const commands = useRef(new Map<string, string>()),
    stable = (key: string) => {
      let id = commands.current.get(key);
      if (!id) {
        id = newMemberCommandId();
        commands.current.set(key, id);
      }
      return id;
    };
  const scopes = useMemo(
      () =>
        authority?.memberships.flatMap((m) => {
          if (
            !authority.actorMembershipIds.includes(m.membershipId) ||
            m.status !== "active" ||
            m.scope.kind !== "course" ||
            ![
              "course_manager",
              "organization_admin",
              "organization_owner",
            ].includes(m.role)
          )
            return [];
          const o = authority.organizations.find(
              (x) => x.organizationId === m.organizationId,
            ),
            p = o?.properties.find(
              (x) =>
                m.scope.kind === "course" &&
                x.propertyId === m.scope.propertyId,
            ),
            c = p?.courses.find(
              (x) =>
                m.scope.kind === "course" && x.courseId === m.scope.courseId,
            );
          return p && c
            ? [
                {
                  context: {
                    actorMembershipId: m.membershipId,
                    organizationId: m.organizationId,
                    propertyId: p.propertyId,
                    courseId: c.courseId,
                  },
                  label: `${o?.displayName} / ${p.displayName} / ${c.displayName}`,
                },
              ]
            : [];
        }) || [],
      [authority],
    ),
    context =
      scopes.find((x) => JSON.stringify(x.context) === scopeKey)?.context ||
      null;
  const load = useCallback(
    async (ctx?: MemberContext | null, cursor: string | null = null) => {
      setPhase("loading");
      try {
        let chosen = ctx;
        if (!authority) {
          const a = await organizationAuthorityService.load();
          setAuthority(a);
          const m = a.memberships.find(
            (x) =>
              a.actorMembershipIds.includes(x.membershipId) &&
              x.status === "active" &&
              x.scope.kind === "course" &&
              [
                "course_manager",
                "organization_admin",
                "organization_owner",
              ].includes(x.role),
          );
          if (m?.scope.kind === "course") {
            chosen = {
              actorMembershipId: m.membershipId,
              organizationId: m.organizationId,
              propertyId: m.scope.propertyId,
              courseId: m.scope.courseId,
            };
            setScopeKey(JSON.stringify(chosen));
          }
        }
        if (!chosen) throw Error("scope");
        const next = await courseMemberService.read(chosen, {
          search: query.trim() || undefined,
          state: status || undefined,
          cursor,
          limit: 25,
        });
        if (!validMemberDirectory(next, chosen)) throw Error("projection");
        setView(next);
        const pending = next.requests.find(
          (r) => r.status === "invitation_draft",
        );
        setDraftResult(
          pending
            ? {
                schema: next.schema,
                requestId: pending.requestId,
                status: "invitation_draft",
                version: pending.version,
                replayed: false,
                delivery: { status: "unavailable", sent: false },
              }
            : null,
        );
        setPhase("ready");
      } catch {
        setPhase(navigator.onLine ? "unavailable" : "offline");
      }
    },
    [authority, query, status],
  );
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if (context) void load(context);
  }, [scopeKey]);
  const run = async (key: string, task: (id: string) => Promise<unknown>) => {
    if (!context) return false;
    setBusy(true);
    setNotice("");
    try {
      await task(stable(key));
      commands.current.delete(key);
      setNotice(t.success);
      await load(context);
      return true;
    } catch {
      setNotice(navigator.onLine ? t.unavailable : t.offline);
      return false;
    } finally {
      setBusy(false);
    }
  };
  if (phase !== "ready" || !context || !view)
    return (
      <section aria-labelledby="members-title">
        <h2 id="members-title">{t.title}</h2>
        <p role={phase === "loading" ? "status" : "alert"} aria-live="polite">
          {phase === "loading"
            ? t.loading
            : phase === "offline"
              ? t.offline
              : t.unavailable}
        </p>
        {phase !== "loading" && (
          <button style={button} onClick={() => void load(context)}>
            {t.retry}
          </button>
        )}
      </section>
    );
  return (
    <section
      aria-labelledby="members-title"
      style={{ display: "grid", gap: 20 }}
    >
      <header>
        <h2 id="members-title">{t.title}</h2>
        <p>{t.intro}</p>
        <label>
          {t.scope}
          <select
            value={scopeKey}
            onChange={(e) => setScopeKey(e.target.value)}
          >
            {scopes.map((x) => (
              <option
                key={JSON.stringify(x.context)}
                value={JSON.stringify(x.context)}
              >
                {x.label}
              </option>
            ))}
          </select>
        </label>
      </header>
      <p role="status" aria-live="polite">
        {t.delivery}
      </p>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          void load(context);
        }}
      >
        <label>
          {t.search}
          <input
            maxLength={80}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label>
          {t.filter}
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as MemberState | "")}
          >
            <option value="">{t.all}</option>
            {states.map((x) => (
              <option key={x} value={x}>
                {t.states[x]}
              </option>
            ))}
          </select>
        </label>
        <button style={button}>{t.search}</button>
      </form>
      <section aria-labelledby="directory">
        <h3 id="directory">{t.directory}</h3>
        {!view.members.length ? (
          <p>{t.empty}</p>
        ) : (
          <div
            role="region"
            aria-label={t.directory}
            tabIndex={0}
            style={{ overflowX: "auto" }}
          >
            <table>
              <thead>
                <tr>
                  <th>{t.member}</th>
                  <th>{t.role}</th>
                  <th>{t.status}</th>
                  <th>{t.updated}</th>
                  <th>{t.change}</th>
                </tr>
              </thead>
              <tbody>
                {view.members.map((m) => (
                  <tr key={m.memberReference}>
                    <th scope="row">
                      <button
                        style={button}
                        onClick={() =>
                          void courseMemberService
                            .detail(context, m.memberReference)
                            .then(setDetail)
                            .catch(() => setNotice(t.unavailable))
                        }
                      >
                        {m.displayName}
                      </button>
                    </th>
                    <td>
                      {m.role ? (
                        <>
                          {t.role}: <code>{m.role}</code>
                        </>
                      ) : (
                        t.unavailable
                      )}
                    </td>
                    <td>{t.states[m.state]}</td>
                    <td>
                      <time dateTime={m.updatedAt}>{m.updatedAt}</time>
                    </td>
                    <td>
                      {["joined", "active", "inactive"].includes(m.state) && (
                        <label>
                          {t.requestedRole}
                          <select
                            value={role}
                            onChange={(e) => setRole(e.target.value)}
                          >
                            {view.policy.roles.map((x) => (
                              <option key={x} value={x}>
                                {t.role} · {x}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      {["joined", "active", "inactive"].includes(m.state) && (
                        <button
                          style={button}
                          disabled={busy}
                          onClick={() =>
                            void run(`status:${m.memberReference}`, (id) =>
                              courseMemberService.requestChange(context, id, {
                                memberReference: m.memberReference,
                                currentMemberVersion: m.version,
                                currentCourseVersion: view.courseVersion,
                                type:
                                  m.state === "inactive"
                                    ? "reactivate"
                                    : "deactivate",
                                locale,
                                purpose,
                              }),
                            )
                          }
                        >
                          {m.state === "inactive" ? t.reactivate : t.deactivate}
                        </button>
                      )}
                      {["joined", "active", "inactive"].includes(m.state) && (
                        <button
                          style={button}
                          disabled={busy || !role.trim()}
                          onClick={() =>
                            void run(`role:${m.memberReference}`, (id) =>
                              courseMemberService.requestChange(context, id, {
                                memberReference: m.memberReference,
                                currentMemberVersion: m.version,
                                currentCourseVersion: view.courseVersion,
                                type: "role_change",
                                requestedRole: role.trim(),
                                locale,
                                purpose,
                              }),
                            )
                          }
                        >
                          {t.roleChange}
                        </button>
                      )}
                      {["awaiting_delivery_provider", "invited"].includes(
                        m.state,
                      ) && (
                        <button
                          style={button}
                          disabled={busy}
                          onClick={() => {
                            setBusy(true);
                            void courseMemberService
                              .draftResend(
                                context,
                                stable(`resend:${m.memberReference}`),
                                {
                                  memberReference: m.memberReference,
                                  currentMemberVersion: m.version,
                                  locale,
                                  purpose,
                                  currentCourseVersion: view.courseVersion,
                                },
                              )
                              .then(setDraftResult)
                              .catch(() => setNotice(t.unavailable))
                              .finally(() => setBusy(false));
                          }}
                        >
                          {t.resend}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {view.nextCursor && (
          <button
            style={button}
            onClick={() => void load(context, view.nextCursor)}
          >
            {t.next}
          </button>
        )}
        {detail && (
          <dialog
            open
            aria-label={t.detail}
            onKeyDown={(e) => {
              if (e.key === "Escape") setDetail(null);
            }}
          >
            <h4>{t.detail}</h4>
            <p>
              {detail.members[0]?.displayName} ·{" "}
              {detail.members[0]
                ? t.states[detail.members[0].state]
                : t.unavailable}{" "}
              · v{detail.members[0]?.version}
            </p>
            <button style={button} onClick={() => setDetail(null)}>
              {t.close}
            </button>
          </dialog>
        )}
      </section>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          void courseMemberService
            .draftInvitation(context, stable("invite-draft"), {
              memberReference: memberRef.trim(),
              displayName: displayName.trim(),
              contactReference: contactReference.trim(),
              locale,
              purpose,
              currentCourseVersion: view.courseVersion,
            })
            .then(setDraftResult)
            .catch(() => setNotice(t.unavailable))
            .finally(() => setBusy(false));
        }}
      >
        <fieldset disabled={busy}>
          <legend>{t.invite}</legend>
          <label>
            {t.reference}
            <input
              required
              maxLength={128}
              value={memberRef}
              onChange={(e) => setMemberRef(e.target.value)}
            />
          </label>
          <label>
            {t.displayName}
            <input
              required
              maxLength={120}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </label>
          <label>
            {t.contactReference}
            <input
              required
              maxLength={128}
              value={contactReference}
              onChange={(e) => setContactReference(e.target.value)}
            />
          </label>
          <label>
            {t.purpose}
            <input
              required
              maxLength={500}
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
            />
          </label>
          <button style={button}>{t.saveDraft}</button>
        </fieldset>
      </form>
      {draftResult && (
        <aside role="status">
          <p>
            {t.confirmWarning} · <code>{draftResult.requestId}</code> · v
            {draftResult.version}
          </p>
          <button
            style={button}
            disabled={busy}
            onClick={() =>
              void run(`submit:${draftResult.requestId}`, (id) =>
                courseMemberService.submitInvitation(
                  context,
                  id,
                  draftResult.requestId,
                  draftResult.version,
                ),
              ).then((ok) => {
                if (ok) setDraftResult(null);
              })
            }
          >
            {t.confirm}
          </button>
        </aside>
      )}
      <section aria-labelledby="csv">
        <h3 id="csv">{t.csv}</h3>
        <p>{t.csvSchema}</p>
        <textarea
          aria-label={t.csv}
          maxLength={65536}
          rows={8}
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
        />
        <button
          style={button}
          disabled={busy || !csv.trim()}
          onClick={() =>
            void (async () => {
              setBusy(true);
              try {
                const next = await courseMemberService.previewCsv(
                  context,
                  stable("preview"),
                  csv,
                  view.courseVersion,
                );
                if (!validCsvPreview(next, view.courseVersion))
                  throw Error("preview");
                setPreview(next);
                commands.current.delete("preview");
                setBulkConfirmed(false);
              } catch {
                setNotice(t.unavailable);
              } finally {
                setBusy(false);
              }
            })()
          }
        >
          {t.preview}
        </button>
        {preview && (
          <>
            <h4>{t.duplicates}</h4>
            <ul>
              {preview.rows.map((r) => (
                <li key={r.row}>
                  {r.row}. {r.displayName} —{" "}
                  {r.result ? t.results[r.result] : t.valid}
                </li>
              ))}
            </ul>
            <p role="alert">{t.confirmWarning}</p>
            <label>
              <input
                type="checkbox"
                checked={bulkConfirmed}
                onChange={(e) => setBulkConfirmed(e.target.checked)}
              />
              {t.bulkAcknowledge}
            </label>
            <button
              style={button}
              disabled={busy || !bulkConfirmed}
              onClick={() =>
                void run(`import:${preview.previewId}`, (id) =>
                  courseMemberService.confirmCsv(context, {
                    commandId: id,
                    previewId: preview.previewId,
                    confirmed: true,
                    currentCourseVersion: view.courseVersion,
                  }),
                )
              }
            >
              {t.confirm}
            </button>
          </>
        )}
      </section>
      <section aria-labelledby="member-requests">
        <h3 id="member-requests">{t.change}</h3>
        {view.requests.length ? (
          <ul>
            {view.requests.map((r) => (
              <li key={r.requestId}>
                <code>{r.requestId}</code> · {t.states[r.status]} · v{r.version}
                {r.expiresAt && (
                  <>
                    {" "}
                    · <time dateTime={r.expiresAt}>{r.expiresAt}</time>
                  </>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p>{t.empty}</p>
        )}
      </section>
      {view.receipts.length > 0 && (
        <section aria-labelledby="member-receipts">
          <h3 id="member-receipts">{t.receipts}</h3>
          <ul>
            {view.receipts.map((r) => (
              <li key={r.receiptId}>
                <code>{r.receiptId}</code> · {t.receipts}:{" "}
                <code>{r.action}</code> ·{" "}
                <time dateTime={r.occurredAt}>{r.occurredAt}</time>
              </li>
            ))}
          </ul>
        </section>
      )}
      {notice && (
        <p
          role={notice === t.success ? "status" : "alert"}
          aria-live="assertive"
        >
          {notice}
        </p>
      )}
    </section>
  );
}
