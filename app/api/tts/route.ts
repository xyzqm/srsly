import { NextRequest, NextResponse } from 'next/server';

/**
 * Optional API-backed TTS. Without OPENAI_API_KEY this returns 501 and the client falls
 * back to browser speech synthesis (lib/speech.ts), which is the path most installs take.
 *
 * `lang` matters more here than it looks. Flashcards speak ONE WORD, and a single word is
 * where language auto-detection from text fails hardest: "no", "pan", "casa" and "son" are
 * all real words in more than one of the languages this app teaches. So the locale is sent
 * explicitly and steers the model rather than being guessed from the input.
 */

const LANGUAGE_NAME: Record<string, string> = {
  zh: 'Mandarin Chinese',
  ja: 'Japanese',
  es: 'Spanish',
  fr: 'French',
};

/** Chinese is slowed most — tone contours are what a learner is straining to hear. */
const SPEED: Record<string, number> = { zh: 0.85, ja: 0.9, es: 0.95, fr: 0.95 };

export async function POST(req: NextRequest) {
  const { text, lang } = await req.json() as { text: string; lang?: string };

  if (!text?.trim()) {
    return NextResponse.json({ error: 'empty_text' }, { status: 400 });
  }

  if (!process.env.OPENAI_API_KEY) {
    // No key — caller falls back to browser TTS
    return NextResponse.json({ error: 'no_key' }, { status: 501 });
  }

  const base = (lang ?? 'zh-CN').slice(0, 2).toLowerCase();
  const languageName = LANGUAGE_NAME[base];

  try {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // gpt-4o-mini-tts rather than tts-1-hd: it accepts `instructions`, which is the
        // only way to tell the model what language a one-word input is in.
        model: 'gpt-4o-mini-tts',
        input: text,
        voice: 'shimmer',
        response_format: 'mp3',
        speed: SPEED[base] ?? 0.95,
        ...(languageName && {
          instructions: `Read the text as a native ${languageName} speaker, clearly and at a natural pace, for a language learner. The text is ${languageName}, even when it is a single word.`,
        }),
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('[tts] OpenAI error:', err);
      return NextResponse.json({ error: 'tts_failed' }, { status: 500 });
    }

    const audio = await response.arrayBuffer();
    return new NextResponse(audio, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    });
  } catch (e) {
    console.error('[tts] fetch error:', e);
    return NextResponse.json({ error: 'fetch_error' }, { status: 500 });
  }
}
