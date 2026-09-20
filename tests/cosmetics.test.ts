import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  COSMETICS, FREE_THEMES, FREE_FONTS, FREE_TEXTURES, FREE_BLANKS,
  canSelect, cosmeticFor, unlockedCosmetics, unlockedCount, canCustomiseAccent, safeAccent,
} from '@/lib/cosmetics';
import { ACHIEVEMENTS } from '@/lib/achievements';

/**
 * Earned themes and typefaces.
 *
 * Three of these are firewalls rather than unit tests, and they exist because every way this
 * feature can go wrong is SILENT. A cosmetic whose milestone was renamed is simply unreachable
 * for ever; one with no CSS block applies an attribute nothing styles, so the picker highlights
 * a selection that changes nothing on screen; and a free theme quietly moved into the catalogue
 * is a takeaway that no compiler and no reviewer would notice until a learner lost their theme.
 */

const root = resolve(__dirname, '..');
const css = readFileSync(resolve(root, 'app/globals.css'), 'utf8');
const sheet = readFileSync(resolve(root, 'components/ThemeSheet.tsx'), 'utf8');

/** Every `[data-theme="x"]`-style selector the stylesheet defines, for one attribute. */
function styled(attr: string): Set<string> {
  return new Set([...css.matchAll(new RegExp(`\\[${attr}="([^"]+)"\\]`, 'g'))].map(m => m[1]));
}

/**
 * The `data-` attribute each kind switches on, or null for one that switches on nothing.
 *
 * `palette` is the odd one out and deliberately so: it unlocks the colour PICKER rather than a
 * value, so there is no attribute to set and no swatch to render. Mapping it to null here is
 * what keeps the CSS firewall below honest instead of quietly exempting a kind.
 */
const ATTR: Record<string, string | null> = {
  theme: 'data-theme',
  font: 'data-font',
  texture: 'data-texture',
  blank: 'data-blank',
  palette: null,
};

describe('the catalogue points at milestones that exist', () => {
  const ids = new Set(ACHIEVEMENTS.map(a => a.id));

  it('every unlock names a real achievement', () => {
    for (const c of COSMETICS) {
      expect(ids.has(c.requires), `${c.id} requires unknown milestone "${c.requires}"`).toBe(true);
    }
  });

  /**
   * A milestone id is a persistence key (`srsly-achievements-seen`) and is documented as
   * never renameable, so this cannot fail by accident — it fails when one is DELETED, which
   * would leave a cosmetic nobody can ever open and no error anywhere.
   */
  it('names no milestone that has been removed', () => {
    const missing = COSMETICS.filter(c => !ids.has(c.requires)).map(c => c.requires);
    expect(missing).toEqual([]);
  });

  it('gives every cosmetic a distinct id', () => {
    expect(new Set(COSMETICS.map(c => c.id)).size).toBe(COSMETICS.length);
  });

  /**
   * NO STREAK UNLOCKS, and this pins the reasoning rather than the list.
   *
   * Milestones are derived from current state, so a streak milestone un-earns itself the
   * first morning someone oversleeps — and a derived gate would confiscate the theme on that
   * morning. Every condition has to be on a counter that only rises in ordinary use. This is
   * the rule lib/cosmetics.ts states at length, and the test that stops the next person
   * reaching for the most obvious unlock in the list.
   */
  it('hangs nothing off a streak, which can go down', () => {
    const regressible = COSMETICS.filter(c => c.requires.startsWith('streak-')
      || c.requires.startsWith('lang-streak-'));
    expect(regressible.map(c => c.id)).toEqual([]);
  });

  /**
   * NOTHING IS GATED ON GOING BADLY, WHICH THE RULE ABOVE DOES NOT COVER.
   *
   * `Boxed` required `leech-10` — rescue ten stuck words — which means first HAVING ten cards
   * failed often enough to trip `LEECH_THRESHOLD`. A learner who studies well may never
   * produce a single one, so it was not a hard unlock for them but an impossible one, with
   * nothing on screen to explain why. And the only reliable way to earn it is to forget a lot
   * of words, which is a reward pointing the wrong way.
   *
   * The streak rule is about conditions that can REGRESS. This is about conditions a learner
   * cannot AIM AT — `leechesFixed` rises monotonically and still fails, which is exactly why
   * it needed its own assertion rather than a wider version of the one above.
   */
  it('hangs nothing off a milestone that only failure can earn', () => {
    const failureEarned = COSMETICS.filter(c => c.requires.startsWith('leech-'));
    expect(
      failureEarned.map(c => c.id),
      'this can only be earned by forgetting words, and a good learner may never earn it at all',
    ).toEqual([]);
  });

  /**
   * Every condition is something a learner can set out to do: study, collect, hold, or read.
   * Listed as prefixes rather than as a count so adding a fifth kind of goal is a deliberate
   * edit here rather than a silent widening.
   */
  it('gates every cosmetic on something a learner can aim at', () => {
    const AIMABLE = ['sessions-', 'deck-', 'mastered-', 'book-', 'books-'];
    for (const c of COSMETICS) {
      expect(
        AIMABLE.some(p => c.requires.startsWith(p)),
        `${c.id} requires "${c.requires}", which is not a goal anyone can set out to reach`,
      ).toBe(true);
    }
  });
});

