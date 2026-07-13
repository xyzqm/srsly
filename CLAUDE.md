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

**srsly** is a Chinese language SRS (spaced repetition) app built with Next.js 15 (App Router), React 19, TypeScript, and Tailwind CSS v4.

### App structure

`app/page.tsx` is a single-page client component that renders five tabs — `read`, `practice`, `dash`, `vocab`, `settings` — switching between them with local `useState`. All navigation is tab-switching; there are no Next.js routes beyond the root page.

### Token format

The core data primitive is `PassageToken` (`lib/types.ts`): `{ text, reading?, meaning?, type?, baseForm? }`. The API route emits compact tuple arrays (`RawTok = [text] | [text, reading] | [text, reading, meaning] | [text, reading, meaning, baseForm]`), normalized into `PassageToken`s client-side in `hooks/useDailyContent.ts`. A single-element tuple is punctuation; a 3-or-4-element tuple marks a **vocab** word; the optional 4th element (Japanese only) carries the dictionary/base form of a conjugated word, resolved server-side by kuromoji.

### AI-generated daily content

`app/api/daily-content/route.ts` is a Next.js API route that calls `claude-haiku-4-5-20251001` with the user's due vocab words, returning a JSON blob of passage, fill items, and conversation keyed to those words. The hook `hooks/useDailyContent.ts` handles caching (localStorage keyed by `srsly-daily-{hskLevel}-{date}`), calls the API route, and parses the raw JSON into typed structures. There is no static fallback content for either language — a failed or incomplete generation surfaces as an error state rather than silently substituting sample content. Daily content is regenerated once per day per HSK/JLPT level.

For Japanese, the model writes plain sentence text (no self-segmentation); `app/api/daily-content/route.ts` segments it server-side via `lib/server/kuromojiSegmenter.ts`, which wraps the `kuromoji` morphological analyzer with a fusion pass that re-merges its morpheme-level output into whole conjugated words (kuromoji alone would split e.g. `使っています` into 4 pieces), then resolves meanings from `public/jmdict.json`/`lib/data/jlpt-vocab.ts` keyed by the resolved dictionary (base) form. Chinese still uses the model's own pipe-delimited (`|`) segmentation, parsed client-side.

### Storage abstraction

`lib/storage/types.ts` defines the `DataService` interface. `lib/storage/index.ts` exports a singleton `storage` pointing at `LocalStorage` (all data lives in `localStorage`). A commented-out Firebase implementation exists in `lib/storage/firebase.ts` — swap the import in `index.ts` to enable it.

LocalStorage keys:
- `srsly-vocab-deck` — user's `DeckWord[]`
- `srsly-srs-state` — streak, todayScore, session count
- `srsly-prefs` — theme, font, hskLevel
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
