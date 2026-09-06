# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Design principles

Prioritize **elegance and concision** over volume. Concretely:

- **Store only what cannot be derived.** Milestones are computed from the deck on read rather
  than kept in a table of unlocked badges; whether a vocabulary lesson's words are in the deck
  is derived, while "I have read this explanation" is not and so is the one thing stored. A
  second record of a fact drifts from the first the moment either is written alone.
- **Generated data is JSON behind an alias, never a TypeScript object literal.** Routing 29 MB
  of dictionaries through a specifier tsc cannot resolve took the typecheck from 2.13 GB and
  2.86M symbols to 0.31 GB and 220k. See the section below; `scripts/lib/emitData.mjs` is what
  keeps it true.
- **Nothing that renders on every screen may import a language's data.** Level tables and
  lesson prose load on demand, which is what holds `/` first-load JS in the high 200s of kB
  rather than ~890 kB. Adding a language means following that pattern, not widening the bundle.
- **Differences between languages live on `LanguageConfig`, not in a ternary.** A third arm on
  `language === 'xx'` is the signal that a flag belongs on the config instead.
- **Prefer a well-maintained library to hand-rolled logic — but say so when you don't.** The
  one deliberate exception is the scheduler: `lib/fsrs.ts` implements FSRS v4.5 directly (19
  weights, learning steps, the retrievability curve) rather than depending on `ts-fsrs`, and
  `DeckWord` in `lib/types.ts` is srsly's own interface rather than an extension of anyone's
  `Card`. Kuromoji, JSZip and the Supabase client are all used rather than reimplemented.

*(This section previously cited `ts-fsrs` as a dependency, described `DeckWord` as extending
its `Card`, and recommended SvelteKit `load` functions — in a Next.js project. All three were
template leftovers that contradicted the code they were meant to describe.)*

## Commands

```bash
npm run dev        # start dev server at localhost:3000
npm run build      # production build (raises the Node heap — see below)
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm run seed:dev   # print a console snippet that seeds a deck lighting up the milestone seals
npm run build:practice  # re-cut the lesson practice tiles with the real segmenters
```

**Never run `npm run build` while a dev server is live.** They share `.next`, and doing it
has corrupted the directory three times — each looking like an unrelated compile error.

**`npm run seed:dev` exists because the Stats panel hides itself on a new account.** That is
deliberate (a wall of empty progress bars is a list of things you have failed to do) and it
makes the badges impossible to look at without a deck. The script prints a snippet rather than
writing anything, because decks live in `localStorage` and only the browser can write there.
It copies every existing `srsly-*` key into `srsly-dev-seed-backup` before overwriting, and
`--restore` puts them back; that is not politeness, it is because a dev deck was once
overwritten with fixtures and could not be recovered.

**`eslint.config.mjs` carries an ignore list, and flat config is why.** ESLint 9 does not read
`.eslintignore` — the file is silently inert — so build output has to be excluded in the config
itself. Without it `npm run lint` walked `.vercel/output` and reported 248 errors from minified
one-line bundles, which is not a lint result, it is noise that makes the command useless as a
gate. The `no-unused-vars` override for a leading `_` is there for the same reason:
`lib/storage/firebase.ts` implements `DataService` with stub methods that must take the full
parameter list and use none of it, and deleting those parameters to satisfy the linter would
break the interface the file exists to implement.

**`npm run build` raises the Node heap to 4 GB, and needs to.** The default on a 16 GB Mac is
~2.2 GB, and webpack has to parse and minify every generated table that a chunk imports — the
French and Spanish grammar tables alone are 2.70 MB and 4.21 MB, on top of the dictionaries and
level tables. Without the flag the build fails with "Reached heap limit", reproducibly, and it
does so at the very end after several minutes of work. It is easy to misread as flaky: an
earlier failure looked transient because a retry happened to pass while the tables were smaller.

### Generated data is JSON, imported through an alias

The dictionaries and level tables are **JSON files with a thin typed `.ts` wrapper**, never
TypeScript object literals — and the wrapper imports them through `@data/…` (or `@dict/…`
for the large dictionaries under `public/`), aliases defined for webpack in
`next.config.ts` and deliberately **absent from tsconfig's `paths`**.

That indirection is the whole point. With `resolveJsonModule` on — which Next sets and
rewrites back on every build, so it cannot simply be disabled — TypeScript opens each JSON
file and materialises an object type with one property per key. Across five languages that
was 2.13 GB and 2.86M symbols; routing the imports through a specifier tsc cannot resolve
lets the ambient declaration in `lib/data/json-modules.d.ts` apply instead, and the files
are never read: **0.31 GB and 220k symbols**. Webpack resolves them normally, so bundling
and lazy `import()` chunk-splitting are unaffected.

Two consequences worth knowing:

- Emitting a generated dataset as a TS object literal will silently undo this. Build scripts
  go through `scripts/lib/emitData.mjs`, which writes the `.json` and its wrapper together.
- If an alias is ever dropped the build fails loudly with "module not found" — it cannot
  regress quietly.

```bash
npm test          # vitest run — the pure logic in lib/
npm run test:watch
```

**Tests cover `lib/`, not components.** The suite exists because the bugs that actually
happened were in pure functions with documented-but-unasserted contracts: `œuvres` lemmatising
to a verb, NFD text shredding every accented word, `d'accord` resolving to "chord" under a
typographic apostrophe. Those are cheap to pin and expensive to notice.

The lemmatizer tests load the REAL dictionary through `@dict`, deliberately. Their rules are
claims about that data — "`est` is a headword meaning east, which is why peeling `n'est` needs
a second pass" — so a stub would test the regex rather than the behaviour. `vitest.config.mts`
repeats the `@data`/`@dict` aliases because tsconfig deliberately lacks them.

Two fixture traps worth knowing, both of which produced false failures while writing these:
a `DeckWord` without `lastReview` looks to FSRS like it was reviewed one second ago, so
retrievability is 1 and no passing grade grows stability; and a punctuation token without
`type: 'punct'` is spaced like a word, because the spacing rules read the type and not the
character.

### When something here looks flaky

Six failure modes that each recurred, or nearly did. They are recorded because every one of
them cost more time to re-diagnose than to read about:

- **Assuming instead of measuring.** A stored lemma looked redundant next to `baseForm`; 33% of
  the commonest forms turn out to carry no `baseForm` at all. The measurement took a minute.
- **Calling a reproducible failure transient.** The heap-limit build failure above was written
  off as flaky and reproduced twice before the flag went in. Nothing in this repo is flaky yet.
- **Debugging against a stale artefact.** Several rounds of deployment work went into a
  deployment that had never rebuilt. Confirm the thing under test is the thing you built.
- **A test too weak to catch the bug it was written for.** The lesson-ordering test asserted
  "everything before the first word set is grammar", which is trivially true of an interleaved
  array — so the subjunctive shipped numbered ahead of `être` and was caught by eye, not by CI.
- **Disk filling up.** ENOSPC has surfaced as five unrelated test failures. `.next` and the
  scratchpad are what to clear.
- **A LOADING STATE RENDERED AS AN ANSWER.** Four separate bug reports in one day were this one
  mistake wearing four faces, and none of them looked related until they were lined up:
  a passage-shaped skeleton and a "writing today's passage… 15–25 seconds" caption shown while
  the app was only reading its cache; "Nothing to review yet — it needs a deck first" shown to a
  learner holding 542 words, because `deck` is `[]` until storage answers; and "Added 542 words
  to your deck" fired on sign-in, because a deck arriving from the cloud is indistinguishable by
  diff from words the learner just added. In every case a value meaning "not here yet" was
  rendered as a value meaning "there is none". **The flag that separates them usually already
  exists** — `deckLoaded`, `loadingMore`, `loadSeq`, a synchronous cache probe — so the fix is
  almost never new state. Ask what an empty value MEANS before rendering a sentence about it.

The pattern behind the first five: **the real bugs were found by running the app, not by reading
the code.** Open the browser before saying something works. The sixth adds a corollary, learned
by failing to reproduce three of those four locally: **run it in the conditions the bug lives
in.** LocalStorage answers before React can paint, so every one of these is invisible on a
laptop reading its own disk and appears only once the data comes over the network. Staging that
— a deliberate delay on the read — is what turned "cannot reproduce" into a control.

## Environment

**`SRSLY_STUB_AI=1` serves canned content instead of calling Anthropic** — no key, no credit,
no cost (`lib/server/stubContent.ts`). It exists because the reading pipeline is the largest
thing in the app and the hardest to work on: every run costs tokens, the guest budget runs
out, and once it has, nothing in the tab is reachable — no passage, no blank, no question, no
results screen. The stub substitutes only the model's raw JSON, so the canned text still runs
through the real segmenters and lemmatizers and you see what the route would actually emit.
It fires on the explicit flag alone and is **never** a fallback for a missing key or a failed
call; content the learner cannot tell apart from real output is what this codebase refuses
everywhere else.

Generation uses the learner's own key (above); `SRSLY_API_KEY` / `ANTHROPIC_API_KEY` in
`.env.local` is the operator-funded fallback for local development. With neither, the ReadTab
shows a no-key state pointing at Settings and at the free reading paths — there is no static
fallback content.

**Generation is bring-your-own-key.** srsly is free to run and free to use; the ONE thing that
costs money is having a new passage written, so that feature uses the learner's own Anthropic
key. They pay Anthropic directly (~1c a passage) and the operator pays nothing.

`lib/userApiKey.ts` (client) and `lib/server/generator.ts` (server) are the two halves. Rules
that matter:

- **The key travels on a header** (`x-srsly-anthropic-key`), never in the body or the URL.
  URLs are logged as a matter of course by proxies, CDNs and platforms, and a logged
  credential is a leaked one. It is used for that one request and never written anywhere.
- **`Generator.operatorPays` decides metering, not the model.** `consumeAiCredit` exists to
  ration the OPERATOR'S tokens; a learner spending their own money must never be rationed on
  top of it. Getting this backwards either double-charges them or gives away tokens the
  operator is billed for.
- **It lives in its own localStorage entry**, not in `srsly-prefs`. Prefs get exported and
  synced as one blob in a way a credential must not, and a key belongs to the device it was
  typed on. It is masked (`sk-ant-…7f3a`) whenever displayed.
- **The no-key state is not a paywall and must not read like one.** Reading your own text, an
  EPUB or audio needs no key and is most of the app — `/api/segment-text` makes NO model call
  in any language. The empty state says so and offers a route to Settings, because "Generate"
  cannot succeed there and a button that reliably fails is worse than none.

Three routes spend: `daily-content`, `grade-response`, `missed-review`. All three prefer the
learner's key and fall back to the server's. `missed-review` builds its client PER REQUEST for
this reason — a module-scoped client is fixed at import time and would silently bill every
learner's example sentences to the operator.