describe('the free set stays free', () => {
  /** THE TAKEAWAY TEST. Nothing that shipped free may ever appear in the catalogue. */
  it('locks nothing that shipped free — themes, type, paper or blanks', () => {
    const free = new Set<string>([
      ...FREE_THEMES, ...FREE_FONTS, ...FREE_TEXTURES, ...FREE_BLANKS,
    ]);
    const stolen = COSMETICS.filter(c => free.has(c.id)).map(c => c.id);
    expect(stolen).toEqual([]);
  });

  it('leaves every free id selectable with nothing unlocked', () => {
    const none = new Set<string>();
    for (const id of [...FREE_THEMES, ...FREE_FONTS, ...FREE_TEXTURES, ...FREE_BLANKS]) {
      expect(canSelect(id, none), `${id} should never be gated`).toBe(true);
    }
  });

  it('reports no catalogue entry for a free id', () => {
    for (const id of [...FREE_THEMES, ...FREE_FONTS, ...FREE_TEXTURES, ...FREE_BLANKS]) {
      expect(cosmeticFor(id)).toBeUndefined();
    }
  });

  /**
   * The default paper and the default blank are what the app draws with NO attribute set, so
   * they must be exactly the look that shipped. Swapping which one is the default would change
   * the app for every existing learner without unlocking anything.
   */
  it('keeps the shipped look as the default for both new kinds', () => {
    expect([...FREE_TEXTURES]).toEqual(['grain']);
    expect([...FREE_BLANKS]).toEqual(['dotted']);
  });
});

describe('the custom accent is a control, and its value is validated', () => {
  it('stays locked until its milestone', () => {
    expect(canCustomiseAccent(new Set())).toBe(false);
    expect(canCustomiseAccent(unlockedCosmetics(['mastered-1000']))).toBe(true);
  });

  /**
   * IT IS THE HARDEST THING IN THE APP, AND DELIBERATELY NOT THE BIGGEST NUMBER. `deck-1000`
   * is a thousand words collected, which is an afternoon of importing; `mastered-1000` is a
   * thousand words each holding a month of stability, which only time can move.
   */
  it('hangs off mastery rather than off collecting', () => {
    const palette = COSMETICS.find(c => c.kind === 'palette')!;
    expect(palette.requires).toBe('mastered-1000');
  });

  /**
   * THE VALUE GOES INTO AN INLINE STYLE AND PREFS SYNC. A value arriving from another device,
   * or from a hand-edited localStorage blob, must be a literal hex colour before it is written
   * anywhere near `style` — so this is a validator rather than a formatter.
   */
  it('accepts three- and six-digit hex, in either case', () => {
    for (const v of ['#fff', '#FFF', '#b23a2e', '#B23A2E']) expect(safeAccent(v)).toBe(v);
    expect(safeAccent('  #fff  ')).toBe('#fff');
  });

  it('refuses everything else, including things a browser would accept', () => {
    for (const v of ['red', 'rgb(1,2,3)', 'var(--ink)', '#12345', '#gggggg', '',
                     'url(x)', '#fff;background:url(x)', null, undefined, 123 as unknown as string]) {
      expect(safeAccent(v as string), String(v)).toBeNull();
    }
  });
});

