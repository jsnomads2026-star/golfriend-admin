export type MemberCourseRequest = {
  id: string; name: string; location: string; requestCount: number; requestedAtMs: number | null;
  status: string; providerClubId: string | null; providerCourseId: string | null; receiptId: string | null; error: string | null;
};
export function requestStatus(row: Record<string, unknown>): string;
export function projectMemberCourseRequests(rows?: Array<Record<string, unknown>>): MemberCourseRequest[];
