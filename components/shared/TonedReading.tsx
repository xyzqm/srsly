'use client';
import { tonedSyllables } from '@/lib/pinyin';

/**
 * A pinyin reading with each syllable carrying its own tone class.
 *
 * ── IT COLOURS ONLY WHAT IT IS SURE OF ──
 *
 * `tonedSyllables` returns null when a reading cannot be split into real syllables — a Latin
 * abbreviation like `bchāo` (B超), or anything that is not pinyin at all. The reading then
 * renders exactly as it did before, uncoloured. That degradation costs nothing, because the
 * TONE MARK is the information and the colour is only reinforcement; colouring the wrong
 * syllable would teach the wrong tone, which is the thing this file exists to avoid.
 *
 * Measured against the whole of CC-CEDICT: 99.44% of Han entries split to one syllable per
 * character, 0.5% refuse and render plain. The residual mismatches are erhua (个儿 `gèr` is
 * genuinely one syllable for two characters) rather than wrong tones.
 *
 * ── THE SWITCH IS CSS, NOT A PROP ──
 *
 * The classes are always emitted; `body[data-tones="on"]` decides whether they do anything.
 * So turning tone colours on or off is one attribute and re-renders nothing — the same shape
 * as `data-blank` and `data-texture`, and the reason none of the four call sites has to know
 * the setting exists.
 */
export default function TonedReading({ reading }: { reading: string }) {
  const parts = tonedSyllables(reading);
  if (!parts) return <>{reading}</>;
  return (
    <>
      {parts.map((p, i) => (
        <span key={i} className={`tone-${p.tone}`}>{p.text}</span>
      ))}
    </>
  );
}
