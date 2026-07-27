<script lang="ts">
  import type { PassageToken } from '$lib/types';
  import type { Snippet } from 'svelte';
  import ClickableWord from './ClickableWord.svelte';

  // An inline cloze blank for a due vocab word in the passage. The user types the hanzi; typed
  // characters colour green (correct prefix) / red (mismatch) in real time. On submit (Enter or
  // blur) the word is revealed and replaced with a ClickableWord, colored by `answer.correct`.
  interface Props {
    token: PassageToken;
    showHint: boolean;
    /** `advance` is true when submission came from pressing Enter (vs. blurring away, e.g. to
     *  click a word's definition popup) — the parent uses it to decide whether to move focus to
     *  the next blank. */
    onGrade: (correct: boolean, advance: boolean) => void;
    /** The parent's recorded answer for this blank, or undefined if not yet submitted. Unlike a
     *  one-shot initial value, this is read on every render — so a later `onToggle` (flipping
     *  correct/incorrect in the parent) re-renders here directly, no remount needed. */
    answer?: { correct: boolean };
    /** True once the passage has been finished (graded) — the correct/incorrect toggle is only
     *  offered before then. */
    locked: boolean;
    /** Flips this blank between correct/incorrect (e.g. to fix a typo the grader shouldn't have
     *  counted against the word). Only rendered when `answer` is set and not `locked`. */
    onToggle: () => void;
    /** Identifies this blank's `<input>` in the DOM (`data-occid`) so the parent can focus the
     *  next one after Enter-submit. */
    occId: string;
    children: Snippet;
  }
  let { token, showHint, onGrade, answer, locked, onToggle, occId, children }: Props = $props();

  let value = $state('');
  let hovered = $state(false);
  // Guards against a submit firing twice in the same tick (Enter moves focus to the next blank,
  // which blurs this one — both handlers can fire before `answer` propagates back down as a prop).
  let graded = false;

  // Green up to the first mismatch, red from there on.
  const matchLen = $derived.by(() => {
    let n = 0;
    while (n < value.length && n < token.text.length && value[n] === token.text[n]) n++;
    return n;
  });

  function submit(force = false, advance = false) {
    if (graded) return;
    if (!value.trim() && !force) return;
    graded = true;
    onGrade(value.trim() === token.text, advance);
  }
</script>

{#if answer}
  {@const color = answer.correct ? 'var(--jade)' : 'var(--accent)'}
  <span style="color:{color};" role="group"
    onmouseenter={() => (hovered = true)}
    onmouseleave={() => (hovered = false)}
  >
    {@render children()}{#if !locked}<button
        type="button"
        onclick={onToggle}
        title={answer.correct ? 'Mark as incorrect' : 'Mark as correct'}
        aria-label={answer.correct ? 'Mark as incorrect' : 'Mark as correct'}
        style="background:none; border:none; cursor:pointer; font-family:var(--f-mono);
          font-size:0.5em; line-height:1; vertical-align:super; padding:0 1px 0 3px;
          color:{hovered ? color : 'var(--ink-faint)'};"
      >{answer.correct ? '✕' : '✓'}</button>{/if}
  </span>
{:else}
  <span
    style="display:inline-block; position:relative; vertical-align:baseline;"
    role="group"
    onmouseenter={() => (hovered = true)}
    onmouseleave={() => (hovered = false)}
  >
    {#if showHint && hovered && token.meaning}
      <span style="position:absolute; bottom:calc(100% + 6px); left:50%; transform:translateX(-50%); white-space:nowrap;
        font-size:10px; font-family:var(--f-mono); color:var(--ink-soft); background:var(--card); border:1px solid var(--line);
        border-radius:5px; padding:2px 6px; pointer-events:none; z-index:10;">{token.meaning}</span>
    {/if}
    {#if value.length > 0}
      <span aria-hidden="true"
        style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; pointer-events:none;
          font-family:var(--f-han); font-size:1em; font-weight:500; padding:0 2px; z-index:1;">
        {#each [...value] as char, i (i)}<span style="color:{i < matchLen ? 'var(--jade)' : 'var(--accent)'};">{char}</span>{/each}
      </span>
    {/if}
    <input
      type="text"
      bind:value
      data-occid={occId}
      onkeydown={(e) => { if (e.key === 'Enter' && !e.isComposing) submit(true, true); }}
      onblur={() => submit()}
      aria-label={`Fill in the blank${showHint && token.meaning ? `: ${token.meaning}` : ''}`}
      style="width:{Math.max(token.text.length * 1.3, 2.5)}em; font-family:var(--f-han); font-size:1em; color:transparent;
        caret-color:var(--ink); background:transparent; border:none; border-bottom:1.5px dotted var(--accent); outline:none;
        padding:0 2px; text-align:center; vertical-align:baseline; position:relative; z-index:2;"
    />
  </span>
{/if}
