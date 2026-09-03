import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { mergeActivity, type DayActivity } from '@/lib/activityLog';

/**
 * Cross-device sync: the merge rules, and the schema that has to be able to hold them.
 *
 * These are pure functions and one file read, which is the only kind of thing this suite
 * covers — the sync itself is verified against a real database by hand, because the failure
 * that made this feature necessary was invisible to any amount of local testing.
 */

const day = (d: string, n: number): DayActivity => ({ d, n });

describe('the schema can hold every column the code writes', () => {
  /**
   * THE TEST THAT WOULD HAVE CAUGHT THE ORIGINAL BUG.
   *
   * `decks`, `shelf` and `passage_state` were named in TypeScript and created only by
   * `alter table` statements written inside a comment. The live project had them applied by
   * hand; `schema.sql` never learned about them; every database built from the repo silently
   * stored nothing, for all four languages, because `saveVocabDeck` writes `decks` and never
   * the legacy `deck`. Reading both files and comparing them is cheap and catches exactly
   * that drift the next time a column is added in one place only.
   */
  const root = resolve(__dirname, '..');
  const schema = readFileSync(resolve(root, 'supabase/schema.sql'), 'utf8');
  /**
   * EVERY migration, not a named one.
   *
   * This read `0001_sync_columns.sql` by filename, which quietly made the test a gate against
   * ever adding a second migration: `review_counts` arrived in `0002` and was reported as
   * having no migration at all. A rule about "the migrations directory" has to read the
   * directory.
   */
  const migrations = readdirSync(resolve(root, 'supabase/migrations'))
    .filter(f => f.endsWith('.sql'))
    .sort()
    .map(f => readFileSync(resolve(root, 'supabase/migrations', f), 'utf8'))
    .join('\n');
  const source = readFileSync(resolve(root, 'lib/storage/supabase.ts'), 'utf8');

  /** The `interface UserDataRow { ... }` body, which is the list of columns this code uses. */
  const rowBody = /interface UserDataRow \{([\s\S]*?)\n\}/.exec(source)?.[1] ?? '';
  const columns = [...rowBody.matchAll(/^\s{2}(\w+)\??:/gm)].map(m => m[1]);

  it('finds the column list to check against', () => {
    // Guards the regex itself: a refactor that renamed the interface would otherwise make
    // every assertion below vacuously pass.
    expect(columns.length).toBeGreaterThanOrEqual(8);
    expect(columns).toContain('decks');
  });

  it('creates every column in schema.sql', () => {
    // Strip `--` comments FIRST. An inline one reading "(= Chinese);" ends the non-greedy
    // capture early, which silently shrinks the block being checked — a test that quietly
    // stops testing is worse than no test.
    const sql = schema.replace(/--[^\n]*/g, '');
    const createBlock = /create table if not exists public\.user_data \(([\s\S]*?)\);/.exec(sql)?.[1] ?? '';
    expect(createBlock, 'could not find the user_data create statement').not.toBe('');
    const missing = columns.filter(c => !new RegExp(`^\\s*${c}\\s`, 'm').test(createBlock));
    expect(missing, `columns in UserDataRow but not in schema.sql: ${missing.join(', ')}`).toEqual([]);
  });

  it('adds every non-original column in a migration, for projects that already exist', () => {
    // `deck`, `prefs` and `srs_state` shipped in the first schema, so no migration adds them.
    const original = new Set(['deck', 'prefs', 'srs_state']);
    const needed = columns.filter(c => !original.has(c));
    const missing = needed.filter(c => !migrations.includes(`add column if not exists ${c} `));
    expect(missing, `columns with no migration: ${missing.join(', ')}`).toEqual([]);
  });

  it('keeps every migration idempotent, so re-running is safe', () => {
    const alters = migrations.match(/^alter table.*$/gm) ?? [];
    expect(alters.length).toBeGreaterThan(0);
    for (const a of alters) expect(a, a).toContain('add column if not exists');
  });
});

describe('activity logs merge per-day MAX, not sum', () => {
  it('takes the larger count for a day both devices recorded', () => {
    expect(mergeActivity([day('2026-08-01', 3)], [day('2026-08-01', 7)]))
      .toEqual([day('2026-08-01', 7)]);
  });

  it('keeps days only one device has', () => {
    expect(mergeActivity([day('2026-08-01', 3)], [day('2026-08-02', 5)]))
      .toEqual([day('2026-08-01', 3), day('2026-08-02', 5)]);
  });

  /**
   * The property the whole choice rests on. A device writes its merged log back, so the cloud
   * then holds the merge; merging again must not grow it. SUM fails this — a+b then +b again
   * gives a+2b — and a heatmap that inflates every time you switch devices is worse than one
   * that undercounts.
   */
  it('is idempotent, so a round trip cannot inflate it', () => {
    const a = [day('2026-08-01', 3), day('2026-08-02', 9)];
    const b = [day('2026-08-01', 7), day('2026-08-03', 2)];
    const once = mergeActivity(a, b);
    expect(mergeActivity(once, b)).toEqual(once);
    expect(mergeActivity(once, a)).toEqual(once);
    expect(mergeActivity(once, once)).toEqual(once);
  });

  it('never loses a day and never exceeds the larger side', () => {
    const a = [day('2026-08-01', 3), day('2026-08-02', 9)];
    const b = [day('2026-08-01', 7)];
    const merged = mergeActivity(a, b);
    for (const src of [...a, ...b]) {
      const got = merged.find(e => e.d === src.d);
      expect(got, `day ${src.d} was dropped`).toBeDefined();
      expect(got!.n).toBeGreaterThanOrEqual(src.n);
    }
    const ceiling = Math.max(...[...a, ...b].map(e => e.n));
    for (const e of merged) expect(e.n).toBeLessThanOrEqual(ceiling);
  });

  it('sorts oldest first, whatever order the two sides arrived in', () => {
    const merged = mergeActivity([day('2026-08-09', 1)], [day('2026-08-02', 1), day('2026-08-05', 1)]);
    expect(merged.map(e => e.d)).toEqual(['2026-08-02', '2026-08-05', '2026-08-09']);
  });

  it('handles an empty side, which is the first-sign-in case', () => {
    const a = [day('2026-08-01', 4)];
    expect(mergeActivity(a, [])).toEqual(a);
    expect(mergeActivity([], a)).toEqual(a);
    expect(mergeActivity([], [])).toEqual([]);
  });
});
