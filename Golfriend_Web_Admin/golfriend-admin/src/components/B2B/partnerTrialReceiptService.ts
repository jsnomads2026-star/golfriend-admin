import {getFunctions, httpsCallable} from "firebase/functions";

// Thin transport only. Every value shown to a human comes from the stored receipt sealed by
// the activation transaction; nothing here derives, totals or reformats an amount.

export interface TrialReceiptLine {
  kind: string; description: string; reference: string | null; currency: string;
  normalMinor: number; discountMinor: number; dueMinor: number; discountReason: string | null;
}

export interface TrialReceiptResult {
  schema: string;
  state: "ready" | "unavailable";
  reason: string | null;
  trial: {
    organizationId: string; tier: "small_business" | "enterprise";
    startsAt: string; endsAt: string; days: number; cancelledAt: string | null;
  } | null;
  statement: {
    statementId: string; statementNumber: string; organizationId: string; applicationId: string;
    tier: "small_business" | "enterprise"; pricingPolicyVersion: string;
    trialStartsAt: string; trialEndsAt: string; trialDays: number;
    agreementVersion: string; agreementDigest: string; currency: string;
    lines: TrialReceiptLine[];
    totals: {normalMinor: number; discountMinor: number; dueMinor: number; taxMinor: number; payableMinor: number};
    basis: Record<string, unknown>;
    issueMode: string; issueReason: string;
    tax: {state: string; jurisdiction: string | null; treatment: string | null; rateBps: number | null; collected: boolean};
    externalMoneyBoundary: string; legalReviewComplete: boolean; immutable: boolean;
    receiptDigest: string;
  } | null;
  verification: {valid: boolean; reason: string} | null;
}

/** Distinguishes "the service failed" from "the server says this receipt is untrustworthy". */
export type TrialReceiptState = TrialReceiptResult | {state: "error"; reason: "offline" | "unavailable" | "unknown"; trial: null; statement: null; verification: null; schema: string};

const call = async (name: string, payload: Record<string, unknown>): Promise<TrialReceiptState> => {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return {state: "error", reason: "offline", trial: null, statement: null, verification: null, schema: ""};
  }
  try {
    const result = await httpsCallable(getFunctions(), name)(payload);
    const data = result.data as TrialReceiptResult;
    // A response that is not the expected contract is treated as unavailable, never rendered.
    if (!data || (data.state !== "ready" && data.state !== "unavailable")) {
      return {state: "error", reason: "unknown", trial: null, statement: null, verification: null, schema: ""};
    }
    return data;
  } catch {
    // Raw provider errors are never surfaced.
    return {state: "error", reason: "unavailable", trial: null, statement: null, verification: null, schema: ""};
  }
};

export const partnerTrialReceiptService = {
  /** Portal: the caller's own organization. The server rejects any other. */
  mine: (organizationId?: string) => call("getPartnerTrialReceiptV1", organizationId ? {organizationId} : {}),
  /** Admin: any organization, same stored document. */
  forOrganization: (organizationId: string) => call("getAdminPartnerTrialReceiptV1", {organizationId}),
  /**
   * Portal: cancel the caller's own trial. Zero due, immediate stop, and a read-only/export
   * window — all decided by the server. The sealed statement is never rewritten.
   */
  cancel: async () => {
    await httpsCallable(getFunctions(), "cancelPartnerTrialV1")({commandId: crypto.randomUUID().replaceAll("-", "_")});
  },
};
