# srsly

[![CI](https://github.com/xyzqm/srsly/actions/workflows/ci.yml/badge.svg)](https://github.com/xyzqm/srsly/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**A reading-first spaced-repetition app for Chinese, Japanese, Spanish and French.** You read
something you actually wanted to read — an article, a novel, a chapter of an EPUB — tap the
words you don't know, and they become scheduled review cards. The app's whole argument is that
levels are a map, not the goal.

**[Live demo](https://srsly-zeta.vercel.app)** · **Engineering log:** [CLAUDE.md](CLAUDE.md)

Reading fills the deck; the deck drives three drills. **Flashcards** in every language, typed
with your own IME. **Handwriting** in Chinese — draw the character, graded by its strokes
([`lib/writingState.ts`](lib/writingState.ts)), with printable 田字格 practice paper for when
you would rather use a pen. **Conjugation** in Spanish
and French, where the regular patterns are taught first and every irregularity is derived from
the dictionary rather than authored.

Generated passages carry one more mode. **Listen** hides the text, plays the sentence aloud and
asks you to type what you heard into the blanks that were already there — the same input and the
same grading, with the reading taken away.

No account needed to try it: reading, dictionary lookups, EPUBs, the lesson tree and every drill
work signed out. Signing in only adds sync. Passage generation is the one thing that costs
money, so it asks for your own Anthropic key rather than spending someone else's.

---

![Reading a text, with per-text readability and real word segmentation](docs/read.png)

<table>
<tr>
<td width="50%"><img src="docs/learn.png" alt="A grammar lesson with a reference table and a pitfall note"></td>
<td width="50%"><img src="docs/practice.png" alt="Building a sentence from tiles"></td>
</tr>
<tr>
<td width="50%"><img src="docs/conjugate.png" alt="A conjugation exception card: pedir's e→i change, with the four forms it alters picked out against the two that behave"></td>
<td width="50%"><img src="docs/practice-sheet.png" alt="Printable tianzige practice paper, with a stroke-order band above each row"></td>
</tr>
<tr>
<td colspan="2"><img src="docs/dictation.png" alt="A listening-dictation run: the sentence just earned is legible with its three typed answers ticked, and everything not yet answered stays blurred"></td>
</tr>
<tr>
<td colspan="2"><img src="docs/stats.png" alt="Milestones, drawn as seals with one badge per ladder"></td>
</tr>
</table>

---

## What is actually hard here

The stack is Next.js on Vercel with Supabase for sync, which is the least interesting thing
about this project. The hard parts are these.

### Four languages, four different segmentation problems

You cannot tap a word until you know where words begin, and no two of these languages make that
the same problem.

- **Chinese is scored, not greedy-longest** ([`lib/server/chineseSegmenter.ts`](lib/server/chineseSegmenter.ts)).
  A 121k-entry dictionary makes longest-match wrong in *both* directions: a long rare entry
  beats a common pair (我家的小猫 read as 家的, CC-CEDICT's "(old) wife"), and a long match
  strands what it leaves (中国人民 → 中国人 + a bare 民). A `wordScore` standing in for
  log P(word) is maximised over each Han run by dynamic programming. Because every score is
  negative, adding a word *costs* something — which is what keeps 小猫 whole instead of
  splitting it into two commoner characters.
- **Japanese needs morpheme fusion.** kuromoji splits 使っています into four pieces; a fusion
  pass re-merges its output into whole conjugated words before anything is looked up.
- **French and Spanish needed lemmatizers written from scratch**
  ([`lib/server/frenchLemmatizer.ts`](lib/server/frenchLemmatizer.ts),
  [`lib/server/spanishLemmatizer.ts`](lib/server/spanishLemmatizer.ts)) — there is no published
  npm lemmatizer for French, and a Snowball *stemmer* is the wrong tool because stemmers emit
  non-words (`manger` → `mang`) while every candidate here must validate against a real
  headword. The interesting cases are homographs: `livre` is "book" before it is a form of
  `livrer`, but `est` really is "is" before it is the noun "east". Getting that ordering wrong
  makes "n'est pas" resolve to a compass direction.

### Grading vocabulary difficulty from open data

CEFR publishes no official word list, so the bands are derived and the derivation is the work.
Words are ranked across **three registers** (everyday, news, reference) by the **mean of their
two best per-register ranks** — averaging *ranks* rather than frequencies stops whichever corpus
has the most extreme distribution from setting the order, and needing two placements *is* the
"common in more than one register" rule.

The bands are then cross-checked against an English anchor (CEFR-J + Octanove, 8,845 headwords).
The anchor has a large systematic bias, so it **swaps pairs across a band boundary** instead of
reassigning words to their anchor level — a uniform pull cancels by construction, only relative
disagreement moves anything, and every band keeps its curriculum size. It moves ~3–4% of words.

Both of those choices were measured against alternatives that failed. So was a blend that
**inverted**: adding a non-narrative register to French ranked `guerre` and `mort` *higher* and
pushed `bonjour` to B2, because conflict is core news vocabulary and greetings are not.

### Deriving a conjugation curriculum, and three heuristics that lied

Spanish and French each ship a Wiktionary- or Lexique-derived grammar table for the word-popup
grammar note. The conjugation drill ([`lib/conjugation.ts`](lib/conjugation.ts),
[`lib/conjugationFr.ts`](lib/conjugationFr.ts)) is **derived from those tables at runtime** — no build step,
no generated file — because a table of conjugation facts would be a second record of what the
first already says. 1,259 Spanish verbs are analysed end to end in 246 ms.

The interesting part is compression. 9.6% of Spanish cells are irregular, but treating each as
its own fact would mean **5,222 cards** — more than the entire HSK 1–6 vocabulary. Clustering by
what actually changes takes that to **819 facts, 6.4×**: `pedir`'s eighteen irregular cells
across five tenses are one card, because *e→i* is one thing to learn.

That works only if the diff is cut in the right place. Comparing `pensa` against `piensa` as
whole strings finds the shared suffix `ensa` and reports the stem as **`pi`** — which clusters
*correctly*, so it passes a counting exercise and then prints a card that says "pi". The regular
form was *generated* as stem + ending, so the cut point is known rather than inferred.

**Then the data fought back. Three times, and each was a rule that looked obviously right,
passed its tests, and put a wrong form on a card.** All three were caught by reading the output,
not the code.

| | The rule | What it produced | The fix |
|---|---|---|---|
| **`tiée`** | shortest form wins — correct for clitics, since `hablándole` carries the same tag as `hablando` | Wiktionary lists both `tiene` and `tiée` as *tener*'s third person. `tiée` is not a word and is one letter shorter | cost each candidate against the regular paradigm; a one-letter insertion beats a two-letter rewrite. Removed 25 spurious A1 cards |
| **`pincer`** | fall back to length when a verb has no regular class | Lexique tags `pincer` — "to pinch" — as *pouvoir*'s 2nd-person plural. Both candidates are six letters, so the tie broke alphabetically | a conjugated form keeps the **shape** of its verb: `pouvez` shares four letters with `pouvoir`, `pincer` shares one |
| **`étaient`** | class a verb by its ending | `être` ends in `-re`, so it was "regular" — and the cost function then *prefers* regular-looking candidates. `étaient` scored 7 against the correct `sont`'s 101 | a verb must **earn** its class: deviate in ≥40% of cells and you are learned as whole rows instead |

That last threshold is measured, not chosen, and nothing sits in the gap: parler 0%, vendre 0%,
rompre 4%, battre 10%, mettre 13%, manger 21% — then prendre 48%, dire 55%, faire 94%, être
100%. It also lands `prendre`, `dire` and `faire` in the third group, which is where a textbook
has them.

The lesson generalises past this project: **a heuristic that ranks candidates always returns
something, and never says how sure it was.** Cost against a model of what the answer should look
like rather than a proxy like length; where there is no model, use a signal that carries meaning.
Then go and look at what it produced.

### Two more places the data decided the design

**The passé composé is not in the table at all.** French's everyday past is `avoir`/`être` plus
a participle — two words — and Lexique lists simple forms only (54 multi-word entries in 86,293).
So it is *composed*: `avoir` is the pattern, the `être` verbs are an authored exception list held
to the same standard as everything else (a test asserts every entry is a verb the table knows),
and number agreement is applied because `nous sommes allé` is wrong French. Gender is not,
because `elle est allée` depends on a subject no flashcard can know.

**Printing 田字格 paper ([`lib/practiceSheet.ts`](lib/practiceSheet.ts)) needed no PDF library
and no font.** jsPDF would have to draw 水 itself,
which means embedding a CJK font — megabytes, to render characters already shipped as vector
outlines for the handwriting canvas. `window.print()` and a stylesheet do it, the stroke paths
draw the glyphs, and the animation library never loads. Three numbers had to be measured rather
than guessed: the glyph box overflows its nominal 1024 grid by 100 units at the *bottom only*
(an estimate of "±50 all round" was wrong in size and direction); the 田字格 cross-hairs first
shipped at 0.07 mm — a quarter of a screen pixel — because a stroke width in viewBox units is a
different physical line in a different-sized box; and ten 18 mm cells fit both A4 and US Letter,
which is why there are ten.

### Listening dictation, where the obvious build was already written and backwards

A **Listen** toggle on a generated passage ([`lib/dictation.ts`](lib/dictation.ts)) plays a
sentence aloud, hides its text, and asks you to type what you heard into the blanks that were
already there.

**It stores nothing and grades nothing new.** The blanks, the typed field, the accent-sensitive
comparison, the refusal to re-grade an answered blank and the FSRS write are all the ones the
cloze passage already performs — dictation changes only what can be *seen* while answering. No
column, no card type, no second scale: recognising a word by ear is arguably harder than reading
it, but a separate number for that would be a second record of one fact.

**`speakWithBlank()` had been sitting in [`lib/speech.ts`](lib/speech.ts) with zero call sites**
— speak up to the blank, go silent, speak the rest — looking exactly like the function this
feature had been waiting for. It tests the opposite skill. A word that was never spoken cannot
be heard, so silence at the gap asks whether you can *infer* a missing word from context, where
listening practice asks whether you can *recognise* one by ear and spell it. It also handles
exactly one gap, and a sentence can carry several, since a word is blanked in all of its
occurrences and blanks have no ceiling. So the sentence is spoken whole and the page is what
hides it — and the function kept a job as the "play it with the gap" hint, for someone who has
heard the sentence and still cannot place the word.

**Hiding text is harder than blurring it.** A blurred token is still a token: tappable, with a
lookup popup ready to print the word *and its definition* for the one word being tested,
selectable by dragging across it, and read out verbatim by a screen reader. So a hidden token is
an inert span — `pointer-events: none`, `user-select: none`, `aria-hidden` — with the characters
left in place so nothing reflows when the sentence is earned. Blur is a look, not a barrier.

A sentence is revealed the moment its last blank is answered rather than at the end of the run:
seeing the sentence you just heard is where the learning lands, and holding it to a results
screen puts it a long way from the moment it means anything.

### A hand-written FSRS scheduler

[`lib/fsrs.ts`](lib/fsrs.ts) implements FSRS v4.5 directly — 19 weights, learning steps, the
retrievability curve `R(t,S) = (1 + F·t/S)^D`. Not a dependency. Mastery is measured as
*stability*, not review count, because "passed eight times" describes a card you keep
forgetting just as well as one you know.

### Performance work, with numbers

- **TypeScript memory: 2.13 GB → 0.31 GB** (2.86M → 220k symbols). With `resolveJsonModule` on,
  tsc opens every generated JSON file and materialises an object type with one property per key.
  Routing those imports through an alias tsc *cannot resolve* lets an ambient declaration apply
  instead, so the files are never read — while webpack resolves them normally and chunk
  splitting is unaffected.
- **First-load JS: ~890 kB → 316 kB.** The level tables are 338 kB–900 kB of source each.
  Loading them on demand rather than importing them at module scope is the whole difference.
- **A shipped grammar table cut from 22.6 MB to 4.2 MB** by keeping only the forms the
  lemmatizer can actually produce — 93% of Wiktionary's Spanish conjugations can never match a
  `baseForm`, so they were 15 MB that could never render.

## How it is verified

**862 tests across 44 files**, and they cover [`lib/`](lib) rather than components — deliberately.
The bugs that actually happened were in pure functions with documented but unasserted contracts:
`œuvres` lemmatising to a verb, NFD normalisation shredding every accented word, `d'accord`
resolving to "chord" under a typographic apostrophe. Those are cheap to pin and expensive to
notice.

The lemmatizer tests load the **real** dictionaries rather than fixtures, because their
assertions are claims about that data — "`est` is a headword meaning east, which is why peeling
`n'est` needs a second pass" — and a stub would test the regex instead of the behaviour.

UI work is verified by **driving the actual app**, not by unit-testing components. That rule is
in [CLAUDE.md](CLAUDE.md) because it keeps earning itself: the practice exercise once presented
its tiles already in the correct order, solvable by tapping left to right without reading a
word, and every existing assertion passed because they all checked *which* tiles existed and
none checked their order.

```bash
npm test        # 862 tests
npm run lint    # 0 warnings
npm run typecheck
```

## Architecture

Next.js 15 App Router, React 19, TypeScript, Tailwind v4. One client page with tab panels
rather than routes — tabs stay mounted so a reading session survives a trip to the deck.

Storage is an interface: [`lib/storage/types.ts`](lib/storage/types.ts) defines `DataService`,
and a singleton starts on `LocalStorage` and swaps in `SupabaseStorage` after sign-in, which
composes the local one as an offline read cache and write-through. **The app is fully usable
signed out** — sign-in buys sync, nothing else.

Postgres has row-level security on every table, and the guest AI budget is enforced by a
`SECURITY DEFINER` function with `revoke all from public`, so the limit lives in the database
rather than in the client that is asking for credit
([`supabase/schema.sql`](supabase/schema.sql)).

**Generation is bring-your-own-key.** srsly is free to run and free to use; the one thing that
costs money is having a new passage written, so that uses the learner's own Anthropic key, sent
on a header rather than in a body or URL because URLs get logged by proxies and a logged
credential is a leaked one. Reading your own text, an EPUB or a starter text makes **no model
call at all**.

## The build pipeline

The dictionaries and level tables are generated, never hand-edited — 21 MB of JSON built from
open corpora by scripts in [`scripts/`](scripts):

| Script | Emits |
|---|---|
| `build-cedict.mjs` | `public/cedict.json` |
| `build-jmdict.mjs` | `public/jmdict.json`, the JLPT tables |
| `build-esdict.mjs` / `build-frdict.mjs` | the Spanish and French dictionaries, form tables and CEFR bands |
| `build-frgrammar.mjs` / `build-esgrammar.mjs` | which grammatical slot each inflected form fills |
| `build-lesson-practice.ts` | the Learn tab's practice tiles, cut by the real segmenters |

Proper nouns are filtered at build time by a shared `nameFilter`, per *sense* rather than per
entry — so `jean` keeps "denim" and loses the given name.

## Some decisions, and why

The full engineering log is [CLAUDE.md](CLAUDE.md). A few worth reading:

- **[An idea that was built, measured, and removed.](CLAUDE.md#environment)** A local Ollama
  generator worked — 5/5 usable passages from `qwen2.5:3b` — but it runs on localhost, so it
  could only ever serve the machine it was installed on, and it was reached for to make
  generation free for *learners*. It was deleted. It left one permanent fix: the 3B model
  returned the literal placeholder string `WORDS` as a title 2 times in 5 where Haiku never
  did, so the prompt now says the title is one you write. **A weaker model is a good prompt
  linter.**
- **[Levels are calibration, not the goal.](CLAUDE.md#the-lesson-tree)** Lessons are sequenced
  but nothing is ever locked, and pasted text and EPUBs ignore levels entirely. A learner who
  believes the ladder is the point will not open their own book.
- **[Only generated passages have blanks.](CLAUDE.md#a-passage-is-generated-only-when-asked-for)**
  A generated passage is written around the words you owe today, so it may fairly test you. A
  novel you chose carries no such contract, and turning it into an exercise is how reading
  stops being the reward.
- **[Two numbers, two questions.](CLAUDE.md#how-hard-is-this-for-me)** "How many of these words
  have I studied?" and "is this written near my level?" routinely disagree, and both readings
  are correct. Showing one number and calling it "coverage" is what made that confusing.
- **[Readability was scoring Japanese exactly backwards.](CLAUDE.md#how-hard-is-this-for-me)**
  HSK and CEFR number their bands easiest-first; JLPT numbers them the other way. Comparing raw
  level numbers put を and する among a starter text's hardest words. Comparing *rank* took it
  from 0% to 91%.

## Running it

```bash
npm install
npm run dev      # localhost:3000
```

No API key is needed to read, look words up, use an EPUB, or review flashcards — with an empty
environment the app runs fully in local-guest mode. Passage generation asks for your own
Anthropic key in Settings (about 1¢ a passage, billed to you by Anthropic, never stored
anywhere but the device you typed it on). Sync needs a Supabase project — see
[`supabase/schema.sql`](supabase/schema.sql), which is a one-file setup.

[`.env.example`](.env.example) lists every variable, all of them optional, and says which ones
must stay **unset** on a public deployment and why.

## Licence and data

srsly's source is **MIT** ([LICENSE](LICENSE)).

The dictionaries it redistributes are not. They are derived from CC-CEDICT, JMdict and
Wiktionary and stay under **CC BY-SA 4.0**; the character-decomposition data is **LGPL-3.0**.
[NOTICE.md](NOTICE.md) covers what ships, and
[`scripts/data/ATTRIBUTION.md`](scripts/data/ATTRIBUTION.md) covers the build-time inputs —
including why the LGPL source was chosen over the more obvious GPLv2 one for the only dataset
whose licence travels into the browser.

## Who built this, and how

srsly was started with my brother [Daniel](https://github.com/xyzqm), who made the first commit
in June 2026 and worked on it through July. I have written the large majority of it — 235 of
295 commits, and every commit since 26 July. `git shortlog -sne` will tell you the same thing
without taking my word for it.

It is also built with heavy AI assistance, which seems worth saying plainly rather than leaving
to be inferred from the commit trailers.

I use AI for generation and acceleration; the architecture, the product decisions and the
verification are mine. What that actually looks like is in this repository:
[CLAUDE.md](CLAUDE.md) is a decision log — measurements, the alternatives that were tried and
rejected, and the bugs that were only ever found by running the app rather than reading it.
Deciding that the Ollama generator had to go despite working, that a cap on blank density was
silently overriding an explicit setting, or that a "fix" which made 90% of a licence check pass
was hiding a deleted dictionary entry — that is the part I would want to be judged on, and it
is the part a model does not do for you.
