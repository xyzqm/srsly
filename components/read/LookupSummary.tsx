'use client';

interface Props {
  totalVocab: number;
  clozeAnswered: number;
}

export default function LookupSummary({ totalVocab, clozeAnswered }: Props) {
  const remaining = totalVocab - clozeAnswered;

  const msg = totalVocab === 0
    ? (<><strong style={{ color: 'var(--ink)' }}>Other words</strong> (faint underline) — tap any to look it up and add it to your deck.</>)
    : clozeAnswered === 0
      ? (<><strong style={{ color: 'var(--ink)' }}>{totalVocab} review word{totalVocab === 1 ? '' : 's'}</strong> hidden as blanks — type each one to practice. Hover a blank for the English hint (toggle <strong style={{ color: 'var(--ink)' }}>Hints</strong> on/off above).</>)
      : remaining > 0
        ? (<><strong style={{ color: 'var(--ink)' }}>{clozeAnswered} of {totalVocab}</strong> blanks filled in — <strong style={{ color: 'var(--ink)' }}>{remaining}</strong> remaining.</>)
        : (<>All <strong style={{ color: 'var(--ink)' }}>{totalVocab}</strong> blank{totalVocab === 1 ? '' : 's'} filled in. Click <strong style={{ color: 'var(--ink)' }}>Finish</strong> below to schedule your results.</>);

  return (
    <div
      className="flex items-center justify-between gap-4 mt-6 px-5 py-4 rounded-xl"
      style={{ border: '1px dashed var(--line)', background: 'var(--paper-2)' }}
    >
      <div style={{ fontSize: 13.5, color: 'var(--ink-soft)', lineHeight: 1.55, maxWidth: '52ch' }}>
        {msg}
      </div>
      {totalVocab > 0 && (
        <div style={{ fontFamily: 'var(--f-display)', fontSize: 34, fontWeight: 500, color: 'var(--accent)', lineHeight: 1, flexShrink: 0 }}>
          {clozeAnswered}/{totalVocab}
        </div>
      )}
    </div>
  );
}
