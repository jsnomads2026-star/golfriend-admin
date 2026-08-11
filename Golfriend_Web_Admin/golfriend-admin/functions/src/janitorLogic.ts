// ==========================================
// FILE: functions/src/janitorLogic.ts
// Pure, deterministic core for the weekly course-deduplication janitor. Contains
// NO Firestore/network access — it plans which duplicate `courses` docs may be
// purged, given the full set. Hardened per issue #19:
//   - NEVER plans deletion of a manually-locked / trusted course;
//   - FAILS CLOSED on ambiguous duplicate groups (skips, never guesses);
//   - deterministic winner selection (order-independent, total ordering);
//   - preserves last-known-good (most-complete / trusted record is kept);
//   - emits bounded audit records for every group decision.
// Tested by janitorLogic.test.ts. The scheduled job is a thin wrapper; it is
// never executed in tests.
// ==========================================

export interface CourseRec {
  docId: string;
  clubID?: string;
  clubName?: string;
  manualLock?: boolean;
  trusted?: boolean;
  gpsSource?: string;
  requiresManualGPS?: boolean;
  createdAt?: number | string;
  [k: string]: unknown;
}

export interface AuditRecord {
  identifier: string;
  action: 'kept_singleton' | 'purge_planned' | 'skipped_ambiguous';
  reason?: string;
  kept: string | null;
  deleted: string[];
}

export interface PurgePlan {
  toDelete: string[];
  keep: Record<string, string>;
  ambiguous: { identifier: string; reason: string; docIds: string[] }[];
  audit: AuditRecord[];
  skippedNoIdentifier: string[];
}

/** A record is protected from deletion if it is manually locked or trusted. */
export function isLocked(c: CourseRec | null | undefined): boolean {
  return !!c && (
    c.manualLock === true
    || c.trusted === true
    || c.requiresManualGPS === true
    || c.gpsSource === 'manual'
  );
}

/** Revalidate a planned deletion against the transaction-time document. */
export function canDeletePlannedCourse(
  plannedDocId: string,
  current: CourseRec | null | undefined,
): boolean {
  return !!current && current.docId === plannedDocId && !isLocked(current);
}

/** The dedup identifier; null when neither clubID nor clubName is a usable string. */
export function identifierOf(c: CourseRec): string | null {
  const id = (typeof c.clubID === 'string' && c.clubID.trim()) ? c.clubID
    : (typeof c.clubName === 'string' && c.clubName.trim()) ? c.clubName
    : null;
  return id ? id.trim() : null;
}

// Fixed field list → deterministic "completeness" (last-known-good) score.
const SIGNAL_FIELDS = ['clubName', 'clubID', 'latitude', 'longitude', 'address', 'imageUrl', 'holes', 'par'];
function completeness(c: CourseRec): number {
  let n = 0;
  for (const f of SIGNAL_FIELDS) {
    const v = c[f];
    if (v !== undefined && v !== null && v !== '' && !(typeof v === 'number' && Number.isNaN(v))) n += 1;
  }
  return n;
}

function createdAtKey(c: CourseRec): number {
  const v = c.createdAt;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') { const t = Date.parse(v); return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t; }
  return Number.MAX_SAFE_INTEGER; // unknown createdAt sorts last (prefer records with a known age)
}

// Total, order-independent ordering: most complete → oldest → lexicographically
// smallest docId. docId is unique, so this is always a strict deterministic winner.
function betterFirst(a: CourseRec, b: CourseRec): number {
  const ca = completeness(a), cb = completeness(b);
  if (ca !== cb) return cb - ca;
  const ta = createdAtKey(a), tb = createdAtKey(b);
  if (ta !== tb) return ta - tb;
  return a.docId < b.docId ? -1 : a.docId > b.docId ? 1 : 0;
}

/**
 * Plan the safe subset of duplicate `courses` docs to purge.
 * Deletion is planned ONLY for non-locked losers of an unambiguous group.
 */
export function planDuplicatePurge(courses: CourseRec[]): PurgePlan {
  const groups = new Map<string, CourseRec[]>();
  const skippedNoIdentifier: string[] = [];
  for (const c of courses) {
    const id = identifierOf(c);
    if (!id) { skippedNoIdentifier.push(c.docId); continue; } // never delete a record we cannot key
    const arr = groups.get(id);
    if (arr) arr.push(c); else groups.set(id, [c]);
  }

  const toDelete: string[] = [];
  const keep: Record<string, string> = {};
  const ambiguous: { identifier: string; reason: string; docIds: string[] }[] = [];
  const audit: AuditRecord[] = [];

  // Iterate identifiers in sorted order for deterministic output.
  for (const id of [...groups.keys()].sort()) {
    const group = groups.get(id)!;
    if (group.length === 1) {
      keep[id] = group[0].docId;
      audit.push({ identifier: id, action: 'kept_singleton', kept: group[0].docId, deleted: [] });
      continue;
    }
    const locked = group.filter(isLocked);
    // FAIL CLOSED: more than one manual lock in a duplicate group is ambiguous.
    if (locked.length > 1) {
      const docIds = group.map((g) => g.docId).sort();
      ambiguous.push({ identifier: id, reason: 'multiple_manual_locks', docIds });
      audit.push({ identifier: id, action: 'skipped_ambiguous', reason: 'multiple_manual_locks', kept: null, deleted: [] });
      continue;
    }
    // Deterministic winner: the single locked/trusted record if present, else the
    // most-complete (last-known-good) record by the total ordering above.
    const winner = locked.length === 1 ? locked[0] : [...group].sort(betterFirst)[0];
    const losers = group.filter((g) => g.docId !== winner.docId);
    // Safety: never delete a locked record even if it is not the winner.
    if (losers.some(isLocked)) {
      const docIds = group.map((g) => g.docId).sort();
      ambiguous.push({ identifier: id, reason: 'locked_non_winner', docIds });
      audit.push({ identifier: id, action: 'skipped_ambiguous', reason: 'locked_non_winner', kept: null, deleted: [] });
      continue;
    }
    const deleted = losers.map((l) => l.docId).sort();
    keep[id] = winner.docId;
    toDelete.push(...deleted);
    audit.push({ identifier: id, action: 'purge_planned', kept: winner.docId, deleted });
  }

  return { toDelete: toDelete.sort(), keep, ambiguous, audit, skippedNoIdentifier: skippedNoIdentifier.sort() };
}
