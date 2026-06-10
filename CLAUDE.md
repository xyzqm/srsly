# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # start dev server at localhost:3000
npm run build    # production build
npm run lint     # eslint
```

No test suite exists yet.

## Environment

AI-generated content requires `ANTHROPIC_API_KEY` in `.env.local`. Without it, the app falls back to static passages and the ReadTab shows a "no API key" warning.

## Architecture

**srsly** is a Chinese language SRS (spaced repetition) app built with Next.js 15 (App Router), React 19, TypeScript, and Tailwind CSS v4.

### App structure

`app/page.tsx` is a single-page client component that renders five tabs — `read`, `practice`, `dash`, `vocab`, `settings` — switching between them with local `useState`. All navigation is tab-switching; there are no Next.js routes beyond the root page.

### Token format

The core data primitive is `PassageToken` (`lib/types.ts`): `{ text, pinyin?, meaning?, type? }`. Raw content is authored as compact tuple arrays (`RawToken = [hanzi] | [hanzi, pinyin] | [hanzi, pinyin, meaning]`) and normalized at load time. A three-element tuple marks a **vocab** word; a two-element tuple is a regular word; a single-element tuple is punctuation.

### Static content

`lib/data/allPassages.ts` contains all six HSK-level passages (HSK 1–6) hardcoded as raw token arrays, questions, fill-in-the-blank items, and conversation turns. `getPassageData(hskLevel)` returns the corresponding `PassageData`. This is always used as fallback when AI content is unavailable.

### AI-generated daily content

`app/api/daily-content/route.ts` is a Next.js API route that calls `claude-3-5-haiku-20241022` with the user's due vocab words, returning a JSON blob of passage, fill items, and conversation keyed to those words. The hook `hooks/useDailyContent.ts` handles caching (localStorage keyed by `srsly-daily-{hskLevel}-{date}`), calls the API route, parses the raw JSON into typed structures, and falls back to static data if generation fails. Daily content is regenerated once per day per HSK level.

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

### Adding a new HSK passage

Add a `HSKn_RAW`, `HSKn_FREE`, `HSKn_QUESTIONS`, `HSKn_FILL` block in `lib/data/allPassages.ts`, then add a `buildPassage(...)` call to the `PASSAGES` array and a matching entry in `STATIC_CONVOS` in `lib/data/staticConvos.ts`.
