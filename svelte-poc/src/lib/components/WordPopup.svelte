<script lang="ts">
  // Port of components/read/WordPopup.tsx — a dark definition card anchored to the clicked
  // word. Trimmed for the PoC: hanzi + pinyin + meaning, plus an Add-to-vocab action for
  // new words and a "revealed" note for due SRS words.
  export interface PopupData {
    word: string;
    pinyin: string;
    meaning: string;
    // pool = already staged in the deck (pool:true) but not yet in circulation — "Add to vocab"
    // releases the existing row instead of inserting a new one (see poolId below).
    type: 'vocab' | 'free' | 'lookup' | 'pool';
    anchorRect: DOMRect;
    // Present only for type 'pool' — the staged row's id, needed to release it.
    poolId?: string;
    // True while a highlight-triggered lookup is still in flight — see ReadTab's handleSelection.
    // Suppresses the meaning text and Add-to-vocab section until the definition (or its absence)
    // is known, so the popup doesn't flash a "not in dictionary" message that a moment later
    // turns out to be wrong.
    loading?: boolean;
  }

  interface Props {
    data: PopupData | null;
    onClose: () => void;
    onAddVocab: (word: string, pinyin: string, meaning: string) => void;
    // Present only for type 'pool' — releases the existing staged row into circulation.
    onReleaseFromPool?: (poolId: string) => void;
    // Present only for type 'lookup' (the word is already in the deck) — lets the user correct a
    // bad reading/meaning inline instead of only being able to view it. Returns a Promise (rather
    // than firing and forgetting) so this popup can wait for the save to actually land before
    // leaving edit mode, and show an error inline instead of silently discarding a failed edit.
    onSaveDefinition?: (pinyin: string, meaning: string) => Promise<void>;
    // Present only for type 'lookup' — requests removal from the deck. Just a request, not the
    // deletion itself: the caller is expected to confirm before actually removing (see ReadTab.svelte).
    onRequestRemove?: () => void;
  }
  let { data, onClose, onAddVocab, onReleaseFromPool, onSaveDefinition, onRequestRemove }: Props = $props();

  let el = $state<HTMLDivElement | null>(null);
  let top = $state(0);
  let left = $state(0);
  let below = $state(false);
  let ready = $state(false);
  let editing = $state(false);
  let editP = $state('');
  let editM = $state('');
  let saving = $state(false);
  let saveError = $state('');

  // Editing state is scoped to whichever word the popup is currently showing — reset it (and
  // seed the drafts) every time `data` changes, not just on mount.
  $effect(() => {
    editing = false;
    saveError = '';
    if (data) { editP = data.pinyin; editM = data.meaning; }
  });

  // Reseeds the drafts every time editing starts (not just when `data` changes) — otherwise a
  // value typed, then Cancelled, would silently resurface (and be save-able) the next time Edit
  // is clicked on this same still-open popup.
  function startEdit() {
    if (!data) return;
    editP = data.pinyin;
    editM = data.meaning;
    saveError = '';
    editing = true;
  }
  function cancelEdit() {
    editing = false;
    saveError = '';
  }

  async function saveEdit() {
    if (!onSaveDefinition || !editM.trim()) return;
    saving = true;
    saveError = '';
    try {
      await onSaveDefinition(editP.trim(), editM.trim());
      editing = false;
    } catch {
      saveError = "Couldn't save — try again.";
    } finally {
      saving = false;
    }
  }

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
      {#if editing}
        <input
          bind:value={editP}
          disabled={saving}
          onkeydown={(e) => { if (e.key === 'Enter') saveEdit(); else if (e.key === 'Escape') cancelEdit(); }}
          placeholder="reading"
          style="font-family:var(--f-mono); font-size:12px; color:var(--pop-fg); margin-left:6px; width:6em;
            background:rgba(255,255,255,.1); border:1px solid rgba(255,255,255,.2); border-radius:5px; padding:2px 6px;"
        />
      {:else}
        <span style="font-family:var(--f-mono); font-size:12px; color:var(--pop-pin); margin-left:6px;">{data.pinyin}</span>
      {/if}
    </div>
    <div style="font-size:13.5px; margin-top:5px; line-height:1.5;">
      {#if editing}
        <input
          bind:value={editM}
          disabled={saving}
          onkeydown={(e) => { if (e.key === 'Enter') saveEdit(); else if (e.key === 'Escape') cancelEdit(); }}
          placeholder="meaning"
          style="width:100%; font-size:13.5px; color:var(--pop-fg); background:rgba(255,255,255,.1);
            border:1px solid rgba(255,255,255,.2); border-radius:5px; padding:4px 8px;"
        />
        {#if !editM.trim()}
          <div style="font-size:10.5px; color:var(--pop-warn); margin-top:4px;">Meaning can't be empty.</div>
        {:else if saveError}
          <div style="font-size:10.5px; color:var(--pop-warn); margin-top:4px;">{saveError}</div>
        {/if}
      {:else if data.loading}
        <em style="opacity:.5; font-size:12px;">Looking up…</em>
      {:else if data.meaning}
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
    {:else if (data.type === 'free' || data.type === 'pool') && !data.loading && data.meaning}
      <div style="display:flex; flex-direction:column; gap:6px; margin-top:12px; padding-top:8px; border-top:1px solid rgba(255,255,255,.1);">
        <button
          onclick={() => {
            if (data.type === 'pool' && data.poolId) onReleaseFromPool?.(data.poolId);
            else onAddVocab(data.word, data.pinyin, data.meaning);
            onClose();
          }}
          style="width:100%; text-align:left; border-radius:8px; padding:8px 12px; cursor:pointer;
            font-family:var(--f-mono); font-size:10.5px; letter-spacing:.05em;
            background:{data.type === 'pool' ? 'var(--purple)' : 'var(--jade)'};
            border:none; color:#fff; line-height:1.3; font-weight:600;"
        >
          Add to vocab
          <span style="display:block; font-weight:400; opacity:.65; margin-top:2px; font-size:9px; text-transform:none; letter-spacing:0;">
            {data.type === 'pool'
              ? 'Already staged — releases into your SRS deck, reviewed starting today'
              : 'Joins your SRS deck — reviewed regularly starting tomorrow'}
          </span>
        </button>
      </div>
    {:else if data.type === 'lookup'}
      <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:8px;
        padding-top:8px; font-size:11px; border-top:1px solid rgba(255,255,255,.1); font-family:var(--f-mono); letter-spacing:.05em;">
        {#if editing}
          <div style="display:flex; gap:6px;">
            <button onclick={saveEdit} disabled={saving || !editM.trim()}
              style="background:var(--jade); border:none; border-radius:6px; color:#fff; cursor:pointer; padding:4px 10px; font-size:11px;
                opacity:{saving || !editM.trim() ? 0.5 : 1};"
            >{saving ? 'Saving…' : 'Save'}</button>
            <button onclick={cancelEdit} disabled={saving}
              style="background:none; border:1px solid rgba(255,255,255,.25); border-radius:6px; color:var(--pop-fg); cursor:pointer; padding:4px 10px; font-size:11px;"
            >Cancel</button>
          </div>
        {:else}
          <span style="color:rgba(120,210,120,.85);">+ Added to your deck</span>
          <div style="display:flex; gap:6px;">
            {#if onSaveDefinition}
              <button onclick={startEdit}
                style="background:none; border:1px solid rgba(255,255,255,.2); border-radius:6px; color:var(--pop-fg);
                  opacity:.75; cursor:pointer; padding:3px 9px; font-size:10.5px;"
              >Edit</button>
            {/if}
            {#if onRequestRemove}
              <button onclick={onRequestRemove} aria-label="Remove from deck" title="Remove from deck"
                style="display:flex; align-items:center; background:none; border:1px solid rgba(255,255,255,.2); border-radius:6px;
                  color:var(--pop-warn); opacity:.85; cursor:pointer; padding:3px 7px;"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6" />
                  <path d="M14 11v6" />
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                </svg>
              </button>
            {/if}
          </div>
        {/if}
      </div>
    {/if}
  </div>
{/if}