An **Ollama** generator was built and measured, then removed. Recording why so it is not
rediscovered as a good idea: it works (5/5 usable passages from `qwen2.5:3b` on Spanish A1,
4.6/5 target words, ~11s against Haiku's ~3.3s) but it runs on localhost, so it can only ever
serve the machine it is installed on — it was reached for to make generation free for
LEARNERS and cannot do that. Its one real benefit was free prompt iteration for the developer.
BYO key solves the actual problem; a second provider for that residue was not worth carrying.

That benchmark did leave one permanent fix. The schema writes `"title": "WORDS"` as a format
placeholder, and the 3B model returned the literal string `WORDS` 2 times in 5 while Haiku
never did — so the prompt now says explicitly that the title is one you write. **A weaker
model is a good prompt linter.**

## Architecture

**srsly** is a multi-language SRS (spaced repetition) app built with Next.js 15 (App Router), React 19, TypeScript, and Tailwind CSS v4. It supports Chinese (HSK 1–6), Japanese (JLPT N5–N1), Spanish (CEFR A1–C2) and French (CEFR A1–C2). Korean was removed.

### Adding or changing a language

`lib/languageConfig.ts` is the single place where languages differ. A `LanguageConfig` carries the level table, dictionary name, script behaviour, UI copy and prompt hints; components and API routes read from it rather than branching on `language === 'xx'`. **Keep it that way** — if you find yourself adding a third arm to a ternary, the difference belongs on the config.

Three flags drive most of the behaviour:

| Flag | Meaning |
|---|---|
| `hasReadings` | Whether words carry a phonetic reading (pinyin/furigana). **False for Spanish and French** — the `p` slot stays empty, no ruby annotation renders, and a token qualifies as vocab on its *meaning* rather than on having resolved a reading |
| `usesBaseForms` | Whether tokens can carry a lemma in `RawTok`'s 4th element (ja, es, fr) |
| `segmentation` | `'pipe'` = the model self-segments with `\|` (zh); `'server'` = the model writes plain prose and we segment server-side (ja, es, fr) |
| `scriptIsUnspaced` | Whether the script needs re-segmentation against the dictionary, word-boundary marks, and no inter-token spaces (zh, ja). Spanish and French are space-delimited and share the same spacing/rendering path |

### App structure

`app/page.tsx` is a single-page client component that renders five tabs — `read`, `practice`, `dash`, `vocab`, `settings` — switching between them with local `useState`. All navigation is tab-switching; there are no Next.js routes beyond the root page.

### Token format

The core data primitive is `PassageToken` (`lib/types.ts`): `{ text, reading?, meaning?, type?, baseForm? }`. The API route emits compact tuple arrays (`RawTok = [text] | [text, reading] | [text, reading, meaning] | [text, reading, meaning, baseForm]`), normalized into `PassageToken`s client-side in `hooks/useDailyContent.ts`. A single-element tuple is punctuation; a 3-or-4-element tuple marks a **vocab** word; the optional 4th element carries the dictionary/base form of an inflected word, resolved server-side (kuromoji for Japanese, `lib/server/spanishLemmatizer.ts` for Spanish). For Spanish the `reading` slot is always `''`.

**Rendering tokens back to text goes through `lib/tokenText.ts`, never through a local join.** `needsSpaceBefore()` decides whether a space precedes a token (nothing for unspaced scripts, nothing before closing punctuation, nothing after an opening `¿ ¡ « ( [ { " '`) and `tokensToText()` builds the whole string. Every renderer — `PassageText`, `FillInBlank`, `Question` — uses it, so the passage, the cloze sentence and the TTS plaintext can't disagree about spacing.

**A token is interactive when it has a reading OR a meaning, never on reading alone.** `ClickableWord`, `TokenEl` and `useWordPopup.openPopup` all apply the same test. Gating on `reading` makes every Spanish/French token dead text, and in Chinese kills any token whose pinyin didn't resolve — that is exactly how lookup popups went missing in the extra modes.

**Decorative glyphs and language-facing copy live in `lib/uiStrings.ts`**, keyed by `LanguageCode` (`空/好/完/填` for Chinese, the equivalents elsewhere, plus the reply placeholder). Use `uiStrings(language)` and size the glyph with `stateGlyphSize()` — a hardcoded 空 in a shared component is a Chinese character sitting in the middle of a French session.

#### A passage is generated only when asked for

Generation used to fire on the day's first load, so opening the app spent Anthropic tokens on
a passage nobody had asked to read — and most opens are not a reading session. The cost landed
whether or not the tab was even looked at. `loadMore` is now the ONLY path that writes a
passage, driven by the "Generate passage" button in the empty state.

Fill and conversation are still generated on the day's first load: they are cheap next to a
passage, and the Practice tab has no equivalent affordance to hang them off.

The ways to bring your own text — paste and EPUB — live behind one `ReadingSources` control
rather than permanent dashed buttons, and it has TWO shapes. With nothing to read it draws the
cards as the primary content of the screen; once a passage is open it collapses to
"+ Add reading". An earlier pass collapsed BOTH states to the single button, on the reasoning
that one control should look the same wherever you meet it — right about consistency, wrong
about the empty tab, where it left a beginner with a bare screen, a disabled Generate button
and no way in. What made the old empty tab bad was three identical unlabelled dashed buttons,
not the fact that the options were visible. `ReadingSources`' own docstring is the long form.

**Levels are calibration and a map, NOT the goal.** This is a deliberate product answer and
the code reflects it: a level tells the generator how hard to write and marks roughly where
you are, and `lib/unlock.ts` gates the next band behind retention — but pasted text, EPUBs and
audio ignore levels entirely, and always should. The app is for reading things you actually
want to read; "advance through HSK 1–6" is what a textbook is for. Settings says so in as many
words, because a learner who thinks the ladder is the point will not open their own book.

**The empty Read tab leads with two reading cards** (`ReadingSources`) — Paste text and Upload
a book — with AI generation set apart below and badged "needs your API key".

**It used to lead with a STARTER TEXT, and that card was removed on request (2026-09-04).** The
reasoning for it is kept because it was not wrong and the cost of removing it is real: every
remaining route asks the learner to go and find something first, so an empty tab is now three
things none of which can start on their own. `StarterPanel` and `lib/data/starterTexts.ts` are
left in the tree unreferenced, and `tests/starterTexts.test.ts` still holds that data to its
contract, so restoring the card is one entry in `CARDS` rather than re-authoring twelve texts.

**The marks are geometry, not emoji** (`components/shared/Mark.tsx`). Emoji were used first and
are the wrong tool for the same reason `BadgeSeal` gives: 📖 is a different drawing on every OS,
it arrives in full colour into a palette assembled from six themes' worth of CSS variables, and
it will not sit on the mono baseline the rest of the UI is set on. Four paths on `currentColor`
inherit the theme like text. The stroke width scales inversely with the box because the viewBox
scales and the stroke does not — a flat 1.5 is a hairline at 12px and a slab at 20px, and these
render at both.

Those texts are WRITTEN, not sourced — still true of the data, which is still tested even
though nothing renders it — for the same reason as `proverbs-seed.json` and the
`beginner` sets: good graded readers are unlicensed or copyrighted, and real public-domain
literature is almost never A1. `tests/starterTexts.test.ts` runs all twelve through the REAL
dictionaries and segmenters — es/fr/ja resolve server-side so a gloss must land in the token,
while zh is checked against cedict/HSK because `segmentZh` deliberately emits bare tokens for
the client to resolve. A starter text with an unlookupable word teaches, in the first thirty
seconds, that tapping words does not reliably work.

**The empty-deck state must never say "add words in Vocab" first.** Reading is what fills the
deck; sending a new learner to a word list inverts the loop and asks for the boring half before
they have seen why it is worth doing. That button only returns once the deck has words but none
are due. The earliest milestones (`first-word`, `first-steps` at 5) exist for the same reason —
every other threshold was unreachable on day one, so the moment the app most needs to prove
itself it had nothing to say.

**Passage topics are seeded on day AND language AND level** (`lib/passageTheme.ts`). They were
seeded on the date alone, and `themeOffset` counts passages within ONE language, so switching
language restarted it at 0 and served the identical topic — a learner reported "the theme was
always the same" and was right three times over. The old `dayHash` also summed the date's parts,
so 2026-08-22 and 2026-09-21 collided outright, and consecutive days walked the list by one.
A second axis, FORM (anecdote, diary entry, dialogue, how-to…), is seeded independently: topic
alone still produced the same *kind* of text every time. Both are pure functions, like
`lib/proverb.ts`, so they are tested without a network call.

**Only GENERATED passages have blanks.** Your own reading — pasted text, a web clip, an EPUB,
a starter text — commits with `vocabWords: []` and touches no schedule. The distinction is a
contract, not a preference: a generated passage is written around the words you owe today, so
the app may fairly test you on them. A book you chose carries no such contract, and turning a
novel into an exercise is how reading stops being the reward. Words still enter the deck from
your own reading, but only when you tap one and press Add to deck. Reading still counts toward
the streak, because reading is studying.

**Blanks have NO ceiling — the count is `tokens × density`, whatever that comes to.** A cap
was tried and removed. It was anchored on the count the recommended density was calibrated
against (~11 blanks in 76 words), which sounds principled and is not: `blankDensity` is a
SHARE, and a share that stops scaling past a threshold is no longer a share. It is the only
control over how much of a passage is blanked, and the setting's own help text promises
exactly that — so a cap silently overrode anyone who set it high, and did so hardest on the
longest passages, which is where an explicit setting most deserves to be believed. Length is
handled by CHUNKING, not by capping: `epubChunk` splits a chapter into sections and each gets
the density applied on its own, so a whole novel's worth is never on screen at once.

`MIN_BLANKS` and the most-owed fallback still apply. Both only ever RAISE the count on a
passage too short or too repetitive to honour the share, never lower it. The fallback exists
because two rules deadlock: a word is blanked in ALL of its occurrences or none (blanking
`playa` in the third sentence while printing it in the first hands over the answer), so a word
occurring more times than the budget never fits — and if it is the only candidate the passage
comes out with zero blanks.

**Finishing is not gated on filling every blank**, for the same reason. With no ceiling, a long
section against a large deck can carry a great many blanks, and requiring all of them put the
results screen — and the proverb behind it — out of reach. Finish grades what was filled;
empty blanks simply forgo their grades. **`NextSection` is deliberately not gated on `showResults`**
for the same reason: the reading is the point and the blanks are practice along the way.

### AI-generated daily content

`app/api/daily-content/route.ts` is a Next.js API route that calls `claude-haiku-4-5-20251001` with the user's due vocab words, returning a JSON blob of passage, fill items, and conversation keyed to those words. The hook `hooks/useDailyContent.ts` handles caching (localStorage keyed by `srsly-daily-{hskLevel}-{date}`), calls the API route, and parses the raw JSON into typed structures. There is no static fallback content for either language — a failed or incomplete generation surfaces as an error state rather than silently substituting sample content. Daily content is regenerated once per day per HSK/JLPT level.

**Contextual meanings.** A gloss is usually several senses (`要` = "to want, to need; will, going to; important"), and showing all of them tells the learner nothing about the sentence in front of them. So each passage carries a side-channel `contextualMeanings: Record<word, sense>` — the model copies back the one `;`-separated segment it actually used. `cleanContextualMeanings()` in the route drops anything that isn't a verbatim (case-insensitive) match of a segment of that word's own gloss, so the model can never introduce a definition; `components/shared/GlossText.tsx` bolds the match and dims the rest, falling back to the plain gloss when there is no match. **The map holds one sense per word per passage**, so a word used in two senses (`livre` as "book" and as "pound") would mislabel one of them — the prompt tells the model to omit such words rather than pick one. Per-occurrence precision would need the key to be an occurrence id, not the word.

For Japanese, the model writes plain sentence text (no self-segmentation); `app/api/daily-content/route.ts` segments it server-side via `lib/server/kuromojiSegmenter.ts`, which wraps the `kuromoji` morphological analyzer with a fusion pass that re-merges its morpheme-level output into whole conjugated words (kuromoji alone would split e.g. `使っています` into 4 pieces), then resolves meanings from `public/jmdict.json`/`lib/data/jlpt-vocab.ts` keyed by the resolved dictionary (base) form. Chinese still uses the model's own pipe-delimited (`|`) segmentation, parsed client-side.

For Spanish, the model also writes plain prose, segmented server-side by `lib/server/spanishSegmenter.ts`. Spanish is space-delimited, so splitting on whitespace/punctuation is exact and no morphological analyzer is needed; the work is in `lib/server/spanishLemmatizer.ts`, which resolves inflected forms to their dictionary form in two tiers:

1. `lib/data/es-forms.ts` — Wiktionary's own `form_of` data, which is where irregulars come from (`fui` → `ir`, `dijeron` → `decir`).
2. Suffix rules, each validated against the dictionary so a candidate is only accepted if it is a real word.

A surface that is itself a **common word** short-circuits both tiers and stays as-is, because many frequent Spanish words are also inflections of something else (`mercado` is "market", not a participle of `mercar`; `para` is the preposition, not a form of `parar`). Headwords whose only sense is a proper noun don't count, so `casas` → `casa` still works. The accepted cost is that participles which double as listed adjectives (`vivido`, `hablado`) stay as themselves rather than resolving to their infinitive.

For French, the model writes plain prose and `lib/server/frenchSegmenter.ts` splits it — the same shape as Spanish. Lemmatization (`lib/server/frenchLemmatizer.ts`) is almost entirely **data-driven**: French Wiktionary records conjugation exhaustively (a sample slice held 28,609 `form_of` entries against 1,658 lemmas), so `lib/data/fr-forms.ts` supplies `suis` → `être` and `mangé` → `manger` outright, and the suffix rules only cover what falls outside it.

**There is deliberately no npm lemmatizer.** None exists for French — `lefff-lemmatizer`, `french-lemmatizer` and `fr-lemmatizer` are not published, and `lemmatizer` is English-only. The one real option is a Snowball *stemmer*, which is the wrong tool here: stemmers emit non-words (`manger` → `mang`) and every candidate in this codebase must validate against a real headword.

Three French-specific wrinkles:

- **Elision.** `l'eau` is kept as ONE token so the passage reads naturally, and the proclitic is peeled off during lemmatization to link the card to `eau`. Only known proclitics (`l' d' j' n' qu' s' c' m' t'`) split, and a token that is *itself* a headword never does — which is what keeps `aujourd'hui` and `d'accord` ("OK", not "agreement") intact. The peeled remainder is re-tested against `FORM_DOMINANT_LEMMAS`, not just looked up: `n'est` peels to `est`, which is a headword meaning "east", so without that second pass "is not" resolves to a compass direction.
- **Homograph ordering.** A surface that is a common word normally wins over its inflected reading (`livre` is "book", not a form of `livrer`; likewise `porte`, `ferme`, `vers`). The exception is `FORM_DOMINANT_LEMMAS` — forms of a dozen very high-frequency verbs, where the verb reading dominates so clearly that it should win anyway (`est` is "is" far more often than the noun "east"; `été` is "been" before "summer"; `donne` is "give" before the card-dealing noun, and `donné` is "given" before the adjective "cheap"). `FORM_DOMINANT_EXCEPTIONS` then carves back the cases where that overshoots: `puis` is the everyday adverb "then", and `je puis` for "je peux" is literary.

  **The lookup is ONE step, not a chain, and that is what makes `donner` safe to add.** Its dangerous homographs are `donnée` ("datum") and `données` ("data"), which are everywhere in modern French — but Wiktionary records both as forms of `donné`, not of `donner`, so they never reach the override and fall through to the common-word test that keeps them as themselves. Only `donne` and `donné` map straight to `donner`. Make that lookup chain and "les données sont claires" starts reading as "to give"; `tests/frenchLemmatizer.test.ts` pins it.

- **Hyphens do two opposite jobs.** Most BUILD a word — `grand-père`, `arc-en-ciel`,
  `porte-monnaie` — and must stay whole. A few ATTACH a pronoun to a verb, in inversion
  questions and imperatives, and leaving those joined meant `est-ce` and `viens-tu` resolved to
  nothing at all: tapping the commonest question form in the language did nothing. `splitClitics`
  peels only known clitics, and **asks the dictionary first and again after every peel** — which
  is what keeps `rendez-vous` whole even though `vous` is a clitic. The head must resolve too, or
  an unknown compound would be torn into two meaningless halves. The euphonic `t` of
  `parle-t-il` is not a word, so `-t-il` is peeled as ONE unit and looked up as `il`; splitting
  every hyphen would leave the reader tapping a `t` no dictionary can define. A clitic keeps its
  hyphen (`-ce`, `-tu`) and `needsSpaceBefore` hugs it to the previous word, so the sentence and
  the TTS plaintext still read `est-ce` — without that rule the halves float apart, since the
  same rules flatten tokens for speech.

**Contraction headwords are dropped at build time** (`contraction of` / `compound of` glosses). French Wiktionary lists `qu'il` and `n'est` as headwords, and the lemmatizer's first test is "is this surface already a headword?" — so they stopped at themselves with a grammar note for a definition and never linked to the `il` / `être` card. `j'ai` and `c'est` still survive, because they carry an ordinary gloss ("I have", "it is") alongside the contraction one; that gloss is serviceable, so they are left alone.

**But only where there is an apostrophe to PEEL.** That reasoning is entirely about proclitics the lemmatizer can split. `au` (à + le) and `aux` (à + les) have nothing to split on — no rule recovers `à` and `le` from `au` — so dropping them did not free a card, it deleted the word: both have no other sense and vanished from the dictionary outright, which is why tapping the `au` in the very first French starter text returned nothing. It went unnoticed because the starter-text check allows 90%, for proper nouns. `du` survived only by accident, on a second sense reading "Forms the partitive article." The filter now tests `word.includes("'")` first, and the 21 entries this restored are exactly the apostrophe-less contractions (`au`, `aux`, `des`, `ès`, the legal `dudit`/`auxdits` family).

### Language data files

Each language's dictionary and level lists are generated by a script in `scripts/`, never edited by hand:

| Script | Outputs |
|---|---|
| `build-cedict.mjs` | `public/cedict.json` (the HSK tables in `lib/data/hsk-*` are checked-in data with no generator in the repo) |
| `build-jmdict.mjs` | `public/jmdict.json`, `lib/data/jlpt-*.ts` |
| `build-esdict.mjs` | `public/esdict.json`, `lib/data/es-forms.ts`, `lib/data/cefr-*.ts` |
| `build-frdict.mjs` | `public/frdict.json`, `lib/data/fr-forms.ts`, `lib/data/fr-*.ts` |
| `build-frgrammar.mjs` | `lib/data/fr-grammar.json` — which slot each inflected form fills |
| `build-esgrammar.mjs` | `lib/data/es-grammar.json` — the Spanish equivalent, from Wiktionary tags |
| `build-themes.mjs` | `lib/data/beginner-themes.json` — the `beginner` sets, validated, for the Learn tab |
| `build-proverbs.mjs` | `lib/data/proverbs.ts` (all four languages) |
| `build-lesson-practice.ts` | `lib/data/lesson-practice.json` — the Learn tab's practice sentences, cut into tiles by the real segmenters |

Proper nouns are filtered out at build time by `scripts/lib/nameFilter.mjs`, shared by every build script: `isNamePos()` rejects a `name`/`proper noun` headword outright, `isNameSense()` drops individual senses that gloss as a surname, given name or place ("a city in…", "a commune in…"). It runs per sense, not per entry, so `jean` keeps "denim" while losing the given name, and `casa`/`perro`/`ville`/`manger` are untouched. Filtering here rather than at lookup time is what keeps `mercado`-style over-lemmatization from being reintroduced — the lemmatizers ask the dictionary whether a candidate is a real word, and a dictionary full of names answers yes too often.

**Transliterated foreign names are APPLIED, not suggested.** `guessChineseNames` looks for a
Chinese SURNAME plus a given name — right for 李华, useless for every foreign name in translated
literature, where 列翁·维尔特 came out as six loose characters each glossed as vocabulary. The
middle dot IS the signal: Chinese writes foreign personal names with `·` and uses it for almost
nothing else in prose, so `guessTransliteratedNames` reads it directly. That is a typographic
mark the author wrote, not an inference, which is why it is applied rather than offered for
confirmation — and it has to be, since an EPUB has no confirmation UI at all.

The hard part is where the name ENDS on the left, since the run before the dot runs back into
the sentence (in 献给列翁·维尔特 the name is 列翁, not 献给列翁). Transliteration picks characters
for sound, so a name part does not contain everyday grammar — scanning outward and stopping at
the first HSK 1–2 character lands on the boundary. `TRANSLIT_CHARS` carves out the handful that
are both, 里 above all: stopping at it truncated 罗德里格斯 to 罗德.

**Pinyin carries the syllable-dividing apostrophe.** Hanyu Pinyin requires one before a
syllable beginning with a, o or e when it is not word-initial, because the boundary is
otherwise ambiguous — `xian` is one syllable, `xi'an` two. `joinPinyin` in `lib/pinyin.ts`
applies it, and `build-cedict.mjs` mirrors it; both decide from the NUMBERED syllable, which
is plain ASCII, rather than from the tone-marked output where the initial vowel could be any
of fifteen accented forms. It corrected 3,044 CC-CEDICT entries and 43 HSK ones.

`canonPinyin` already strips apostrophes, so this changes how pinyin is WRITTEN and never what
it matches — nothing comparing readings was affected.

**The spaces in some HSK pinyin are correct and must not be "fixed".** 43 entries read
`dǎ diànhuà`, `gōnggòng qìchē`, `xià yǔ`. Pinyin orthography separates WORDS, and those are
verb-object or two-word compounds; CC-CEDICT joins everything, which is the less careful
choice. Normalising them against cedict would make them worse.

**Chinese segmentation is SCORED, not greedy-longest** (`lib/server/chineseSegmenter.ts`).
A 121k-entry dictionary makes longest-match wrong in two directions: a long rare entry beats a
short common pair (我家的小猫 read 家的, CC-CEDICT's "(old) wife", instead of 家 + 的), and a
long match strands what it leaves (中国人民 → 中国人 + a bare 民). `wordScore` stands in for
log P(word) and a DP maximises the total over each Han run. Because every score is NEGATIVE,
adding a word costs something — which is what keeps 小猫 whole rather than splitting it into
two commoner characters, while still letting 家 + 的 beat an archaic 家的.

HSK LEVEL is the frequency signal: it is the only graded one in the repo and a real one.
Outside HSK, entries take a flat in-the-dictionary score, and CC-CEDICT's own register tags
demote the ones that cause the trouble. `(coll.)`, `(slang)` and `(dialect)` are deliberately
NOT demoted — people say those, and a learner meeting one still wants the gloss.

**The two-character minimum survives, as a rule about which deck words get the override
bonus.** A deck word of 2+ characters outscores anything and so is never buried — that is what
the old greedy re-cutting helpers arranged, and they are gone. But a SINGLE-character card
gets no bonus at all: inside a two-character word the halves are morphemes, so a learner
holding 生 and 活 must not have 生活 torn in two, and 中国人 must not shed a bare 人. Dropping
that while moving to scoring re-broke exactly those two cases.

### Grammar in what you are reading

`components/read/GrammarNote.tsx` prints one line under the definition in `WordPopup` saying
what the word is DOING — `imperfect · 3rd person singular`, `feminine plural`, `present`. The
app always knew this and never said it: `lemmatizeFr` resolves `abaissait → abaisser` to link
the card, and the learner saw only the gloss of "abaisser", never that they were looking at an
imperfect.

**French and Spanish, because those are the two with the data.** French reads Lexique 3, already
vendored for frequency ranking, whose `infover`/`genre`/`nombre` columns record every form's
exact slot. Spanish reads the inflection tags Wiktionary puts on `form_of` senses — the ones
`build-esdict.mjs` sees and discards. Japanese has kuromoji at runtime and would be a third
design; Chinese has no inflection to describe. The seam is the MODULE, so `components/read/GrammarNote.tsx`
dispatches on language and a third table is a third entry rather than a rewrite.

**Spanish is a TAG SET where French is a positional code**, and that difference removes a whole
class of bug rather than adding one. `hablaba` is `['first-person','imperfect','indicative','singular','third-person']`
— flat, semantic, nothing to misread by position. What carries over exactly is the discipline
about ambiguity, and Spanish needs MORE of it: an axis is named only when its own tags agree, so
`hablaba` reads "imperfect · singular" with no person, and `adj|augmentative,feminine,masculine`
reads "augmentative" with no gender. That second one rendered as "feminine" until the rule was
applied to gender as well as person — the form serves both, and printing whichever tag sorted
first is a coin flip presented to a beginner as a fact. Two TENSES is the one ambiguity worth
stating rather than hiding: `vivimos` is "present or preterite · 1st person plural", because for
-ir verbs those really are spelled alike.

**The Spanish tag list is a WHITELIST, and has to be.** Wiktionary's Spanish tags have a long
open tail — twenty-odd country names, `abbreviation`, `clipping`, `misspelling`, `transitive`.
Blacklisting was tried first and is unwinnable: anything missed fragments the interned code
space, and the first build produced 957 codes, most of them a real slot plus `Mexico`. With a
whitelist it is 131. `alt_of` senses are excluded outright — an alternative SPELLING is not a
grammatical slot.

**And it is filtered to forms the app can actually resolve.** Unfiltered the Spanish table is
669,076 forms and 22.6 MB, because Wiktionary conjugates every verb it has. Only 7% of those
appear in `es-forms.json`, which is what the lemmatizer reads — so the rest can never produce a
matching `baseForm` and the line could never render: 15 MB that cannot appear. Keeping forms
whose lemma is graded vocabulary, plus any form the lemmatizer table already knows, gives 132,900
forms and 4.21 MB, against an `esdict.json` of 5.45 MB every Spanish learner already downloads.

**Codes are decoded at render, not at build.** The table stores raw `VER|ind:imp:3s||`, so
rewording "past historic" costs no rebuild, and the decoder is unit-testable against every code
the data actually contains. `tests/frenchGrammar.test.ts` asserts exhaustiveness over the real
Lexique file — an unmapped slot is a test failure, not a blank line in the UI.

Four traps, all of which produced wrong output before they were found:

- **`imp` means two different things by POSITION** — imperative as a MOOD (`imp:pre:2s`),
  imparfait as a TENSE (`ind:imp:3s`). Hence `MOODS` and `TENSES` are separate tables. A
  position-blind lookup mislabels one of them, and a beginner cannot catch a confidently wrong
  grammatical label.
- **Lexique packs every reading into ONE row**, ordered by mood code, so `lève` is
  `imp:pre:2s;ind:pre:1s;ind:pre:3s;sub:pre:1s`. Taking `[0]` reads as obviously right and
  labels the commonest form of every regular -er verb an IMPERATIVE — `il mange` would have
  read "imperative · 2nd person singular". Because the codes are interned, keeping all slots
  costs 0.02 MB, so the shortcut bought nothing.
- **The line says only what the slots JOINTLY determine.** `lève` is four different jobs spelled
  alike, all present, so it reads `present` and the moods and persons go unmentioned; `abaissait`
  has one slot and keeps full detail. Weighted by real reading frequency, 73% of forms carry one
  tense, 21% are nouns/adjectives with none, 5% carry two (rendered "A, or B") and 0.9% carry
  three or more, which say **nothing** — four alternatives is not an explanation, and silence is
  the honest form of "it depends".
- **Gender and number belong to the participle, not to the finite readings sharing its spelling.**
  `faites` is `imp:pre:2p;ind:pre:2p;par:pas` marked feminine plural; attaching that to the whole
  entry claims "vous faites" is feminine. It is appended only when every slot is a participle.

**A reading is shown only when the app's OWN lemmatizer agrees**, which is why the table stores
a lemma the token already carries. `baseForm` comes from Wiktionary via `frenchLemmatizer`; this
table comes from Lexique. They agree on 99.7% of the 500 commonest forms — and the disagreements
are exactly where a label would be wrong: Lexique calls `lui` a form of `luire`, `tu` a participle
of `taire` and `mort` one of `mourir`, while the lemmatizer deliberately leaves all three alone as
common words in their own right. **A missing `baseForm` is not a gap to paper over — it is that
homograph judgement, already made.** Deferring to it is what stops this line contradicting the
definition printed directly above it. (Storing the lemma costs 0.8 MB; interning the lemmas too
was measured and saves 0.18 MB against 29,147 distinct values, which is not worth the indirection.)

**Loaded lazily on the first word tap, never at module scope** — `loadFrGrammar` follows
`loadLevelTable`/`cachedLevelTable` in `lib/curriculum.ts`, cache included, so a re-opened popup
renders on its first frame instead of blinking the line in one commit late. The table is 2.70 MB
raw / 433 kB over the wire, in its own chunk; `/` first-load JS is unchanged at 286 kB. It is
deliberately NOT attached to tokens server-side, which would inflate the wire format for
information almost none of which is looked at.

### How hard is this, for me?

`lib/readability.ts` reports what share of a text sits at or below the learner's band, shown on
any open passage and — for a book — as a per-chapter figure plus a sampled whole-book estimate
(`components/read/ReadabilityNote.tsx`).

**Information, never a gate.** This file's position is that levels are calibration and a MAP,
and a readability figure is precisely that map: it answers "is this book near where I am?",
which is the question standing between a learner and the novel they want to read. Nothing is
withheld at any figure, and it renders beside the text rather than in front of it.

**It measures TOKENS, not raw text, and that is not a detail.** Every segmenter is server-side,
so nothing on the client can turn a string into words; and the level tables are keyed by LEMMA,
so matching surface forms would count `parlons` and `maisons` as unknown and score a wholly-A1
French text at about 40% — a confidently wrong number, which is worse than no number. Measuring
the tokens the segmenter already produced sidesteps both: they carry `baseForm` and `meaning`
already, so a passage costs nothing extra. The paste panel is the one place that shows BOTH numbers, and only because it had already paid
for them: its "Check coverage" button segments the text anyway, so the level figure costs no
extra request there.

**Two numbers, two questions, both labelled.** DECK FAMILIARITY (`lib/coverage.ts`) asks "how
many of these particular words have I studied?" — the only thing the app has direct evidence
for, and it moves as you study. READABILITY (`lib/readability.ts`) asks "is this written near my
level?" — a property of the text, stable, comparable between books. They routinely disagree and
both readings are correct: a beginner's first article often scores high on readability and near
zero on deck familiarity, because most of a page is function words nobody makes cards for.
Showing one number and calling it "coverage" is what made that confusing.

**Token-weighted, not type-weighted.** The question is "what share of the words on this page do
I know?" By types, a rare word met once weighs the same as `le` met forty times, which reads as
a far harder text than it is. `types` is still reported, because the pair says something neither
says alone: high token coverage with a large type count is a text with many one-off hard words,
which is exactly the text a dictionary makes readable.

**Two kinds of token are excluded from the measurement rather than graded**, because grading
them would lie in one direction or the other:

- **Proper nouns**, which `nameFilter.mjs` strips from the dictionaries at build time, so a
  novel's characters resolve to nothing. Counting them as hard makes every novel look far above
  its level.
- **Undecomposed elisions.** `j'aime` is `je` + `aime`, both A1, but it survives as one token
  because it is its own headword — so it is in no band, and grading it put "j'aime" at the top
  of a beginner chapter's list of hardest words.

**A book is ESTIMATED from a few excerpts, and says so.** `/api/segment-text` caps at
`MAX_PASTE_CHARS`, so an exact novel-wide figure is one request per chapter — thirty-plus round
trips before the learner has decided whether they want the book. `sampleChapters` takes three
spread through it, skipping front matter and anything too short to be prose.

**The verdict is bucketed on the ROUNDED percentage**, not the raw coverage, or 75% reads
"very hard" on one text and "hard going" on the next.

**It compares RANK, not the level number, and Japanese is why.** HSK and CEFR number their bands
easiest-first; JLPT numbers them the other way, N5 being the beginner level. Comparing raw
numbers scored Japanese exactly backwards — a starter text read "0% at or below JLPT N4" with を
and する among its hardest words. `LanguageConfig.levels` is already documented as "ordered
easiest → hardest" and `lib/unlock.ts` already resolves through rank "so it is right for a
descending curriculum too"; readability now does the same, so 0 is the easiest band whichever
way the language counts.

**Three more things surfaced by measuring Japanese**, all of which made a beginner text look
far harder than it is. Particles are grammar, not vocabulary, so no JLPT list contains を or に
and every one read as above-level — they are excluded like proper nouns. 22 JLPT entries hold
several spellings in ONE key (`足; 脚`, `在る; 有る`), so neither spelling ever matched; the
index splits them. And the list is written in formal orthography — 御飯 where real text says
ご飯, 友達 where it says 友だち — so ordinary N5 words were unranked; the level vocab carries
each word's reading, and the kana bridges the two spellings. Together: 0% → 91%.

**Words the ranking cannot see were pinned, not worked around.** `au`, `aux`, `des`, `ma`, `ces`
and `parce` were in NO band — contractions and possessives are excluded from band eligibility by
construction — so they scored as above-level and turned up among a text's "hardest words". They
are core A1 grammar; the fix belonged in `pin`, not in the metric.

**Two dictionary defects surfaced by writing the trees, both fixed at the source.**

A Japanese auxiliary had no gloss at all. kuromoji tags です and ます as 助動詞, which routes them
through `PARTICLE_GLOSS` in `kuromojiSegmenter.ts` — a table that held only particles, so they
returned '' and tapping the end of any polite sentence gave nothing. です closes almost every
polite sentence in the language, and ます is the case that table exists for: JMdict glosses it
"measuring container; measuring box". The auxiliaries are now listed alongside the particles.

And seven HSK 1–3 words were defined as surnames. CC-CEDICT lists a surname as its own entry, and
`build-cedict.mjs` kept the FIRST entry per simplified form on the stated theory that cedict's
order puts the commonest sense first. It does not for surnames, because capitalised surname
pinyin (`Mǎ`) sorts ahead of the lowercase reading (`mǎ`) — so 马 was "surname Ma" with no
"horse" anywhere, 能 was "surname Neng" rather than "can", and 张 — the measure word for flat
things — was "surname Zhang". The build now prefers a real definition over a name-only entry, the
same way it already preferred one over a "variant of" pointer. `lib/data/hsk-vocab.ts` is
checked-in data with no generator and still carries the bad glosses, and it is consulted BEFORE
CC-CEDICT, so `mergeHskVocab` drops a name-only gloss rather than letting it shadow the fix.

### A gloss shows ONE sense

`components/shared/GlossText.tsx` renders a dictionary gloss as its lead sense plus a `+N more`
control, and is used by `WordPopup` (so the Read tab and generated passages both get it) and by
the Learn tab's vocabulary lists. `jaune` glosses as "yellow; yolk (of egg); strikebreaker", and
someone who tapped a colour should not have to read past two senses that have nothing to do with
the sentence. It is the same judgement `LeechTriage` rests on: a five-sense dump is why a card
will not stick.

**Nothing is discarded.** The deck stores the full gloss; this only changes what is shown first.
Flashcards deliberately do NOT collapse — the answer side is the one place you are specifically
asking what a word means, and hiding senses there could conceal the one you added the card for.

**The lead is the CONTEXTUAL sense where the generator identified one**, not blindly segment
zero. Collapsing to the first would have hidden the very sense `contextualMeanings` exists to
surface. The passage's hover tooltip renders with `pointerEvents: 'none'`, so collapsing is
opt-in — a control the reader cannot click is worse than the full gloss.

**Near-duplicate senses are dropped at render.** Wiktionary repeats itself more than you would
expect: `gris` carries both "grey / gray" AND "gray / grey", `bleu` both "blue" and "the color
blue", `rouge` both "red (of a red color)" and "red". The test is EXACT equality of content
words after removing framing words (`the`, `of`, `color`, `used`…). The looser subset test was
tried and rejected: it also swallows real senses, collapsing être's "to be; to be located; to be
situated" down to "to be". A repeated sense is untidy; a deleted one is wrong.

**Collapsing makes the LEAD SENSE load-bearing**, which is what surfaced a run of bad ones —
`une` led with "front page (of a publication)", `pas` with "step, pace, footstep", `ce` with "a
part of the primary school", `yaourt` with "a song where the singer makes up the words", and
`assiette` with "seat". All are top-frequency or first-lesson words, and all are fixed in
`core-overrides.json` rather than in the renderer.

### The lesson tree

`components/learn/LearnTab.tsx` is a **Learn** tab holding an authored course: 33 lessons in 6
lessons per language across two sections — one tree per language, all four. `TabNav` still
filters on `hasLessons`, because an empty tab reads as a broken one.

**GRAMMAR IS THE COURSE; WORDS ARE A SHELF.** The two are split rather than interleaved because
they are not the same kind of thing. Grammar builds on itself — the passé composé cannot be
explained to someone who has not met a participle — so it is ONE numbered track in array order,
and the number is the whole navigation. Vocabulary sets have no such dependency; nobody needs
colours before food, so numbering them would invent a prerequisite and make opening the one you
wanted feel like skipping ahead. `grammarLessons`/`vocabLessons` split them and
`nextGrammarLesson` marks where you left off.

**The array order IS the course order**, so all grammar must precede all word sets. A weaker
"everything before the first vocab is grammar" test passes on an interleaved array, which is
how the subjunctive briefly came out numbered 7, ahead of `être`; the test now asserts the last
grammar lesson precedes the first word set. Advanced material was appended at the END of the
grammar run for the same reason.

**A language gets its GRAMMAR TABLE before its lesson tree** where it can have one, and that
order is deliberate: a tree that explains the imperfect beside a reader that cannot point one
out in the text is half a feature twice. French came first and Spanish second for that reason.

**Chinese is the exception, and for the same reason it has no table: it does not inflect.**
There is no slot for a form to fill, so a `GrammarNote` would have nothing to report. Everything
a French note carries is a separate WORD in Chinese — 了, 的, 把, a measure word — which the
reader can already tap. What a dictionary cannot tell them is what those words are FOR, so prose
is the only way, and the tree is the primary teaching surface rather than a supplement.

**Japanese got the third design rather than a third table**, and the reason is that its
morphology is PRODUCTIVE: 食べる stacks into 食べさせられたくなかった, so no finite table can
enumerate the forms and any table fails silently on exactly the long ones a reader needs help
with. kuromoji already walks the auxiliary chain to fuse morphemes into one token, so
`lib/japaneseGrammar.ts` composes a description from that chain instead — 読みました is
読む + ます + た, and reads "polite · past".

**The chain travels ON the token, which this file elsewhere forbids.** That rule was written
about French, where a 2.70 MB table exists and can be lazily fetched, so per-token data would be
paying twice for something almost never read. Neither half holds for Japanese: there is no table
to fetch and kuromoji cannot run in a browser, so a few bytes on the minority of tokens that are
conjugated is the only way the client can know. Raw auxiliaries travel; English is produced at
render, the same split as the other two.

**`れる`/`られる` is passive, potential AND honorific at once**, so the line says "passive or
potential" rather than picking — the same discipline that stops the Spanish decoder naming a
person for `hablaba`. And `て` is a JOIN, not a feature: what it means depends on what attaches
to it, so `て|いる` is "ongoing" while a bare `て` is the connective form.

**PopupData is built in TWO places** — `hooks/useWordPopup.ts` and `components/read/PassageText.tsx`
— and the passage uses the second. A field added to only one silently never renders where it
matters, which is exactly what happened to the chain first time round.

**The Spanish tree follows the French one's SHAPE and not its content.** The hard parts of
Spanish are not the hard parts of French: `ser` versus `estar`, `gustar`'s backwards
construction and `por`/`para` get lessons of their own, while elision and the partitive have no
Spanish counterpart and are absent. Lesson ids are namespaced per language (`fr-gender`,
`es-gender`) because completion is stored by id in one list, so a collision would merge two
trees' progress; `tests/lessons.test.ts` asserts ids are unique across every tree and runs the
whole suite over `LESSON_LANGUAGES`, so a third tree is covered the day it is added.

**ORDERED, NEVER LOCKED, and that tension is deliberate.** This file says levels are calibration
and a map rather than the goal, and that the app is for reading what you actually want to read.
A lesson tree pulls the other way. The resolution is that lessons are SEQUENCED but gate
nothing: every lesson opens on day one, nothing is `disabled`, and the tab says so in its first
sentence. If a lesson ever becomes a prerequisite for reading, that decision has been reversed
and should be reversed knowingly rather than by adding a prop.

**The curriculum reads NO scheduling state.** No due counts, no streak, no stability, no
mastery — grep confirms it. FSRS cannot gate, order, unlock or un-finish a lesson, and
completion lives in its own key rather than being derived from the deck, so deleting cards or
falling behind on reviews leaves the tree exactly as it was. The single point of contact is a
vocabulary lesson's "add these words" button, which is the learner acting — the same
relationship the Read tab already has, where Read is separate from SRS and tapping a word still
adds it.

**Practice is a RUN of questions, and it grades NOTHING.** "Start practice" opens a session
(`components/learn/LessonPractice.tsx`): one question at a time, a progress bar, and the ones
you miss coming back at the end. Getting one wrong re-queues it inside that session and does
nothing else — no FSRS write, no streak, no record that survives closing the lesson — because
the curriculum is separate from FSRS and a lesson you can fail is a lesson you avoid.

It replaced a page of independently-checkable exercises, which is a worksheet: no progress, no
finish, and a wrong answer so cheap there was no reason to think first.

**The practice sentences are NOT the examples.** Building the questions from the examples meant
the answer was printed on the screen the learner had just scrolled past — the exercise tested
scrollback rather than the rule. Every grammar lesson now carries three sentences written for the
exercise, and `tests/lessons.test.ts` asserts none of them repeats an example, compared with
whitespace and punctuation stripped. `lib/lessonPractice.ts` prefers them and falls back to the
examples, so a lesson without them is degraded and not broken; the distractor pool draws from
both, because a plausible wrong option is one the learner has just been taught.

**Some rules are a table pretending to be prose.** Measure words, counters, verb endings, which
preposition each country takes — these are FINITE SETS, and a learner reading "本 for books, 张
for flat things, 只 for many animals" in running text is building the table themselves, from
memory, while trying to learn its contents. `Lesson.table` is structured data rather than markdown
inside `explanation` for one reason: a string cannot be tapped. 27 lessons have one; the rest do
not, because "the verb goes last" has nothing to tabulate and a two-row table added for
consistency is furniture.

**`Lesson.pitfall` gets its own box because the error is the part you have to recognise later.**
A rule stated correctly, and a rule stated correctly beside the wrong version you were about to
write, are not the same lesson. It is separated from `explanation` rather than being paragraph
four.

**Two question shapes, because one was too easy.** With punctuation pinned to the last tile, a
two-tile ordering question has one sensible arrangement and asks nothing — `我 / 吃饭。` solves
itself. Examples shorter than `MIN_ORDER_TILES` become a CHOICE instead: one word removed,
picked from four drawn from the same lesson. Which shape an example gets is derived in
`lib/lessonPractice.ts`, so no lesson data changed.

**The prompt is the gloss with its teaching aside removed.** 139 of the 333 authored glosses
carry an explanation after an em dash, and it usually names the word being tested — the prompt
for the 张 question read "This sheet of paper is big — 张 for flat things". `promptFor` cuts at
the dash; the explanation panel prints the gloss in full once the answer is in, which is where
the teaching belongs. A test asserts no prompt names its own answer, script-aware because a
naive substring check fires on the Spanish answer `no` inside the English word "not".

**The explanation shows whether you were right or wrong.** Being right does not mean you knew
why.

**Tiles: tap to place, drag to position, ask to inspect.** Placing and positioning are
separated by what the pointer does after it goes down (`components/learn/PracticeTiles.tsx`) —
a press starts a timer, moving past `DRAG_SLOP` cancels it and begins a drag, releasing before
either is a tap. Pointer events rather than HTML5 drag-and-drop, which does not fire on touch at
all. Two traps, both found by driving it: `setPointerCapture`/`releasePointerCapture` THROW for
a pointer the browser does not consider active, and an unguarded throw in the pointerup handler
ate the entire drop; and the drop index must be recomputed from the event, because reading it
from React state gives whatever the last committed render carried, which landed every drag at
the end of the row.

**INSPECT has four ways in, and they are one set in one file** (`lib/inspectGesture.ts`):
long-press, right-click, ⌘/ctrl-click and double-click, all opening the same `WordPopup` with
definition, audio and Add to vocab. One intent that three input devices spell three different
ways; a learner reaches for whichever their hands know, so defining the set in two components
would drift into two sets.

**The double-click is the only one that needs an `undo`, and that is not a hack.** The other
three announce themselves before anything happens — the modifier is already held at press time,
a long-press is a press that never moves, a right-click is its own button. A double-click
cannot: its first click is indistinguishable from a single one, so the tile has ALREADY moved
by the time the second arrives. The two ways out are to delay every tap by the double-click
window — ~300 ms of lag on the most-used gesture to serve the rarest, which is the tap delay
the whole platform spent years removing — or to let the first click act and reverse it. The
caller hands over how to undo the tap it just performed, and a completed double runs it.

**It pairs on POSITION, not on the word, and the pool no longer reflows.** Those are one design.
Matching on the tile's text fails a real double-click outright, because the first click moves
that tile away and the second lands on whatever slid into the gap — verified in a browser, where
double-clicking 杯 placed 杯 and then 咖啡。So a used tile now leaves its slot behind, the way
Duolingo's word bank does. That looked cosmetic and is load-bearing: with the pool frozen, two
presses in one spot can only ever mean one tile. Position-matching without it would fire on
ordinary fast play, so neither half is safe alone. The second press is caught in the CAPTURE
phase on the wrapper, because after taking the last word back out of the answer the spot pressed
may be bare row, and only the container sees that.

**The pool used to show the sentence already in order.** `PracticeTiles` was handed `tiles`,
which is the CORRECT order — so every build-the-sentence question could be solved by tapping
left to right without reading a word. Nothing in the suite noticed, because every assertion was
about which tiles exist rather than what order they are shown in. `OrderQuestion` now carries a
separate `shuffled`, re-drawn when the shuffle lands on the identity permutation (one time in 24
for a four-tile sentence), and capped so a sentence whose tiles are all the same word terminates.

**Example sentences and table terms are tappable too.** A lesson could print 个 and 张 and never
say how either is pronounced. `tiles` already holds the sentence cut on real segmenter
boundaries, so the words are there to make tappable; an example without them renders as plain
text rather than guessing.

**The gap between two example words is a MARGIN, not a space in the label.** A button is
inline-block and browsers trim trailing whitespace inside one, so `` `${t} ` `` collapsed to
nothing and every French and Spanish example rendered as «jesuisfatigué.» — one unreadable run.
It went unseen because the gesture work was verified in Chinese, where the correct gap is zero.

**A miss falls through to the server, because the client dictionaries deinflect nothing.**
`lib/data/esdict.ts` says so outright: everywhere else the base form is resolved server-side and
travels on the token, but a lesson tile is a bare string with no such help. In Spanish and French
— where nearly every verb on screen is conjugated — tapping `tenemos`, `escribimos` or `tienes`
silently did nothing. `components/learn/useLessonInspect.ts` retries a miss against the same
per-language route `AddWordForm` already uses, which runs the real lemmatizer: one request, only
on a word the dictionary could not resolve, and only when someone asks. Chinese needs none of it
and gets none — it does not inflect, so the first lookup is the only one there could be.

**A table cell is tapped word by word.** A conjugation row reads "je suis", and neither the
dictionary nor the deinflection route can resolve a two-word phrase, so a whole-cell button was
dead on every row of every French and Spanish table. Splitting on spaces is a no-op for the
single characters Chinese and Japanese put there.

**The EXAMPLE tiles are authored, the PRACTICE tiles are generated, and both fall on real
segmenter boundaries.** Deriving them at render would need a segmenter and every segmenter here
is server-side, so they have to be checked in either way. The examples were cut once by hand
against the real segmenter; the 306 practice sentences go through `npm run build:practice`
(`scripts/build-lesson-practice.ts`), which runs each one through `segmentZh` / `segmentJa` /
`segmentFr` / `segmentEs` and emits `lib/data/lesson-practice.json`. A tile boundary is exactly
where a SPACE would go, which `lib/tokenText.ts` already decides for the whole app — so a tile
row cannot disagree with the passage renderer about whether `¿` belongs to the word after it.

Two things that bit while writing it. Punctuation has to be judged from the CHARACTERS and not
from the tuple width: `segmentZh` deliberately emits every token bare, so "a 1-tuple is
punctuation" is true of three languages and false of that one, and reading the width folded
whole Chinese sentences into a single tile. And the generator is a vitest "test" with its own
config (`scripts/lesson-practice.vitest.mts`), because it must import the TypeScript segmenters
and vitest is the only TypeScript runner this project depends on — `vitest.config.mts` includes
only `tests/**`, so it never runs as part of `npm test`. `tests/lessons.test.ts` asserts the tiles rebuild their own sentence, compared
with whitespace removed: French writes a space before `?` that the segmenter drops, and Spanish
opens with `¿`, neither of which changes which tiles exist. A one-tile example (待ってください。is
a single fused token) stays an example and is not offered as a puzzle.

**Completion is the one thing stored**, in `srsly-lessons-done`, device-local for the same
reason as `srsly-achievements-seen` and `srsly-curriculum-pruned`. Whether a vocabulary
lesson's words are in the deck IS derivable and is not stored; "I have read this explanation"
is not recoverable from anything, so it is.

**The two kinds of lesson end differently.** A grammar lesson is read, so finishing it is
something the learner says. A vocabulary lesson is finished by adding its words, so the button
does the work and the tick follows — a separate confirmation after the cards were already in
the deck would be a checkbox for its own sake. Words go straight into play rather than the
pool: a themed set of 11 that someone chose is much closer to a single "Add to vocab" than to a
500-word level import, and pool auto-activation is off unless chosen, so pooling them would
leave the learner with nothing visible.

**The vocabulary lessons cost almost nothing, because the syllabus already existed.**
`scripts/build-themes.mjs` reads the `beginner` section of `core-overrides.json` — the same 21
themed sets per language the dictionary builds already consume — validates every word against
the built dictionary, and emits `lib/data/beginner-themes.json`. **Words only, no glosses**:
the client already fetches the dictionary, so shipping definitions would be a second copy that
goes stale on the next rebuild.

**The prose and every example are WRITTEN, not sourced**, exactly like the starter texts: good
grammar courses are copyrighted and paraphrasing one is not a loophole. The *syllabus* —
gender, agreement, negation, the passé composé — is universal structure and free to follow.
`tests/lessons.test.ts` runs every example through the REAL French segmenter and requires each
word to resolve, and `KNOWN_DICTIONARY_GAPS` names the two that currently do not **and asserts
the list is exactly right**, so an exemption cannot outlive the bug it describes.

**Nothing that renders on every screen may import the lesson data.** `lib/lessons.ts` answers
`hasLessons` from a list of language codes and holds no prose, because `TabNav` renders
everywhere; the tree lives behind `lib/data/lessons/index.ts` and the tab is loaded with
`next/dynamic`. Importing it directly put 12 kB of French in the initial bundle for every
learner, including the ones studying Chinese who can never open the tab — the same failure the
level tables describe. `/` first-load JS: 286 kB before, 289 kB after.

#### The daily proverb is chosen, not generated

It is a **completion reward**, shown in exactly two places, both of them "you have finished"
states: under the vocabulary results once a targeted reading is done, and on the
session-complete screen after a block of flashcards or cram (one `Flashcards` component
serves both modes, so its single complete block covers them). Nowhere else. Sitting
permanently at the foot of the Read tab it was wallpaper — always there, so never an event.

`lib/proverb.ts` picks one idiom per day as a **pure function of the date**. There is no API
call and nothing to cache. That is worth stating because the instinct for a "daily X" is to
generate it and cache by date the way `useDailyContent` does — right when the content has to
be written for you, wrong here. Idioms are a fixed set CC-CEDICT already ships with
definitions, so generation would only add cost, latency, an offline failure mode, and the
one risk this codebase refuses everywhere else: a model inventing a plausible chengyu, or
attaching a gloss that is subtly wrong, which a learner cannot detect.

**Chinese is derived, the rest are seeded.** CC-CEDICT marks 4,874 four-character entries
`(idiom)`, filtered to the 3,760 whose every character is in HSK — an idiom you cannot read
is not a daily anything. The 84 that are HSK vocabulary *in their own right* sort first as
tier 0; that is the only signal in the data separating "famous" from merely "readable", and
without it the feature opens on 一倡三叹. Japanese, Spanish and French come from
`scripts/data/proverbs-seed.json`, because their emitted tables carry only `{p, m}` —
JMdict's `proverb` tag and Wiktionary's `proverb` part of speech are both dropped at build
time, leaving nothing to filter on. Every seeded word is validated against that language's
own dictionary **and its form table**, since a proverb is running prose and most of its words
are inflected (`duerme`, `vaut`, `oreilles`); headwords alone rejected 23 of 40.

The sequence is anchored to the learner's **first day** (`srsly-proverb-day-one`), not to a
fixed epoch. Counting from the epoch would start a new learner at index `20679 % 3760` and
throw the canon-first ordering away for everyone.

#### How French is ranked and banded

**French does not use the corpus blend below.** It ranks off **Lexique 3** (`scripts/data/Lexique383.tsv`, CC BY-SA 4.0, vendored — see `ATTRIBUTION.md` for the citation and download command), read by `scripts/lib/lexique.mjs`. Lexique ships 142,695 entries with hand-checked lemmas, POS tags, and frequency measured separately over **film subtitles** (`freqlemfilms2`) and **books** (`freqlemlivres`). Those are lemma-level, so there is no corpus to download, tokenize or lemmatize.

**A word scores the MINIMUM of its two register frequencies** — it is only as strong as its weaker register. That one choice is what removes slang, and it beats the ratio test you might reach for first (`bonjour` has a films/books ratio of 11 and is obviously core). Measured on the top 500: `min` gives 20/20 core words and **zero** slang; geometric mean lets `mec` in; arithmetic lets `putain` and `mec` in. Subtitles being half the input is fine precisely *because* books get a veto. Lexique's `ortho` column also supplies the inflection inventory that scopes `FR_FORMS`.

#### How Spanish words are ranked and banded

**Not from subtitles.** Spanish used to rank against hermitdave/FrequencyWords, which is OpenSubtitles and nothing else — one narrow register whose high-frequency band is interjections, profanity and slang, because that is what film characters say. It made study lists the passage generator could not write natural prose around. `scripts/lib/corpusFreq.mjs` replaced it with three registers:

| Register | Corpus | License |
|---|---|---|
| everyday | Tatoeba + TED2020 | CC BY / CC BY-NC-ND |
| news | Global Voices | CC BY |
| reference | Wikimedia | CC BY-SA |

A register may be backed by more than one corpus (counts are summed). **A word scores the mean of its two best per-register ranks.** Two properties matter and both are deliberate: needing two placements *is* the "common in more than one register" rule, and averaging **ranks rather than ipm** stops whichever corpus has the most extreme distribution from setting the order (an encyclopedia says "municipality" at a rate no conversation ever will). Taking the best two rather than all three keeps `gracias` from being punished for being rare in an encyclopedia. Set `SRSLY_CORPUS_CACHE=<dir>` to cache per-corpus counts and re-run a build with no downloads.

**Spanish drops inflections that borrow their lemma's frequency.** Spanish counts raw lowercased surfaces, so a surface that is mostly an inflection of something else gets credited to whatever homograph the dictionary glosses — which produced A1 cards that were *wrong*, not merely redundant: `haya` ranked on haber's subjunctive and taught as "beech tree", `partes` as "genitalia", `alta` as "certificate of discharge", `era` as "threshing floor". `collidesWithLemma()` in `build-esdict.mjs` drops a form only when all three hold: its lemma is in the top 800 (only a common paradigm bleeds that much count), the two are within 5× in rank (`casa` is 37× commoner than `casar`, which proves it is its own word), and their glosses share no content term (`trabajo`/`trabajar` both say "work", so that card is right). Each condition earns its place against a 37-word labelled set — removing any one of them loses either `haya` or `trabajo`/`viaje`/`apoyo`. **French needs none of this**: Lexique gives POS-disambiguated lemma frequencies, so the count on `porte` is the noun's and never the verb's.

**Single letters are filtered out of the bands** for es/fr by `isBandableLength()`, against a short whitelist per language (`y o a e u` for Spanish, `y à ô` for French). Wiktionary has an entry for every letter and encyclopedic text is full of bare ones, so `t`, `i`, `x`, `k` and `f` all reached Spanish A1/A2. The letter *sense* is already metalinguistic, but exclusion needs **every** sense to be excluded and these carry a stray abbreviation or musical-note sense that survives. Languages absent from the whitelist map are not filtered at all — the rule only makes sense where a one-character word is exceptional, which would not hold for a syllabic script.

**A second opinion from English.** After the bands are cut, `adjustBandsWithAnchor()` compares each word against the **CEFR-J Wordlist v1.5** (Yukio Tono, TUFS — free for research *and commercial* use with citation) plus the **Octanove Vocabulary Profile C1/C2** (CC BY-SA 4.0), vendored unmodified under `scripts/data/` with `ATTRIBUTION.md`. `scripts/lib/cefrjAnchor.mjs` reads a word's dictionary gloss and returns the level of the **easiest term of its primary sense** — everything before the first semicolon. Both halves are deliberate: a sense is a list of near-synonyms and a learner only needs one of them, so the median scored `además` at B1 on the strength of "furthermore"; and later senses are where Wiktionary keeps the colourful material, so reading the whole gloss scored `bueno` at B1 because "sexy" is in it.

The adjustment **swaps pairs across a band boundary** rather than reassigning words to their anchor. That matters: the anchor has a large systematic bias (net pull ≈ −3,400 levels for Spanish), because CEFR-J + Octanove is 8,845 English headwords weighted toward A1–B2, so a genuinely C1 word with a plain English gloss anchors at A2. Reassigning would empty the upper bands. Trading pairs cancels a uniform pull by construction — if everything in B1 wants to be A2 and nothing comes back the other way, nothing moves — so only *relative* disagreement has an effect. It also keeps every band exactly its curriculum size and makes the ±1 limit structural: a word crosses at most one boundary and is then locked.

**It only acts on a disagreement of two levels or more.** At one level it fires on noise and demotes core vocabulary — `algo`, `bueno` and `trabajar` all read A2 from their English translations and were dropped out of Spanish A1 on that basis. A gloss is also ignored outright when `isMetalinguisticGloss()` matches it: `a` is glossed "The first letter of the Spanish alphabet; bishop" (the preposition is missing), which read B1 and demoted it.

**The two-level rule is relaxed at the ends of the scale**, and it has to be. Moving a word *up* into A1 would otherwise need an anchor of "A1 minus one" and moving one *down* into C2 an anchor of "C2 plus one"; neither exists, so those boundaries had no candidates on one side, `k` was always 0, and A1↔A2 and C1↔C2 never traded at all. An anchor sitting **on** the floor or ceiling is already disagreeing as loudly as it can express, so `wantsEasier`/`wantsHarder` treat a saturated anchor as sufficient on its own. Everywhere in the middle the two-level rule is unchanged, which is what still keeps `algo`, `bueno` and `trabajar` — all reading A2 against an A1 band — in Spanish A1.

Spanish never showed the freeze because its three-register blend had A1 about right already. French exposed it: Lexique's two registers are film subtitles and books, **both narrative fiction**, so they agree with each other about drama and A1 filled with `souffrir`, `arme` and `âme` while the anchor sat powerless. Unfrozen, the cross-check moves 400 words in French and 504 in Spanish (~3–4%).

**Hand-set level overrides.** `scripts/data/core-overrides.json` has three sections — `pin` (greetings, forced to level 1), `beginner` (thematic A1 sets, also forced to level 1) and `demote` (forced no higher than B1) — applied by `scripts/lib/coreOverrides.mjs` *after* the anchor and immediately before emission, so both bypass the derived signals. Demote runs first, pin second, so pinning wins if a word ever lands in both. It exists because frequency and the anchor share a blind spot: **nobody writes "hello" in an encyclopedia.**

`leadSense` and `curatedGloss` are two further sections, governing DEFINITIONS rather than levels. `leadSense` only reorders senses the dictionary already lists, so it stays inside the rule that a definition comes from the licensed source; `curatedGloss` replaces the gloss outright and is the one deliberate exception, for entries where the source is missing the core sense — Wiktionary's `assiette` has no "plate" at all, and `chambre` is a stub ending in a colon. Prefer `leadSense`, and keep the curated list short.

**A `leadSense` value must match a sense EXACTLY, or it can silently do nothing.** The matcher took the first sense *containing* the value, then moved it only when `i > 0` — so `rouge`, which lists "red (of a red color)" ahead of "red", found index 0 and skipped the move. The override looked applied, was checked in, and changed nothing. It now tries an exact match before falling back to substring (the fallback still serves entries naming a prefix of a longer sense, like `se`). A stale entry can also never match: `ci` named a sense that no longer survives filtering, and sat there leaving the word defined as "see -ci". Against the corpora actually used, `hola` and `bonjour` landed at B1, `안녕하세요` and `아니요` at B2, and `por favor` / `s'il vous plaît` / `au revoir` / `여보세요` were never ranked at all, since the corpus tokenizer counts single tokens and those are multi-word. No tuning fixes that — the evidence is absent from the source.

**`beginner` exists because no corpus contains a beginner's world.** Newspapers, encyclopedias, subtitles and novels almost never say fork, Thursday, purple or yogurt, so the ranking put `tenedor`, `zumo`, `verdura` and `yogur` at C2, `bolígrafo` and `morado` at C1, `manzana` and `cuchillo` at B2, and three of the seven weekdays at B1. Measured against an external A1 reference list, only **49%** of a real beginner vocabulary was in our A1. The `beginner` section fixes that with ~300 words per language in 21 themed sets (numbers, colours, weekdays, months, seasons, family, body, food, house, tableware, clothing, school, places, transport, weather, animals, routine, adjectives, basics, verbs, everyday), taking the yardstick to **93%**. The remainder are pure inflections (`amiga`, `zapatos`, `lavarse`) that have no dictionary headword and so cannot be pinned — the strict-dictionary rule holds here too.

Those sets are written from knowledge of the languages, not copied: the *categories* are universal syllabus structure and every word is validated against our own CC BY-SA dictionary at build time. Third-party curated lists were declined for the same reason as CEFRLex and UniversalCEFR — the good ones are unlicensed or commercially copyrighted. The grouping is kept in the JSON rather than flattened because it is a syllabus, and a "study by topic" feature wants exactly that shape.

One trap worth remembering: `apocopic form of` and `clipping of` look metalinguistic and must NOT be filtered. Spanish apocope produces `muy`, `su`, `tu`, `gran`, `buen`; clipping produces `foto`, `cine`. Adding them to `isMetalinguisticGloss()` deleted `muy` from A1. The single genuine offender, `san`, is named in `demote` instead.

**`demote` exists because French ranks off narrative fiction.** Lexique's two registers are film subtitles and books, so `mourir`, `tuer`, `guerre` and `sang` are genuinely frequent and reach A1 on merit. The obvious fix — blend in a non-narrative register — was measured and **inverts**: Global Voices and Wikimedia rank `guerre` at 206/72 and `mort` at 144/78, *above* where Lexique puts them, while ranking `bonjour` at 4348/16922 and `merci` at 1223/11506. Conflict and death are core news and encyclopedia vocabulary; greetings are not. Mean, geometric and worst-of blends all left `mourir`/`tuer`/`guerre` in A1 *and* pushed `bonjour` to B1–B2 with `manger` and `chien` to A2. The two signals are anti-correlated with the goal, so no weighting separates them — hence an editorial list, stated as one, rather than a number pretending to be one.

Keep both lists short; they are not a place to express taste about A1. The one rule it does **not** bypass is the dictionary: a pinned word must be a real headword with a real gloss, and anything else is warned about and skipped, because the emitted tables carry that gloss. Pinned words are prepended in file order, so they are the first thing a learner meets. Band sizes are allowed to drift here (~20 words in 12,000) — honouring a pin by demoting some other real word to keep A1 at exactly 500 would trade one arbitrary call for another.

This is deliberately a tie-breaker, never the ranking. Mapping English → target is one-to-many (96% of CEFR-J's A1 words find a Spanish candidate but 88% find more than one, median 5), and it is blind to vocabulary with no English headword — 6% of Spanish A1 (`los`, `del`, `había`) anchors to nothing. Each build writes `scripts/reports/{lang}-band-adjustments.tsv` (gitignored) listing every word that moved, so the swaps are reviewable before the tables are committed.

Two filters gate **band eligibility only** — never the dictionary, which stays comprehensive because a learner who meets a slang word still needs to look it up:

- `scripts/lib/registerFilter.mjs` — a headword is dropped when *every* sense is slang, vulgar, obsolete or dialectal. Note it is narrower than the `RESTRICTED_TAGS` lists in the build scripts, which only govern gloss *ordering*: `colloquial` and `informal` are deliberately absent (everyday speech is what a learner wants) and so is `historical` ("feudalism" is a current word for a past thing). `isLexicalPos()` additionally drops letter names, symbols and bound affixes, which is what keeps `p` and `n` out of Spanish A1.
- **There is no `!forms.has(w)` guard**, and re-adding one will silently delete the core vocabulary. It reads as obviously correct — an inflected form is not its own vocabulary item — but Wiktionary also lists `casa` as a form of `casar`, `agua` of `aguar`, `libro` of `librar` and `gracias` as the plural of `gracia`. `dict[w]` is the correct test alone, since it is only ever populated from lemma senses.

**CEFR levels are not an official word list.** (This applies to French as well as Spanish — both are graded on CEFR, but each gets its own prefs key, `cefrLevel` and `frLevel`, so the two studies stay independent.) Unlike HSK and JLPT, which publish authoritative exam vocabulary, the CEFR defines no such list: the Instituto Cervantes and Beacco Reference Level Descriptions are copyrighted books, and **CEFRLex** (FLELex for French, ELELex for Spanish) — which genuinely is CEFR-graded, from learner textbooks — states **no license anywhere**, so it is not vendored. `lib/data/cefr-levels.ts` (Spanish) is therefore still a **frequency approximation**, now cross-register rather than subtitle-derived, and `lib/data/fr-levels.ts` a Lexique-derived one. Don't present it to users as an official mapping.

### The web clipper

`lib/webClip.ts` is a bookmarklet, installed from inside the Paste panel rather than from
Settings — it IS pasting, just without the copying, and Settings is where nobody would look
for it. It scrapes the article from whatever page you are on and
opens it here, segmented. Copy-paste is fine on day one and tedious by week two, and the whole
argument for the app is that you read what you actually want to read.

**The text travels in the URL HASH**, and that is the design rather than a shortcut. A fragment
is never sent to the server, so the page you were reading stays on your device — the same
promise the paste and EPUB panels already make. A POST endpoint would have been easier and
would have quietly broken that promise for the one source where the content is someone else's
page. It also means no storage, no expiry and nothing to clean up. The cap is `MAX_PASTE_CHARS`,
so the clipper can never produce something the reader could not have pasted by hand.

Two things that only surface when you click it, both found that way:

- **The payload is JSON, not two fields joined by a separator.** `encodeURIComponent` escapes
  `|` to `%7C` inside the title, and the browser escapes the literal separator to `%7C` too, so
  the two become indistinguishable. Anything `encodeURIComponent` leaves alone (`~`, `!`, `*`)
  has the mirror-image problem. The round-trip unit test passed throughout, because a string
  never goes near a browser — `tests/webClip.test.ts` now decodes through a real `URL`.
- **React refuses to render a `javascript:` href**, substituting a throwing stub. That is right
  for user-supplied links and exactly wrong for a bookmarklet, whose whole nature is being one,
  so `ClipperPanel` assigns the attribute through the DOM. The panel looked correct either way;
  only the dragged bookmark was dead.

**A clip carries the page's language**, read from `<html lang>` by the bookmarklet. Without it
the text is segmented in whatever language the app happened to be showing — clip a Spanish
article during a Chinese session and it is analysed as Chinese, and the reader has to notice,
switch language, and paste it again by hand, which is the whole saving of the feature spent on
a detour. The app honours the tag only when `languageFromTag` can read it AND the learner has
actually added that language.

That switch has an ORDERING TRAP worth knowing. The request arrives on ReadTab's mount, which
is before `languages` has loaded from prefs, so checking the list at call time always failed
and the switch silently never happened. `wantLanguage` parks the request until the list is
known. The same class of bug is why `language` is now seeded synchronously from localStorage
rather than defaulting to `'zh'` — a Spanish learner's app opened as Chinese at HSK 3, and
anything reading the language in that window got the wrong answer.

**No songs ship with the app.** Lyrics are licensed separately from recordings and both are
enforced, so a "starter songs" shelf is not available to us at any level of curation. What can
be given away is knowing what to look for, which is what the listen-along panel's "New to this?"
block does — what an `.lrc` is, how to find one, and what a working file looks like.

### A book has its own reading space

A book section is NOT another entry in the passage list. Sections used to be appended to it, so
a novel's chapters interleaved with pasted articles and generated passages, "passage 7 / 12"
said nothing about where you were in the book, and reading a novel while also dipping into an
article meant paging past one to reach the other.

`ReadTab` holds `bookPassage` separately: while a book is open it takes over the view, the
passage nav is replaced by a "reading a book" bar with a way out, and `NextSection` advances
within the book rather than appending to the list. Closing puts the list back exactly as it
was, because it was never disturbed. Position is per book in IndexedDB already, so reopening
resumes where you stopped.

### Reading an EPUB

`lib/epub.ts` unzips the book in the browser and returns ordered chapters of PLAIN TEXT,
which then go through `/api/segment-text` exactly as pasted text does. **No iframe reader.**
An embedded reader renders the publisher's XHTML in a document this app cannot reach, which
would put every word beyond the segmenters, the spacing rules and `WordPopup` — the whole
reason text is rendered as tokens here.

Three things worth knowing:

- **The spine is the book, not the manifest.** The manifest lists every file including the
  cover image and stylesheets; only `<spine>` says which are body text and in what order.
  Metadata and manifest lookups go through `getElementsByTagName` and compare LOCAL names,
  because a real OPF namespaces everything (`<dc:title>`, `<opf:item>`) and a CSS selector
  has to guess whether the prefix is part of the name — which differs between XML and HTML
  parsing. Selectors worked on a hand-written fixture and would have failed on every real book.
- **The front-matter threshold is measured in the script's own units.** A page under
  `minChapterChars` is skipped as a cover or copyright line. That was a flat 200 characters,
  which is ~35 words in English and a full page of prose in Chinese — so real chapters were
  silently dropped out of CJK books while European ones behaved. It now compares the two
  scripts against each other (not against page length, since whitespace and punctuation belong
  to neither) and drops to 40 for CJK.
- **A chapter is not a passage.** `/api/segment-text` caps at `MAX_PASTE_CHARS`, so
  `lib/epubChunk.ts` cuts each chapter into sections at paragraph boundaries — never
  mid-sentence, since a truncated final word is what the lemmatizer would then see.
- **`dc:language` is not a language tag.** The spec only recommends RFC 5646 and publishers
  write display names — a Chinese edition declares `简体中文`. `declaredMismatch` therefore
  checks the SHAPE first (`/^[a-z]{2,3}$/` on the primary subtag) and compares against
  `langTags` on the language config, since `zho`/`chi`/`cmn` are all Chinese. Testing
  `tag.length >= 2 && tag !== study` reads as obviously correct and warned that a Chinese book
  was not Chinese. Anything unparseable is **not evidence** and falls through to the script
  check, which reads the prose itself.
- **The shelf is per study language.** Each book carries `studyLanguage`, stamped from the
  language being studied when it was added — never from `dc:language`. `shelfLanguage()` falls
  back to the declared tag only when `languageFromTag` can actually parse it, so books added
  before the field still land correctly; one it cannot place shows everywhere and is stamped on
  first read. Switching language clears the open book (`EpubPanel` holds `activeId` in state and
  is rendered without a `key`), letting the already-per-language `srsly-epub-active-{lang}`
  pointer restore that language's book.

- **The position has ONE home.** Chapter and section live on the book record in IndexedDB;
  localStorage holds only `srsly-epub-active-{lang}`, a pointer to which book is open. Copying
  the position into localStorage as well would be two records of one fact, and they disagree
  the moment either is written alone. `nextPosition` in `lib/epubProgress.ts` crosses chapter
  boundaries and skips empty chapters — a chapter stripped to nothing still occupies an index,
  so advancing has to walk rather than add one — and returns null at the end of the book,
  which renders as a sentence rather than a disabled button claiming there is more.
- **Books live in IndexedDB** (`lib/epubStore.ts`), not localStorage. A novel is megabytes;
  localStorage caps ~5 MB for the whole origin and already holds every deck, the shelf and
  the daily cache. JSZip is dynamically imported for the same reason the level tables are —
  a static import put 30 kB in the initial bundle for every learner.

### Client bundle

The level tables are large — HSK 338 kB, JLPT 585 kB, CEFR 900 kB, French 900 kB of source. They are loaded **on demand**, never imported statically:

- `ImportPanel` dynamically imports a language's tables when the level-import tab is opened.
- `dict.ts` / `jadict.ts` / `esdict.ts` / `frdict.ts` each pull their level vocab inside `preload*()`, alongside the dictionary JSON fetch, rather than at module scope.

Statically importing them put every language's vocabulary in the initial page bundle for every user. Keeping them lazy is what holds first-load JS in the high 200s of kB rather than ~890 kB — if you add a language, follow the same pattern. (Measured 287 kB for `/` at the time of writing; `npm run build` prints it. The figure drifts as the app grows, so treat the ~890 kB counterfactual as the number that matters, not the absolute.)

### Storage abstraction

`lib/storage/types.ts` defines the `DataService` interface. `lib/storage/index.ts` exports a
singleton `storage` that starts on `LocalStorage`; after sign-in `AuthProvider` swaps in
`SupabaseStorage`, which composes a LocalStorage as an offline read cache and write-through.
`lib/storage/firebase.ts` is a throwing skeleton for a backend that lost to Supabase — it is
not wired to anything and `firebase` is not a dependency.

**Every column `SupabaseStorage` names must exist in `supabase/schema.sql` AND in a file under
`supabase/migrations/`.** Three of them once lived only as `alter table` statements written in
a comment at the top of `lib/storage/supabase.ts` — so the live project had them applied by
hand, the schema file never learned about them, and any database built from the repo silently
stored **nothing at all**: `saveVocabDeck` writes `decks` and never the legacy `deck`, so the
upsert failed, the `missingColumns` guard latched, and every deck write was dropped for all
four languages. `tests/sync.test.ts` now reads both SQL files and fails if a column named in
`UserDataRow` is missing from either. A migration that lives in a comment is a migration
nobody has run.

**What syncs and what deliberately does not.** Decks, prefs, SRS state, the shelf, today's
cloze progress, the activity log and finished lessons all sync. Staying device-local, each for
its own reason: `srsly-achievements-seen` (a duplicate toast is cheaper than the sync
surface), `srsly-curriculum-pruned` (records what was done to this copy, and re-pruning is a
pure no-op), `srsly-claimed-words` (ephemeral and derivable), `srsly-daily-*` (a 24-hour cache
that should regenerate at the second device's level), and `srsly-anthropic-key` — which lives
outside `srsly-prefs` *precisely so the synced blob cannot carry it*. **EPUB files never
sync**: a book is megabytes of someone else's copyrighted file, and uploading it would break
the promise the paste and clip panels make in as many words. The shelf says so out loud, since
a silently missing book reads as a bug.

**`srsly-lessons-done` DOES sync, which contradicts the "device-local like achievements-seen"
note in the lesson-tree section above.** The justification there — "'I have read this
explanation' is not recoverable from anything" — is a fact about the learner, not the device,
and the grammar track is numbered, so an unsynced list actively sends someone back to a lesson
they finished. It merges **last-writer-wins, not as a union**: `LearnTab`'s `mark` TOGGLES, so
a union would make un-ticking impossible across devices. The union survives only in
`migrateLocalToCloud`, where there is no cloud list to conflict with.

**The activity log merges per-day MAX, never a sum.** A device writes its merged log back, so
summing double-counts on every round trip — a+b, then a+b+b. MAX is idempotent, and the cost
is that a day studied on two devices reads as the busier of the two rather than the total,
which is the same undercount posture `lib/activityLog.ts` already takes.

**`prefs` and `srs_state` are MERGED per field, not written whole** (`lib/prefsMerge.ts`,
`lib/srsStateMerge.ts`). They were whole-blob last-writer-wins until 2026-09-05, so every
setting travelled with every save and a device holding a stale copy reverted the column on its
next write: change the theme on a phone and the laptop's level went back; open the phone after
studying on the laptop and the streak walked backwards. Nothing errored, and a value that
quietly reverts to one you did once choose is close to undetectable.

The two halves need different rules, and the interesting one is where the obvious answer is
wrong:

- **`srs_state` — the streak is OWNED, not maximised.** MAX is right for the counters and
  wrong for the streak, because a streak is allowed to go DOWN: break it and it resets to 1,
  and a per-field maximum can never represent that, so a stale 40 would resurrect a streak the
  learner had already lost. The streak instead belongs to whichever side has the later
  `lastActive` — already the authoritative "last day studied", already what `lib/streak.ts`
  advances when it persists a reconciled streak — and the two travel TOGETHER, since a count
  from one device beside a date from the other describes a state neither was ever in.
  `todayScore` likewise never outlives its `todayScoreDate`. `forgivenDays` unions, `sessions`
  and `accuracy` take per-day MAX, the same undercount posture `mergeActivity` documents.
- **`prefs` — a THREE-WAY merge against the last value this device saw in the cloud.** These
  are choices, not tallies: no max or union means anything for a theme, and the only honest
  rule is "whoever changed it last". That needs to know what the device CHANGED rather than
  what it holds, which is the entire bug, so `savePrefs` applies only the fields that differ
  from its base. With no base — a first sync — `mine` wins the scalars, which is the old
  behaviour kept deliberately as the floor. Four keyed collections merge per key regardless:
  `poolAutoDate` by later date (losing one language's entry reintroduces the exact
  double-activation avalanche it was moved into prefs to prevent), `testedLevels` by max,
  `placementSeen` by OR, `languages` by union.

Both merges are idempotent and commutative, because a device writes its merged copy back and
the cloud then holds the merge — the same requirement `lib/reviewCounts.ts` documents.
`tests/blobMergeWiring.test.ts` asserts the PAYLOAD rather than the function, because the
wiring is the half that can silently regress: these were one-line blob writes, and an edit
could make them one again without failing a merge test.

#### A write that fails offline is queued, not lost

`patch()` used to `console.error` a failed upsert and return. Nothing retried — so reviews
graded without signal were written to the device and never to the cloud, and then the app's own
refresh-on-focus (`app/page.tsx`) called `invalidate()` and re-read, and every getter mirrored
the cloud's OLDER copy back down over local. **The reviews were deleted, by the feature that
exists to keep devices in step.** Not a slow drift: one focus event.

**The queue is a MAP keyed by column, not a log of operations** (`lib/storage/writeQueue.ts`).
Every write in this layer is a whole-column blob — `patch({ decks: <the entire decks object> })`,
never `{ add: word }` — so a later value supersedes an earlier one completely. That one property
removes everything hard about a retry queue: no ordering to preserve, no stale delta replayed
over a fresh one, and a queue bounded at eight entries however long the device stays offline.
An append-only log would have had all three problems to solve.

**`isPending` is the half that actually prevents the loss.** A queue alone does not: the app can
read, and mirror the stale cloud value down over local, before the queue ever drains. So while a
column is pending, local is by definition the newer copy and the cloud must not overwrite it —
the guard is on `getVocabDeck`, `getSRSState`, `getPrefs`, `getShelf` and `getLessonsDone`. The
facade also flushes BEFORE the focus re-read, so the two are belt and braces.

**A schema fault is not a network fault.** A missing column will never succeed, so queueing it
would mean retrying forever on every focus; it stays learned-once and is dropped from the queue
rather than retried. That is why this cannot simply queue on `error`.

**The cold-cache merge base was the more dangerous bug, and it was caused BY going offline.**
Every payload is built by spreading the cloud's current value, `{ ...(r?.decks ?? {}), [lang]:
deck }`. Offline with a cold cache `row()` returns null, so that `?? {}` produced an object
naming only the language being studied — and replaying it would delete the other three
languages' decks. It failed harmlessly at the time, which is exactly what hid it. `localDecks()`
and `localShelves()` rebuild the base from local instead.

`passage_state` is the one column that is SKIPPED rather than queued when the row is unreadable,
because `LocalStorage` keeps cloze progress under one key per passage and there is no local copy
of the whole map to rebuild from. It is pruned to today on every write, so the worst case is a
blank filled offline not reappearing on a second device later the same day.

**It does not change the conflict model.** A replayed write still overwrites whatever another
device did meanwhile, exactly as an online write would. The claim is narrower and worth stating
exactly: an offline write gets to be a writer at all, instead of vanishing. The one exception is
`activity_log`, which is re-merged through `mergeActivity` at replay — idempotent per-day MAX, so
folding in what the cloud learned is strictly better and costs nothing.

When the queue cannot be persisted (quota), it is dropped and warned about rather than failing
the local write: local is written first and is the truth, so the cost is the SYNC of that change
and never the change.

#### A read is fresh, but one page load is not fifty-two reads

`row()` is `select('*')` — the WHOLE row: all four languages' decks, the shelf, the activity
log — and every read path calls it FRESH, deliberately, because that is what cross-device sync
is. What that missed is that the reads on a page load are CONCURRENT: four languages times
several mounted copies of `useVocabDeck`, plus prefs, SRS state, lessons, counts and
per-passage cloze state, all mounting together.

Measured on the live site, signed in: **52 Supabase calls, the last landing 25.9 seconds after
navigation**, against a page that was itself interactive at 468 ms. The app was not slow; it was
downloading the same row fifty-two times. After coalescing: 9 calls, none of them duplicates of
each other, all finished by 2.8 s.

**The freshness rule did not change, and must not.** Callers running in the same instant share
one in-flight fetch, and a single request started at that instant is exactly as current as
fifty-two started at that instant — no older snapshot is served. A caller arriving after it
resolves still gets its own. `invalidate()` drops the in-flight share as well as the cache, so a
focus re-read cannot join a request issued before the learner came back to the tab.
`tests/rowCoalescing.test.ts` pins both halves; against the old `row()` its first case fails
12 to 1.

**`poolAutoDate` lives in prefs, not in `srsly-pool-auto-{lang}`.** Device-local was harmless
while decks were; the moment they sync, two devices hold two dates against one shared pool and
both activate a batch on the same day — exactly the avalanche `lib/poolAutoActivate.ts` exists
to prevent, reintroduced by syncing.

LocalStorage keys:
- `srsly-vocab-deck-{lang}` — user's `DeckWord[]`, namespaced per language. **One deck per language, full stop.** The multi-deck feature (a `decks: string[]` tag array on each word, a deck selector, per-deck study scoping) was removed; `useVocabDeck` strips the retired `deck`/`decks` fields from stored words on load. The `decks` jsonb column in `lib/storage/supabase.ts` is unrelated — it is keyed by `LanguageCode` and is how per-language decks are stored
- `srsly-srs-state` — streak, todayScore, session count
- `srsly-prefs` — theme, font, language, and the per-language level (`hskLevel` / `jlptLevel` / `cefrLevel` / `frLevel`)
- `srsly-claimed-words` — words added to deck or previewed
- `srsly-curriculum-pruned` — per-language marker of the last `CURRICULUM_VERSION` the deck was pruned at (`lib/curriculum.ts`). Device-local on purpose: it records what has been done to this copy of the deck, not a preference worth syncing
- `srsly-pool-auto-{lang}` — the date the daily pool auto-activation last ran (`lib/poolAutoActivate.ts`). Read on load, not on a timer, and **never used to compute elapsed days**: the catch-up cap is precisely the absence of that arithmetic, so a week away costs one batch rather than seven
- `srsly-activity-log` — per-day count of cards graded; the review heatmap's record. **Synced**, merged per-day MAX
- `srsly-lessons-done` — finished lesson ids. **Synced**, last-writer-wins (the tick toggles)
- `srsly-daily-{lang}-{level}-{YYYY-MM-DD}` — cached daily content

### Theming

Six themes (`paper`, `ink`, `tea`, `slate`, `bone`, `dusk`) and five fonts are toggled by setting `data-theme` and `data-font` attributes on `document.body`. CSS variables (`--ink`, `--paper`, `--card`, `--line`, `--accent`, `--f-display`, `--f-mono`, `--f-han`, etc.) drive all styling. `useTheme` manages this; `ThemeSheet` is the drawer UI. Never use hardcoded colors — always use CSS variables.

#### Milestones are derived, never stored

`lib/achievements.ts` computes every milestone from the deck and `srsly-srs-state` on read —
"50 words mastered" is a count over the deck, not a counter kept in sync. That follows the
"store only what cannot be derived" rule, and it is the feature most likely to violate it: the
obvious build is a table of unlocked badges, which is a second record of what the deck already
says and drifts the first time a word is deleted.

Mastery is **stability, not review count**: `reviews >= n` calls eight passes on a card you keep
forgetting mastery, and FSRS already measures the difference — `MASTERY_STABILITY_DAYS` asks
whether the card would survive a month.

The one thing that genuinely cannot be derived is which milestones have been ANNOUNCED, so
`srsly-achievements-seen` holds those ids, device-local like `srsly-curriculum-pruned`. It
**seeds silently on first run**: someone arriving with a full deck has earned a dozen at once,
and a dozen toasts is a bug, not a reward.

`AchievementToast` renders on the two "you finished" screens beside the daily proverb, and
holds what it is showing in its OWN state rather than rendering from `fresh`. Those look like
the same list and are not — acknowledging empties `fresh`, so rendering from it made the
milestone vanish a second after it appeared.

#### A milestone is a seal, and one badge per ladder

`components/stats/BadgeSeal.tsx` draws a milestone as a mark inside a ring. It replaced a row
of text pills in which `Vocabulary 1000` looked exactly like `Vocabulary 10` — twenty-odd
identical grey tags, which is a tag cloud rather than a cabinet.

**`FAMILIES` groups the thresholds and `collapse` shows only the rung you are standing on** —
the highest earned, or the nearest ahead. Passing 100 words used to print `Vocabulary 10`, 50
and 100 side by side. Grouping is declared explicitly rather than parsed off an id prefix,
because **the ids are the `srsly-achievements-seen` key and renaming one re-announces a
milestone the learner already saw** — that is what lets `first-word` join the `deck` ladder and
`book-1` join `books` without either being renamed. `tests/achievements.test.ts` asserts every
milestone is in exactly one family and that each family is listed easiest first, both of which
fail silently in the UI otherwise: an unlisted milestone renders as a lone badge, and a family
out of order draws "1/5" on its hardest rung.

**The marks carry no script, deliberately.** The obvious seal has a character in it, and it
must not: the panel is shared by all four languages and is about none of them, so a 語 would be
the hardcoded-空 bug in a new place. Every mark is geometry.

**Earned and unearned use different rings, and that is the point.** Earned draws one arc per
rung, filled to the rung reached, so "3 of 5" is legible without a caption; unearned draws a
single continuous arc for progress toward the next one. They answer different questions — what
you have climbed versus how close the next step is — and the flat progress bar this replaced
said the second thing in a second visual language one row below the badge it described.

**Gold is the top of a ladder, and only a real one** (`toppedLadder`). A one-rung family is
trivially at its own top, and counting that made three of seven badges gold — gold then reads
as decoration rather than as the end of a climb.

**Marks are judged at 46px, not blown up.** `unstuck` first carried a chain link with a
diagonal across it, which at badge size read as the universal *prohibited* slash: a milestone
for repairing a card looked like one for banning it. Pulling the halves apart to drop the slash
left two floating hooks that read as nothing. It is now the shape of the thing itself — a card
that dipped and came back up.

`ToastHost` draws the same seal as the Stats panel and the completion screen, so one event does
not have two looks depending on where the learner happened to be standing.

#### Only one surface announces a milestone

Two things can announce: `AchievementToast` on the completion screens, and `ToastHost` in the
corner. Both read `fresh` from `useAchievements` and both call `acknowledge()`, and they are
separate hook instances — so whichever effect ran first consumed the announcement and the other
showed nothing.

**A completion screen wins whenever one is mounted; the floating toast speaks only when there
is none.** `lib/completionSurface.ts` holds the claim. Both halves are load-bearing: the
floating toast exists because the earliest milestones are deliberately reachable in a first
session, and a learner who saves five words while reading and never finishes a passage would
otherwise meet none of them — so silencing it outright would delete a deliberate behaviour.

**The claim is made during RENDER, not in an effect**, because React runs every render in a
commit before any effect in it — which is what makes the outcome independent of where the two
components sit in the tree. It is a `Set` keyed by instance rather than a counter so that
StrictMode's double render is a no-op instead of a permanent +1, and so there is no state
update during render to warn about. `ToastHost` reads it in its effect and returns **without
acknowledging** — acknowledging and merely skipping the toast would mark the milestone seen and
lose it for good.

**`ToastHost` mounts once, at the app root, and that is not tidiness.** It used to live inside
`ReadTab`, which mounts twice (variant `'read'` and variant `'srs'`), so there were two of them
racing over the same milestone — and `TabPanel` hides an inactive tab with `display: none`, so
the winner could be the instance nobody could see and the milestone simply never appeared.

`AchievementToast` renders on **both** completion screens. It was missing from the reading
results for a while, despite this file and the component's own docstring describing two, so a
milestone crossed on the last blank of a passage had nowhere to be announced.

### Reading and SRS are separate tabs

One line down the middle, and it is the app's main organising idea:

- **Read** is your own material — starter texts, pasted articles, web clips, books. No blanks,
  no grading, no schedule touched. Words enter the deck only when you tap one and press Add to
  deck. Comprehension questions are available (they check understanding, not recall).
- **SRS** is what FSRS actually drives: flashcards, and generated passages, which keep their
  blanks because a generated passage is written around the words you owe today.

**SRS is the landing tab**, with one exception that is load-bearing rather than a nicety: a
URL carrying a web clip lands on Read instead. `TabPanel` mounts a tab only once it has been
activated, and the clipper reads its payload from the location hash in an effect inside
ReadTab — so landing on SRS with a clip in the URL would leave that effect unmounted and the
clipped article unread until the learner opened Read by hand, which is the exact papercut the
clipper removes. `initialTab()` in `app/page.tsx` decides it in a lazy initialiser, reusing
`decodeClip`.

`ReadTab` renders BOTH, and `variant` decides which: `'read'` draws the passages marked
`pasted` (every own-text source goes through `buildPastedPassage`, so that flag already
separates the two halves — there is deliberately no second `source` field to drift out of sync
with it), and `'srs'` draws the rest. One component because a passage is a passage; the
difference is which list it reads and which controls it offers.

Both instances mount at once, since TabPanel keeps tabs alive. That is why **clip handling is
gated to `variant === 'read'`** — a clip is someone's own article, and if the SRS instance
consumed the URL hash first it would clear it and Read would find nothing.

Anything gated on `clozeWordCount > 0` is gated on "this passage has blanks", which is the
same distinction expressed in the one place the renderer can see it. That is why the Hints
toggle and the finish row disappear on your own reading rather than being separately
suppressed.

**CRAM WAS REMOVED.** It drilled a chosen set while deliberately changing nothing — no
scheduling, no counts, no streak — which made it the one thing in the SRS tab that was not
SRS. It also had no stored state to clean up: being stateless WAS the feature. Stats' "Drill
these" went with it, since cram was the only thing that could drill a scoped set.

#### Listening dictation is the cloze passage with the text withheld

`lib/dictation.ts` and `components/read/DictationBar.tsx` add a **Listen** toggle to a
generated passage. The sentence is played whole, the text is hidden, and the learner types
the missing words into the blanks that were already there.

**IT IS A PRESENTATION, NOT A SECOND EXERCISE.** The blanks, the typed input, the
case-insensitive accent-sensitive grading, the refusal to re-grade and the FSRS write are all
the ones `ClozeBlank` already performs — dictation changes only what can be SEEN while
answering. Nothing new is stored, and a heard blank grades exactly as a read one: recognising
a word by ear is arguably harder, but a second scale would be a second record of one fact and
`srs_state` has enough of those.

**THE AUDIO IS COMPLETE; THE TEXT IS WHAT HAS GAPS.** The obvious build is `speakWithBlank()`
— speak up to the blank, go silent, speak the rest — and it is backwards for this exercise.
The learner is asked to type what they HEARD, and a word that was never spoken cannot be
heard. Silence at the gap tests whether you can infer a missing word from context; playing the
sentence whole tests whether you can recognise it by ear and spell it, which is what listening
practice is for. `speakWithBlank` keeps a job as the "With the gap" HINT, for someone who has
heard the sentence and still cannot place the word. It also takes exactly ONE gap while a
sentence can carry several, so it could not have been the spine either way.

**SRS only, and that is the same contract as everywhere else.** Your own reading commits with
`vocabWords: []` and touches no schedule, so it has no blanks to dictate — and turning a book
you chose into an exercise is what this file refuses. The toggle is gated on
`variant === 'srs'` as well as on the passage having blanks.

**A sentence is revealed the moment its last blank is answered**, not at the end of the run:
seeing the sentence you just heard is where the learning lands, and holding it to a results
screen puts it a long way from the moment it means something. A sentence with NO blanks is
never hidden — there would be nothing to earn it with, so it would stay blurred for good.

**A hidden token is masked plain text, not a blurred `TokenEl`.** Rendering the real thing and
blurring it leaves it tappable, and the lookup popup would print the word and its definition
for a token the learner is being asked to recognise by ear. Blur is a look, not a barrier. The
characters stay in place so nothing reflows when the sentence is earned.

**Hints are forced off while dictating**, whatever the toggle says: `showHint` gives live
character-by-character feedback as you type, which in a listening exercise hands over the
spelling being tested.

**`PassagePlayer` is hidden during a run.** It reads the whole passage straight through, and
two play buttons an inch apart doing different things is a puzzle — the wrong one reads out
sentences the learner has not earned. Audio still fires only on physical intent, for the
reason `PassagePlayer`'s docstring gives at length: `/api/tts` is a paid call.

**The daily proverb is an SRS reward.** It shows on the two screens that say you finished
scheduled work — a completed generated passage and a finished flashcard session. It does not
appear on your own reading, which has no finish state to earn it: `showResults` only exists
where blanks do.

### Key hooks

| Hook | Responsibility |
|---|---|
| `useSRS` | Streak tracking, session scoring, emoji state |
| `useVocabDeck` | CRUD for the user's deck; `reviews` field tracks mastery |
| `useDailyContent` | Fetch/cache AI passage; parse raw API tokens |
| `useTheme` | Theme/font persistence and DOM sync |
| `useWordPopup` | Click-to-lookup popup state on clickable Chinese words |
| `useSpeech` | Web Speech API TTS for passage playback |

#### A leech is a card to fix, not to keep reviewing

A word auto-flags as a leech at `LEECH_THRESHOLD` lapses and auto-pauses. That stops it
eating review time, which is the immediate problem, but it fixes nothing — and until
`components/vocab/LeechTriage.tsx` the card simply sat in the Stuck filter forever.

The premise is that a card failed eight times is rarely failing for want of a ninth review:
the gloss is a five-sense dictionary dump nobody can hold, or the word has no hook. So all
three actions **change the card** — trim the meaning, add a mnemonic (`DeckWord.note`,
rendered on the flashcard's answer side only), or remove it — and none of them is "review it
again". Unsticking clears `leech` as well as the schedule, because leaving the flag set would
re-pause the card on its very next lapse under `applyLeech`'s half-threshold rule.

Shown one card at a time, and only under the Stuck filter. A list of thirty leeches is the
thing the learner has already been ignoring; a queue of one asks a question small enough to
answer.

