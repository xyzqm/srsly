import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { FR_GRAMMAR } from '@/lib/data/fr-grammar';
import {
  describeFeature, describeCode, lookupGrammar, type FrGrammarTable,
} from '@/lib/frenchGrammar';

/**
 * These read the REAL Lexique file and the REAL emitted table, deliberately — the same
 * reasoning as the lemmatizer tests loading the real dictionary. The claim being tested is
 * "every slot this data can produce has an English description", and a hand-written list of
 * codes would test the list instead.
 */
const LEXIQUE = path.join(process.cwd(), 'scripts', 'data', 'Lexique383.tsv');
const table = FR_GRAMMAR as FrGrammarTable;

function lexiqueSlots(): Set<string> {
  const out = new Set<string>();
  const rows = readFileSync(LEXIQUE, 'utf8').split('\n');
  for (let i = 1; i < rows.length; i++) {
    const c = rows[i].split('\t');
    if (c.length < 11) continue;
    for (const slot of (c[10] ?? '').split(';')) if (slot) out.add(slot);
  }
  return out;
}

describe('every inflection Lexique can produce has a description', () => {
  const slots = lexiqueSlots();

  it('covers every infover slot in the database', () => {
    const unmapped = [...slots].filter(c => describeFeature(c) === null);
    expect(unmapped, `unmapped inflection codes: ${unmapped.join(', ')}`).toEqual([]);
  });

  it('finds a real number of them, so a parse failure cannot pass silently', () => {
    expect(slots.size).toBeGreaterThan(40);
  });
});

/**
 * `imp` means two different things depending on where it sits: imperative as a MOOD, imparfait
 * as a TENSE. A position-blind lookup mislabels one of them, and a beginner cannot catch a
 * confidently wrong grammatical label.
 */
describe('imp is read by position, not by spelling', () => {
  it('reads ind:imp as the imperfect tense', () => {
    expect(describeFeature('ind:imp:3s')).toBe('imperfect · 3rd person singular');
  });

  it('reads imp:pre as the imperative mood', () => {
    expect(describeFeature('imp:pre:2s')).toBe('imperative · 2nd person singular');
  });

  // Lexique writes every imperative as `imp:pre:…`, so naming the tense would say it twice.
  it('does not call an imperative "present"', () => {
    expect(describeFeature('imp:pre:2p')).not.toMatch(/present/);
  });
});

describe('the phrasing is what a learner needs', () => {
  it.each([
    ['ind:pre:3s', 'present · 3rd person singular'],
    ['ind:fut:1s', 'future · 1st person singular'],
    ['ind:pas:3s', 'past historic · 3rd person singular'],
    ['sub:pre:1s', 'subjunctive present · 1st person singular'],
    ['cnd:pre:2p', 'conditional present · 2nd person plural'],
    ['inf', 'infinitive'],
    ['par:pas', 'past participle'],
    ['par:pre', 'present participle'],
  ])('%s reads as "%s"', (code, expected) => {
    expect(describeFeature(code)).toBe(expected);
  });

  // The indicative is the unmarked case. Labelling it adds a word to every single verb and
  // tells the reader nothing they can use.
  it('never says "indicative"', () => {
    for (const c of ['ind:pre:1s', 'ind:imp:2p', 'ind:fut:3p', 'ind:pas:1p']) {
      expect(describeFeature(c)).not.toMatch(/indicative/i);
    }
  });

  it('tolerates the trailing semicolon Lexique writes', () => {
    expect(describeFeature('ind:pre:3s;')).toBe('present · 3rd person singular');
  });

  it('returns null rather than guessing at nonsense', () => {
    for (const c of ['', 'xyz', 'ind:zzz:3s', 'ind:pre:9s', 'a:b:c:d']) {
      expect(describeFeature(c), c).toBeNull();
    }
  });
});

/**
 * THE REGRESSION THIS SUITE EXISTS FOR.
 *
 * Lexique packs every reading of a form into one row, ordered by mood code — so `imp` sorts
 * ahead of `ind`, and reading only the first slot labels the commonest form of every regular
 * -er verb an IMPERATIVE. `il mange` would have read "imperative · 2nd person singular".
 */
