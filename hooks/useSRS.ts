'use client';
import { useState, useEffect, useCallback } from 'react';
import { storage } from '@/lib/storage';
import type { DailyAccuracy, DeckWord, LanguageCode, SRSState } from '@/lib/types';
import { todayStr, dateInDays } from '@/lib/deck';
import { applyActivity, dueCountOn, forgivenInStreak, reconcileStreak, languageActivity, languageStreakDisplay, withLanguageStreak } from '@/lib/streak';
import { SUPPORTED_LANGUAGES } from '@/lib/languageConfig';
import { pickFace, type FaceName } from '@/lib/stateFace';

/**
 * What the header shows and what it says when asked.
 *
 * `face` NAMES A DRAWING, it is not a character. It was `emoji: string` — a literal 🤔 and
 * eleven friends — which `components/shared/Mark.tsx` had already ruled out in writing for
 * every other mark in the app: an emoji is somebody else's artwork, drawn differently on
 * every OS, arriving in full colour into a themed palette. See `lib/stateFace.ts`, which owns
 * both the state table and `pickFace` so that the one part of this with branches in it can be
 * tested without a renderer.
 */
interface FaceState { face: FaceName; tip: string }

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

/**
 * `language` enables the per-language streak. Optional because Header only wants the face,
 * and asking every caller for a language it does not use would be noise — omitted simply
 * means the global streak behaves exactly as before and `langStreak` stays 0.
 */
