'use client';

interface Props {
  peekedCount: number;
  totalVocab: number;
  claimedCount: number;
}

export default function LookupSummary({ peekedCount, totalVocab, claimedCount }: Props) {
  const msg = peekedCount === 0
    ? (<><strong style={{ color: 'var(--ink)' }}>Review words</strong> (accent underline) — revealing counts as forgotten. <strong style={{ color: 'var(--ink)' }}>Other words</strong> (faint underline) — free to look up; add to your deck or just schedule for tomorrow.</>)
    : (<><strong style={{ color: 'var(--ink)' }}>{peekedCount}</strong> of {totalVocab} review words revealed → each reset to <strong style={{ color: 'var(--ink)' }}>due tomorrow</strong>. {claimedCount > 0 && <>Also queued <strong style={{ color: 'var(--ink)' }}>{claimedCount}</strong> new word{claimedCount === 1 ? '' : 's'}.</>}</>);

  return (
    <div
      className="flex items-center justify-between gap-4 mt-6 px-5 py-4 rounded-xl"
      style={{ border: '1px dashed var(--line)', background: 'var(--paper-2)' }}
    >
      <div style={{ fontSize: 13.5, color: 'var(--ink-soft)', lineHeight: 1.55, maxWidth: '52ch' }}>
        {msg}
      </div>
      <div style={{ fontFamily: 'var(--f-display)', fontSize: 34, fontWeight: 500, color: 'var(--accent)', lineHeight: 1, flexShrink: 0 }}>
        {peekedCount}
      </div>
    </div>
  );
}
