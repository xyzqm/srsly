'use client';
import { useState, useEffect, useCallback } from 'react';
import { storage } from '@/lib/storage';

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

export function useSRS() {
  const [emojiState, setEmojiState] = useState<EmojiState>({ emoji: '🤔', tip: '' });
  const [streak, setStreak] = useState(0);
  const [sessions, setSessions] = useState(0);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    storage.getSRSState().then(state => {
      let { streak: s, lastVisit, todayScore, todayScoreDate } = state;
      let daysSince = 0;

      if (lastVisit && lastVisit !== today) {
        const diff = new Date(today).getTime() - new Date(lastVisit).getTime();
        daysSince = Math.floor(diff / 86400000);
      }

      if (!lastVisit) {
        storage.saveSRSState({ ...state, lastVisit: today });
      } else if (lastVisit !== today) {
        const newStreak = daysSince === 1 ? s + 1 : 1;
        s = newStreak;
        storage.saveSRSState({ ...state, streak: newStreak, lastVisit: today });
      }

      setStreak(s);
      setSessions(state.sessions ?? 0);
      const scoreFresh = todayScoreDate === today && todayScore >= 0;
      setEmojiState(pickEmoji(s, daysSince, todayScore, scoreFresh));
    });
  }, []);

  const recordScore = useCallback(async (score: number) => {
    const today = new Date().toISOString().slice(0, 10);
    const state = await storage.getSRSState();
    const newSessions = (state.sessions ?? 0) + 1;
    const updated = { ...state, todayScore: score, todayScoreDate: today, sessions: newSessions };
    await storage.saveSRSState(updated);
    setSessions(newSessions);
    setEmojiState(pickEmoji(updated.streak, 0, score, true));
  }, []);

  return { ...emojiState, recordScore, streak, sessions };
}
