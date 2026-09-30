import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * A SHARED GOAL MUST NEVER BE ABLE TO MOVE YOUR SCHEDULE.
 *
 * The moment a pact can write to FSRS, the streak or the daily budget, missing a morning costs
 * somebody ELSE something — which is precisely the mechanic CLAUDE.md refuses when it rules out
 * streak unlocks, and the reason a pact is a sum toward a target rather than a shared streak.
 * It is also the posture `lib/practiceSheet.ts` and `lib/writingState.ts` already take, so this
 * is the third copy of a rule the project keeps rather than a new one.
 *
 * Comments are stripped first, for the reason `tests/writingState.test.ts` gives: both modules
 * name the very things they are firewalled FROM while explaining why, so a raw substring check
 * would fail on the documentation and push the next person to delete the explanation to get CI
 * green.
 */

const ROOT = resolve(import.meta.dirname, '..');
const strip = (src: string) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter(l => !l.trim().startsWith('//')).join('\n');

const MODULES = ['lib/pact.ts', 'lib/pactStore.ts'] as const;
const sources = Object.fromEntries(
  MODULES.map(m => [m, strip(readFileSync(resolve(ROOT, m), 'utf8'))]),
) as Record<(typeof MODULES)[number], string>;

/** Modules that can schedule, count against a budget, or move a streak. */
const FORBIDDEN_IMPORTS = [
  './fsrs', './streak', './reviewCounts', './writingState', './drillState',
  './poolAutoActivate', './curriculum',
];

/** Identifiers that WRITE something a pact has no business writing. */
const FORBIDDEN_CALLS = ['logGraded', 'fsrsSchedule', 'gradeCard', 'bumpCount', 'applyLeech', 'saveDrillCards'];

describe.each(MODULES)('%s cannot reach the scheduler', mod => {
  it.each(FORBIDDEN_IMPORTS)('does not import %s', spec => {
    expect(sources[mod]).not.toContain(`'${spec}'`);
  });

  it.each(FORBIDDEN_CALLS)('never names %s', id => {
    expect(sources[mod]).not.toContain(id);
  });
});

describe('the control', () => {
  /**
   * Without this the firewall could pass by the modules being empty, renamed or deleted — the
   * failure mode a "does not contain" test has by default.
   */
  it('is reading real modules that really do the job', () => {
    expect(sources['lib/pact.ts']).toContain('export function contributionFor');
    expect(sources['lib/pactStore.ts']).toContain('export async function publishContribution');
  });

  /**
   * READING the activity log is allowed and WRITING it is not, which is the whole distinction
   * and is easy to lose. A contribution is a recomputation over records that already exist.
   */
  it('reads the activity log without being able to add to it', () => {
    expect(sources['lib/pactStore.ts']).toContain('getActivityLog');
    expect(sources['lib/pactStore.ts']).not.toContain('logGraded');
  });

  /**
   * `set`, never an increment. An accumulating publish double-counts on every retry, which is
   * the argument `mergeActivity` makes for per-day MAX — and the property that lets this skip
   * the offline write queue entirely.
   */
  it('publishes a recomputed value rather than an increment', () => {
    const src = sources['lib/pactStore.ts'];
    expect(src).toContain('contributed: value');
    expect(src).not.toMatch(/contributed:\s*[^,\n]*\+/);
  });
});
