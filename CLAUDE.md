# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Design principles

Prioritize **elegance and concision** over volume. Concretely:

- **Don't reinvent existing tools.** Reach for well-maintained libraries (e.g. `ts-fsrs` for spaced-repetition scheduling) instead of hand-rolling their logic.
- **Prevent data bloat.** Keep persisted models minimal — store only what can't be derived, and let types extend a library's own model (e.g. `DeckWord extends ts-fsrs`'s `Card`) rather than duplicating fields.
- **Use the framework, not bespoke plumbing.** Prefer built-in mechanisms (e.g. SvelteKit `load` / remote functions) over custom state/store layers.

## Commands

```bash
npm run dev      # start dev server at localhost:3000
npm run build    # production build
npm run lint     # eslint
```

No test suite exists yet.

## Environment

AI-generated content requires `ANTHROPIC_API_KEY` in `.env.local`. Without it (or once a guest exhausts their free-generation budget), the ReadTab shows a "no API key" / limit-reached warning with no passage underneath — there is no static fallback content.

## Architecture

**srsly** is a multi-language SRS (spaced repetition) app built with Next.js 15 (App Router), React 19, TypeScript, and Tailwind CSS v4. It supports Chinese (HSK 1–6), Japanese (JLPT N5–N1), Spanish (CEFR A1–C2) and Korean (TOPIK 1–6).

### Adding or changing a language

`lib/languageConfig.ts` is the single place where languages differ. A `LanguageConfig` carries the level table, dictionary name, script behaviour, UI copy and prompt hints; components and API routes read from it rather than branching on `language === 'xx'`. **Keep it that way** — if you find yourself adding a third arm to a ternary, the difference belongs on the config.

Three flags drive most of the behaviour:

| Flag | Meaning |
|---|---|
| `hasReadings` | Whether words carry a phonetic reading (pinyin/furigana). **False for Spanish and Korean** — the `p` slot stays empty, no ruby annotation renders, and a token qualifies as vocab on its *meaning* rather than on having resolved a reading |
| `usesBaseForms` | Whether tokens can carry a lemma in `RawTok`'s 4th element (ja, es, ko) |
| `segmentation` | `'pipe'` = the model self-segments with `\|` (zh); `'server'` = the model writes plain prose and we segment server-side (ja, es, ko) |
| `scriptIsUnspaced` | Whether the script needs re-segmentation against the dictionary, word-boundary marks, and no inter-token spaces (zh, ja). Spanish and Korean are space-delimited and share the same spacing/rendering path |

### App structure

`app/page.tsx` is a single-page client component that renders five tabs — `read`, `practice`, `dash`, `vocab`, `settings` — switching between them with local `useState`. All navigation is tab-switching; there are no Next.js routes beyond the root page.

### Token format

The core data primitive is `PassageToken` (`lib/types.ts`): `{ text, reading?, meaning?, type?, baseForm? }`. The API route emits compact tuple arrays (`RawTok = [text] | [text, reading] | [text, reading, meaning] | [text, reading, meaning, baseForm]`), normalized into `PassageToken`s client-side in `hooks/useDailyContent.ts`. A single-element tuple is punctuation; a 3-or-4-element tuple marks a **vocab** word; the optional 4th element carries the dictionary/base form of an inflected word, resolved server-side (kuromoji for Japanese, `lib/server/spanishLemmatizer.ts` for Spanish). For Spanish the `reading` slot is always `''`.

### AI-generated daily content

`app/api/daily-content/route.ts` is a Next.js API route that calls `claude-haiku-4-5-20251001` with the user's due vocab words, returning a JSON blob of passage, fill items, and conversation keyed to those words. The hook `hooks/useDailyContent.ts` handles caching (localStorage keyed by `srsly-daily-{hskLevel}-{date}`), calls the API route, and parses the raw JSON into typed structures. There is no static fallback content for either language — a failed or incomplete generation surfaces as an error state rather than silently substituting sample content. Daily content is regenerated once per day per HSK/JLPT level.

For Japanese, the model writes plain sentence text (no self-segmentation); `app/api/daily-content/route.ts` segments it server-side via `lib/server/kuromojiSegmenter.ts`, which wraps the `kuromoji` morphological analyzer with a fusion pass that re-merges its morpheme-level output into whole conjugated words (kuromoji alone would split e.g. `使っています` into 4 pieces), then resolves meanings from `public/jmdict.json`/`lib/data/jlpt-vocab.ts` keyed by the resolved dictionary (base) form. Chinese still uses the model's own pipe-delimited (`|`) segmentation, parsed client-side.

For Spanish, the model also writes plain prose, segmented server-side by `lib/server/spanishSegmenter.ts`. Spanish is space-delimited, so splitting on whitespace/punctuation is exact and no morphological analyzer is needed; the work is in `lib/server/spanishLemmatizer.ts`, which resolves inflected forms to their dictionary form in two tiers:

1. `lib/data/es-forms.ts` — Wiktionary's own `form_of` data, which is where irregulars come from (`fui` → `ir`, `dijeron` → `decir`).
2. Suffix rules, each validated against the dictionary so a candidate is only accepted if it is a real word.

A surface that is itself a **common word** short-circuits both tiers and stays as-is, because many frequent Spanish words are also inflections of something else (`mercado` is "market", not a participle of `mercar`; `para` is the preposition, not a form of `parar`). Headwords whose only sense is a proper noun don't count, so `casas` → `casa` still works. The accepted cost is that participles which double as listed adjectives (`vivido`, `hablado`) stay as themselves rather than resolving to their infinitive.

For Korean, the model writes plain prose and `lib/server/koreanSegmenter.ts` splits it. Korean is space-delimited so the split itself is exact, but each space-delimited chunk (an **eojeol**) fuses a content word with its particles and verb endings — `학교에서` is 학교 + 에서, `먹었어요` is 먹다 conjugated. Resolving that is `lib/server/koreanLemmatizer.ts`, and it is the only language here whose morphology is written by hand:

- Japanese has kuromoji, a real analyzer. Spanish had Wiktionary's `form_of` data, which supplied every irregular for free.
- Korean has neither. Its Wiktionary `form_of` entries are almost entirely hanja→hangul spellings, and verb lemmas list only ~3 forms against a conjugation space of hundreds.

So it works by rule, in the same generate-liberally/validate-strictly style as Spanish: strip a particle or ending, generate candidate stems, accept only what the dictionary confirms. Endings fuse *into* the stem's final syllable (만나 + 았어요 → 만났어요, where 았 survives only as a ㅆ batchim), so the candidate generation is jamo-level via `es-hangul` and the two transformation families **compose** — 왔어 → 왔 → 와 → 오 → 오다.

⚠️ **`es-hangul` reports compound vowels decomposed**: `돼` comes back with jungseong `"ㅗㅐ"`, not `"ㅙ"`, and `combineCharacter` expects the same. Passing a precomposed vowel does not throw — it silently builds the *wrong* syllable (`combineCharacter('ㄷ','ㅚ')` returns `니`, not `되`). Compound vowels in that file go through the named `WA`/`WEO`/`WAE`/`OE` constants for exactly this reason.

Coverage is measured, not assumed: `build-kodic.mts` runs the real lemmatizer over all 50k tokens of the frequency list and prints the resolution rate. It currently resolves **64% of distinct forms / 86.8% of running text**. The remainder is dominated by proper nouns and colloquial contractions (`어딨어`, `아녜요`). Two known limits: 들어요 is genuinely ambiguous between 들다 and 듣다, and words Wiktionary lists as headwords in their own right (그래 "yeah") stop at themselves rather than resolving to 그렇다.

### Language data files

Each language's dictionary and level lists are generated by a script in `scripts/`, never edited by hand:

| Script | Outputs |
|---|---|
| `build-cedict.mjs` | `public/cedict.json`, `lib/data/hsk-*.ts` |
| `build-jmdict.mjs` | `public/jmdict.json`, `lib/data/jlpt-*.ts` |
| `build-esdict.mjs` | `public/esdict.json`, `lib/data/es-forms.ts`, `lib/data/cefr-*.ts` |
| `build-kodic.mts` | `public/kodict.json`, `lib/data/topik-*.ts` (run with `npx tsx`) |

**Neither CEFR nor TOPIK levels are official word lists.** Unlike HSK and JLPT, which publish authoritative exam vocabulary, the CEFR defines no such list and the Instituto Cervantes inventories are neither machine-readable nor freely redistributable. `lib/data/cefr-levels.ts` is therefore a **frequency approximation** — lemmas ranked by OpenSubtitles corpus frequency and cut at the cumulative vocabulary sizes commonly cited per tier. Useful as a study progression, but don't present it to users as an official mapping.

`lib/data/topik-levels.ts` has the same status, for the same reason — TOPIK publishes no vocabulary list either. Note that Korean needs an extra step the others don't: a raw Korean frequency list is mostly *inflected* forms (its top entries are 내가, 난, 있어, 할), so `build-kodic.mts` lemmatizes the corpus first and aggregates counts onto headwords before banding. The best-graded open data (a scrape combining the National Institute of Korean Language's 초급/중급 grading with a TOPIK A/B/C grading) carries **no license**, so it is deliberately not used.

