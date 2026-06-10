import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { text } = await req.json() as { text: string };

  if (!text?.trim()) {
    return NextResponse.json({ error: 'empty_text' }, { status: 400 });
  }

  if (!process.env.OPENAI_API_KEY) {
    // No key — caller falls back to browser TTS
    return NextResponse.json({ error: 'no_key' }, { status: 501 });
  }

  try {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1-hd',
        input: text,
        voice: 'shimmer',       // Natural-sounding, works well for Chinese
        response_format: 'mp3',
        speed: 0.9,             // Slightly slower for clarity
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
