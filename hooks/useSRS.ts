'use client';
import { useState, useEffect, useCallback } from 'react';
import { storage } from '@/lib/storage';
import type { DailyAccuracy, DeckWord, LanguageCode } from '@/lib/types';
import { todayStr, dateInDays } from '@/lib/deck';
import { applyActivity, forgivenInStreak, reconcileStreak } from '@/lib/streak';
import { SUPPORTED_LANGUAGES } from '@/lib/languageConfig';

interface EmojiState { emoji: string; tip: string }

function pickEmoji(streak: number, daysSince: number, todayScore: number, scoreFresh: boolean): EmojiState {
  if (daysSince >= 14) return { emoji: '🥶', tip: 'Been a while... welcome back!' };
  if (daysSince >= 4)  return { emoji: '🫥', tip: "Getting rusty — let's shake it off!" };
  if (daysSince >= 2)  return { emoji: '😶‍🌫️', tip: 'A couple days off — ease back in' };
  if (scoreFresh) {
    if (todayScore >= 90) return { emoji: '🤓', tip: 'Top marks today!' };
    if (todayScore >= 75) return { emoji: '😎', tip: 'Strong session!' };
    if (todayScore >= 55) return { emoji: '🙃', tip: 'Getting there — keep pushing!' };
    return { emoji: '😅', tip: "Tough one — tomorrow's another shot" };
  }
  if (streak >= 100) return { emoji: '🎉', tip: `${streak}-day streak — absolutely legendary!` };
  if (streak >= 30)  return { emoji: '😍', tip: `${streak}-day streak — you're on a roll!` };
  if (streak >= 7)   return { emoji: '🔥', tip: `${streak}-day streak — keep the fire going!` };
  return { emoji: '🤔', tip: 'New day — what are we learning?' };
}

function yesterday(): string {
  return dateInDays(-1);
}

/**
 * Every deck the learner has, across languages.
 *
 * The streak is one global number but decks are per-language, so a rest day has to mean
 * "nothing owed anywhere". Judging it against the active language alone would forgive a
 * gap while another language's reviews piled up.
 */
async function allDecks(): Promise<DeckWord[]> {
  const decks = await Promise.all(
    SUPPORTED_LANGUAGES.map(c => storage.getVocabDeck(c.code as LanguageCode)),
  );
  return decks.flat();
}

/** Days of cloze history kept. Long enough for a 7-day rolling figure to survive a gap. */
const ACCURACY_WINDOW = 30;

/** Right/total over the last `days` calendar days, and the percentage (null if untested). */
export function rollingAccuracy(history: DailyAccuracy[] | undefined, days: number) {
  const cutoff = dateInDays(-(days - 1));
  const recent = (history ?? []).filter(e => e.d >= cutoff);
  const right = recent.reduce((n, e) => n + e.right, 0);
  const total = recent.reduce((n, e) => n + e.total, 0);
  return { right, total, pct: total ? Math.round((right / total) * 100) : null, days: recent.length };
}