### Client bundle

The level tables are large — HSK 338 kB, JLPT 585 kB, CEFR 900 kB, TOPIK 600 kB of source. They are loaded **on demand**, never imported statically:

- `ImportPanel` dynamically imports a language's tables when the level-import tab is opened.
- `dict.ts` / `jadict.ts` / `esdict.ts` / `kodict.ts` each pull their level vocab inside `preload*()`, alongside the dictionary JSON fetch, rather than at module scope.

Statically importing them put every language's vocabulary in the initial page bundle for every user. Keeping them lazy is what holds first-load JS at ~250 kB instead of ~890 kB — if you add a language, follow the same pattern.

### Storage abstraction

`lib/storage/types.ts` defines the `DataService` interface. `lib/storage/index.ts` exports a singleton `storage` pointing at `LocalStorage` (all data lives in `localStorage`). A commented-out Firebase implementation exists in `lib/storage/firebase.ts` — swap the import in `index.ts` to enable it.

LocalStorage keys:
- `srsly-vocab-deck-{lang}` — user's `DeckWord[]`, namespaced per language
- `srsly-srs-state` — streak, todayScore, session count
- `srsly-prefs` — theme, font, language, and the per-language level (`hskLevel` / `jlptLevel` / `cefrLevel`)
- `srsly-claimed-words` — words added to deck or previewed
- `srsly-daily-{hskLevel}-{YYYY-MM-DD}` — cached daily content

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

### Practice modes

The Practice tab (`components/practice/ExtrasTab.tsx`) offers three modes selected via `PracticeMode`:
- **flash** — `Flashcards.tsx` — SRS card review with mastery grading
- **fill** — `FillInBlank.tsx` — fill-in-the-blank from daily content
- **convo** — `Conversation.tsx` — guided dialogue practice

Reading comprehension (`ReadTab`) supports two response modes: free-response (`fr`) graded by Claude at `/api/daily-content` or multiple-choice (`mc`).
