#!/usr/bin/env -S npx tsx
// Interactive simulator for `gradeWord` (src/lib/srs.ts) — imports it directly, so this stays
// correct automatically as that function's scheduling logic changes. Not part of the build —
// a dev tool, run via tsx.
//
// Usage:
//   npm run simulate-grading                       interactive prompt loop
//   npm run simulate-grading -- good good again     non-interactive: replay a sequence and exit
//
// Each step advances simulated "now" to the card's current due date, then grades it there —
// i.e. it models always reviewing exactly on schedule, not reviewing early/late.

import { createInterface } from 'node:readline/promises';
import { State } from 'ts-fsrs';
import { newCard, gradeWord, DEFAULT_SRS_SETTINGS, type FsrsGrade } from '../src/lib/srs.ts';
import type { DeckWord } from '../src/lib/types.ts';

const GRADE_ALIASES: Record<string, FsrsGrade> = {
  '1': 1, again: 1, a: 1,
  '2': 2, hard: 2, h: 2,
  '3': 3, good: 3, g: 3,
  '4': 4, easy: 4, e: 4,
};
const GRADE_NAME: Record<FsrsGrade, string> = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' };
const STATE_NAME: Record<number, string> = {
  [State.New]: 'New',
  [State.Learning]: 'Learning',
  [State.Review]: 'Review',
  [State.Relearning]: 'Relearning',
};

function parseGrade(tok: string): FsrsGrade | null {
  return GRADE_ALIASES[tok.toLowerCase()] ?? null;
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function printRow(i: number, reviewedAt: Date, grade: FsrsGrade, card: DeckWord) {
  const intervalDays = daysBetween(reviewedAt, card.due);
  console.log(
    `#${String(i).padStart(2)}  reviewed ${fmtDate(reviewedAt)}  ` +
    `grade=${GRADE_NAME[grade].padEnd(5)} -> next due ${fmtDate(card.due)} (+${intervalDays}d)  ` +
    `state=${STATE_NAME[card.state].padEnd(10)} stability=${card.stability.toFixed(2)} ` +
    `difficulty=${card.difficulty.toFixed(2)} reps=${card.reps} lapses=${card.lapses}`,
  );
}

// gradeWord always reviews at real-world `new Date()`; to simulate reviewing exactly on the
// card's due date (rather than whatever the wall clock says), fake time forward for the call.
async function gradeAt(card: DeckWord, grade: FsrsGrade, when: Date): Promise<DeckWord> {
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...args: unknown[]) {
      // @ts-expect-error - forwarding varargs to the real Date constructor
      super(...(args.length ? args : [when]));
    }
    static override now() {
      return when.getTime();
    }
  }
  // @ts-expect-error - swapping the global Date for the duration of the call
  globalThis.Date = FakeDate;
  try {
    return gradeWord(card, grade, DEFAULT_SRS_SETTINGS);
  } finally {
    globalThis.Date = RealDate;
  }
}

async function run() {
  let card: DeckWord = { id: 'sim', ...newCard({ h: '', p: '', m: '' }) };
  const startedAt = new Date(card.due); // == now, since a fresh card is due immediately

  console.log(
    `Simulating gradeWord with desiredRetention=${DEFAULT_SRS_SETTINGS.desiredRetention}, ` +
    `maxIntervalDays=${DEFAULT_SRS_SETTINGS.maxIntervalDays}`,
  );
  console.log(`New card created ${fmtDate(startedAt)} — state=New, due immediately.\n`);

  const cliGrades = process.argv.slice(2).map(parseGrade);
  const nonInteractive = cliGrades.length > 0 && cliGrades.every((g) => g !== null);

  let i = 0;
  if (nonInteractive) {
    for (const grade of cliGrades as FsrsGrade[]) {
      i += 1;
      const prevDue = new Date(card.due);
      card = await gradeAt(card, grade, prevDue);
      printRow(i, prevDue, grade, card);
    }
    return;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  // Iterate the interface's async line queue (rather than repeated rl.question() calls) so
  // piped/non-TTY input isn't dropped: Node's readline.promises .question() only listens for
  // the *next* 'line' event, so lines that arrive in the same buffered chunk before it's called
  // again are silently lost. The async iterator queues every line instead.
  const lines = rl[Symbol.asyncIterator]();
  console.log('Enter grades one at a time (again/hard/good/easy, or 1-4). Type "q" to quit.\n');
  try {
    for (;;) {
      const prevDue = new Date(card.due);
      const waitedDays = daysBetween(startedAt, prevDue);
      const prompt =
        `[state=${STATE_NAME[card.state]} due=${fmtDate(prevDue)} (day ${waitedDays}) ` +
        `stability=${card.stability.toFixed(2)} difficulty=${card.difficulty.toFixed(2)}] grade> `;
      process.stdout.write(prompt);
      const { value, done } = await lines.next();
      if (done) break;
      const answer = value.trim();
      if (!answer) continue;
      if (['q', 'quit', 'exit'].includes(answer.toLowerCase())) break;

      const grade = parseGrade(answer);
      if (grade === null) {
        console.log(`  ! unrecognized grade "${answer}" — use again/hard/good/easy or 1-4\n`);
        continue;
      }

      i += 1;
      card = await gradeAt(card, grade, prevDue);
      printRow(i, prevDue, grade, card);
    }
  } finally {
    rl.close();
  }

  console.log(`\nDone — ${i} review(s) simulated.`);
}

run();
