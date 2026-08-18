// EMULATOR-ONLY SHIM. Not product code, and never loaded by a deployed function.
//
// Why this exists
// ---------------
// firebase-tools' Functions emulator replaces the `firebase-admin` module with a Proxy and,
// for the namespace accessors, returns `Proxied.getOriginal(target, key)`:
//
//   static getOriginal(target, key) {
//     const value = target[key];
//     if (Proxied.isConstructor(value) || typeof value !== "function") return value;
//     return value.bind(target);                       // <-- drops own properties
//   }
//   static isConstructor(obj) { return !!obj.prototype && !!obj.prototype.constructor.name; }
//
// In firebase-admin v13 `admin.firestore`, `admin.auth`, `admin.storage` and `admin.database`
// are functions WITHOUT a `.prototype`. So `isConstructor` is false, they are `.bind()`-ed,
// and `Function.prototype.bind` returns a fresh function that carries none of the original's
// own properties. The result is that inside the Functions emulator:
//
//   admin.firestore.FieldValue   === undefined
//   admin.firestore.Timestamp    === undefined
//   admin.firestore.FieldPath    === undefined
//
// so any handler calling `admin.firestore.FieldValue.serverTimestamp()` throws
// "Cannot read properties of undefined (reading 'serverTimestamp')". That code is correct and
// works in production; the emulator proxy is what breaks it.
//
// This shim gives those accessors a named `prototype` BEFORE the emulator wraps the module, so
// `isConstructor` reports true and the original function object is passed through untouched,
// statics intact. It changes nothing about the functions' behaviour or authority.
//
// Loaded via NODE_OPTIONS=--require for emulator runs only.

const path = require('node:path');

function shim() {
  let adminPath;
  try {
    adminPath = require.resolve('firebase-admin', {
      paths: [path.join(__dirname, '..', 'functions'), path.join(__dirname, '..'), process.cwd()],
    });
  } catch {
    return; // firebase-admin is not resolvable from this process (e.g. the CLI itself)
  }

  let admin;
  try { admin = require(adminPath); } catch { return; }

  // These accessors are not own properties and manufacture a NEW function on every read, so
  // patching the value you just read is lost on the next access. Pin one instance as an own
  // property, then give that instance a named prototype.
  for (const key of ['firestore', 'auth', 'storage', 'database', 'messaging', 'appCheck', 'remoteConfig', 'installations', 'machineLearning', 'projectManagement', 'securityRules']) {
    let accessor;
    try { accessor = admin[key]; } catch { continue; }
    if (typeof accessor !== 'function' || accessor.prototype) continue;
    try {
      // A named constructor on the prototype is exactly what Proxied.isConstructor tests for.
      const holder = function () {};
      Object.defineProperty(holder, 'name', {value: key, configurable: true});
      Object.defineProperty(accessor, 'prototype', {value: {constructor: holder}, writable: false, enumerable: false, configurable: true});
      Object.defineProperty(admin, key, {value: accessor, writable: true, enumerable: true, configurable: true});
    } catch {
      // Non-configurable accessor: leave it alone rather than half-patching it.
    }
  }
}

shim();
