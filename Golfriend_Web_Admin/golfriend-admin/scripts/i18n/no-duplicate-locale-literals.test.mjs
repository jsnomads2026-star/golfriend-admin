// Guardrail (ratchet): the canonical eight-locale set must not be hard-coded in
// NEW places. `src/i18n/locales.ts` is the single source of truth. Every other
// file that still hard-codes the set is a KNOWN legacy duplicate, frozen in the
// ledger below and slated for consolidation once the coupled gates are updated.
//
// This test FAILS if a new file hard-codes the locale set (drift), and it lets
// the ledger SHRINK as consolidation proceeds (found ⊆ ledger, not ==).
// Run: node --test scripts/i18n
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src');

// The single source of truth — always allowed to define the set.
const CANONICAL_SOURCE = 'src/i18n/locales.ts';

// KNOWN legacy duplicates (pending the consolidation slice that also updates the
// gates asserting these literals: c2b/c2c/c2d/c2e/c3a/c3b + *-verify). Do not add
// to this list — new duplicates must import from the canonical source instead.
const LEGACY_LEDGER = new Set([
  'src/components/admin/booking/BookingClassifier.ts',
  'src/components/admin/booking/BookingCommissioning.d.ts',
  'src/components/admin/booking/BookingCommissioning.js',
  'src/components/admin/booking/BookingMessageComposer.tsx',
  'src/components/admin/booking/BookingReportView.tsx',
  'src/components/admin/booking/bookingReleaseReadiness.d.ts',
  'src/components/admin/booking/bookingReleaseReadiness.js',
  'src/components/admin/v2/adminNavigation.ts',
  'src/components/admin/v2/commissioningContracts.ts',
  'src/components/admin/v2/marketingLibraryModel.mjs',
  'src/components/admin/v2/partnerOperationsModel.mjs',
  'src/components/admin/v2/reportingModel.mjs',
]);

const ARRAY_LITERAL = /\[\s*'en'\s*,\s*'th'\s*,\s*'ko'\s*,\s*'ja'\s*,\s*'zh'\s*,\s*'es'\s*,\s*'fr'\s*,\s*'de'\s*\]/;
const UNION_LITERAL = /'en'\s*\|\s*'th'\s*\|\s*'ko'\s*\|\s*'ja'\s*\|\s*'zh'\s*\|\s*'es'\s*\|\s*'fr'\s*\|\s*'de'/;

function scan(dir, hits) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) scan(full, hits);
    else if (/\.(ts|tsx|js|mjs|cjs)$/.test(entry.name)) {
      const rel = ('src/' + path.relative(srcRoot, full)).split(path.sep).join('/');
      const content = fs.readFileSync(full, 'utf8');
      if (ARRAY_LITERAL.test(content) || UNION_LITERAL.test(content)) hits.add(rel);
    }
  }
}

test('canonical source of truth exists and defines the set', () => {
  const hits = new Set();
  scan(srcRoot, hits);
  assert.ok(hits.has(CANONICAL_SOURCE), `${CANONICAL_SOURCE} must define the canonical locale set`);
});

test('no NEW file hard-codes the locale set outside the canonical source', () => {
  const hits = new Set();
  scan(srcRoot, hits);
  const offenders = [...hits].filter((f) => f !== CANONICAL_SOURCE && !LEGACY_LEDGER.has(f));
  assert.deepEqual(
    offenders,
    [],
    `New hard-coded locale set(s) found — import from ${CANONICAL_SOURCE} instead:\n  ${offenders.join('\n  ')}`,
  );
});

test('legacy ledger only shrinks (consolidated files must leave the ledger)', () => {
  const hits = new Set();
  scan(srcRoot, hits);
  const stale = [...LEGACY_LEDGER].filter((f) => !hits.has(f));
  assert.deepEqual(
    stale,
    [],
    `These ledger entries no longer hard-code the set — remove them from LEGACY_LEDGER:\n  ${stale.join('\n  ')}`,
  );
});
