# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Design principles

Prioritize **elegance and concision** over volume. Concretely:

- **Don't reinvent existing tools.** Reach for well-maintained libraries (e.g. `ts-fsrs` for spaced-repetition scheduling) instead of hand-rolling their logic.
- **Prevent data bloat.** Keep persisted models minimal — store only what can't be derived, and let types extend a library's own model (e.g. `DeckWord extends ts-fsrs`'s `Card`) rather than duplicating fields.
- **Use the framework, not bespoke plumbing.** Prefer built-in mechanisms (e.g. SvelteKit `load` / remote functions) over custom state/store layers.

## Commands

```bash
npm run dev        # start dev server at localhost:3000
npm run build      # production build
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
```

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

AI-generated content requires `ANTHROPIC_API_KEY` in `.env.local`. Without it (or once a guest exhausts their free-generation budget), the ReadTab shows a "no API key" / limit-reached warning with no passage underneath — there is no static fallback content.

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

Two French-specific wrinkles:

- **Elision.** `l'eau` is kept as ONE token so the passage reads naturally, and the proclitic is peeled off during lemmatization to link the card to `eau`. Only known proclitics (`l' d' j' n' qu' s' c' m' t'`) split, and a token that is *itself* a headword never does — which is what keeps `aujourd'hui` and `d'accord` ("OK", not "agreement") intact. The peeled remainder is re-tested against `FORM_DOMINANT_LEMMAS`, not just looked up: `n'est` peels to `est`, which is a headword meaning "east", so without that second pass "is not" resolves to a compass direction.
- **Homograph ordering.** A surface that is a common word normally wins over its inflected reading (`livre` is "book", not a form of `livrer`; likewise `porte`, `ferme`, `vers`). The exception is `FORM_DOMINANT_LEMMAS` — forms of a dozen very high-frequency verbs, where the verb reading dominates so clearly that it should win anyway (`est` is "is" far more often than the noun "east"; `été` is "been" before "summer"). `FORM_DOMINANT_EXCEPTIONS` then carves back the cases where that overshoots: `puis` is the everyday adverb "then", and `je puis` for "je peux" is literary.

**Contraction headwords are dropped at build time** (`contraction of` / `compound of` glosses). French Wiktionary lists `qu'il` and `n'est` as headwords, and the lemmatizer's first test is "is this surface already a headword?" — so they stopped at themselves with a grammar note for a definition and never linked to the `il` / `être` card. `j'ai` and `c'est` still survive, because they carry an ordinary gloss ("I have", "it is") alongside the contraction one; that gloss is serviceable, so they are left alone.

### Language data files

Each language's dictionary and level lists are generated by a script in `scripts/`, never edited by hand:

| Script | Outputs |
|---|---|
| `build-cedict.mjs` | `public/cedict.json`, `lib/data/hsk-*.ts` |
| `build-jmdict.mjs` | `public/jmdict.json`, `lib/data/jlpt-*.ts` |
| `build-esdict.mjs` | `public/esdict.json`, `lib/data/es-forms.ts`, `lib/data/cefr-*.ts` |
| `build-frdict.mjs` | `public/frdict.json`, `lib/data/fr-forms.ts`, `lib/data/fr-*.ts` |
| `build-proverbs.mjs` | `lib/data/proverbs.ts` (all four languages) |

Proper nouns are filtered out at build time by `scripts/lib/nameFilter.mjs`, shared by every build script: `isNamePos()` rejects a `name`/`proper noun` headword outright, `isNameSense()` drops individual senses that gloss as a surname, given name or place ("a city in…", "a commune in…"). It runs per sense, not per entry, so `jean` keeps "denim" while losing the given name, and `casa`/`perro`/`ville`/`manger` are untouched. Filtering here rather than at lookup time is what keeps `mercado`-style over-lemmatization from being reintroduced — the lemmatizers ask the dictionary whether a candidate is a real word, and a dictionary full of names answers yes too often.

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

**Hand-set level overrides.** `scripts/data/core-overrides.json` has three sections — `pin` (greetings, forced to level 1), `beginner` (thematic A1 sets, also forced to level 1) and `demote` (forced no higher than B1) — applied by `scripts/lib/coreOverrides.mjs` *after* the anchor and immediately before emission, so both bypass the derived signals. Demote runs first, pin second, so pinning wins if a word ever lands in both. It exists because frequency and the anchor share a blind spot: **nobody writes "hello" in an encyclopedia.** Against the corpora actually used, `hola` and `bonjour` landed at B1, `안녕하세요` and `아니요` at B2, and `por favor` / `s'il vous plaît` / `au revoir` / `여보세요` were never ranked at all, since the corpus tokenizer counts single tokens and those are multi-word. No tuning fixes that — the evidence is absent from the source.

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
- **A chapter is not a passage.** `/api/segment-text` caps at `MAX_PASTE_CHARS`, so
  `lib/epubChunk.ts` cuts each chapter into sections at paragraph boundaries — never
  mid-sentence, since a truncated final word is what the lemmatizer would then see.
- **Books live in IndexedDB** (`lib/epubStore.ts`), not localStorage. A novel is megabytes;
  localStorage caps ~5 MB for the whole origin and already holds every deck, the shelf and
  the daily cache. JSZip is dynamically imported for the same reason the level tables are —
  a static import put 30 kB in the initial bundle for every learner.

### Client bundle

The level tables are large — HSK 338 kB, JLPT 585 kB, CEFR 900 kB, French 900 kB of source. They are loaded **on demand**, never imported statically:

- `ImportPanel` dynamically imports a language's tables when the level-import tab is opened.
- `dict.ts` / `jadict.ts` / `esdict.ts` / `frdict.ts` each pull their level vocab inside `preload*()`, alongside the dictionary JSON fetch, rather than at module scope.

Statically importing them put every language's vocabulary in the initial page bundle for every user. Keeping them lazy is what holds first-load JS at ~250 kB instead of ~890 kB — if you add a language, follow the same pattern.

### Storage abstraction

`lib/storage/types.ts` defines the `DataService` interface. `lib/storage/index.ts` exports a singleton `storage` pointing at `LocalStorage` (all data lives in `localStorage`). A commented-out Firebase implementation exists in `lib/storage/firebase.ts` — swap the import in `index.ts` to enable it.

LocalStorage keys:
- `srsly-vocab-deck-{lang}` — user's `DeckWord[]`, namespaced per language. **One deck per language, full stop.** The multi-deck feature (a `decks: string[]` tag array on each word, a deck selector, per-deck study scoping) was removed; `useVocabDeck` strips the retired `deck`/`decks` fields from stored words on load. The `decks` jsonb column in `lib/storage/supabase.ts` is unrelated — it is keyed by `LanguageCode` and is how per-language decks are stored
- `srsly-srs-state` — streak, todayScore, session count
- `srsly-prefs` — theme, font, language, and the per-language level (`hskLevel` / `jlptLevel` / `cefrLevel` / `frLevel`)
- `srsly-claimed-words` — words added to deck or previewed
- `srsly-curriculum-pruned` — per-language marker of the last `CURRICULUM_VERSION` the deck was pruned at (`lib/curriculum.ts`). Device-local on purpose: it records what has been done to this copy of the deck, not a preference worth syncing
- `srsly-pool-auto-{lang}` — the date the daily pool auto-activation last ran (`lib/poolAutoActivate.ts`). Read on load, not on a timer, and **never used to compute elapsed days**: the catch-up cap is precisely the absence of that arithmetic, so a week away costs one batch rather than seven
- `srsly-daily-{lang}-{level}-{YYYY-MM-DD}` — cached daily content

### Theming

Six themes (`paper`, `ink`, `tea`, `slate`, `bone`, `dusk`) and five fonts are toggled by setting `data-theme` and `data-font` attributes on `document.body`. CSS variables (`--ink`, `--paper`, `--card`, `--line`, `--accent`, `--f-display`, `--f-mono`, `--f-han`, etc.) drive all styling. `useTheme` manages this; `ThemeSheet` is the drawer UI. Never use hardcoded colors — always use CSS variables.

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

### Practice modes

The Practice tab (`components/practice/ExtrasTab.tsx`) offers three modes selected via `PracticeMode`:
- **flash** — `Flashcards.tsx` — SRS card review with mastery grading
- **fill** — `FillInBlank.tsx` — fill-in-the-blank from daily content
- **convo** — `Conversation.tsx` — guided dialogue practice

Reading comprehension (`ReadTab`) supports two response modes: free-response (`fr`) graded by Claude at `/api/daily-content` or multiple-choice (`mc`).
