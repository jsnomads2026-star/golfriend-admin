export interface FirebaseTarget {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

export const V1_CONFIG: FirebaseTarget;
export const PRECOMMISSION_CONFIG: FirebaseTarget;
export const V1_FORBIDDEN: string[];
export function resolveFirebaseTarget(
  mode: string,
  env?: Record<string, string | undefined>,
): FirebaseTarget;
export interface EmulatorEndpoints {
  host: string;
  ports: { auth: number; firestore: number; functions: number; storage: number };
}
export function resolveEmulatorEndpoints(
  mode: string,
  env?: Record<string, string | undefined>,
): EmulatorEndpoints | null;
export function findV1Leaks(cfg: Record<string, unknown>): Array<[string, string]>;
