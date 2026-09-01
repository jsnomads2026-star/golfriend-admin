// Strict callable App Check proof. This invokes the firebase-functions onCall
// wrapper through Express, without the emulator-only verifier bypass used by
// the separate synthetic-valid-token test.
import assert from "node:assert";
import express from "express";
import {partnerGetApplication} from "./partnerAuthority.js";

async function invoke(appCheckToken?: string) {
  const app = express();
  app.use(express.json());
  app.post("/", partnerGetApplication as any);
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind a TCP port.");
    const response = await fetch(`http://127.0.0.1:${address.port}/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(appCheckToken ? {"X-Firebase-AppCheck": appCheckToken} : {}),
      },
      body: JSON.stringify({data: {applicationId: "partner_appcheck_runtime_0001"}}),
    });
    return response.status;
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function main() {
  assert.equal(await invoke(), 401, "missing App Check must be rejected before the callable handler");
  assert.equal(await invoke("malformed-app-check-token"), 401, "invalid App Check must be rejected before the callable handler");
  console.log("Partner Authority strict App Check runtime proof PASS: missing and malformed tokens receive 401 before Partner Authority reads or writes.");
}

main().catch((error) => { console.error(error); process.exit(1); });
