import type { AdminIdentity } from './AdminIdentityContext';

export const CALIBRATION_ROLE: string;
export function calibrationControlsAvailable(identity?: AdminIdentity | null): boolean;
export function calibrationBlockedReason(identity?: AdminIdentity | null): 'director' | 'attestation' | 'offline' | null;
