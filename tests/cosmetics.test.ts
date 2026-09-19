import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  COSMETICS, FREE_THEMES, FREE_FONTS, canSelect, cosmeticFor, unlockedCosmetics, unlockedCount,
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

/** Every `[data-theme="x"]` / `[data-font="x"]` selector the stylesheet defines. */
function styled(attr: 'data-theme' | 'data-font'): Set<string> {
  return new Set([...css.matchAll(new RegExp(`\\[${attr}="([^"]+)"\\]`, 'g'))].map(m => m[1]));
}

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
});

describe('the free set stays free', () => {
  /** THE TAKEAWAY TEST. Nothing that shipped free may ever appear in the catalogue. */
  it('locks none of the six themes or five typefaces', () => {
    const free = new Set<string>([...FREE_THEMES, ...FREE_FONTS]);
    const stolen = COSMETICS.filter(c => free.has(c.id)).map(c => c.id);
    expect(stolen).toEqual([]);
  });

  it('leaves every free id selectable with nothing unlocked', () => {
    const none = new Set<string>();
    for (const id of [...FREE_THEMES, ...FREE_FONTS]) {
      expect(canSelect(id, none), `${id} should never be gated`).toBe(true);
    }
  });

  it('reports no catalogue entry for a free id', () => {
    for (const id of [...FREE_THEMES, ...FREE_FONTS]) expect(cosmeticFor(id)).toBeUndefined();
  });
});

describe('every id the picker offers is actually styled', () => {
  const themes = styled('data-theme');
  const fonts = styled('data-font');

  it('gives each free theme and typeface a CSS block', () => {
    for (const t of FREE_THEMES) expect(themes.has(t), `no [data-theme="${t}"]`).toBe(true);
    for (const f of FREE_FONTS) expect(fonts.has(f), `no [data-font="${f}"]`).toBe(true);
  });

  /**
   * The failure this catches is a selection that highlights and changes nothing: `data-theme`
   * is set to a value no rule matches, so the page keeps the previous palette while the
   * picker insists the new one is active.
   */
  it('gives each earned cosmetic a CSS block', () => {
    for (const c of COSMETICS) {
      const set = c.kind === 'theme' ? themes : fonts;
      expect(set.has(c.id), `no [data-${c.kind}="${c.id}"] in globals.css`).toBe(true);
    }
  });

  it('defines no palette or type block nothing can select', () => {
    const known = new Set<string>([...FREE_THEMES, ...FREE_FONTS, ...COSMETICS.map(c => c.id)]);
    const orphans = [...themes, ...fonts].filter(id => !known.has(id));
    expect(orphans).toEqual([]);
  });

  /** An unlock nothing renders is an unlock nobody can collect. */
  it('offers every cosmetic in the picker', () => {
    for (const c of COSMETICS) {
      expect(sheet.includes(`'${c.id}'`), `ThemeSheet never mentions ${c.id}`).toBe(true);
    }
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
