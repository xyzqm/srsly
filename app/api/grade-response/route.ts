import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

/** Keyword-match fallback — used when no API key or Claude fails. */
function keywordFallback(response: string, key: string[]): {
  verdict: 'ok' | 'partial' | 'miss';
  message: string;
  wordsHit: string[];
} {
  const wordsHit = key.filter(k => response.includes(k));
  const ratio = wordsHit.length / Math.max(key.length, 1);
  if (response.trim().length < 4) {
    return { verdict: 'miss', message: 'Too short — write a full sentence in Chinese.', wordsHit: [] };
  }
  if (ratio >= 0.66) {
    return { verdict: 'ok', message: `Good — you included the key ideas (${wordsHit.join('、')}).`, wordsHit };
  }
  if (ratio >= 0.34) {
    const missed = key.filter(k => !response.includes(k));
    return { verdict: 'partial', message: `You used some key words. Try also including: ${missed.slice(0, 2).join('、')}.`, wordsHit };
  }
  return { verdict: 'miss', message: `Reread the passage — the answer involves ${key.slice(0, 2).join('、')}.`, wordsHit: [] };
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.SRSLY_API_KEY || process.env.ANTHROPIC_API_KEY;

  let question: string;
  let model: string;
  let key: string[];
  let response: string;
  let hskLevel: number;

  try {
    const body = await req.json();
    question  = String(body.question ?? '');
    model     = String(body.model    ?? '');
    key       = Array.isArray(body.key) ? body.key : [];
    response  = String(body.response ?? '');
    hskLevel  = Number(body.hskLevel) || 4;
  } catch {
    return NextResponse.json({ error: 'invalid request' }, { status: 400 });
  }

  if (!question || !response) {
    return NextResponse.json({ error: 'question and response are required' }, { status: 400 });
  }

  // No API key → fall back immediately
  if (!apiKey || apiKey === 'your-api-key-here') {
    return NextResponse.json(keywordFallback(response, key));
  }

  const client = new Anthropic({ apiKey });

  const levelDesc = hskLevel <= 2 ? 'beginner' : hskLevel <= 4 ? 'intermediate' : 'advanced';
  const keyList = key.length > 0 ? key.join(', ') : '(none specified)';

  const prompt = `You are grading a Chinese language student's free-response reading comprehension answer.

QUESTION (Chinese): ${question}
CORRECT ANSWER (English model): ${model}
KEY VOCABULARY (reference only): ${keyList}
STUDENT'S ANSWER: ${response}
HSK LEVEL: ${hskLevel} (${levelDesc})

PRIMARY criterion — COMPREHENSION:
Does the student's answer correctly address what the question asks? Judge this against the model answer.
A student who expresses the correct meaning in their own words, WITHOUT using the key vocabulary, can still receive "ok" or "partial".

SECONDARY criterion — VOCABULARY (bonus signal only):
Did the student use any of the key vocabulary words correctly in context? This is a positive signal but NOT required.

Verdict rules (comprehension is what matters):
- "ok"      : Correctly and clearly answers the question in Chinese — regardless of which words they used
- "partial" : Shows some understanding but incomplete, imprecise, or misses part of the answer — OR answer is correct but very brief
- "miss"    : Does not address the question, shows fundamental misunderstanding, too vague to evaluate, or written in English

The answer MUST be in Chinese script to receive "ok" or "partial".

Return ONLY valid JSON, no other text:
{"verdict":"ok","message":"feedback here","wordsHit":["word1"]}

message: 1–2 sentences of specific, encouraging English feedback. Lead with what they got right. If "partial" or "miss", explain concisely what was missing or incorrect.
wordsHit: words from KEY VOCABULARY the student used correctly (empty array [] if none — that is fine).`;

  try {
    const aiResponse = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: 'You output only valid JSON. No markdown, no code blocks, no explanations.',
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = aiResponse.content[0].type === 'text' ? aiResponse.content[0].text.trim() : '';
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    let json: { verdict?: string; message?: string; wordsHit?: unknown };
    try {
      json = JSON.parse(cleaned);
    } catch {
      console.error('[grade-response] JSON parse failed:', cleaned);
      return NextResponse.json(keywordFallback(response, key));
    }

    const verdict = json.verdict === 'ok' || json.verdict === 'partial' ? json.verdict : 'miss';
    const message = typeof json.message === 'string' && json.message.trim()
      ? json.message.trim()
      : 'Review the passage and try again.';
    const wordsHit = Array.isArray(json.wordsHit)
      ? (json.wordsHit as unknown[]).filter((w): w is string => typeof w === 'string' && key.includes(w))
      : keywordFallback(response, key).wordsHit;

    return NextResponse.json({ verdict, message, wordsHit });
  } catch (err) {
    console.error('[grade-response] Claude error:', err);
    return NextResponse.json(keywordFallback(response, key));
  }
}
