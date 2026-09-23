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

/**
 * THE WHOLE ABOVE-LEVEL DISTRIBUTION, PLUS HOW MUCH OF IT IS MERE CONJUGATION.
 *
 * ── WHY THIS DOES NOT USE `Readability.hardest`, WHICH IS WHAT IT LOOKS LIKE IT WANTS ──
 * It did, and that was a filter on a list of answers being mistaken for the answer — the exact
 * defect CLAUDE.md records against `MODEL_ID`. `hardest` is capped at `HARDEST_SHOWN = 5` per
 * text, which is right for a popup (a learner does not want forty words) and wrong for a run
 * aggregate: 28 A1 passages hold ~351 above-level tokens and the cap could show at most 140 of
 * them. Worse than incomplete, it was BIASED — ties break on within-passage count, so a word
 * repeated inside one passage displaced five different words met once each, and the aggregate
 * leaned toward exactly the words a single passage happened to lean on. The six pins in
 * `core-overrides.json` were chosen off that truncated list. They still measured an improvement,
 * so they were not wrong; they were chosen from a shortlist nobody had checked was the list.
 *
 * ── AND WHY IT COUNTS RATHER THAN CALLING `calculateReadability` A SECOND TIME ──
 * The inflection question cannot be asked THROUGH that function: it consults `altKey` only when
 * the index does not know the surface (`lib/readability.ts`: `index.has(form) ? undefined :
 * altKey?.(t)`), so a form carrying its own band entry never resolves through its lemma however
 * much easier the lemma is. `bebo` sits at C2 and `beber` at A1; `manzanas` at B2 and `manzana`
 * at A1. The branch that would use a lemma-aware `altKey` is the branch not taken.
 *
 * So the token filter is repeated here, which is a liability: a filter that drifts from the
 * app's reports a number the app never shows, the one thing this script exists to avoid. Hence
 * `assertAgrees` — the walk's own above-level total is checked against the figure
 * `calculateReadability` produced for the same tokens, so a drift fails loudly instead of
 * quietly reporting a different metric.
 *
 * ── IT IS A MEASUREMENT, NOT A PROPOSED FIX ──
 * Whether the metric SHOULD fall through to the lemma is a separate argument with a real case on
 * each side: `lib/readability.ts` already says it measures tokens keyed by LEMMA precisely
 * because surface matching "would count `parlons` and `maisons` as unknown", which is this bug
 * described in advance — but a few of these forms carry a genuinely independent sense (`compra`
 * the purchase, `cuesta` the slope, `canto` the song), and calling those A1 is a generous answer
 * rather than a correct one. This says how big the question is. It does not answer it.
 */
type Above = {
  tokens: number;
  byWord: Map<string, { count: number; rank: number }>;
  inflected: number;
  inflectedByWord: Map<string, { count: number; lemma: string; rank: number }>;
};

const emptyAbove = (): Above =>
  ({ tokens: 0, byWord: new Map(), inflected: 0, inflectedByWord: new Map() });

