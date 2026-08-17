import { NextRequest, NextResponse } from 'next/server';
import type { LanguageCode } from '@/lib/types';
import { getLanguageConfig, toLanguageCode } from '@/lib/languageConfig';
import { segmentJa, type RawTok } from '@/lib/server/kuromojiSegmenter';
import { segmentEs } from '@/lib/server/spanishSegmenter';
import { segmentFr } from '@/lib/server/frenchSegmenter';
import { segmentZh } from '@/lib/server/chineseSegmenter';
import { splitSentences } from '@/lib/server/sentenceSplit';
import { MAX_PASTE_CHARS } from '@/lib/constants';

/**
 * Segment text the LEARNER supplied, into the same wire format /api/daily-content emits.
 *
 * NO MODEL CALL, IN ANY LANGUAGE, AND SO NO `consumeAiCredit`. That is the whole point of
 * this route existing separately rather than as a `sections: ['segment']` arm of
 * daily-content: the generation budget rations Anthropic tokens, and reading your own
 * article spends none. Japanese, Spanish and French already have deterministic segmenters
 * (kuromoji and the two lemmatizing splitters); Chinese now has lib/server/chineseSegmenter.ts,
 * written for exactly this, because the daily path leans on the model emitting `|` and
 * pasted prose carries no such marks.
 *
 * `words` is the caller's deck. It is passed straight through as the segmenters' `overrides`
 * map, which is what links a passage token back to its card: it is how `Bonjour` at the head
 * of a sentence keeps `bonjour` as its base form, and how a multi-word entry (`por favor`)
 * survives as one token instead of two.
 */

/** Above this the response is large enough to be worth refusing outright. */
const MAX_SENTENCES = 400;

interface DeckEntry { h: string; p: string; m: string }

async function segment(
  language: LanguageCode,
  sentence: string,
  overrides: Map<string, { p: string; m: string }>,
): Promise<RawTok[]> {
  if (language === 'zh') return segmentZh(sentence, overrides);
  if (language === 'es') return segmentEs(sentence, overrides);
  if (language === 'fr') return segmentFr(sentence, overrides);
  return segmentJa(sentence, overrides);
}

export async function POST(req: NextRequest) {
  let text: string;
  let title: string;
  let language: LanguageCode;
  let words: DeckEntry[];

  try {
    const body = await req.json();
    text = typeof body.text === 'string' ? body.text : '';
    title = typeof body.title === 'string' ? body.title : '';
    language = toLanguageCode(body.language);
    words = Array.isArray(body.words) ? body.words : [];
  } catch {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 });
  }

  if (!text.trim()) {
    return NextResponse.json({ error: 'empty text' }, { status: 400 });
  }
  if (text.length > MAX_PASTE_CHARS) {
    return NextResponse.json(
      { error: 'too long', detail: `Text is ${text.length} characters; the limit is ${MAX_PASTE_CHARS}.` },
      { status: 413 },
    );
  }

  // The deck, keyed exactly as the segmenters expect. First card wins for a repeated
  // surface — a polyphone (行 xíng / háng) has two cards and one spelling, and the
  // segmenter only needs to know that the surface IS a word; which reading applies is
  // settled client-side against `deckReadings`.
  const overrides = new Map<string, { p: string; m: string }>();
  for (const w of words) {
    if (typeof w?.h !== 'string' || !w.h) continue;
    if (!overrides.has(w.h)) overrides.set(w.h, { p: w.p ?? '', m: w.m ?? '' });
  }

  const unspaced = getLanguageConfig(language).scriptIsUnspaced;
  const rawSentences = splitSentences(text, unspaced).slice(0, MAX_SENTENCES);
  if (rawSentences.length === 0) {
    return NextResponse.json({ error: 'empty text' }, { status: 400 });
  }

  try {
    const sentences = await Promise.all(rawSentences.map(s => segment(language, s, overrides)));
    // A title is segmented like any other line so its words are clickable and can carry a
    // blank, exactly as a generated passage's title does.
    const titleToks = title.trim() ? await segment(language, title.trim(), overrides) : [];
    return NextResponse.json({ ok: true, title: titleToks, sentences });
  } catch (err) {
    console.error('[segment-text]', language, err);
    return NextResponse.json({ error: 'segmentation failed', detail: String(err) }, { status: 500 });
  }
}
