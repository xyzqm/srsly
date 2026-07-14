<script lang="ts">
  import type { PassageToken } from '$lib/types';

  // Port of components/shared/ClickableWord.tsx — a clickable ruby word that opens a
  // definition popup. Tokens without a reading render as plain text.
  interface Props {
    token: PassageToken;
    onOpen: (e: MouseEvent, token: PassageToken) => void;
    claimKind?: 'vocab' | null;
    /** When false, hides the underline + badge that mark word boundaries. */
    showBoundaries?: boolean;
  }
  let { token, onOpen, claimKind = null, showBoundaries = true }: Props = $props();

  let hovered = $state(false);

  const borderStyle = $derived(
    !showBoundaries
      ? 'none'
      : claimKind === 'vocab'
        ? '1.5px solid var(--jade)'
        : '1px dotted color-mix(in srgb, var(--ink-faint) 55%, transparent)',
  );
  const badgeColor = $derived(claimKind === 'vocab' ? 'var(--jade)' : 'transparent');
</script>

{#if !token.reading || token.type === 'punct'}
  <span>{token.text}</span>
{:else}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <ruby
    onclick={(e) => onOpen(e, token)}
    onkeydown={(e) => { if (e.key === 'Enter') onOpen(e as unknown as MouseEvent, token); }}
    onmouseenter={() => (hovered = true)}
    onmouseleave={() => (hovered = false)}
    style="cursor:pointer; border-bottom:{borderStyle}; background:{hovered
      ? 'color-mix(in srgb, var(--accent) 12%, transparent)'
      : 'transparent'}; border-radius:3px; padding-bottom:1px; transition:background .12s;"
  >{token.text}
  <!-- <rt>{token.reading}</rt> DISABLE READINGS FOR NOW, may add back in the fuure -->
  </ruby>{#if showBoundaries}<span
    aria-hidden="true"
    style="display:inline; font-size:0.45em; vertical-align:super; line-height:0; font-family:var(--f-ui); font-weight:700; pointer-events:none; user-select:none; color:{badgeColor};"
  >+</span>{/if}
{/if}
