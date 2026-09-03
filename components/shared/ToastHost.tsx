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

export default function ToastHost({ deck, loadSeq }: { deck: DeckWord[]; loadSeq: number }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  /** Ids present at the last check. `null` until the first deck has loaded. */
  const seenIds = useRef<Set<string> | null>(null);
  const { fresh, acknowledge } = useAchievements(deck.length);

  function push(t: Toast, ms: number) {
    setToasts(prev => (prev.some(x => x.id === t.id) ? prev : [...prev, t]));
    setTimeout(() => setToasts(prev => prev.filter(x => x.id !== t.id)), ms);
  }

  /**
   * A deck that arrived from STORAGE is absorbed silently — it is not something the learner
   * just did.
   *
   * `loadSeq` counts loads and not edits (see hooks/useVocabDeck.ts). Signing in swaps a small
   * local deck for a large cloud one, and by diff alone that is identical to adding hundreds
   * of words at once: it announced "Added 542 words to your deck" and fired a Collector 1000
   * milestone crossed months earlier on another device. Re-seeding here is what makes a
   * sync silent while leaving a real save loud.
   *
   * `acknowledge()` is exactly the right primitive for the milestone half, and it already
   * exists: it marks what is currently earned as seen WITHOUT showing anything.
   */
  const lastLoad = useRef(loadSeq);
  useEffect(() => {
    if (loadSeq === lastLoad.current) return;
    lastLoad.current = loadSeq;
    seenIds.current = new Set(deck.map(w => w.id ?? w.h));
    if (fresh.length > 0) acknowledge();
  }, [loadSeq, deck, fresh, acknowledge]);

  /**
   * A word was saved. Seeded on the first pass rather than compared against zero, so arriving
   * with an existing deck does not announce words saved in some previous session.
   */
  useEffect(() => {
    const ids = new Set(deck.map(w => w.id ?? w.h));
    const prev = seenIds.current;
    seenIds.current = ids;
    if (prev === null) return;                       // first load: seed, announce nothing
    const added = deck.filter(w => !prev.has(w.id ?? w.h));
    if (added.length === 0) return;                  // a removal, or an in-place edit

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
  }, [deck]);

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
