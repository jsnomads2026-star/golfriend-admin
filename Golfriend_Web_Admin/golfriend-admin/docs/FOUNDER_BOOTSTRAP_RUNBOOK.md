# Founder / Director bootstrap runbook

**Audience:** James (founder) and whoever holds Firebase console owner access.
**Contains no secrets.** No key, password, token or site key appears in this file.

## Why a manual step exists

Admin authority is derived **only** from a server-owned `admin_users/{uid}` document. There
is deliberately no self-service path, no email allowlist and no bootstrap code that can mint
the first Director — any of those would be a privilege-escalation path that lives forever for
the sake of one first-time setup.

So exactly one privileged write is done by a human, once, in the Firebase console. Everything
before and after it is automatic and server-authoritative.

Nothing in this repository performs that write, and nothing should be added that does.

## Step 1 — Create the sign-in identity (no authority yet)

1. Open the Admin site at its root (`/`). It routes to the Admin sign-in form.
2. Sign in with the founder work email and password.
   - If the Firebase Auth user does not exist yet, create it once in
     **Firebase console → Authentication → Users → Add user**, then sign in.
   - If the password is unknown, use **Forgot your password?** on the sign-in form. The
     notice shown is intentionally identical whether or not the address is registered.
3. Expect to land on **“Access pending.”** That is correct and means everything is working:
   authentication succeeded, and no admin record exists yet, so zero privilege was granted.

## Step 2 — Copy the authenticated UID

In **Firebase console → Authentication → Users**, find the row for the founder email and copy
its **User UID**. This is the value the authority document is keyed by. Do not use the email
address as the document ID — email is not authority here.

## Step 3 — The one manual privileged write

In **Firebase console → Firestore Database**, create a document:

- **Collection:** `admin_users`
- **Document ID:** the User UID copied in step 2 — exactly, no whitespace
- **Fields:**

| Field    | Type   | Value      |
| -------- | ------ | ---------- |
| `role`   | string | `Director` |
| `status` | string | `Active`   |

Both values are matched exactly against a canonical allowlist:

- `role` must be one of `Director`, `Manager`, `Support` — case-sensitive. `director` is
  rejected.
- `status` is normalized (NFC, trimmed, lower-cased) and must resolve to `active`. Anything
  else — `Pending`, `Suspended`, blank, unrecognized — is denied, and a *known* inactive value
  renders as “suspended” rather than “pending”.

Add any descriptive fields your team wants (name, created-by, ticket reference). They are
ignored by the authority predicate.

## Step 4 — Confirm

Return to the Admin tab. The shell re-derives authority from a live `onSnapshot` listener on
`admin_users/{uid}`, so the Admin console should appear **without signing out or reloading**.
If it does not, sign out and back in, then re-check the document ID against the UID.

Removing or suspending that document revokes access immediately, by the same listener.

## Step 5 — Calibration controls (separate, additional gate)

The Golf API calibration controls appear under **Course operations**. They require *all* of:

1. an active `Director` record (steps 1–4);
2. a real **App Check** attestation in the deployed build;
3. an online browser.

App Check is provisioned at build time with the **public, non-secret** reCAPTCHA site key in
`VITE_FIREBASE_APPCHECK_SITE_KEY`. With no site key, no attestation provider is installed, the
shell honestly reports `appCheck: false`, and the controls render a blocked notice instead of
issuing calls the server would reject. The site key is registered in
**Firebase console → App Check → Apps**; it is a public value, but it still belongs in build
configuration rather than in this repository.

The server re-checks the same authority independently on every call — App Check enforcement,
the active-Director predicate, and the rotation/receipt binding — so the client gate is an
explanation, never the thing that makes it safe.

## What this runbook must never become

- Do not add code that writes `admin_users`. The manual step is the control.
- Do not grant authority from an email address, a claim the client can set, or a build flag.
- Do not add a fallback role for “no record found”. Access pending means zero privilege.
- Do not put the reCAPTCHA site key, any API key, or any credential in this file.
