'use client';
import { useEffect, useRef, useState } from 'react';
import { useAchievements } from '@/hooks/useAchievements';
import { collapse, type Badge } from '@/lib/achievements';
import type { DeckWord } from '@/lib/types';
import { completionSurfaceMounted } from '@/lib/completionSurface';
import BadgeSeal from '@/components/stats/BadgeSeal';

/**
 * The two things worth interrupting a reader for, and nothing else.
 *
 * 1. **A word entered your deck.** The popup's own "+ Added to your deck" vanishes with the
 *    popup, so the confirmation disappeared at the exact moment it was earned. Saying what
 *    HAPPENS NEXT — a review tomorrow — is the point: it is the first evidence that this is a
 *    scheduler and not a bookmark list. It NAMES the word, because "Added to your deck" on a
 *    page full of words does not tell you which one landed — and tapping the wrong word is
 *    exactly the mistake the confirmation should let you catch.
 * 2. **A milestone was crossed.** `AchievementToast` already covers the two "you finished"
 *    screens, but the earliest milestones are deliberately reachable in the first session
 *    (see lib/achievements.ts), and a learner who saves five words and never finishes a
 *    passage would have met none of them.
 *
 * Floating rather than inline, because both fire mid-read and inline would reflow the passage
 * under the reader's eyes. Auto-dismissing, because neither is an action — they are receipts.
 */

const SAVE_MS = 2600;
const MILESTONE_MS = 5200;

interface Toast {
  id: string;
  kind: 'save' | 'milestone';
  title: string;
  detail: string;
  /** Milestones only — the same seal the Stats panel and the completion screen draw, so one
   *  event does not have two different looks depending on where you happened to be. */
  badge?: Badge;
}

const mono = { fontFamily: 'var(--f-mono)' } as const;

