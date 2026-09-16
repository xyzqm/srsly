import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { isAnonymousGuest } from '@/lib/supabase/server';
import type { LanguageCode } from '@/lib/types';
import { getLanguageConfig, toLanguageCode, levelLabel, difficultyTier } from '@/lib/languageConfig';
import { resolveAiAccess } from '@/lib/server/aiGate';

/** Keyword-match fallback — used when no API key or Claude fails. */
function keywordFallback(response: string, key: string[], langName: string): {
  verdict: 'ok' | 'partial' | 'miss';
  message: string;
  wordsHit: string[];
} {
  const wordsHit = key.filter(k => response.includes(k));
  const ratio = wordsHit.length / Math.max(key.length, 1);
  if (response.trim().length < 4) {
    return { verdict: 'miss', message: `Too short — write a full sentence in ${langName}.`, wordsHit: [] };
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

/**
 * THIS ROUTE DEGRADES WHERE THE OTHER TWO REFUSE, AND THAT IS THE DESIGN.
 *
 * `daily-content` and `missed-review` return 402 when an operator-funded request may not be
 * made, because they have nothing else to offer. Grading does: `keywordFallback` is free,
 * instant and a real answer. So the same question — whose money is this? — routes here to a
 * cheaper grade rather than to a refusal, and a learner never loses their answer over it.
 */
export async function POST(req: NextRequest) {
  // Who is paying: lib/server/aiGate.ts, the same resolution the other two spending routes use.
  const access = resolveAiAccess(req);

  let question: string;
  let model: string;
  let key: string[];
  let response: string;
  let hskLevel: number;
  let language: LanguageCode;

  try {
    const body = await req.json();
    question  = String(body.question ?? '');
    model     = String(body.model    ?? '');
    key       = Array.isArray(body.key) ? body.key : [];
    response  = String(body.response ?? '');
    language  = toLanguageCode(body.language);
    hskLevel  = Number(body.hskLevel) || 4;
  } catch {
    return NextResponse.json({ error: 'invalid request' }, { status: 400 });
  }

  const config = getLanguageConfig(language);
  const langName = config.name;
  const levelName = levelLabel(language, hskLevel);

  if (!question || !response) {
    return NextResponse.json({ error: 'question and response are required' }, { status: 400 });
  }

  /**
   * WHOSE MONEY DECIDES THIS, NOT WHETHER THEY ARE SIGNED IN.
   *
   * This read `!apiKey || await isAnonymousGuest()`, which reserved AI grading for signed-in
   * accounts — and so refused it to an anonymous learner who had connected their OWN key in
   * Settings and was paying Anthropic directly for every call. `lib/server/generator.ts`
   * states the rule outright: `operatorPays` decides metering, not the model, and a learner
   * spending their own money must never be rationed on top of it. This was the last place in
   * the codebase that broke it, and it broke it invisibly — the grade still came back, just
   * from a keyword match, so the only symptom was grading that felt oddly blunt to the one
   * group of learners who had paid to avoid exactly that.
   *
   * What has NOT changed: a guest with no key of their own still gets keyword matching. The
   * operator does not fund strangers' grading, which is the same answer supabase/schema.sql
   * gives for passages.
   *
   * Cheap reasons first, and that ordering is load-bearing rather than tidy —
   * `isAnonymousGuest()` is a Supabase round trip, so it is only asked once the answer can
   * still depend on it.
   */
  if (!access.usable || access.stub) {
    return NextResponse.json(keywordFallback(response, key, langName));
  }
  if (access.operatorPays && await isAnonymousGuest()) {
    return NextResponse.json(keywordFallback(response, key, langName));
  }

  const client = new Anthropic({ apiKey: access.apiKey });

  // Tier comes off the language config — the level numbering runs in opposite directions
  // per language (HSK 6 and CEFR C2 are hardest; JLPT N1 is hardest).
  const levelDesc = difficultyTier(language, hskLevel);
  const keyList = key.length > 0 ? key.join(', ') : '(none specified)';

  const prompt = `You are grading a ${langName} language student's free-response reading comprehension answer.

QUESTION (${langName}): ${question}
CORRECT ANSWER (English model): ${model}
KEY VOCABULARY (reference only): ${keyList}
STUDENT'S ANSWER: ${response}
LEVEL: ${levelName} (${levelDesc})

PRIMARY criterion — COMPREHENSION:
Does the student's answer correctly address what the question asks? Judge this against the model answer.
A student who expresses the correct meaning in their own words, WITHOUT using the key vocabulary, can still receive "ok" or "partial".

SECONDARY criterion — VOCABULARY (bonus signal only):
Did the student use any of the key vocabulary words correctly in context? This is a positive signal but NOT required.

Verdict rules (comprehension is what matters):
- "ok"      : Correctly and clearly answers the question in ${langName} — regardless of which words they used
- "partial" : Shows some understanding but incomplete, imprecise, or misses part of the answer — OR answer is correct but very brief
- "miss"    : Does not address the question, shows fundamental misunderstanding, too vague to evaluate, or written in English

${config.answerScriptNote}

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
      return NextResponse.json(keywordFallback(response, key, langName));
    }

    const verdict = json.verdict === 'ok' || json.verdict === 'partial' ? json.verdict : 'miss';
    const message = typeof json.message === 'string' && json.message.trim()
      ? json.message.trim()
      : 'Review the passage and try again.';
    const wordsHit = Array.isArray(json.wordsHit)
      ? (json.wordsHit as unknown[]).filter((w): w is string => typeof w === 'string' && key.includes(w))
      : keywordFallback(response, key, langName).wordsHit;

    return NextResponse.json({ verdict, message, wordsHit });
  } catch (err) {
    console.error('[grade-response] Claude error:', err);
    return NextResponse.json(keywordFallback(response, key, langName));
  }
}
