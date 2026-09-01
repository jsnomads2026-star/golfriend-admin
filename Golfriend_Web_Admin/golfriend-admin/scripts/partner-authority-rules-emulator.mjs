// Browser-SDK rules proof against the local Auth + Firestore emulators only.
import assert from "node:assert/strict";
import {initializeApp, deleteApp} from "firebase/app";
import {getAuth, connectAuthEmulator, signInAnonymously} from "firebase/auth";
import {getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, terminate} from "firebase/firestore";

const app = initializeApp({apiKey: "demo-partner-authority", authDomain: "demo-partner-authority.local", projectId: process.env.GCLOUD_PROJECT || "demo-partner-authority"}, "partner-authority-rules");
const auth = getAuth(app);
const firestore = getFirestore(app);
connectAuthEmulator(auth, "http://127.0.0.1:9099", {disableWarnings: true});
connectFirestoreEmulator(firestore, "127.0.0.1", 8080);
await signInAnonymously(auth);

const partnerRef = doc(firestore, "partner_applications", "direct_browser_attempt");
await assert.rejects(() => getDoc(partnerRef), (error) => error?.code === "permission-denied");
await assert.rejects(() => setDoc(partnerRef, {state: "approved", ownerUid: auth.currentUser?.uid}), (error) => error?.code === "permission-denied");
await terminate(firestore);
await deleteApp(app);
console.log("Partner Authority Firestore Rules emulator proof PASS: authenticated browser direct read and write are denied.");
