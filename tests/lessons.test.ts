import { describe, it, expect } from 'vitest';
import { grammarLessons, vocabLessons, nextGrammarLesson, hasLessons, LESSON_LANGUAGES } from '@/lib/lessons';
import { lessonsFor } from '@/lib/data/lessons';
import { BEGINNER_THEMES } from '@/lib/data/beginner-themes';
import { segmentFr } from '@/lib/server/frenchSegmenter';
import { segmentEs } from '@/lib/server/spanishSegmenter';
import { segmentZh } from '@/lib/server/chineseSegmenter';
import { segmentJa } from '@/lib/server/kuromojiSegmenter';
import cedictData from '@dict/cedict.json';
import { HSK_VOCAB } from '@/lib/data/hsk-vocab';
import type { LanguageCode } from '@/lib/types';

/**
 * A lesson's examples are held to the starter texts' bar: EVERY word must resolve in our own
 * dictionary, checked through the REAL segmenter rather than a stub. The whole app is built on
 * tapping a word to find out what it means, so an example sentence you cannot tap through
 * teaches the opposite of what the lesson is for.
 *
 * The vocabulary lessons are checked differently — they name a theme rather than carrying
 * words, so what matters is that the theme exists and is not empty. The words themselves were
 * already validated against the dictionary when `scripts/build-themes.mjs` emitted them.
 *
 * Everything here is parameterised over LESSON_LANGUAGES, so adding a third tree gets the whole
 * suite for free and cannot ship without passing it.
 */

/**
 * THREE VALIDATION STRATEGIES, because the pipelines genuinely differ.
 *
 * French, Spanish and Japanese resolve meanings SERVER-side, so a resolved token carries its
 * gloss in the third slot and the check is on the tuple width. Chinese deliberately does not:
 * `segmentZh` emits every non-deck token bare and the client looks it up through
 * lib/data/dict.ts, because CC-CEDICT's first sense is often the wrong one. So Chinese is
 * checked against the same tables the client consults — exactly as tests/starterTexts.test.ts
 * does, and for the same reason.
 *
 * Japanese is the only async one, since kuromoji has to load.
 */
const cedict = cedictData as unknown as Record<string, { p: string; m: string }>;
const HAN = /[\u4e00-\u9fff]/;

/** Words a lesson example may use that are not vocabulary the dictionary carries. */
async function unresolvedWords(lang: LanguageCode, text: string): Promise<string[]> {
  if (lang === 'zh') {
    // Bare tokens by design: check the Han words against what the client would consult.
    return segmentZh(text, new Map())
      .map(t => t[0])
      .filter(w => HAN.test(w))
      .filter(w => !(w in cedict) && !(w in HSK_VOCAB));
  }
  const toks = lang === 'ja'
    ? await segmentJa(text, new Map())
    : (lang === 'fr' ? segmentFr : segmentEs)(text, new Map()) as unknown as Array<string[]>;
  return toks
    .filter(t => t.length > 1)                    // punctuation is a 1-tuple
    .filter(t => !(t.length >= 3 && t[2]))        // no gloss resolved
    .map(t => t[0])
    /**
     * PROPER NOUNS ARE EXEMPT, and by design rather than by concession.
     * `scripts/lib/nameFilter.mjs` strips names from every dictionary at build time, so Canada
     * and Madrid resolve to nothing on purpose — the same reason tests/starterTexts.test.ts
     * allows 90% and lib/readability.ts refuses to grade them. A lesson on which preposition
     * each country takes cannot avoid naming a country.
     *
     * Detected as capitalised-but-not-sentence-initial, which is available in Spanish and
     * French and unnecessary in Chinese and Japanese, where nothing is capitalised.
     */
    .filter(w => !/^\p{Lu}/u.test(w) || text.trim().startsWith(w));
}

const allThemes = BEGINNER_THEMES as Record<string, Record<string, string[]>>;

describe('every language with a tree declares one', () => {
  it('is offered for all four', () => {
    for (const l of ['fr', 'es', 'zh', 'ja'] as const) expect(hasLessons(l), l).toBe(true);
  });

  it('never claims a language whose tree is actually empty', () => {
    for (const l of LESSON_LANGUAGES) {
      expect(lessonsFor(l).length, `${l} is listed but has no lessons`).toBeGreaterThan(0);
    }
  });
});

