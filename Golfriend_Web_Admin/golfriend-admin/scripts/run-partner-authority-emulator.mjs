import {spawnSync} from "node:child_process";

// This is deliberately test-runner-only. It allows firebase-functions to
// decode synthetic App Check tokens in the local demo emulator; deployed
// Functions never receive FIREBASE_DEBUG_FEATURES and enforce App Check.
const firebaseCliPath = process.env.FIREBASE_CLI_PATH;
const firebase = firebaseCliPath ? process.execPath : (process.platform === "win32" ? "firebase.cmd" : "firebase");
const node = JSON.stringify(process.execPath);
const local = (args) => spawnSync(process.execPath, args, {cwd: process.cwd(), stdio: "inherit"});
const execute = (command, debugFeatures) => {
  const result = spawnSync(firebase, [
    ...(firebaseCliPath ? [firebaseCliPath] : []),
    "--config", "firebase.partner-authority.test.json",
    "emulators:exec",
    "--project", "demo-partner-authority",
    "--only", "auth,firestore,functions,storage",
    command,
  ], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: {...process.env, ...(debugFeatures ? {FIREBASE_DEBUG_FEATURES: debugFeatures} : {})},
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
};

const compile = local(["functions/node_modules/typescript/bin/tsc", "--project", "functions/tsconfig.json"]);
if (compile.error) throw compile.error;
if ((compile.status ?? 1) !== 0) process.exitCode = compile.status ?? 1;
else {
  // First, use the ordinary firebase-functions verifier for missing and
  // malformed tokens. This test never starts the emulator bypass.
  const strict = local(["functions/lib/partnerAuthority.appCheck.runtime.test.js"]);
  if (strict.error) throw strict.error;
  if ((strict.status ?? 1) !== 0) {
    process.exitCode = strict.status ?? 1;
  } else {
    // Then isolate synthetic valid-token coverage. This bypass is never present
    // in production and is not written to firebase.json or Function options.
    process.exitCode = execute(
      `${node} functions/lib/partnerAuthority.emulator.test.js && ${node} functions/lib/partnerAuthority.callables.emulator.test.js && ${node} scripts/partner-authority-rules-emulator.mjs && ${node} functions/lib/partnerEvidenceStorage.emulator.test.js`,
      JSON.stringify({skipTokenVerification: true}),
    );
  }
}