export function useSRS(language?: LanguageCode) {
  const [faceState, setFaceState] = useState<FaceState>({ face: 'thinking', tip: '' });
  const [streak, setStreak] = useState(0);
  const [sessions, setSessions] = useState(0);
  const [accuracy, setAccuracy] = useState<DailyAccuracy[]>([]);
  const [forgiven, setForgiven] = useState(0);
  const [langStreak, setLangStreak] = useState(0);

  useEffect(() => {
    const today = todayStr();
    const yest = yesterday();

    (async () => {
      let state = await storage.getSRSState();
      const lastVisit = state.lastVisit;
      const decks = await allDecks();
      // Read the last active day BEFORE reconciling: a broken streak clears it, and that
      // is the only record of how long the learner was actually gone.
      const priorActive = state.lastActive ?? state.todayScoreDate;

      // Settle any gap FIRST, and before the day's reviews move any due dates — that
      // ordering is what makes the retroactive check trustworthy (see lib/streak.ts).
      const settled = reconcileStreak(state, decks, today, yest);
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
      const live = lastActive === today || lastActive === yest;
      const displayStreak = live ? state.streak : 0;

      // The language's own counter, settled the same way and against its own deck only.
      if (language) {
        const langDeck = await storage.getVocabDeck(language);
        const { streak: shown, settled: langSettled } =
          languageStreakDisplay(state.byLanguage?.[language], langDeck, today, yest);
        if (langSettled) {
          state = withLanguageStreak(state, language, langSettled);
          await storage.saveSRSState(state);
        }
        setLangStreak(shown);
      }

      setStreak(displayStreak);
      setSessions(state.sessions ?? 0);
      setAccuracy(state.accuracy ?? []);
      setForgiven(forgivenInStreak(state, today));

      // How long the learner has genuinely been away. A live streak means zero, however
      // many calendar days passed: reconcileStreak only leaves it live when every missed
      // day was one FSRS asked nothing of them.
      const daysAway = live || !priorActive ? 0 : Math.floor(
        (new Date(today).getTime() - new Date(priorActive).getTime()) / 86400000
      );

      // Today is a rest day when the streak reaches yesterday and nothing is owed now.
      // Requiring "not active today" is what stops a finished session from reading as
      // rest — clearing the queue empties it just as surely as never having owed anything.
      const restToday = lastActive === yest && dueCountOn(decks, today, lastActive) === 0;

      const scoreFresh = state.todayScoreDate === today && state.todayScore >= 0;
      setFaceState(pickFace(displayStreak, daysAway, state.todayScore, scoreFresh, restToday));
    })();
    // Re-runs on a language switch so the new language's own streak is settled and shown.
  }, [language]);

  /**
   * Mark today as studied. Extends the streak, and nothing else.
   *
   * Split out from recordScore because the two questions are different: "did you study
   * today" and "how well did you do". Finishing the daily reading answers the first and
   * often not the second — a passage with no comprehension questions has no score to
   * report — and folding them together is exactly why reading used to leave the streak
   * untouched.
   *
   * ── AND `sessions` BELONGED WITH THE FIRST QUESTION ALL ALONG ──
   *
   * It was incremented only by `recordScore`, so finishing a passage that carried no
   * comprehension questions advanced the STREAK and not DAYS STUDIED: one action, two
   * counters, disagreeing about whether it happened. Reported as a discrepancy and it is
   * one — reading a text and pressing Finish is the work, and whether the generator happened
   * to attach questions to it is not a fact about the learner.
   *
   * ONE TEST FOR "today is already counted", which is the part that makes this safe. The two
   * paths asked different questions — `lastActive ?? todayScoreDate` here and
   * `todayScoreDate` there — so adding the increment naively would count twice on a day where
   * a passage was finished and cards were run. Both read `firstToday` now, captured BEFORE
   * `applyActivity` sets `lastActive`.
   */
  /**
   * Record today in the active language's streak, if there is one.
   *
   * Separate from the global bump because the two can disagree: study Spanish and the global
   * streak counts today, but Chinese has still not been touched. Returns the state rather
   * than saving, so the caller writes once.
   */
  const bumpLanguage = useCallback(async (state: SRSState, today: string, yest: string): Promise<SRSState> => {
    if (!language) return state;
    const cur = state.byLanguage?.[language];
    if (cur?.lastActive === today) return state;
    const deck = await storage.getVocabDeck(language);
    return withLanguageStreak(state, language, languageActivity(cur, deck, today, yest));
  }, [language]);

  const recordActivity = useCallback(async () => {
    const today = todayStr();
    const yest = yesterday();
    let state = await storage.getSRSState();
    if ((state.lastActive ?? state.todayScoreDate) === today) return; // already counted

    // A gap can open between mount and now (midnight, or a long-lived tab), so settle again.
    const settled = reconcileStreak(state, await allDecks(), today, yest);
    if (settled) state = settled;

    state = applyActivity(state, today, yest);
    state = await bumpLanguage(state, today, yest);
    // Getting here AT ALL means today was not counted — the guard above returned otherwise —
    // so this is the day's first study of any kind. See the docstring.
    const sessions = (state.sessions ?? 0) + 1;
    state = { ...state, sessions };
    await storage.saveSRSState(state);
    setSessions(sessions);
    setStreak(state.streak);
    setForgiven(forgivenInStreak(state, today));
    return state.streak;
  }, [bumpLanguage]);

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
    // Independently of `firstToday`: the global streak may already be counted today from
    // another language, while THIS one has not studied yet.
    state = await bumpLanguage(state, today, yest);

    /**
     * The day is counted once, by whichever of the two paths gets here first.
     *
     * This asked `todayScoreDate === today`, which is a different question from the one
     * `recordActivity` asks — so once activity also counts the day, a learner who finished a
     * passage and then ran cards would have been credited with two days studied on one day.
     * `firstToday` is the shared answer, captured above before `applyActivity` moved it.
     */
    const newSessions = firstToday ? (state.sessions ?? 0) + 1 : (state.sessions ?? 0);
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
    // A score means they just studied, so neither away nor resting — the score face wins.
    setFaceState(pickFace(updated.streak, 0, score, true, false));
  }, [bumpLanguage]);

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

  return { ...faceState, recordScore, recordActivity, recordAnswer, streak, langStreak, sessions, accuracy, forgiven };
}
