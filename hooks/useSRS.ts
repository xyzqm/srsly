'use client';
import { useState, useEffect, useCallback } from 'react';
import { storage } from '@/lib/storage';
import type { DailyAccuracy } from '@/lib/types';
import { todayStr, dateInDays } from '@/lib/deck';

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

  useEffect(() => {
    const today = todayStr();
    const yest = yesterday();

    storage.getSRSState().then(state => {
      const { streak: s, lastVisit, todayScore, todayScoreDate } = state;

      // Update lastVisit without touching streak (streak only changes on recordScore)
      if (!lastVisit || lastVisit !== today) {
        storage.saveSRSState({ ...state, lastVisit: today });
      }

      // Displayed streak: valid only if user completed reading today or yesterday
      // If they skipped days (last score > 1 day ago), show 0
      const displayStreak =
        todayScoreDate === today || todayScoreDate === yest ? s : 0;

      // Guard against a corrupted runaway counter (caused by a past render-loop bug)
      const rawSessions = state.sessions ?? 0;
      const safeSessions = rawSessions > 9999 ? 0 : rawSessions;
      if (rawSessions !== safeSessions) {
        storage.saveSRSState({ ...state, sessions: safeSessions });
      }

      setStreak(displayStreak);
      setSessions(safeSessions);
      setAccuracy(state.accuracy ?? []);

      // daysSince last visit (for emoji)
      let daysSince = 0;
      if (lastVisit && lastVisit !== today) {
        daysSince = Math.floor(
          (new Date(today).getTime() - new Date(lastVisit).getTime()) / 86400000
        );
      }

      const scoreFresh = todayScoreDate === today && todayScore >= 0;
      setEmojiState(pickEmoji(displayStreak, daysSince, todayScore, scoreFresh));
    });
  }, []);

  const recordScore = useCallback(async (score: number) => {
    const today = todayStr();
    const yest = yesterday();
    const state = await storage.getSRSState();

    let newStreak: number;
    if (state.todayScoreDate === today) {
      // Already recorded a score today — don't increment again
      newStreak = state.streak;
    } else if (state.todayScoreDate === yest) {
      // Did reading yesterday and again today → extend streak
      newStreak = state.streak + 1;
    } else {
      // Missed one or more days, or first time ever → reset to 1
      newStreak = 1;
    }

    // Only count a new session if this is the first score recorded today
    const newSessions = state.todayScoreDate === today
      ? (state.sessions ?? 0)
      : (state.sessions ?? 0) + 1;
    const updated = {
      ...state,
      streak: newStreak,
      todayScore: score,
      todayScoreDate: today,
      sessions: newSessions,
    };
    await storage.saveSRSState(updated);
    setSessions(newSessions);
    setStreak(newStreak);
    setEmojiState(pickEmoji(newStreak, 0, score, true));
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

  return { ...emojiState, recordScore, recordAnswer, streak, sessions, accuracy };
}