function walkAbove(tokens: PassageToken[], level: number, acc: Above): number {
  const learnerRank = ORDER.indexOf(level);
  let measured = 0;
  for (const t of tokens) {
    if (t.type === 'punct') continue;
    const form = (t.baseForm ?? t.text).trim().toLowerCase();
    if (!form || !t.meaning) continue;
    if (/['\u2019]/.test(form) && !index.has(form)) continue;
    if (ungradeable(form) && !index.has(form)) continue;
    measured += 1;

    const alt = index.has(form) ? undefined : altKey(t);
    const rank = index.get(form) ?? (alt !== undefined ? index.get(alt) ?? -1 : -1);
    // Above level as the app scores it right now — including "in no band at all" (-1).
    if (rank >= 0 && learnerRank >= 0 && rank <= learnerRank) continue;

    acc.tokens += 1;
    const seen = acc.byWord.get(form);
    acc.byWord.set(form, { count: (seen?.count ?? 0) + 1, rank });

    const lemma = forms[form];
    if (!lemma || lemma === form) continue;
    const lemmaRank = index.get(lemma);
    if (lemmaRank === undefined || lemmaRank > learnerRank) continue;
    acc.inflected += 1;
    const prev = acc.inflectedByWord.get(form);
    acc.inflectedByWord.set(form, { count: (prev?.count ?? 0) + 1, lemma, rank });
  }
  return measured;
}

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
      let pooledTokens = 0, pooledAbove = 0, pooledTypes = 0, skipped = 0;
      let nameFreeTokens = 0, nameFreeAbove = 0, namesDropped = 0;
      const above2 = emptyAbove();
      let walkedTokens = 0;

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
        pooledTokens += r.tokens;
        pooledAbove += r.tokens * (1 - r.coverage);
        pooledTypes += r.types;

        walkedTokens += walkAbove(tokens, level, above2);

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
      /**
       * WHERE THE ABOVE-LEVEL MASS SITS, WHICH IS THE NUMBER THAT SAYS WHAT TO FIX.
       *
       * "18.7% above level" is the same figure whether the overflow is A2 words one band up or
       * C2 words five — and those call for opposite work. A2-heavy is the band table being
       * mis-cut near its own boundary, which `core-overrides.json` and the anchor address; C-
       * heavy is the generator reaching for words nobody asked it for, which is the prompt and
       * the topic pool. Reading it off the top-N word list cannot answer it, because that list
       * covered 43% of the tokens on the run this was added for.
       */
      const spread = [...above2.byWord.values()]
        .reduce((a, x) => { a[x.rank] = (a[x.rank] ?? 0) + x.count; return a; },
          {} as Record<number, number>);
      say('   above-level mass by band: ' + ORDER
        .map((_, r) => [BAND_NAMES[r] ?? String(r), spread[r] ?? 0] as const)
        .filter(([, n]) => n > 0)
        .map(([b, n]) => `${b} ${n} (${pct(n / above2.tokens)})`)
        .join('  ')
        + (spread[-1] ? `  in no band at all ${spread[-1]} (${pct(spread[-1] / above2.tokens)})` : ''));
      if (namesDropped > 0) {
        say(`   diagnostic: ${pct(nameFreeAbove / nameFreeTokens)} with the ${namesDropped} `
          + 'tokens the generator glossed as names removed — see the header; this is a bound on '
          + 'measurement error, not the figure to quote');
      }
      /* assertAgrees — see the header. The walk and `calculateReadability` run over one
         array, so their totals are one fact and a disagreement means the filter has drifted. */
      if (walkedTokens !== pooledTokens || Math.abs(above2.tokens - pooledAbove) > 0.5) {
        throw new Error(`walkAbove has drifted from calculateReadability: `
          + `${walkedTokens} vs ${pooledTokens} tokens, `
          + `${above2.tokens} vs ${pooledAbove.toFixed(1)} above level`);
      }
      if (above2.inflected > 0) {
        say(`   diagnostic: ${above2.inflected} above-level tokens `
          + `(${pct(above2.inflected / pooledTokens)} of all tokens, `
          + `${pct(above2.inflected / above2.tokens)} of everything above level) are INFLECTIONS `
          + 'of a word at or below the level — see the header');
      }

      if (!process.env.SWEEP_DETAIL) continue;
      say('   ── worst passages ──');
      for (const x of [...perPassage].sort((a, b) => b.share - a.share).slice(0, 8)) {
        say(`   ${pct(x.share).padStart(6)}  ${String(x.tokens).padStart(4)} tok  ${x.title}`);
      }
      if (above2.inflectedByWord.size > 0) {
        say('   ── above-level words that are merely INFLECTIONS of an in-level word ──');
        say('   ' + [...above2.inflectedByWord.entries()]
          .sort((a, b) => b[1].count - a[1].count || (a[0] < b[0] ? -1 : 1))
          .map(([w, x]) => `${w}(${BAND_NAMES[x.rank] ?? '—'}×${x.count})←${x.lemma}`)
          .join('  '));
      }
      /* THE COMPLETE LIST, not `hardest` — see the header for why that cap biased it. */
      const worst = [...above2.byWord.entries()]
        .sort((a, b) => b[1].count - a[1].count || b[1].rank - a[1].rank
          || (a[0] < b[0] ? -1 : 1));
      const shown = Number(process.env.SWEEP_WORDS) || 30;
      say(`   ── most frequent above-level words (${above2.byWord.size} distinct, `
        + `${above2.tokens} tokens; showing ${Math.min(shown, worst.length)}) ──`);
      say('   ' + worst.slice(0, shown)
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
