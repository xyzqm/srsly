<script lang="ts">
  import { fade, scale } from 'svelte/transition';

  // Shared confirm/cancel modal — backdrop fades, card scales+fades in, both animate back out on
  // dismiss (Svelte plays `transition:` directives automatically on mount/unmount inside the
  // {#if} block that renders this).
  interface Props {
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => void;
    /** Omit for a single-button informational dialog (no Cancel — the backdrop and the confirm
     *  button both just dismiss it). */
    onCancel?: () => void;
  }
  let { title, message, confirmLabel, onConfirm, onCancel }: Props = $props();
  const dismiss = () => (onCancel ?? onConfirm)();
</script>

<div
  role="presentation"
  onclick={dismiss}
  transition:fade={{ duration: 150 }}
  style="position:fixed; inset:0; z-index:9998; display:flex; align-items:center; justify-content:center;
    background:rgba(0,0,0,.35); padding:24px;"
>
  <div
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    onclick={(e) => e.stopPropagation()}
    onkeydown={() => {}}
    transition:scale={{ duration: 150, start: 0.96 }}
    style="width:100%; max-width:360px; background:var(--card); border:1px solid var(--line); border-radius:14px;
      padding:24px 26px; box-shadow:0 8px 32px rgba(0,0,0,.22), 0 2px 8px rgba(0,0,0,.14);"
  >
    <div style="font-family:var(--f-display); font-size:18px; font-weight:500;">{title}</div>
    <p style="color:var(--ink-soft); font-size:13.5px; line-height:1.6; margin:10px 0 22px;">{message}</p>
    <div style="display:flex; gap:10px; justify-content:flex-end;">
      {#if onCancel}
        <button onclick={onCancel}
          style="font-family:var(--f-mono); font-size:12px; letter-spacing:.06em; text-transform:uppercase;
            background:none; color:var(--ink-soft); border:1px solid var(--line); border-radius:8px; padding:9px 16px; cursor:pointer;">
          Cancel
        </button>
      {/if}
      <button onclick={onConfirm}
        style="font-family:var(--f-mono); font-size:12px; letter-spacing:.06em; text-transform:uppercase; font-weight:500;
          background:var(--accent); color:#fff; border:none; border-radius:8px; padding:9px 16px; cursor:pointer;
          box-shadow:0 2px 0 var(--accent-deep);">
        {confirmLabel}
      </button>
    </div>
  </div>
</div>