describe('every id the picker offers is actually styled', () => {
  const themes = styled('data-theme');
  const fonts = styled('data-font');

  it('gives every free option a CSS block', () => {
    for (const t of FREE_THEMES) expect(themes.has(t), `no [data-theme="${t}"]`).toBe(true);
    for (const f of FREE_FONTS) expect(fonts.has(f), `no [data-font="${f}"]`).toBe(true);
    // `grain` and `dotted` are the DEFAULTS rather than selectable blocks — they are what the
    // bare `body::before` and `.cloze-blank` rules already draw, which is why neither needs a
    // `[data-*]` selector and why both are asserted as base rules instead.
    expect(css).toMatch(/\.cloze-blank\s*\{/);
    expect(css).toMatch(/body::before\s*\{/);
  });

  /**
   * The failure this catches is a selection that highlights and changes nothing: the attribute
   * is set to a value no rule matches, so the page keeps its previous look while the picker
   * insists the new one is active.
   */
  it('gives each earned cosmetic a CSS block, or declares it styles nothing', () => {
    for (const c of COSMETICS) {
      const attr = ATTR[c.kind];
      if (attr === null) continue;   // palette unlocks a control, not a value
      expect(attr, `no attribute mapped for kind "${c.kind}"`).toBeTruthy();
      expect(styled(attr!).has(c.id), `no [${attr}="${c.id}"] in globals.css`).toBe(true);
    }
  });

  it('maps every kind in the catalogue', () => {
    for (const c of COSMETICS) {
      expect(Object.hasOwn(ATTR, c.kind), `unmapped kind "${c.kind}"`).toBe(true);
    }
  });

  it('defines no block nothing can select', () => {
    const known = new Set<string>([
      ...FREE_THEMES, ...FREE_FONTS, ...FREE_TEXTURES, ...FREE_BLANKS,
      ...COSMETICS.map(c => c.id),
    ]);
    const all = [...themes, ...fonts, ...styled('data-texture'), ...styled('data-blank')];
    expect(all.filter(id => !known.has(id))).toEqual([]);
  });

  /**
   * An unlock nothing renders is an unlock nobody can collect.
   *
   * The palette one is checked differently because it has no swatch to name: what proves it is
   * reachable is the drawer consulting `canCustomiseAccent`, which is the only thing that can
   * put the colour picker on screen.
   */
  it('offers every cosmetic in the picker', () => {
    for (const c of COSMETICS) {
      if (c.kind === 'palette') continue;
      expect(sheet.includes(`'${c.id}'`), `ThemeSheet never mentions ${c.id}`).toBe(true);
    }
  });

  it('puts the colour picker behind its unlock', () => {
    expect(sheet).toContain('canCustomiseAccent');
    expect(sheet).toContain('setAccentColor');
  });
});

describe('unlocking', () => {
  it('opens nothing for a learner holding no milestones', () => {
    expect(unlockedCosmetics([]).size).toBe(0);
  });

  it('opens exactly the cosmetic whose milestone is held', () => {
    const open = unlockedCosmetics(['sessions-1']);
    expect([...open]).toEqual(['vellum']);
  });

  it('ignores milestones no cosmetic is hung off', () => {
    expect(unlockedCosmetics(['streak-7', 'polyglot-2', 'leech-1']).size).toBe(0);
  });

  it('accumulates', () => {
    const open = unlockedCosmetics(COSMETICS.map(c => c.requires));
    expect(unlockedCount(open)).toBe(COSMETICS.length);
  });

  it('accepts a Set as readily as a list', () => {
    expect([...unlockedCosmetics(new Set(['deck-50']))]).toEqual(['grand']);
  });
});

describe('the gate is on choosing, never on wearing', () => {
  const none = new Set<string>();

  it('refuses a cosmetic whose milestone is not held', () => {
    expect(canSelect('midnight', none)).toBe(false);
  });

  it('allows one that is held', () => {
    expect(canSelect('midnight', new Set(['midnight']))).toBe(true);
  });

  /**
   * THE REGRESSION CASE, stated as a test.
   *
   * `mastered` falls when cards lapse and `booksFinished` falls if a book is deleted, so an
   * unlock CAN close again. Someone already using that theme keeps it: the alternative is the
   * app silently repainting itself one morning because a card slipped below a month of
   * stability, which is the takeaway this whole feature is built to avoid.
   */
  it('keeps the theme already applied selectable after its milestone lapses', () => {
    expect(canSelect('terminal', none, 'terminal')).toBe(true);
    expect(canSelect('terminal', none, 'paper')).toBe(false);
  });
});
