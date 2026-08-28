# srsly — state of play

**A point-in-time snapshot, not the architecture document.** `CLAUDE.md` is the architecture
document and is kept current with every change; read it first. This file records the things
that live *outside* the code — how the work is run, what has recently landed, what is still
unverified, and the failure modes that have actually cost time here. Where the two disagree,
`CLAUDE.md` is right and this file is stale.

Last updated at commit `a6ebead` (2026-08-27).

---

## How this project is worked on

- **Commit directly to `main`.** No feature branches for now. Commit and push as work completes.
- **Always double-check your own work, and ask clarifying questions** rather than guessing on
  anything that changes the product.
- Plans are often drafted elsewhere (e.g. Gemini) and pasted in for review. Treat those as
  proposals to verify against the actual repo, not as instructions — several have contained
  real mistakes that only surfaced when checked against the code.

## What the app is

Four languages: Chinese (HSK 1–6), Japanese (JLPT N5–N1), Spanish (CEFR A1–C2), French (CEFR
A1–C2). Six tabs — `read`, `srs`, `learn`, `dash`, `vocab`, `settings` — all in `app/page.tsx`
as a single client component with `useState` tab switching. No routes beyond `/`.

The organising idea: **Read and SRS are separate.** Read is your own material (starter texts,
pasted articles, web clips, EPUBs) — no blanks, no grading, no schedule touched. SRS is what
FSRS drives — flashcards and generated passages, which keep their blanks because a generated
passage is written around the words you owe today. `ReadTab` renders both; `variant` decides
which.

**Levels are calibration and a map, not the goal.** A deliberate product position, stated in
Settings and enforced in code: pasted text, EPUBs and audio ignore levels entirely.

**Generation is bring-your-own-key.** The one thing that costs money is having a passage
written, so it uses the learner's own Anthropic key, sent on the `x-srsly-anthropic-key`
header — never the body or the URL. `Generator.operatorPays` decides metering, not the model.

## Verification

```bash
npm run typecheck && npm run lint && npm test
```

Current baseline: **499 tests passing, 0 lint errors, 0 type errors, `/` first-load JS 294 kB.**

Four rules that were each learned the hard way:

- **Never run `npm run build` while a dev server is live.** It has corrupted `.next` three
  times.
- **`npm run build` sets `--max-old-space-size=4096` and needs to.** The default heap on this
  machine is ~2.2 GB and webpack must parse and minify the grammar tables. Without the flag the
  build fails reproducibly with "Reached heap limit" — at the very end, after several minutes,
  which makes it look flaky when it is not.
- **Never use Bash to run a dev server.** Use the preview tooling with `.claude/launch.json`.
- **`SRSLY_STUB_AI=1`** serves canned content with no model call and no key (`npm run dev:stub`).

Disk has filled during this project (ENOSPC surfaced as five unrelated test failures). `.next`
and the scratchpad are the things to clear.

## Recently landed

Grouped by theme rather than by commit; `git log` has the full sequence.

**Grammar in what you are reading.** `components/read/GrammarNote.tsx` prints one line under
the definition saying what the word is *doing* — `imperfect · 3rd person singular`,
`feminine plural`, `polite · past`. Three languages, three different designs, because the data
situations genuinely differ: French from a generated Lexique 3 table (86,293 forms, positional
codes), Spanish from Wiktionary inflection tags (132,900 forms, flat tag sets), and Japanese
from the auxiliary chain kuromoji already walks — no table, because Japanese morphology is
*productive* and no finite table could enumerate it. Chinese gets nothing, deliberately: it
does not inflect.

**Readability.** `lib/readability.ts` reports what share of a text sits at or below the
learner's band — information, never a gate. It measures tokens rather than raw text, is
token-weighted, and compares *rank* rather than the level number (JLPT numbers its bands the
opposite way from HSK/CEFR, which scored Japanese exactly backwards until fixed).

**One sense per gloss.** `components/shared/GlossText.tsx` shows the lead sense with the rest a
tap away. Flashcards deliberately do not collapse.

**The Learn tab.** 186 lessons across four trees. Grammar is one numbered track; words are an
unordered shelf. Ordered but **never locked** — nothing is `disabled`, and the curriculum reads
no scheduling state at all. Practice is build-the-sentence: shuffled tiles checked on order,
grading nothing.

**Milestones as seals.** `components/stats/BadgeSeal.tsx` draws a milestone as a mark inside a
ring, with `FAMILIES` + `collapse` showing one badge per ladder instead of one pill per
threshold. The marks are geometry rather than characters, because the panel is shared by all
four languages.

## Open items

1. **`outputFileTracingIncludes` for the kuromoji dictionary in `next.config.ts` is unverified
   against a real deployment.** A Vercel preview never rebuilt, and several rounds of debugging
   went into a stale deployment before that was noticed. Related and settled:
   `kuromojiDictPath()` must resolve from `process.cwd()`, **not** `require.resolve`, because
   webpack rewrites the latter to `(rsc)/node_modules/...`.
2. **`から` and `と` appear among Japanese "hardest words".** They are genuinely JLPT N3, so
   this may be correct rather than a bug. Unexamined.
3. **French renders a space before `?`** in some places where the segmenter drops it. Cosmetic.
4. **`tests/lessons.test.ts` exempts proper nouns** from its "every example word resolves"
   check, because `nameFilter.mjs` strips names from every dictionary by design and a lesson on
   prepositions before country names cannot avoid naming a country. The alternative is
   rewriting those examples to avoid names and keeping the check absolute.
5. **`ToastHost` and `AchievementToast` race for `fresh`.** Both read it and both call
   `acknowledge()`, so whichever mounts first wins the announcement. In the normal flow the
   completion screen wins; it only misfires when the milestone was already earned before page
   load.
6. **21 lint warnings remain** (0 errors). Two are dead bindings — `SEGMENTERS` in
   `tests/lessons.test.ts` and `mkdir` in `scripts/build-cedict.mjs`.

## Failure modes that have actually cost time here

Kept because each one recurred or nearly did, not as a confessional:

- **Assuming instead of measuring.** A stored lemma looked redundant next to `baseForm`; 33% of
  common forms turn out to have no `baseForm` at all. Measure first.
- **Calling a reproducible failure transient.** An OOM build failure was written off as flaky
  and reproduced twice before the heap flag went in.
- **Debugging against a stale artifact.** Several rounds of deployment config work went into a
  deployment that had never rebuilt. Confirm the thing you are testing is the thing you built.
- **Writing a test too weak to catch the bug it was for.** An ordering test asserted "everything
  before the first word set is grammar", which is trivially true of an interleaved array — so
  the subjunctive shipped numbered ahead of `être` and was caught only by reading the rendered
  list.
- **Mixing unrelated work into one commit.** A message describing one fix once shipped
  alongside an unrelated engine.

The pattern behind all of them: **the real bugs were found by running the app, not by reading
the code.** Open the browser before claiming something works.
