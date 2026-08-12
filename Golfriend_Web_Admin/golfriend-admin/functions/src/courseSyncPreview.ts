import { classifyCourseSync, type CourseRecord, type ProviderCourse, type SyncResult } from './courseSync.js';

export interface PreviewTarget {
  courseId: string;
  existing: CourseRecord;
}

export type SyntheticProviderOutcome =
  | { kind: 'response'; course: ProviderCourse | null }
  | { kind: 'failed'; message: string };

export interface SyntheticPreviewTarget {
  projectId: string;
  functionsHost: string;
  firestoreHost: string;
}

export function assertEmulatorOnlyPreviewTarget(target: SyntheticPreviewTarget): void {
  const loopback = /^(?:localhost|127\.0\.0\.1):\d+$/;
  if (!target.projectId.startsWith('demo-') || !loopback.test(target.functionsHost) || !loopback.test(target.firestoreHost)) {
    throw new Error('Synthetic preview harness requires a demo-* project and loopback emulator hosts.');
  }
}

export interface PreviewResultRow {
  courseId: string;
  result: SyncResult;
  message: string;
  before: { latitude: number | null; longitude: number | null };
  after?: { latitude: number; longitude: number };
}

/**
 * Shared preview-only decision seam used by syncCoursesFromProvider and the
 * emulator/synthetic harness. It has no database or network dependency and
 * cannot accept apply mode, so production writes are impossible here.
 */
export function runSyncCoursesFromProviderPreview(
  mode: 'preview',
  targets: PreviewTarget[],
  outcomes: ReadonlyMap<string, SyntheticProviderOutcome>,
): { mode: 'preview'; processed: number; productionWrites: 0; results: PreviewResultRow[] } {
  if (mode !== 'preview') throw new Error('Synthetic preview seam accepts preview mode only.');

  const results = targets.map((target): PreviewResultRow => {
    const outcome = outcomes.get(target.courseId);
    if (!outcome || outcome.kind === 'failed') {
      const beforeDecision = classifyCourseSync(target.courseId, target.existing, null);
      return {
        courseId: target.courseId,
        result: 'error',
        message: outcome?.kind === 'failed' ? `Provider failed: ${outcome.message}` : 'Provider outcome unavailable.',
        before: beforeDecision.before,
      };
    }

    const decision = classifyCourseSync(target.courseId, target.existing, outcome.course);
    return { courseId: target.courseId, ...decision };
  });

  return { mode: 'preview', processed: results.length, productionWrites: 0, results };
}
