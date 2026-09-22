import { describe, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { buildLevelIndex, calculateReadability, MIN_TOKENS, type LevelBands } from '../lib/readability';
import type { PassageToken } from '../lib/types';
import { tokensToText } from '../lib/tokenText';
import BANDS from '@data/cefr-levels.json';
import ES_FORMS from '@data/es-forms.json';
import ESDICT from '@dict/esdict.json';

/**
 * What share of a generated passage sits ABOVE the level it was written for.
 *
 *   SWEEP_DIR=/tmp/sweep-groq npx vitest run --config scripts/analyse-sweep.vitest.mts
 *
 * Reads the dumps `scripts/sweep-readability.mjs` writes and measures them with
 * `lib/readability.ts` — the app's OWN metric, on the app's own normalised tokens, which is the
 * whole reason that sweep drives the UI rather than the API. It writes `readability.txt` beside
 * the dumps as well as printing, because vitest swallows stdout depending on how it is invoked
 * and a measurement you cannot get back out is not one.
 *
 * ── THE EXCLUSIONS ARE THE APP'S, NOT THIS SCRIPT'S ──
 * `ungradeable` and `altKey` are rebuilt exactly as `hooks/useReadability.ts` builds them for
 * Spanish: a surface with no dictionary entry and no form-table entry is not a vocabulary item
 * (which is what keeps the generator's own glossed place names out), and a form the server left
 * unlemmatised is retried through `es-forms`. Diverging from the hook here would produce a
 * number the app never shows.
 *
 * ── TWO NUMBERS, AND POOLED IS THE ONE TO QUOTE ──
 * POOLED weights every token equally, so one long passage counts more than one short one —
 * that is the share of words a reader actually meets. PER-PASSAGE MEAN weights every passage
 * equally and carries the spread, which is what says whether a difference is real. They are
 * printed together because a gap between them means passage length is correlated with
 * difficulty.
 *
 * ── AND THE SAMPLE SIZE IS THE POINT ──
 * CLAUDE.md records a round of topic cuts measuring 13.1% against 12.8% and calls it "not a
 * result": ten passages can only resolve about 5 percentage points. So `n` and the standard
 * deviation are printed on every line, and anything below `MIN_TOKENS` is dropped rather than
 * averaged in — a 20-token passage can only score in coarse steps and would move a mean it has
 * no business moving.
 *
 * ── AND `SWEEP_DETAIL=1` IS WHERE A NUMBER BECOMES ACTIONABLE ──
 * A summary says a run is worse; it cannot say why. CLAUDE.md's topic tiering came from
 * reading the WORST passages of a run and noticing they were not badly written but written
 * about the wrong things — `pulsera` (C2) in "how to make a beaded bracelet". So the detail
 * mode prints each passage's title against its above-level share, worst first, and then the
 * words that were above level most often across the whole run. Both come straight out of
 * `Readability.hardest`, which exists for exactly this.
 *
 * ── AND ONE DIAGNOSTIC SECOND FIGURE, WHICH IS NOT A PROPOSED CHANGE TO THE METRIC ──
 * A PERSON'S NAME SPELLED LIKE A COMMON NOUN IS GRADED AS THE COMMON NOUN. `nameFilter.mjs`
 * strips proper nouns from the tables so a character resolves to nothing and is excluded — but
 * `maría` survives as a real Spanish word (magpie; Marie biscuit), sits in B1, and a run of 28
 * A1 passages addressed to a María counted it 23 times as above-level: the single largest
 * contributor in the whole run. `ungradeable` cannot reach it, deliberately —
 * `calculateReadability` only consults it when the index does NOT know the form, and the index
 * knows this one.
 *
 * So the second figure drops tokens the GENERATOR glossed as a name through its own `names`
 * side-channel, and it exists to BOUND that error rather than to fix it. CLAUDE.md rejects
 * sniffing for "(name)" inside the app, and rightly: it reads a phrasing the model chose and
 * the prompt never asked for, so it would be a metric resting on wording nobody guaranteed.
 * In a script whose entire job is to say how much of a number is artefact, reading it once and
 * labelling it is the honest move — the gap between the two figures IS the finding.
 *
 * Spanish only, like the sweep: these are the tables it reads.
 */

const DIR = process.env.SWEEP_DIR;
const LEVELS = (process.env.SWEEP_LEVELS || '1,2,3,4,5,6').split(',').map(Number);
const ORDER = [1, 2, 3, 4, 5, 6];
const BAND_NAMES = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

const forms = ES_FORMS as Record<string, string>;
const dict = ESDICT as Record<string, { m?: string } | undefined>;
const index = buildLevelIndex(BANDS as unknown as LevelBands, ORDER);
const ungradeable = (form: string) => !dict[form]?.m && !forms[form];
const altKey = (t: PassageToken) => forms[(t.baseForm ?? t.text).trim().toLowerCase()];

/** The generator's own names side-channel. See the diagnostic note above. */
const glossedAsName = (t: PassageToken) => /^\s*\((?:name|place)\)/i.test(t.meaning ?? '');

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

describe('sweep readability', () => {
  it('reports above-level share per level', () => {
    if (!DIR) throw new Error('set SWEEP_DIR to a directory holding level-<n>.json dumps');
    const out: string[] = [];
    const say = (line: string) => { out.push(line); console.log(line); };

    for (const level of LEVELS) {
      let dump: { passages?: unknown[] };
      try { dump = JSON.parse(readFileSync(`${DIR}/level-${level}.json`, 'utf8')); } catch { continue; }

      const above: number[] = [];
      const sizes: number[] = [];
      const perPassage: { title: string; share: number; tokens: number }[] = [];
      const hardTotals = new Map<string, { count: number; rank: number }>();
      let pooledTokens = 0, pooledAbove = 0, pooledTypes = 0, skipped = 0;
      let nameFreeTokens = 0, nameFreeAbove = 0, namesDropped = 0;

      for (const raw of dump.passages ?? []) {
        const p = raw as { titleTokens?: PassageToken[]; sentences?: { tokens: PassageToken[] }[] };
        const tokens = [...(p.titleTokens ?? []), ...(p.sentences ?? []).flatMap(s => s.tokens)];
        const r = calculateReadability(tokens, index, level, ORDER, ungradeable, altKey);
        if (r.tokens < MIN_TOKENS) { skipped += 1; continue; }
        above.push(1 - r.coverage);
        sizes.push(r.tokens);
        perPassage.push({
          title: tokensToText(p.titleTokens ?? [], false).trim() || '(untitled)',
          share: 1 - r.coverage,
          tokens: r.tokens,
        });
        for (const h of r.hardest) {
          const prev = hardTotals.get(h.word);
          hardTotals.set(h.word, { count: (prev?.count ?? 0) + h.count, rank: h.level });
        }
        pooledTokens += r.tokens;
        pooledAbove += r.tokens * (1 - r.coverage);
        pooledTypes += r.types;

        const withoutNames = tokens.filter(t => !glossedAsName(t));
        namesDropped += tokens.length - withoutNames.length;
        const rn = calculateReadability(withoutNames, index, level, ORDER, ungradeable, altKey);
        nameFreeTokens += rn.tokens;
        nameFreeAbove += rn.tokens * (1 - rn.coverage);
      }

      if (above.length === 0) { say(`level ${level}: nothing measurable`); continue; }
      const sorted = [...sizes].sort((a, b) => a - b);
      say(`level ${level} (${BAND_NAMES[level - 1] ?? level})  n=${above.length} passages  `
        + `${pooledTokens} tokens  median ${sorted[Math.floor(sorted.length / 2)]}/passage`
        + (skipped ? `  (${skipped} too short to measure)` : ''));
      say(`   above level: pooled ${pct(pooledAbove / pooledTokens)}  `
        + `per-passage ${pct(mean(above))} ± ${pct(sd(above))}  `
        + `range ${pct(Math.min(...above))}–${pct(Math.max(...above))}`);
      say(`   ${(pooledTypes / pooledTokens).toFixed(2)} distinct forms per token`);
      if (namesDropped > 0) {
        say(`   diagnostic: ${pct(nameFreeAbove / nameFreeTokens)} with the ${namesDropped} `
          + 'tokens the generator glossed as names removed — see the header; this is a bound on '
          + 'measurement error, not the figure to quote');
      }

      if (!process.env.SWEEP_DETAIL) continue;
      say('   ── worst passages ──');
      for (const x of [...perPassage].sort((a, b) => b.share - a.share).slice(0, 8)) {
        say(`   ${pct(x.share).padStart(6)}  ${String(x.tokens).padStart(4)} tok  ${x.title}`);
      }
      say('   ── most frequent above-level words ──');
      const worst = [...hardTotals.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 15);
      say('   ' + worst
        .map(([w, x]) => `${w}(${BAND_NAMES[x.rank] ?? '—'}×${x.count})`)
        .join('  '));
    }

    /**
     * SILENCE IS NOT A RESULT. With no usable dumps this printed nothing at all and passed,
     * which reads exactly like a measurement of zero rather than the absence of one — the
     * mistake CLAUDE.md names four times over, here in the tool that exists to report.
     */
    if (out.length === 0) {
      say(`no passage dumps in ${DIR} for level(s) ${LEVELS.join(', ')}.`);
      say('The sweep writes level-<n>.json only when it generated something — check its log.');
    }
    writeFileSync(`${DIR}/readability.txt`, `${out.join('\n')}\n`);
  });
});
