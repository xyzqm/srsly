# srsly — SvelteKit proof-of-concept

A **proof-of-concept** rewrite of srsly's core **Read → vocab** loop in SvelteKit + Svelte 5
(runes), built side-by-side with the production Next.js app (which is untouched). It exists to
evaluate Svelte for this codebase before committing to a full port — it is **Chinese-only** and
covers the essential loop, not every feature.

SRS scheduling uses the **[`ts-fsrs`](https://github.com/open-spaced-repetition/ts-fsrs)**
library rather than a hand-rolled implementation (see `src/lib/srs.ts`). All storage is
**Supabase** — there are no client stores and no `+page.server.ts`; data loading and mutations
are **SvelteKit remote functions** (`src/lib/data.remote.ts`).

## Run

```bash
cd svelte-poc
npm install
# 1. One-time: create the PoC's table — paste supabase-setup.sql into the Supabase SQL editor.
# 2. Env (.env): PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY (copied from ../.env.local),
#    and SRSLY_API_KEY for AI generation.
npm run dev        # http://localhost:5173
npm run check      # svelte-check (0 errors / 0 warnings)
```

Signed out, the whole app is replaced by a login gate (magic link / Google / **guest**). Without
an API key, "Generate passage" surfaces a "no API key" state.

## Architecture

- **Auth + storage: Supabase.** `hooks.server.ts` creates a cookie-backed server client and
  `safeGetSession`; `+layout.ts` provides the isomorphic **browser** client (`data.supabase`)
  used only by the login gate for auth. All app data lives in one row of `poc_user_data`
  (`deck` / `prefs` / `daily` jsonb).
- **Data via remote functions.** `src/lib/data.remote.ts` exports a `getData` **query** and
  `addWord` / `removeWord` / `gradeCloze` / `generatePassage` / `saveTheme` / `saveLevel` /
  `seedDemo` / `clearDeck` **commands**. Each reads the request-scoped Supabase client via
  `getRequestEvent().locals`, and mutations call `getData().refresh()` (single-flight), so the
  page's `const app = $derived(await getData())` updates reactively — no stores, no `action()` glue.
- **The `supabase`-from-layout gotcha:** remote functions run on the server and use
  `locals.supabase` (server client). The *browser* client needed for `signIn*` calls only exists
  in `+layout.ts` → so `LoginGate` gets it from `data.supabase`, never through a remote function.

## What's ported (and how it maps to the React app)

| React (Next.js)                         | Svelte (this PoC)                          |
|-----------------------------------------|--------------------------------------------|
| `app/api/daily-content/route.ts`        | `src/lib/server/generate.ts` (called by a command) |
| `hooks/useDailyContent.ts` (parse)      | `src/lib/tokens.ts` (client normalize)     |
| `hooks/useVocabDeck.ts` + storage       | `src/lib/data.remote.ts` + `src/lib/server/data.ts` |
| `lib/storage/supabase.ts`               | `src/lib/server/data.ts` (`poc_user_data`) |
| `components/read/ReadTab.tsx`           | `src/lib/components/ReadTab.svelte`        |
| `components/read/PassageText.tsx` (cloze) | `src/lib/components/ClozeBlank.svelte`    |
| `components/vocab/VocabTab.tsx`         | `src/lib/components/VocabTab.svelte`        |
| `lib/fsrs.ts` (hand-rolled FSRS-4.5)    | `src/lib/srs.ts` (thin wrapper over `ts-fsrs`) |
| `lib/auth/AuthProvider.tsx`             | `LoginGate.svelte` + `hooks.server.ts` + `+layout.*` |
| `app/page.tsx` (tab shell)              | `src/routes/+page.svelte`                   |

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

### Reading with cloze blanks

Due deck words in the generated passage render as inline **cloze blanks** (`ClozeBlank.svelte`):
you type the hanzi, typed characters colour green (correct prefix) / red (mismatch) live, and on
submit (Enter, or blur — the IME-safe path) the word reveals with ✓/✗. "Finish" grades every
answered word through ts-fsrs (`gradeCloze` command, worst grade per word: correct → Good (3),
miss → Again (1)).

## Verified working

Login gate (signed out) → **guest** sign-in → tabs. Seed/add words → `getData()` refreshes
reactively (persisted to Supabase) → generate a passage → due words appear as cloze blanks →
fill them (green ✓ / red ✗) → Finish grades through ts-fsrs. Theme + HSK level persist. All
mutations are remote commands; `svelte-check` and `npm run build` are clean.

To seed due words for testing: **Settings → Seed demo words** (five words due today).

## Deliberately out of scope for the PoC

Japanese/kuromoji, the guest AI budget/metering, the conversation / flashcards practice modes,
reading-comprehension questions, multi-passage nav, and the Stats tab. The React app remains the
source of truth for all of these.
