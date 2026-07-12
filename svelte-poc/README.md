# srsly — SvelteKit proof-of-concept

A **proof-of-concept** rewrite of srsly's core **Read → vocab** loop in SvelteKit + Svelte 5
(runes), built side-by-side with the production Next.js app (which is untouched). It exists to
evaluate Svelte for this codebase before committing to a full port — it is **Chinese-only** and
covers the essential loop, not every feature.

## Run

```bash
cd svelte-poc
npm install
# Provide an API key (already copied from ../.env.local if you set one there):
#   echo "SRSLY_API_KEY=sk-ant-..." > .env
npm run dev        # http://localhost:5173
npm run check      # svelte-check (0 errors / 0 warnings)
```

Without a key, `/api/daily-content` returns 503 and the Read tab shows a "no API key" state —
the same behavior as the React app.

## What's ported (and how it maps to the React app)

| React (Next.js)                         | Svelte (this PoC)                          |
|-----------------------------------------|--------------------------------------------|
| `app/api/daily-content/route.ts`        | `src/routes/api/daily-content/+server.ts`  |
| `hooks/useDailyContent.ts` (parse)      | `src/lib/tokens.ts` + `stores/daily.svelte.ts` |
| `hooks/useVocabDeck.ts`                 | `src/lib/stores/deck.svelte.ts`            |
| `hooks/useTheme.ts`                     | `src/lib/stores/theme.svelte.ts`           |
| `lib/storage/local.ts`                  | `src/lib/storage.ts`                        |
| `components/read/ReadTab.tsx`           | `src/lib/components/ReadTab.svelte`         |
| `components/vocab/VocabTab.tsx`         | `src/lib/components/VocabTab.svelte`        |
| `components/shared/ClickableWord.tsx`   | `src/lib/components/ClickableWord.svelte`   |
| `components/read/WordPopup.tsx`         | `src/lib/components/WordPopup.svelte`       |
| `app/page.tsx` (tab shell)              | `src/routes/+page.svelte`                   |
| `app/globals.css` (theme tokens)        | `src/app.css`                               |

Copied **verbatim** (framework-agnostic): `types.ts`, `deck.ts`, `fsrs.ts`, `languageConfig.ts`,
`readings.ts`, `data/dict.ts`, `data/hsk-vocab.ts`, and `static/cedict.json` (CC-CEDICT).

## Verified working

AI passage generation → CC-CEDICT pinyin/meaning resolution → clickable word lookup popup →
add-to-vocab → deck persists to `localStorage` (same keys as the React app) → deck scheduling
state (FSRS) reactively re-marks passage words as **due** (accent underline) or **new** (jade
badge) → survives reload. Six themes and HSK level persist too.

## Deliberately out of scope for the PoC

Japanese/kuromoji, Supabase auth + guest AI budget, fill-in-blank / conversation / flashcards
practice modes, reading-comprehension questions, cloze grading, multi-passage nav, and the
Stats tab. The React app remains the source of truth for all of these.