describe('a form with several readings says only what they agree on', () => {
  it.each(['mange', 'lève', 'parle', 'donne', 'regarde'])(
    '%s is a present tense, not an imperative', form => {
      expect(describeCode(table.c[table.w[form][0][0]])).toBe('present');
    });

  it('keeps full detail when there is only one reading', () => {
    expect(describeCode('VER|ind:imp:3s||')).toBe('imperfect · 3rd person singular');
  });

  it('names both when a form has exactly two readings', () => {
    expect(describeCode('VER|ind:pre:3s;par:pas|m|s'))
      .toBe('present · 3rd person singular, or past participle');
  });

  // Four alternatives is not an explanation. Silence is the honest form of "it depends".
  it('says nothing when a form has three or more readings', () => {
    expect(describeCode('VER|ind:fut:3p;ind:pre:3s;ind:pas:3s;par:pas|m|s')).toBeNull();
  });

  it('drops a mood the readings disagree about, and keeps a unanimous one', () => {
    expect(describeCode('VER|sub:pre:1s;sub:pre:3s||')).toBe('subjunctive present');
    expect(describeCode('VER|imp:pre:1p;ind:pre:1p||')).toBe('present · 1st person plural');
  });
});

describe('gender and number', () => {
  it('describes a noun or adjective, which have no verb slots at all', () => {
    expect(describeCode('NOM||m|p')).toBe('masculine plural');
    expect(describeCode('ADJ||f|s')).toBe('feminine singular');
  });

  it('agrees a past participle', () => {
    expect(describeCode('VER|par:pas|m|p')).toBe('past participle · masculine plural');
  });

  /**
   * `faites` is `imp:pre:2p;ind:pre:2p;par:pas` marked feminine plural — the agreement belongs
   * to the participle alone, so attaching it to the finite readings would say that "vous
   * faites" is feminine.
   */
  it('withholds agreement when only some readings are participles', () => {
    expect(describeCode('VER|ind:pre:2p;par:pas|f|p')).not.toMatch(/feminine/);
  });
});

/**
 * The homograph guard. Lexique and the app's lemmatizer come from different sources, and
 * where they disagree the lemmatizer is making a deliberate call this must not override.
 */
describe('a reading is only shown when the app\'s own lemmatizer agrees', () => {
  it('says nothing without a baseForm, however much Lexique knows', () => {
    // Lexique lists all three as verb forms; the lemmatizer leaves them alone as common words,
    // so the popup must not announce `tu` as a participle of `taire`.
    for (const w of ['tu', 'lui', 'mort']) {
      expect(table.w[w], `${w} should be in the table`).toBeTruthy();
      expect(lookupGrammar(table, w, undefined), w).toEqual([]);
    }
  });

  it('says nothing when the lemmas disagree', () => {
    expect(lookupGrammar(table, 'chats', 'chatte')).toEqual([]);
  });

  it('explains the form when they agree', () => {
    expect(lookupGrammar(table, 'chats', 'chat')).toEqual(['masculine plural']);
    expect(lookupGrammar(table, 'abaissait', 'abaisser')).toEqual(['imperfect · 3rd person singular']);
    expect(lookupGrammar(table, 'allés', 'aller')).toEqual(['past participle · masculine plural']);
  });

  it('is case-insensitive, since a sentence-initial word is capitalised', () => {
    expect(lookupGrammar(table, 'Chats', 'Chat')).toEqual(['masculine plural']);
  });

  // `belle` is listed as both an adjective and a noun, both feminine singular of `beau`.
  it('does not print one fact twice', () => {
    expect(lookupGrammar(table, 'belle', 'beau')).toEqual(['feminine singular']);
  });

  it('returns nothing for a word not in the table', () => {
    expect(lookupGrammar(table, 'zzzznotaword', 'zzzz')).toEqual([]);
  });
});

/**
 * The table is generated, so its contents are a claim about the build script rather than
 * something asserted by hand.
 */
describe('the emitted table', () => {
  it('decodes every code it contains, or deliberately declines to', () => {
    // No throwing, no undefined — every code is either a sentence or an explicit null.
    for (const code of table.c) {
      const out = describeCode(code);
      expect(out === null || (typeof out === 'string' && out.length > 0), code).toBe(true);
    }
  });

  it('leaves few codes undescribed, so a decoding regression is visible', () => {
    const silent = table.c.filter(c => describeCode(c) === null);
    expect(silent.length / table.c.length).toBeLessThan(0.35);
  });

  it('never contains a form identical to its own lemma', () => {
    for (const [form, entries] of Object.entries(table.w).slice(0, 5000)) {
      for (const [, lemma] of entries) expect(lemma.toLowerCase()).not.toBe(form);
    }
  });

  it('is big enough to be the real thing', () => {
    expect(Object.keys(table.w).length).toBeGreaterThan(50_000);
  });
});
