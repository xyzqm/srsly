import { State } from 'ts-fsrs';
import type { DeckWord } from '../types';
import { getDeckStore } from '../stores/deck.svelte';
import { getDailyStore } from '../stores/daily.svelte';
import { dayOffset, localDateStr } from '../deck';

// Dev-only helpers for debugging the due-word flow. Installed on `window.__srsly` in dev
// (see +page.svelte). Not bundled behavior the app depends on — purely a debugging console.

// A small demo set with known readings so seeding doesn't depend on the dictionary loading.
const DEMO: Array<{ h: string; p: string; m: string }> = [
  { h: '经济', p: 'jīngjì', m: 'economy' },
  { h: '城市', p: 'chéngshì', m: 'city' },
  { h: '科技', p: 'kējì', m: 'technology; science and technology' },
  { h: '环境', p: 'huánjìng', m: 'environment' },
  { h: '健康', p: 'jiànkāng', m: 'health; healthy' },
  { h: '旅游', p: 'lǚyóu', m: 'to travel; tourism' },
];

export interface DevTools {
  /** Add `n` demo words, all due TODAY (so they're pulled into the next generated passage). */
  seedDue(n?: number): Promise<DeckWord[]>;
  /** Add demo words spanning every state: overdue, due today, new (not-yet-due), and reviewed. */
  seedMixed(): Promise<DeckWord[]>;
  /** Grade a word by hanzi (1=Again…4=Easy) through ts-fsrs and persist. */
  grade(hanzi: string, rating: 1 | 2 | 3 | 4): Promise<void>;
  /** Print the deck's scheduling state as a table. */
  dump(): DeckWord[];
  /** Empty the deck. */
  clear(): Promise<void>;
  /** Regenerate today's passage around the current due words. */
  regen(): Promise<void>;
}

export function installDevTools(getLevel: () => number): void {
  if (typeof window === 'undefined') return;
  const deck = getDeckStore();
  const daily = getDailyStore();

  const tools: DevTools = {
    async seedDue(n = DEMO.length) {
      // newCard defaults due=now, so these land due today.
      for (const w of DEMO.slice(0, n)) await deck.addWord({ ...w });
      return deck.deck;
    },
    async seedMixed() {
      // One word in each state so every passage/vocab indicator is exercised at once.
      // These are Card overrides on top of a fresh ts-fsrs card (see deck.addWord/newCard).
      await deck.addWord({ ...DEMO[0], due: dayOffset(-2) });                 // overdue
      await deck.addWord({ ...DEMO[1], due: dayOffset(0) });                  // due today
      await deck.addWord({ ...DEMO[2], due: dayOffset(0) });                  // due today
      await deck.addWord({ ...DEMO[3], due: dayOffset(1) });                  // new, not yet due (pending)
      await deck.addWord({ ...DEMO[4], due: dayOffset(9), state: State.Review, reps: 2, stability: 12, difficulty: 5, last_review: dayOffset(-3) }); // reviewed
      return deck.deck;
    },
    async grade(hanzi, rating) {
      await deck.updateWordReview(hanzi, rating);
    },
    dump() {
      const rows = deck.deck.map((w) => ({
        h: w.h, due: localDateStr(w.due), state: State[w.state], reps: w.reps,
        stability: w.stability?.toFixed?.(2), difficulty: w.difficulty?.toFixed?.(2),
        lapses: w.lapses, learning_steps: w.learning_steps,
      }));
      // eslint-disable-next-line no-console
      console.table(rows);
      return deck.deck;
    },
    async clear() {
      await deck.clear();
    },
    async regen() {
      await daily.generate(getLevel(), deck.deck, 'zh', Math.floor(Math.random() * 12));
    },
  };

  (window as unknown as { __srsly: DevTools }).__srsly = tools;
  // eslint-disable-next-line no-console
  console.info('[srsly dev] window.__srsly ready — try __srsly.seedMixed().then(__srsly.regen)');
}
