import { NextRequest, NextResponse } from 'next/server';
import { segmentJa } from '@/lib/server/kuromojiSegmenter';

export const runtime = 'nodejs';

/**
 * Resolves a single manually-typed Japanese word to its dictionary (base) form via the same
 * kuromoji pipeline used for AI-generated content — used by AddWordForm so a conjugated word
 * typed by the user (e.g. 食べました) is stored in the deck as its dictionary form (食べる),
 * matching what generated passages resolve to.
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

  const tokens = await segmentJa(text, new Map());
  // Only a single resolved word is meaningful here — a phrase/sentence typed into the "add a
  // word" field has no single canonical form, so the caller should keep the raw text as-is.
  if (tokens.length !== 1) {
    return NextResponse.json({ single: false });
  }
  const [surface, reading = '', meaning = '', baseForm] = tokens[0];
  return NextResponse.json({ single: true, surface, reading, meaning, baseForm: baseForm ?? null });
}
