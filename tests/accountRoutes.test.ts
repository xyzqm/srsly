import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * THE HEADER CHIP, AND WHERE "GO TO SETTINGS" ACTUALLY ARRIVES.
 *
 * Two bugs of one family, both of which were reported as confusion rather than as failure,
 * because nothing errored in either case.
 *
 * 1. The header's email was a `<span>` carrying the same background, border, radius, padding
 *    and mono type as the Sign out button an inch away — a control by every visual signal and
 *    by none of the behavioural ones. It was clicked and did nothing.
 *
 * 2. `ApiKeyPanel` lives inside the `account` group of SettingsTab, and the Read tab's
 *    "Connect a key in Settings" button navigated to Settings' DEFAULT group, `study`. So the
 *    one route offered to a learner who cannot generate landed them on a screen with no key
 *    field anywhere on it.
 *
 * Both are invisible to a type checker and to every runtime assertion in the app, so they are
 * pinned here against the source — the `tests/writingState.test.ts` approach, for the same
 * reason: what is being asserted is a RELATIONSHIP between two files that no single module
 * can see.
 */

/**
 * COMMENTS ARE STRIPPED FIRST, for the reason tests/writingState.test.ts gives at length:
 * these files EXPLAIN the bugs being asserted against, quoting the old markup and the old
 * sentence verbatim. A raw substring check passes on the documentation — or worse, fails on
 * it, which pushes the next person to delete the explanation to get CI green. This test
 * caught itself doing exactly that on its first run.
 */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter(l => !l.trim().startsWith('//'))
    .join('\n');
}

const root = resolve(__dirname, '..');
const page = code(readFileSync(resolve(root, 'app/page.tsx'), 'utf8'));
const settings = code(readFileSync(resolve(root, 'components/settings/SettingsTab.tsx'), 'utf8'));

/** The body of a top-level `function Name(` declaration, to the next one. */
function functionBody(src: string, name: string): string {
  const start = src.indexOf(`function ${name}(`);
  expect(start, `no function ${name} in the source`).toBeGreaterThan(-1);
  const rest = src.slice(start + 1);
  const end = rest.indexOf('\nfunction ');
  return end === -1 ? rest : rest.slice(0, end);
}

describe('the account chip is a control, not a control-shaped label', () => {
  const chip = functionBody(page, 'AccountChip');

  /**
   * The exact shape of the original bug: the element wrapping `{email}` was a `<span>`.
   * Scanning backwards for whichever tag opened last is enough to tell the two apart, and
   * fails loudly if someone swaps it back.
   */
  it('renders the email inside a button', () => {
    const before = chip.slice(0, chip.indexOf('{email}'));
    expect(before.includes('{email}') || before.length > 0).toBe(true);
    expect(
      before.lastIndexOf('<button') > before.lastIndexOf('<span'),
      'the email is wrapped in a <span> again — it looks clickable and is not',
    ).toBe(true);
  });

  it('gives that button somewhere to go', () => {
    expect(chip).toContain('onClick={onOpenAccount}');
  });

  /** A control that does not say it is one with the cursor is half the same bug. */
  it('still marks the whole chip as clickable', () => {
    expect(chip).toContain('cursor-pointer');
  });
});

describe('a route to Settings arrives where the thing it promised is', () => {
  /**
   * The key panel's home. If it ever moves group, this test fails and the one below — which
   * asserts callers ask for `account` — has to move with it. That pairing is the point:
   * the panel's location and the destination callers request are one fact in two files.
   */
  it('keeps ApiKeyPanel in the account group', () => {
    const account = settings.slice(
      settings.indexOf("{group === 'account' && (<>"),
      settings.indexOf("{group === 'study' && (<>"),
    );
    expect(account.length).toBeGreaterThan(0);
    expect(account, 'ApiKeyPanel is no longer inside the account group').toContain('<ApiKeyPanel');
  });

  it('sends every "connect a key" route to that group and not to the default', () => {
    expect(
      page.includes("onNavigateSettings={() => changeTab('settings')}"),
      'onNavigateSettings lands on the default group again, where there is no key field',
    ).toBe(false);
    expect(page).toContain('onNavigateSettings={openAccount}');
  });

  it('asks for the account group from the header chip too', () => {
    expect(page).toContain("setSettingsGroup('account')");
    expect(page).toContain('onOpenAccount={openAccount}');
  });

  /**
   * A prop nothing reads is a destination silently ignored.
   *
   * THE FALLBACK IS NO LONGER A LITERAL, and that is the point of the change rather than an
   * incidental edit. It was `?? 'study'` — neither the first group in the row nor the thing
   * anyone arrives wanting, so opening Settings cold highlighted the second tab along with no
   * explanation. It is `GROUPS[0].id` now, so the default and the order cannot disagree: this
   * asserts the RELATIONSHIP rather than the value, which is what stops a reorder quietly
   * leaving the default pointing at the middle of the row.
   */
  it('honours the requested group when Settings opens', () => {
    expect(settings).toContain('useState<Group>(initialGroup ?? GROUPS[0].id)');
    expect(page).toContain('initialGroup={settingsGroup}');
  });

  /** And the first group is the one a learner would expect to meet first. */
  it('opens on Account when nobody has asked for a group', () => {
    const first = settings.match(/const GROUPS = \[\s*\{\s*id:\s*'(\w+)'/);
    expect(first?.[1]).toBe('account');
  });

  /**
   * REMEMBERED ACROSS A TAB CHANGE, WHICH IS THE OPPOSITE OF WHAT THIS ONCE ASSERTED.
   *
   * `changeTab` used to clear the group, guarding against a stale destination: one click on the
   * header chip pinning Settings to Account for the rest of the session. It did prevent that,
   * and it cost the ordinary case — SettingsTab unmounts when you leave the tab, so with
   * nothing held above it every return dropped you back on "Studying", however deep in
   * Scheduling or Backup you had been. Reported from a screen recording.
   *
   * Recording the last group LOOKED AT serves both: the chip's request is simply the most
   * recent choice, and the next choice replaces it. So the assertion inverts.
   */
  it('remembers the group across a tab change instead of resetting it', () => {
    const change = page.slice(page.indexOf('const changeTab = useCallback'));
    expect(change.slice(0, 400), 'clearing this sends every return back to Studying')
      .not.toContain('setSettingsGroup(undefined)');
  });

  /** A group nav that does not report upward leaves nothing to come back to. */
  it('records the group the learner picks', () => {
    expect(settings).toContain('onGroupChange?.(g.id)');
    expect(page).toContain('onGroupChange={setSettingsGroup}');
  });
});

describe('the account panel reports rather than reassures', () => {
  const panel = code(readFileSync(resolve(root, 'components/settings/AccountPanel.tsx'), 'utf8'));

  /**
   * THE SENTENCE THIS REPLACED. "Signed in as … — synced across devices" was printed
   * unconditionally, so it said the same thing on a device with a week of writes stuck behind
   * a dead connection. The claim now has to come from the queue.
   */
  it('reads the write queue instead of asserting everything is synced', () => {
    expect(panel).toContain('storage.pendingColumns()');
    expect(panel).not.toContain('synced across devices');
  });

  /** `null` is "not counted yet" and `[]` is "nothing saved". Rendering one as the other is
   *  the mistake CLAUDE.md names four times over. */
  it('separates "still counting" from "nothing there"', () => {
    expect(panel).toContain('decks === null');
    expect(panel).toContain('decks.length === 0');
  });
});
