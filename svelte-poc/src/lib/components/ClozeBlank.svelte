<script lang="ts">
  import type { PassageToken } from '$lib/types';
    import type { Snippet } from 'svelte';
    import { untrack } from 'svelte';
    import ClickableWord from './ClickableWord.svelte';

  // An inline cloze blank for a due vocab word in the passage. The user types the hanzi; typed
  // characters colour green (correct prefix) / red (mismatch) in real time. On submit (Enter or
  // blur) the word is revealed, graded, and replaced with a ClickableWord.
  interface Props {
    token: PassageToken;
    showHint: boolean;
    onGrade: (correct: boolean) => void;
    /** Pre-fills an already-answered blank (restored from persisted progress) directly into the
     *  submitted/revealed state, instead of an empty input. */
    initialGrade?: { correct: boolean };
    children: Snippet;
  }
  let { token, showHint, onGrade, initialGrade, children }: Props = $props();

  // `initialGrade` only ever matters at creation — the parent forces a remount (via `{#key}`)
  // whenever restored/fresh status changes, so there's no later value to react to; `untrack`
  // makes that one-shot read explicit instead of an unintentional stale-capture warning.
  let value = $state('');
  let submitted = $state(untrack(() => !!initialGrade));
  let correct = $state(untrack(() => initialGrade?.correct ?? false));
  let hovered = $state(false);
  let graded = untrack(() => !!initialGrade);

  // Green up to the first mismatch, red from there on.
  const matchLen = $derived.by(() => {
    let n = 0;
    while (n < value.length && n < token.text.length && value[n] === token.text[n]) n++;
    return n;
  });

  function submit(force = false) {
    if (graded) return;
    if (!value.trim() && !force) return;
    graded = true;
    correct = value.trim() === token.text;
    submitted = true;
    onGrade(correct);
  }
</script>

{#if submitted}
  {@const color = correct ? 'var(--jade)' : 'var(--accent)'}
  <span style="color:{color}">
    {@render children()}
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
      onkeydown={(e) => { if (e.key === 'Enter' && !e.isComposing) submit(true); }}
      onblur={() => submit()}
      aria-label={`Fill in the blank${showHint && token.meaning ? `: ${token.meaning}` : ''}`}
      style="width:{Math.max(token.text.length * 1.3, 2.5)}em; font-family:var(--f-han); font-size:1em; color:transparent;
        caret-color:var(--ink); background:transparent; border:none; border-bottom:1.5px dotted var(--accent); outline:none;
        padding:0 2px; text-align:center; vertical-align:baseline; position:relative; z-index:2;"
    />
  </span>
{/if}
