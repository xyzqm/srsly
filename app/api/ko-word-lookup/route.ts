import { NextRequest, NextResponse } from 'next/server';
import { resolveWordServer } from '@/lib/server/wordResolver';

export const runtime = 'nodejs';

/**
 * Resolves a single manually-typed Korean word to its dictionary (base) form, so a
 * conjugated word typed into AddWordForm (먹었어요 → 먹다) is stored under the same
 * card generated passages resolve to.
 *
 * The work lives in lib/server/wordResolver.ts, shared with /api/batch-word-lookup, so the
 * single-word and bulk-import paths can never disagree about whether a word is real.
 */
export async function POST(req: NextRequest) {
  let text: string;
  try {
    const body = await req.json();
    text = typeof body.text === 'string' ? body.text.trim() : '';
  } catch {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 });
  }
  if (!text) return NextResponse.json({ error: 'empty text' }, { status: 400 });

  const r = await resolveWordServer('ko', text);
  // `single: false` covers both "that was a phrase, not a word" and "no dictionary entry".
  if (!r.found) return NextResponse.json({ single: false });
  return NextResponse.json({
    single: true,
    surface: r.surface,
    reading: r.reading,
    meaning: r.meaning,
    baseForm: r.word !== r.surface ? r.word : null,
  });
}
