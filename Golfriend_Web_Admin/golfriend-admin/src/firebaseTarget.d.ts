export interface FirebaseTarget {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

export const V1_CONFIG: FirebaseTarget;
export const V1_FORBIDDEN: string[];
export function resolveFirebaseTarget(
  mode: string,
  env?: Record<string, string | undefined>,
): FirebaseTarget;
export function findV1Leaks(cfg: Record<string, unknown>): Array<[string, string]>;