for (const lang of LESSON_LANGUAGES as LanguageCode[]) {
  const lessons = lessonsFor(lang);
  const themes = allThemes[lang] ?? {};

  describe(`${lang}: the tree is structurally sound`, () => {
    it('has unique ids', () => {
      const ids = lessons.map(l => l.id);
      expect(new Set(ids).size, `duplicate ids in: ${ids.join(', ')}`).toBe(ids.length);
    });

    it('carries a title and a summary on every lesson', () => {
      for (const l of lessons) {
        expect(l.title.trim(), l.id).not.toBe('');
        expect(l.summary.trim(), l.id).not.toBe('');
      }
    });

    it('teaches grammar as well as vocabulary', () => {
      expect(grammarLessons(lessons).length).toBeGreaterThanOrEqual(12);
      expect(vocabLessons(lessons).length).toBeGreaterThanOrEqual(8);
    });

    /**
     * GRAMMAR IS ONE ORDERED TRACK. The array order IS the course order — it is what the
     * numbers in the UI count — so the two kinds must not interleave, or the numbering would
     * jump around a word list nobody needs to do first.
     */
    it('puts the whole grammar track before the word sets', () => {
      const kinds = lessons.map(l => l.kind);
      const lastGrammar = kinds.lastIndexOf('grammar');
      const firstVocab = kinds.indexOf('vocab');
      // A weaker "everything before the first vocab is grammar" check passes on an INTERLEAVED
      // array, which is how the subjunctive briefly ended up numbered 7 — ahead of être.
      expect(firstVocab, 'grammar and words are interleaved').toBeGreaterThan(lastGrammar);
    });

    it('points at the first unfinished grammar lesson', () => {
      const track = grammarLessons(lessons);
      expect(nextGrammarLesson(lessons, new Set())).toBe(track[0]);
      expect(nextGrammarLesson(lessons, new Set([track[0].id]))).toBe(track[1]);
      expect(nextGrammarLesson(lessons, new Set(track.map(l => l.id)))).toBeUndefined();
    });
  });

  describe(`${lang}: grammar lessons`, () => {
    const grammar = lessons.filter(l => l.kind === 'grammar');

    it('all carry explanation prose and examples', () => {
      for (const l of grammar) {
        expect((l.explanation ?? '').trim().length, `${l.id} explanation`).toBeGreaterThan(200);
        expect(l.examples?.length ?? 0, `${l.id} examples`).toBeGreaterThanOrEqual(3);
        expect(l.theme, `${l.id} should not name a vocab theme`).toBeUndefined();
      }
    });

    /**
     * The build-the-sentence exercise is only solvable if the tiles actually reassemble into
     * the sentence. Compared with whitespace removed, because French writes a space before `?`
     * that the segmenter drops and Spanish opens with `¿` — neither changes which tiles there
     * are, and both would otherwise fail a strict comparison for no reason.
     */
    it('has tiles that rebuild their own sentence', () => {
      const strip = (s: string) => s.replace(/\s+/g, '');
      for (const l of grammar) {
        for (const ex of l.examples ?? []) {
          expect(ex.tiles?.length, `${l.id}: "${ex.text}" has no tiles`).toBeGreaterThan(0);
          expect(strip(ex.tiles!.join('')), `${l.id}: tiles do not rebuild "${ex.text}"`)
            .toBe(strip(ex.text));
        }
      }
    });

    /**
     * A one-tile example cannot be reassembled — 待ってください。is a single fused token — so it
     * is fine as an example and useless as an exercise. Every lesson still needs at least one
     * example that CAN be built, or its practice section would be empty.
     */
    it('gives every lesson at least one buildable sentence', () => {
      for (const l of grammar) {
        const buildable = (l.examples ?? []).filter(e => (e.tiles?.length ?? 0) > 1);
        expect(buildable.length, `${l.id} has no exercise the learner could do`).toBeGreaterThan(0);
      }
    });

    it('never ships a tile that is only punctuation or blank', () => {
      for (const l of grammar) {
        for (const ex of l.examples ?? []) {
          for (const t of ex.tiles ?? []) {
            expect(t.trim(), `${l.id}: empty tile in "${ex.text}"`).not.toBe('');
            expect(/[\p{L}\p{N}]/u.test(t), `${l.id}: "${t}" is punctuation only`).toBe(true);
          }
        }
      }
    });

    it('gives every example an English gloss', () => {
      for (const l of grammar) {
        for (const ex of l.examples ?? []) {
          expect(ex.text.trim(), l.id).not.toBe('');
          expect(ex.gloss.trim(), `${l.id}: "${ex.text}"`).not.toBe('');
        }
      }
    });

    /**
     * PRACTICE SENTENCES ARE NOT THE EXAMPLES, and this is what makes that true.
     *
     * Building the exercise from the examples meant the answer was printed on the screen the
     * learner had just scrolled past — it tested scrollback, not the rule. Comparing with
     * whitespace and punctuation stripped, because "he is coming." and "he is coming?" are the
     * same sentence for this purpose and neither is a new question.
     */
    it('never practises a sentence it has already printed as an example', () => {
      const bare = (s: string) => s.replace(/[\s\p{P}]/gu, '');
      for (const l of grammar) {
        const shown = new Set((l.examples ?? []).map(e => bare(e.text)));
        for (const p of l.practice ?? []) {
          expect(shown.has(bare(p.text)), `${l.id}: practice repeats the example «${p.text}»`).toBe(false);
        }
      }
    });

    it('gives every grammar lesson its own practice sentences', () => {
      for (const l of grammar) {
        expect(l.practice?.length ?? 0, `${l.id} has no practice sentences`).toBeGreaterThanOrEqual(3);
      }
    });

    it('has practice tiles that rebuild their own sentence', () => {
      const strip = (s: string) => s.replace(/\s+/g, '');
      for (const l of grammar) {
        for (const ex of l.practice ?? []) {
          expect(ex.tiles?.length, `${l.id}: "${ex.text}" has no tiles`).toBeGreaterThan(1);
          expect(strip(ex.tiles!.join('')), `${l.id}: tiles do not rebuild "${ex.text}"`)
            .toBe(strip(ex.text));
          for (const t of ex.tiles!) {
            expect(/[\p{L}\p{N}]/u.test(t), `${l.id}: "${t}" is punctuation only`).toBe(true);
          }
          expect(ex.gloss.trim(), `${l.id}: "${ex.text}" has no gloss`).not.toBe('');
        }
      }
    });

    /**
     * A TABLE IS A LOOKUP, so its first column has to be tappable, so every term in it has to
     * resolve — held to exactly the bar an example sentence is held to. A measure-word table
     * printing 张 with no way to find out how it is said would be the very complaint the
     * table was added to answer.
     */
    it('lays out any reference table squarely, with a resolvable first column', async () => {
      const misses: string[] = [];
      for (const l of grammar) {
        const t = l.table;
        if (!t) continue;
        expect(t.caption.trim(), `${l.id} table caption`).not.toBe('');
        expect(t.columns.length, `${l.id} table columns`).toBeGreaterThanOrEqual(2);
        expect(t.rows.length, `${l.id} table rows`).toBeGreaterThanOrEqual(2);
        for (const r of t.rows) {
          expect(r.length, `${l.id}: row «${r.join(' | ')}» is not ${t.columns.length} wide`)
            .toBe(t.columns.length);
          expect(r[0].trim(), `${l.id}: empty term in a table row`).not.toBe('');
          for (const w of await unresolvedWords(lang, r[0])) {
            misses.push(`${l.id}: table term "${w}"`);
          }
        }
      }
      expect(misses, `unlookupable table terms:\n  ${misses.join('\n  ')}`).toEqual([]);
    }, 120_000);

    it('names the mistake, where the lesson has one to name', () => {
      for (const l of grammar) {
        if (l.pitfall === undefined) continue;
        expect(l.pitfall.trim().length, `${l.id} pitfall is too short to say anything`)
          .toBeGreaterThan(40);
      }
    });

    /**
     * THE ONE THAT MATTERS, and it has no exemptions. It briefly carried two for French — `au`,
     * which the dictionary's contraction filter had deleted outright, and `est-ce`, which the
     * segmenter kept whole as one unlookupable token. Both were fixed at the source rather than
     * written around, and this list stays empty.
     */
    it('uses only words that resolve in the real dictionary', async () => {
      const misses: string[] = [];
      for (const l of grammar) {
        // Practice sentences are held to the same bar as the printed ones: an exercise you
        // cannot tap through teaches the opposite of what the lesson is for.
        for (const ex of [...(l.examples ?? []), ...(l.practice ?? [])]) {
          for (const w of await unresolvedWords(lang, ex.text)) {
            misses.push(`${l.id}: "${w}" in «${ex.text}»`);
          }
        }
      }
      expect(misses, `unlookupable words:\n  ${misses.join('\n  ')}`).toEqual([]);
    }, 120_000);
  });

  describe(`${lang}: vocabulary lessons`, () => {
    const vocab = lessons.filter(l => l.kind === 'vocab');

    it('name a theme that actually exists and is not empty', () => {
      for (const l of vocab) {
        expect(l.theme, `${l.id} has no theme`).toBeTruthy();
        const words = themes[l.theme!];
        expect(words, `${l.id}: theme "${l.theme}" is not in beginner-themes`).toBeTruthy();
        expect(words.length, `${l.id}: theme "${l.theme}" is empty`).toBeGreaterThan(3);
      }
    });

    it('does not name the same theme twice', () => {
      const used = vocab.map(l => l.theme);
      expect(new Set(used).size, `repeated themes: ${used.join(', ')}`).toBe(used.length);
    });

    it('carries no explanation or examples — it is a word list, not a reading', () => {
      for (const l of vocab) {
        expect(l.explanation, l.id).toBeUndefined();
        expect(l.examples, l.id).toBeUndefined();
        expect(l.practice, l.id).toBeUndefined();
        expect(l.table, l.id).toBeUndefined();
      }
    });
  });
}

/** Ids are the persistence key for completion, so a collision across trees would merge them. */
describe('ids are unique across every language', () => {
  it('never reuses an id between trees', () => {
    const ids = (LESSON_LANGUAGES as LanguageCode[]).flatMap(l => lessonsFor(l).map(x => x.id));
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes, `ids shared between languages: ${dupes.join(', ')}`).toEqual([]);
  });
});