export function useSRS() {
  const [emojiState, setEmojiState] = useState<EmojiState>({ emoji: '🤔', tip: '' });
  const [streak, setStreak] = useState(0);
  const [sessions, setSessions] = useState(0);
  const [accuracy, setAccuracy] = useState<DailyAccuracy[]>([]);
  const [forgiven, setForgiven] = useState(0);

  useEffect(() => {
    const today = todayStr();
    const yest = yesterday();

    (async () => {
      let state = await storage.getSRSState();
      const lastVisit = state.lastVisit;

      // Settle any gap FIRST, and before the day's reviews move any due dates — that
      // ordering is what makes the retroactive check trustworthy (see lib/streak.ts).
      const settled = reconcileStreak(state, await allDecks(), today, yest);
      if (settled) state = settled;

      // Guard against a corrupted runaway counter (caused by a past render-loop bug)
      const rawSessions = state.sessions ?? 0;
      if (rawSessions > 9999) state = { ...state, sessions: 0 };

      // lastVisit is "opened the app", which the streak deliberately no longer keys off.
      if (lastVisit !== today) state = { ...state, lastVisit: today };
      await storage.saveSRSState(state);

      const lastActive = state.lastActive ?? state.todayScoreDate;
      // A streak is live only while it reaches today or yesterday — after reconcile,
      // forgiven rest days have already been folded into lastActive.
      const displayStreak = lastActive === today || lastActive === yest ? state.streak : 0;

      setStreak(displayStreak);
      setSessions(state.sessions ?? 0);
      setAccuracy(state.accuracy ?? []);
      setForgiven(forgivenInStreak(state, today));

      // daysSince last visit (for emoji)
      let daysSince = 0;
      if (lastVisit && lastVisit !== today) {
        daysSince = Math.floor(
          (new Date(today).getTime() - new Date(lastVisit).getTime()) / 86400000
        );
      }

      const scoreFresh = state.todayScoreDate === today && state.todayScore >= 0;
      setEmojiState(pickEmoji(displayStreak, daysSince, state.todayScore, scoreFresh));
    })();
  }, []);

  /**
   * Mark today as studied. Extends the streak, and nothing else.
   *
   * Split out from recordScore because the two questions are different: "did you study
   * today" and "how well did you do". Finishing the daily reading answers the first and
   * often not the second — a passage with no comprehension questions has no score to
   * report — and folding them together is exactly why reading used to leave the streak
   * untouched.
   */
  const recordActivity = useCallback(async () => {
    const today = todayStr();
    const yest = yesterday();
    let state = await storage.getSRSState();
    if ((state.lastActive ?? state.todayScoreDate) === today) return; // already counted

    // A gap can open between mount and now (midnight, or a long-lived tab), so settle again.
    const settled = reconcileStreak(state, await allDecks(), today, yest);
    if (settled) state = settled;

    state = applyActivity(state, today, yest);
    await storage.saveSRSState(state);
    setStreak(state.streak);
    setForgiven(forgivenInStreak(state, today));
    return state.streak;
  }, []);

  const recordScore = useCallback(async (score: number) => {
    const today = todayStr();
    const yest = yesterday();
    let state = await storage.getSRSState();

    const firstToday = (state.lastActive ?? state.todayScoreDate) !== today;
    if (firstToday) {
      const settled = reconcileStreak(state, await allDecks(), today, yest);
      if (settled) state = settled;
      state = applyActivity(state, today, yest);
    }

    // Only count a new session if this is the first score recorded today
    const newSessions = state.todayScoreDate === today
      ? (state.sessions ?? 0)
      : (state.sessions ?? 0) + 1;
    const updated = {
      ...state,
      todayScore: score,
      todayScoreDate: today,
      sessions: newSessions,
    };
    await storage.saveSRSState(updated);
    setSessions(newSessions);
    setStreak(updated.streak);
    setForgiven(forgivenInStreak(updated, today));
    setEmojiState(pickEmoji(updated.streak, 0, score, true));
  }, []);

  /**
   * Log one passage-cloze answer. Called per blank rather than per session so a passage
   * abandoned half-way still counts what was actually attempted.
   */
  const recordAnswer = useCallback(async (correct: boolean) => {
    const today = todayStr();
    const state = await storage.getSRSState();
    const hist = [...(state.accuracy ?? [])];
    const i = hist.findIndex(e => e.d === today);
    if (i >= 0) hist[i] = { ...hist[i], right: hist[i].right + (correct ? 1 : 0), total: hist[i].total + 1 };
    else hist.push({ d: today, right: correct ? 1 : 0, total: 1 });
    const trimmed = hist.slice(-ACCURACY_WINDOW);
    await storage.saveSRSState({ ...state, accuracy: trimmed });
    setAccuracy(trimmed);
  }, []);

  return { ...emojiState, recordScore, recordActivity, recordAnswer, streak, sessions, accuracy, forgiven };
}