export default function ToastHost(
  { deck, loadSeq, language, deckLoaded = true }:
  { deck: DeckWord[]; loadSeq: number; language: string; deckLoaded?: boolean },
) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  /**
   * What the deck looked like at the last check, AND which deck that was.
   *
   * The language and the load counter are stored ALONGSIDE the ids rather than in refs of
   * their own, because the question is never "has the language changed since the last
   * render" — it is "do these ids describe the deck I am now holding". Those are different
   * questions and the second is the one a diff needs answered. `null` until a deck has
   * actually loaded.
   */
  const seen = useRef<{ lang: string; loadSeq: number; ids: Set<string> } | null>(null);
  const { fresh, acknowledge } = useAchievements(deck.length);

  function push(t: Toast, ms: number) {
    setToasts(prev => (prev.some(x => x.id === t.id) ? prev : [...prev, t]));
    setTimeout(() => setToasts(prev => prev.filter(x => x.id !== t.id)), ms);
  }

  /**
   * The one effect that decides whether the deck changed BECAUSE THE LEARNER DID SOMETHING.
   *
   * ── WHY ONE EFFECT AND NOT TWO ──
   * This was two: one that re-seeded on a language switch or a fresh load, and one that
   * diffed. They ran in declaration order, which is stable — and it did not matter, because
   * they had DIFFERENT DEPENDENCY ARRAYS and the two signals do not arrive on the same
   * render. `language` changes immediately; the new language's deck arrives one or more
   * renders later, since `useVocabDeck` has to read storage first. So the re-seed fired
   * against the OUTGOING language's deck, spent its guard, and by the time the incoming deck
   * landed the diff had nothing to protect it: 711 unfamiliar ids, and "Added 711 words to
   * your deck" on every single language switch.
   *
   * Worse, the guard it spent was `loadSeq === lastLoad.current` — and `loadSeq` is a
   * PER-LANGUAGE counter (see hooks/useVocabDeck.ts). Comparing Chinese's third load against
   * Spanish's third load compares two unrelated facts that happen to both be 3.
   *
   * Folding them into one effect removes the ordering entirely: the ids are compared against
   * the language and counter they were RECORDED WITH, so there is no window in which they
   * can describe a different deck than the one being diffed.
   *
   * ── AND IT IS GATED ON deckLoaded ──
   * Which is the same fix `Flashcards` already carries, for the same reason. Between the
   * language changing and its deck arriving, `deck` still holds the outgoing language's
   * words; recording those under the incoming language's name would just move the bug one
   * step later. `deckLoaded` is derived during render from which language the deck actually
   * belongs to, so it is false for exactly that window.
   */
  useEffect(() => {
    if (!deckLoaded) return;                       // the deck in hand is not this language's
    const ids = new Set(deck.map(w => w.id ?? w.h));
    const prev = seen.current;
    seen.current = { lang: language, loadSeq, ids };

    // First deck of the session: seed and announce nothing. Arriving with 500 words is not
    // 500 things you just did.
    if (prev === null) return;

    /**
     * A DIFFERENT DECK IS NOT AN ADDITION, and it wears two faces.
     *
     * Switching language replaces the deck wholesale with another language's words. Signing
     * in replaces a small local deck with a large cloud one — indistinguishable by diff from
     * adding hundreds of words at once, which is how a sign-in came to announce "Added 542
     * words" and fire a milestone crossed months earlier on another device.
     *
     * `acknowledge()` is exactly right for the milestone half and already exists: it marks
     * what is currently earned as seen WITHOUT showing anything.
     */
    if (prev.lang !== language || prev.loadSeq !== loadSeq) {
      if (fresh.length > 0) acknowledge();
      return;
    }

    const added = deck.filter(w => !prev.ids.has(w.id ?? w.h));
    if (added.length === 0) return;                // a removal, or an in-place edit

    // One word gets named; a bulk import gets counted. Naming eleven words in a corner toast
    // is a wall of text nobody reads, and the count is the useful fact there anyway.
    const title = added.length === 1
      ? `Added ${added[0].h} to your deck`
      : `Added ${added.length} words to your deck`;
    push({
      id: `save-${deck.length}-${Date.now()}`,
      kind: 'save',
      title,
      detail: added.length === 1 ? 'Scheduled for review tomorrow' : 'Scheduled for review',
    }, SAVE_MS);
  }, [deck, deckLoaded, language, loadSeq, fresh, acknowledge]);

  useEffect(() => {
    if (fresh.length === 0) return;
    /**
     * A completion screen outranks this one, and takes the acknowledgement with it.
     *
     * Returning WITHOUT calling `acknowledge` is the whole point: the milestone stays
     * unannounced so the completion screen can claim it. Acknowledging here and merely
     * skipping the toast would mark it seen and lose it for good.
     */
    if (completionSurfaceMounted()) return;
    // One toast per ladder, not per rung — crossing three thresholds at once should not
    // stack three near-identical cards in the corner. See `collapse`.
    for (const b of collapse(fresh, 'last')) {
      push({ id: `ms-${b.a.id}`, kind: 'milestone', title: b.a.name, detail: b.a.description, badge: b },
        MILESTONE_MS);
    }
    acknowledge();
  }, [fresh, acknowledge]);

  if (toasts.length === 0) return null;

  return (
    <div
      className="flex flex-col gap-2"
      style={{ position: 'fixed', right: 18, bottom: 18, zIndex: 60, maxWidth: 320, pointerEvents: 'none' }}
    >
      {toasts.map(t => (
        <div
          key={t.id}
          role="status"
          className="rounded-[11px] px-4 py-3 flex items-center gap-3"
          style={{
            background: 'var(--card)',
            border: `1px solid ${t.kind === 'milestone' ? 'var(--accent)' : 'var(--line)'}`,
            boxShadow: '0 6px 20px color-mix(in srgb, var(--ink) 12%, transparent)',
          }}
        >
          {t.badge
            ? <BadgeSeal mark={t.badge.family.mark} tier={t.badge.tier} tierCount={t.badge.tierCount} earned size={38} />
            : <span style={{ fontSize: 15, lineHeight: 1 }}>✓</span>}
          <div className="flex flex-col gap-0.5">
            {t.kind === 'milestone' && (
              <div style={{ ...mono, fontSize: 9.5, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--accent)' }}>
                Milestone
              </div>
            )}
            <div style={{ fontSize: 13.5, color: 'var(--ink)', fontWeight: 500 }}>{t.title}</div>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.45 }}>{t.detail}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
