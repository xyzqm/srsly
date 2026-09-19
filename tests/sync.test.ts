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

  /**
   * EVERY FUNCTION THE SQL DEFINES MUST BE REVOKED FROM PUBLIC, AND THIS IS NOT THEORETICAL.
   *
   * Postgres grants EXECUTE on a new function to PUBLIC by default, so a `create function` with
   * no `revoke` is world-callable the moment it exists — and these are SECURITY DEFINER, which
   * means world-callable AND past RLS. The live database was found holding a second, older
   * `consume_ai_credit(p_limit integer)` in exactly that state: its ACL read `=X/postgres`, an
   * empty grantee meaning PUBLIC, because schema.sql's revoke names ONE SIGNATURE and never
   * touched it. The caller passed their own limit, so the budget check was whatever the request
   * asked for. See supabase/migrations/0006_drop_legacy_credit_overload.sql.
   *
   * Nothing in a repository can see what was applied to a project by hand — that overload
   * appeared in no file here. What this CAN hold is the rule for functions the repo does define,
   * so the next one cannot ship unlocked the way that one did.
   */
  const sql = schema + '\n' + migrations;
  const definedFunctions = [...sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+([\w.]+)\s*\(([^)]*)\)/gi)]
    .map(m => ({ name: m[1], args: m[2].trim() }));

  it('finds the functions to check — the control', () => {
    expect(definedFunctions.length).toBeGreaterThan(0);
    expect(definedFunctions.map(f => f.name)).toContain('public.consume_ai_credit');
  });

  it.each([...new Set(definedFunctions.map(f => f.name))])(
    '%s is revoked from public, so it is not world-executable by default',
    name => {
      const escaped = name.replace(/\./g, '\\.');
      expect(sql).toMatch(new RegExp(`revoke\\s+all\\s+on\\s+function\\s+${escaped}\\s*\\(`, 'i'));
    },
  );

  /**
   * ONE SIGNATURE PER FUNCTION NAME. An overload is how the dropped one hid: a revoke written
   * for `f()` says nothing about `f(integer)`, so a second signature is a second lock to
   * remember, and the forgotten one defaults open.
   */
  it('defines no overloads, because a revoke only covers the signature it names', () => {
    const signatures = new Map<string, Set<string>>();
    for (const f of definedFunctions) {
      if (!signatures.has(f.name)) signatures.set(f.name, new Set());
      signatures.get(f.name)!.add(f.args);
    }
    for (const [name, args] of signatures) expect([...args], name).toHaveLength(1);
  });

  /**
   * SCHEMA AND THE LATEST MIGRATION MUST DEFINE THE SAME FUNCTION, BYTE FOR BYTE.
   *
   * Every drift this project has actually suffered is this shape: a rule applied to the live
   * database by hand or by one file, while another file kept describing the old one. The
   * columns are already covered below; the FUNCTION was not, and it is the one carrying the
   * spend limits — so `schema.sql` saying 3 a day while the migration that was actually run
   * says something else is a limit nobody has applied, wearing a limit's clothes.
   *
   * Compared to the end of the body rather than to the end of the file, because a migration
   * legitimately carries its own header and its own idempotent grants around the same
   * definition.
   */
  it('keeps consume_ai_credit identical in schema.sql and its newest migration', () => {
    const body = (src: string): string | null => {
      const a = src.indexOf('create or replace function public.consume_ai_credit()');
      if (a === -1) return null;
      const b = src.indexOf('$$;', a);
      return b === -1 ? null : src.slice(a, b + 3);
    };
    const fromSchema = body(schema);
    expect(fromSchema, 'schema.sql no longer defines consume_ai_credit').not.toBeNull();

    // The newest migration that defines it at all — earlier ones are superseded history.
    // Read per FILE rather than from the joined `migrations` blob above, which cannot tell
    // one definition from the next.
    const files = readdirSync(resolve(root, 'supabase/migrations'))
      .filter(f => f.endsWith('.sql'))
      .sort();
    const defining = files
      .map(f => ({ f, body: body(readFileSync(resolve(root, 'supabase/migrations', f), 'utf8')) }))
      .filter((v): v is { f: string; body: string } => v.body !== null);
    expect(defining.length, 'control: some migration should define it').toBeGreaterThan(0);

    const newest = defining[defining.length - 1];
    expect(newest.body, `${newest.f} and schema.sql disagree about consume_ai_credit`)
      .toBe(fromSchema);
  });

  /**
   * The spend limits are the one thing in that function worth naming out loud, so a change to
   * either number is a deliberate edit to this line rather than a diff nobody reads.
   */
  it('caps both guests and accounts, per day', () => {
    expect(schema).toMatch(/guest_limit\s+int\s+:=\s*(\d+);/);
    expect(schema).toMatch(/account_limit\s+int\s+:=\s*(\d+);/);
    const guest = Number(/guest_limit\s+int\s+:=\s*(\d+);/.exec(schema)![1]);
    const account = Number(/account_limit\s+int\s+:=\s*(\d+);/.exec(schema)![1]);
    // An account that is signed in should not be worse off than an anonymous visitor, and
    // neither number may be the "unlimited" this deliberately stopped being.
    expect(account).toBeGreaterThanOrEqual(guest);
    expect(Number.isFinite(account) && account > 0).toBe(true);
  });

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
