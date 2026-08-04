import { NextRequest, NextResponse } from 'next/server';
import { toLanguageCode } from '@/lib/languageConfig';
import { resolveWordServer, type ResolvedWord } from '@/lib/server/wordResolver';

export const runtime = 'nodejs';

/**
 * Batch counterpart of `/api/{lang}-word-lookup`, for the bulk import flow.
 *
 * ImportPanel needs the same inflection handling AddWordForm gets — a pasted 먹었어요 should
 * become the 먹다 card, not be rejected as unknown — but issuing one request per pasted word
 * would mean hundreds of round-trips for a single paste. This takes the whole list at once.
 *
 * Returns a map keyed by the submitted surface, so the caller can line results back up with
 * its own (possibly duplicated, possibly reordered) input.
 */

/** Hard ceiling per request. A paste larger than this is chunked by the caller; the cap is
 *  here so a hand-rolled request can't ask the server to segment an unbounded list. */
const MAX_WORDS = 500;

export async function POST(req: NextRequest) {
  let words: unknown;
  let language;
  try {
    const body = await req.json();
    words = body.words;
    language = toLanguageCode(body.language);
  } catch {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 });
  }

  if (!Array.isArray(words)) {
    return NextResponse.json({ error: '`words` must be an array' }, { status: 400 });
  }
  if (words.length > MAX_WORDS) {
    return NextResponse.json(
      { error: `too many words: ${words.length} (max ${MAX_WORDS})` },
      { status: 400 },
    );
  }

  // Resolve each DISTINCT surface once. A pasted list routinely repeats words — and for an
  // inflecting language every repeat would otherwise re-run the segmenter, which for
  // Japanese means re-tokenising through kuromoji.
  const unique = new Set<string>();
  for (const w of words) {
    if (typeof w === 'string' && w.trim()) unique.add(w.trim());
  }

  const resolved = await Promise.all(
    [...unique].map(async (surface): Promise<[string, ResolvedWord]> => [
      surface,
      await resolveWordServer(language, surface),
    ]),
  );

  const results: Record<string, Omit<ResolvedWord, 'surface'>> = {};
  for (const [surface, r] of resolved) {
    results[surface] = { found: r.found, word: r.word, reading: r.reading, meaning: r.meaning };
  }

  return NextResponse.json({ results });
}
