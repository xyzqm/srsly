<script lang="ts">
  import type { DeckWord } from '$lib/types';
  import { isNew } from '$lib/srs';

  // `deck` (getDeck) excludes pool words server-side (loadDeck filters `pool = false`), so pool
  // counts have to come from the separate `poolWords` (getPoolWords) query instead.
  let { deck, poolWords }: { deck: DeckWord[]; poolWords: DeckWord[] } = $props();

  // Due-date histogram bins: each entry's `maxMs` is the upper edge (ms from now) of that bin,
  // exclusive of earlier bins — since bucketIndex takes the *first* bin a word's delay satisfies,
  // these thresholds partition the timeline into ranges even though each is written cumulatively.
  const HISTOGRAM_BINS: { label: string; maxMs: number | null }[] = [
    { label: 'now', maxMs: 0 },
    { label: '1h', maxMs: 3_600_000 },
    { label: '6h', maxMs: 6 * 3_600_000 },
    { label: '1d', maxMs: 24 * 3_600_000 },
    { label: '3d', maxMs: 3 * 24 * 3_600_000 },
    { label: '7d', maxMs: 7 * 24 * 3_600_000 },
    { label: '14d', maxMs: 14 * 24 * 3_600_000 },
    { label: '30d', maxMs: 30 * 24 * 3_600_000 },
    { label: '30d+', maxMs: null },
  ];

  function bucketIndex(deltaMs: number): number {
    for (let i = 0; i < HISTOGRAM_BINS.length; i++) {
      const b = HISTOGRAM_BINS[i];
      if (b.maxMs === null || deltaMs <= b.maxMs) return i;
    }
    return HISTOGRAM_BINS.length - 1;
  }

  // `deck` is already active-only (see prop comment above), so every word here has a real due date.
  const dueCounts = $derived.by(() => {
    const now = Date.now();
    const counts = HISTOGRAM_BINS.map(() => 0);
    for (const w of deck) counts[bucketIndex(w.due.getTime() - now)]++;
    return counts;
  });
  const maxDueCount = $derived(Math.max(1, ...dueCounts));

  // Mastery segments — pool (staged, not yet released into review) / new (never graded) / reviewed
  // (1-2x) / proficient (3-5x) / mastered (6x+), the same thresholds the Next.js original used
  // on its `reviews` counter, applied here to ts-fsrs's equivalent `reps` field.
  const segments = $derived.by(() => {
    let newC = 0, reviewed = 0, proficient = 0, mastered = 0;
    for (const w of deck) {
      if (isNew(w)) newC++;
      else if (w.reps <= 2) reviewed++;
      else if (w.reps <= 5) proficient++;
      else mastered++;
    }
    return [
      { label: 'Pool · waiting', count: poolWords.length, color: 'var(--ink-faint)' },
      { label: 'New', count: newC, color: 'var(--purple)' },
      { label: 'Reviewed · 1–2×', count: reviewed, color: 'var(--gold)' },
      { label: 'Proficient · 3–5×', count: proficient, color: 'var(--jade)' },
      { label: 'Mastered · 6×+', count: mastered, color: 'var(--accent)' },
    ];
  });
  const total = $derived(deck.length + poolWords.length);
  const gradientBg = $derived.by(() => {
    if (total === 0) return 'var(--line-soft)';
    let cum = 0;
    const parts: string[] = [];
    for (const s of segments) {
      const pct = (s.count / total) * 100;
      if (pct > 0) {
        parts.push(`${s.color} ${cum.toFixed(2)}% ${(cum + pct).toFixed(2)}%`);
        cum += pct;
      }
    }
    return `conic-gradient(${parts.join(', ')})`;
  });
</script>

<div
  class="animate-rise"
  style="background:var(--card); border:1px solid var(--line); border-radius:0 12px 12px 12px; padding:32px 36px;"
>
  <div style="font-family:var(--f-mono); font-size:11px; letter-spacing:.2em; text-transform:uppercase; color:var(--ink-faint);">
    All-time · vocabulary bank
  </div>
  <div style="font-family:var(--f-display); font-size:30px; font-weight:500; letter-spacing:-.015em; margin:8px 0 4px; line-height:1.15;">
    <em style="font-style:normal; color:var(--accent);">{total}</em> word{total === 1 ? '' : 's'} in your deck.
  </div>

  {#if total === 0}
    <p style="color:var(--ink-soft); font-size:14.5px; max-width:46ch; line-height:1.55;">
      Your deck is empty. Add words from the Vocab tab to start building it.
    </p>
  {:else}
    <div style="margin-top:28px;">
      <div style="font-family:var(--f-mono); font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:var(--ink-faint); margin-bottom:16px;">
        Upcoming reviews
      </div>
      <div style="display:flex; align-items:flex-end; gap:6px; height:140px;">
        {#each HISTOGRAM_BINS as bin, i (bin.label)}
          <div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; height:100%;">
            <div style="font-family:var(--f-mono); font-size:11px; color:var(--ink-soft); margin-bottom:4px; min-height:1em;">
              {dueCounts[i] > 0 ? dueCounts[i] : ''}
            </div>
            <div
              style="width:100%; max-width:34px; border-radius:4px 4px 0 0; background:var(--accent);
                opacity:{dueCounts[i] > 0 ? 1 : 0.25};
                height:{dueCounts[i] > 0 ? Math.max((dueCounts[i] / maxDueCount) * 100, 4) : 2}%;"
            ></div>
          </div>
        {/each}
      </div>
      <div style="display:flex; gap:6px; margin-top:8px;">
        {#each HISTOGRAM_BINS as bin (bin.label)}
          <div style="flex:1; text-align:center; font-family:var(--f-mono); font-size:10px; color:var(--ink-faint); text-transform:uppercase;">
            {bin.label}
          </div>
        {/each}
      </div>
    </div>

    <div style="display:grid; gap:36px; margin-top:36px; align-items:center; grid-template-columns:200px 1fr;">
      <div style="position:relative; flex-shrink:0; width:200px; height:200px;">
        <div style="width:100%; height:100%; border-radius:50%; background:{gradientBg}; filter:drop-shadow(0 3px 14px rgba(0,0,0,.08));"></div>
        <div style="position:absolute; top:27%; right:27%; bottom:27%; left:27%; border-radius:50%; background:var(--card);"></div>
        <div style="position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; z-index:1;">
          <div style="font-family:var(--f-display); font-size:28px; font-weight:500; color:var(--ink); line-height:1;">{total}</div>
          <div style="font-family:var(--f-mono); font-size:10px; letter-spacing:.12em; color:var(--ink-faint); margin-top:4px;">WORDS</div>
        </div>
      </div>

      <div style="display:flex; flex-direction:column; gap:16px;">
        {#each segments as s (s.label)}
          <div style="display:grid; align-items:center; gap:14px; grid-template-columns:12px 1fr 80px;">
            <span style="width:11px; height:11px; border-radius:3px; flex-shrink:0; background:{s.color};"></span>
            <div>
              <div style="font-family:var(--f-display); font-size:22px; font-weight:500; line-height:1;">{s.count}</div>
              <div style="font-family:var(--f-mono); font-size:10px; letter-spacing:.12em; text-transform:uppercase; color:var(--ink-faint); margin-top:2px;">{s.label}</div>
            </div>
            <div style="height:5px; background:var(--line-soft); border-radius:4px; overflow:hidden;">
              <div style="height:100%; width:{total > 0 ? (s.count / total) * 100 : 0}%; background:{s.color}; border-radius:4px;"></div>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>
