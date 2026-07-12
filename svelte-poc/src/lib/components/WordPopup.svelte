<script lang="ts">
  // Port of components/read/WordPopup.tsx — a dark definition card anchored to the clicked
  // word. Trimmed for the PoC: hanzi + pinyin + meaning, plus an Add-to-vocab action for
  // new words and a "revealed" note for due SRS words.
  export interface PopupData {
    word: string;
    pinyin: string;
    meaning: string;
    type: 'vocab' | 'free' | 'lookup';
    anchorRect: DOMRect;
  }

  interface Props {
    data: PopupData | null;
    onClose: () => void;
    onAddVocab: (word: string, pinyin: string, meaning: string) => void;
  }
  let { data, onClose, onAddVocab }: Props = $props();

  let el = $state<HTMLDivElement | null>(null);
  let top = $state(0);
  let left = $state(0);
  let below = $state(false);
  let ready = $state(false);

  function fmtMeaning(m: string): string {
    return m.replace(/\s*·\s*/g, '; ');
  }

  $effect(() => {
    if (!data || !el) { ready = false; return; }
    const pw = 254;
    const r = data.anchorRect;
    let l = r.left + r.width / 2 - pw / 2;
    l = Math.max(10, Math.min(l, window.innerWidth - pw - 10));
    left = l;
    // Measure after paint to decide above/below.
    requestAnimationFrame(() => {
      if (!el) return;
      const ph = el.offsetHeight;
      const topAbove = r.top - ph - 12;
      const topBelow = r.bottom + 10;
      const isBelow = topAbove < 8;
      below = isBelow;
      top = isBelow ? topBelow : topAbove;
      ready = true;
    });
  });

  $effect(() => {
    if (!data) return;
    const onDown = (e: MouseEvent) => {
      if (el && !el.contains(e.target as Node)) onClose();
    };
    const onScroll = () => onClose();
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onScroll, { capture: true } as EventListenerOptions);
    };
  });
</script>

{#if data}
  <div
    bind:this={el}
    role="dialog"
    tabindex="-1"
    onclick={(e) => e.stopPropagation()}
    onkeydown={() => {}}
    style="position:fixed; width:254px; padding:14px 16px; border-radius:12px; z-index:9999;
      left:{left}px; top:{top}px;
      background:var(--pop-bg); color:var(--pop-fg); font-family:var(--f-ui);
      box-shadow:0 8px 32px rgba(0,0,0,.22), 0 2px 8px rgba(0,0,0,.14);
      opacity:{ready ? 1 : 0}; pointer-events:{ready ? 'auto' : 'none'}; transition:opacity .15s ease;"
  >
    <button
      onclick={onClose}
      aria-label="Close"
      style="position:absolute; top:8px; right:8px; width:20px; height:20px; display:flex;
        align-items:center; justify-content:center; border-radius:9999px;
        background:rgba(255,255,255,.13); border:none; color:var(--pop-fg); font-size:14px;
        line-height:1; cursor:pointer; opacity:.65;"
    >×</button>

    <div
      style="position:absolute; left:50%; transform:translateX(-50%); width:0; height:0;
        {below
          ? 'bottom:100%; border-left:7px solid transparent; border-right:7px solid transparent; border-bottom:7px solid var(--pop-bg);'
          : 'top:100%; border-left:7px solid transparent; border-right:7px solid transparent; border-top:7px solid var(--pop-bg);'}"
    ></div>

    <div style="display:flex; align-items:baseline; gap:8px; padding-right:20px; flex-wrap:wrap;">
      <span style="font-family:var(--f-han); font-size:22px; font-weight:500;">{data.word}</span>
      <span style="font-family:var(--f-mono); font-size:12px; color:var(--pop-pin); margin-left:6px;">{data.pinyin}</span>
    </div>
    <div style="font-size:13.5px; margin-top:5px; line-height:1.5;">
      {#if data.meaning}
        {fmtMeaning(data.meaning)}
      {:else}
        <em style="opacity:.35; font-size:12px;">definition not in local dictionary</em>
      {/if}
    </div>

    {#if data.type === 'vocab'}
      <div style="display:flex; gap:8px; margin-top:8px; padding-top:8px; font-size:11.5px;
        border-top:1px solid rgba(255,255,255,.12); color:var(--pop-warn); line-height:1.35;">
        ↺ <span>Revealed — counts as <strong style="color:var(--pop-warn-strong);">forgotten</strong>, returns tomorrow</span>
      </div>
    {:else if data.type === 'free'}
      <div style="display:flex; flex-direction:column; gap:6px; margin-top:12px; padding-top:8px; border-top:1px solid rgba(255,255,255,.1);">
        <button
          onclick={() => { onAddVocab(data.word, data.pinyin, data.meaning); onClose(); }}
          style="width:100%; text-align:left; border-radius:8px; padding:8px 12px; cursor:pointer;
            font-family:var(--f-mono); font-size:10.5px; letter-spacing:.05em; background:var(--jade);
            border:none; color:#fff; line-height:1.3; font-weight:600;"
        >
          Add to vocab
          <span style="display:block; font-weight:400; opacity:.65; margin-top:2px; font-size:9px; text-transform:none; letter-spacing:0;">
            Joins your SRS deck — reviewed regularly starting tomorrow
          </span>
        </button>
      </div>
    {:else if data.type === 'lookup'}
      <div style="margin-top:8px; padding-top:8px; font-size:11px; border-top:1px solid rgba(255,255,255,.1);
        color:rgba(120,210,120,.85); font-family:var(--f-mono); letter-spacing:.05em;">
        + Added to your deck
      </div>
    {/if}
  </div>
{/if}
