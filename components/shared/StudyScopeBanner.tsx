'use client';

/**
 * Shown in the learning modes while a focused "Study this deck" session is active. Makes
 * the temporary, session-only scope visible (otherwise you can't tell you're not on the
 * global queue) and offers a one-click exit back to studying your whole collection.
 */
export default function StudyScopeBanner({ decks, onExit }: { decks: string[]; onExit: () => void }) {
  if (!decks.length) return null;
  const label = decks.length === 1 ? decks[0] : `${decks.length} decks`;
  return (
    <div
      className="flex items-center gap-3 mb-5 px-4 py-2.5 rounded-xl"
      style={{ background: 'var(--accent-soft)', border: '1px solid color-mix(in srgb, var(--accent) 35%, transparent)' }}
    >
      <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--accent)' }}>
        ▸ Studying
      </span>
      <span style={{ fontFamily: 'var(--f-mono)', fontSize: 12.5, color: 'var(--ink)', fontWeight: 500 }}>{label}</span>
      <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--ink-soft)' }}>
        — only this deck&apos;s due cards
      </span>
      <button
        onClick={onExit}
        className="ml-auto cursor-pointer transition-all duration-150"
        style={{
          fontFamily: 'var(--f-mono)', fontSize: 10.5, letterSpacing: '.06em', textTransform: 'uppercase',
          background: 'none', color: 'var(--accent)',
          border: '1px solid color-mix(in srgb, var(--accent) 45%, transparent)',
          borderRadius: 7, padding: '5px 11px',
        }}
      >
        Exit to all decks
      </button>
    </div>
  );
}
