# srsly — SvelteKit proof-of-concept

A **proof-of-concept** rewrite of srsly's core **Read → vocab** loop in SvelteKit + Svelte 5
(runes), built side-by-side with the production Next.js app (which is untouched). It exists to
evaluate Svelte for this codebase before committing to a full port — it is **Chinese-only** and
covers the essential loop, not every feature.

SRS scheduling uses the **[`ts-fsrs`](https://github.com/open-spaced-repetition/ts-fsrs)**
library rather than a hand-rolled implementation (see `src/lib/srs.ts`).

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
| `lib/fsrs.ts` (hand-rolled FSRS-4.5)    | `src/lib/srs.ts` (thin wrapper over `ts-fsrs`) |
| `app/page.tsx` (tab shell)              | `src/routes/+page.svelte`                   |
| `app/globals.css` (theme tokens)        | `src/app.css`                               |

Copied **verbatim** (framework-agnostic): `types.ts`, `deck.ts`, `languageConfig.ts`,
`readings.ts`, `data/dict.ts`, `data/hsk-vocab.ts`, and `static/cedict.json` (CC-CEDICT).

### SRS: `ts-fsrs`, with `DeckWord extends Card`

Rather than converting between two shapes, **`DeckWord` extends ts-fsrs's `Card`** (see
`types.ts`), so a deck word *is* a valid `Card`. Scheduling has no field mapping — grading is
just:

```ts
export function gradeWord(word, grade, settings) {
  const { card } = fsrs(params).next(word, new Date(), grade); // word IS a Card
  return { ...word, ...card };                                  // merge scheduling back
}
```

`Card` supplies `due` (Date), `stability`, `difficulty`, `reps`, `lapses`, `state`,
`learning_steps`, `last_review` — replacing the old `dueAt`/`dueAtMs`/`phase`/`learningStep`/
`reviews`/`lastReview` fields (sub-day intervals are now just a `due` Date, so `dueAtMs` is
gone). Grades 1–4 map 1:1 to ts-fsrs `Rating`; learning steps are `['1m','10m']` with fuzz on.

The one wrinkle from extending `Card`: its `due`/`last_review` are `Date` objects, which JSON
can't preserve, so `reviveCard()` in `srs.ts` turns them back into Dates on load (and migrates
any older on-disk shape). App-side "is this due?" lives in `isDueToday()` (`deck.ts`), comparing
`due`'s local calendar day; "never reviewed?" is `isNew()` (`state === State.New`).

Verified: legacy decks migrate on load; a new card graded Good → `Learning` (sub-day `due`), a
second Good → graduates to `Review` (`due` 2 days out) — identical scheduling to before, zero
conversion code.

## Verified working

AI passage generation → CC-CEDICT pinyin/meaning resolution → clickable word lookup popup →
add-to-vocab → deck persists to `localStorage` (same keys as the React app) → deck scheduling
state (ts-fsrs) reactively re-marks passage words as **due** (accent underline) or **new** (jade
badge) → survives reload. Six themes and HSK level persist too.

## Debugging: simulating due words

In dev, `window.__srsly` is exposed (see `src/lib/dev/seed.ts`) as a console helper:

| Call | What it does |
|---|---|
| `__srsly.seedDue(n)` | Add `n` demo words all due **today** (pulled into the next passage). |
| `__srsly.seedMixed()` | Add words across every state: overdue, due-today, not-yet-due, reviewed. |
| `__srsly.grade(hanzi, 1‒4)` | Grade a word through ts-fsrs and persist (1=Again…4=Easy). |
| `__srsly.regen()` | Regenerate today's passage around the current due words. |
| `__srsly.dump()` | `console.table` the deck's scheduling state. |
| `__srsly.clear()` | Empty the deck. |

Typical loop: `await __srsly.seedMixed(); await __srsly.regen();`. Under the hood a word is
"due" whenever `dueAt` is absent or `≤ today` (`isDueToday` in `lib/deck.ts`); the deck lives in
`localStorage` under `srsly-vocab-deck-zh`, so you can also hand-edit `dueAt` there directly.

## Deliberately out of scope for the PoC

Japanese/kuromoji, Supabase auth + guest AI budget, the fill / conversation / flashcards
practice modes, reading-comprehension questions, in-passage cloze grading, multi-passage nav,
and the Stats tab. The React app remains the source of truth for all of these.
