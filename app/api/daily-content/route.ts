import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

/** Maximum words to use for generation — keeps the output focused. */
const MAX_WORDS = 8;

/** Sentence count targets by HSK level */
const SENTENCE_TARGET: Record<number, number> = {
  1: 6, 2: 8, 3: 10, 4: 12, 5: 14, 6: 16,
};

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'your-api-key-here') {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 });
  }

  let words: { h: string; p: string; m: string }[];
  let hskLevel: number;

  try {
    const body = await req.json();
    words = body.words;
    hskLevel = body.hskLevel ?? 4;
    if (!Array.isArray(words) || words.length < 1) {
      return NextResponse.json({ error: 'words array required' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 });
  }

  // Cap to top words (sorted by reviews ascending so newer/less-reviewed come first)
  const targetWords = words.slice(0, MAX_WORDS);

  const wordList = targetWords.map((w, i) => `${i + 1}. ${w.h} (${w.p}) — ${w.m}`).join('\n');
  const levelDesc = hskLevel <= 2 ? 'beginner' : hskLevel <= 4 ? 'intermediate' : 'advanced';
  const sentenceCount = SENTENCE_TARGET[hskLevel] ?? 10;

  const prompt = `You are a Chinese language teacher generating personalized daily practice content.

VOCABULARY TO REVIEW TODAY (${targetWords.length} words):
${wordList}

HSK LEVEL: ${hskLevel} (${levelDesc})

Generate a cohesive set of practice materials around a single everyday theme that uses ALL the vocabulary words above. Return a JSON object with EXACTLY this structure:

{
  "title": TOKEN_ARRAY,
  "sentences": [TOKEN_ARRAY, TOKEN_ARRAY, ...],
  "questions": [QUESTION, QUESTION, QUESTION],
  "fill": [FILL_ITEM, ...],
  "convo": [CONVO_TURN, ...]
}

TOKEN formats — each token is a small JSON array:
  ["word", "pinyin", "meaning"]    — REQUIRED for every word with 2+ characters, and any content word
  ["word", "pinyin"]               — ONLY single-character function particles: 的、了、是、在、和、也、都、有、没、不、把、被、让、与、或、于
  ["punctuation"]                  — Punctuation only: 。！？，、—…

TOKEN_ARRAY = array of the token arrays above.

CRITICAL TOKENIZATION RULES:
1. Every word with 2+ characters MUST be a 3-element array ["word","pinyin","meaning"]. No exceptions.
2. NEVER emit ["word","pinyin"] (2-element) for any multi-character word.
3. Do NOT bundle multiple words into one token. Write 背景下 as ["背景","bèijǐng","background; context"] + ["下","xià"] not as ["背景下","bèijǐng xià"].
4. For the VOCAB WORDS listed above, use the exact meaning from the list above.

CORRECT:   ["加快","jiākuài","to speed up; to accelerate"] ✓
CORRECT:   ["文化遗产","wénhuà yíchǎn","cultural heritage"] ✓
INCORRECT: ["加快","jiākuài"] ✗  ← missing meaning, NEVER do this for 2+ char words
INCORRECT: ["背景下","bèijǐng xià"] ✗  ← bundled phrase, break it up

QUESTION = {
  "q": TOKEN_ARRAY,
  "model": "English model answer (1-2 sentences)",
  "key": ["hanzi_word1", "hanzi_word2"],
  "options": [
    {"tokens": TOKEN_ARRAY, "correct": true},
    {"tokens": TOKEN_ARRAY, "correct": false},
    {"tokens": TOKEN_ARRAY, "correct": false},
    {"tokens": TOKEN_ARRAY, "correct": false}
  ]
}
  "q" = the question in Chinese tokens.
  "model" = English model answer for free-response grading.
  "key" = 1-3 hanzi words (from the vocab list above) that a correct answer should mention.
  "options" = exactly 4 multiple-choice options (full Chinese sentences), exactly 1 correct.

FILL_ITEM = {
  "before": TOKEN_ARRAY,
  "answer": ["hanzi", "pinyin"],
  "after": TOKEN_ARRAY,
  "distractors": [["h","p"], ["h","p"], ["h","p"]]
}
  "answer" MUST be one of the vocabulary words in the list.
  "distractors" = 3 plausible but wrong words (can be from the passage; must NOT be the answer).

CONVO_TURN = {
  "key": ["hanzi", ...],
  "tutor": TOKEN_ARRAY,
  "suggestions": [TOKEN_ARRAY, TOKEN_ARRAY]
}
  "key" = 1-3 vocab words used in this turn.
  "suggestions" = 1-2 model replies the student might give. Last turn must have "suggestions": [].

REQUIREMENTS:
1. "title": 3-6 tokens — a natural title for today's theme.
2. "sentences": ${sentenceCount}-${sentenceCount + 2} sentences — a rich, coherent passage telling a complete story or describing a topic in depth. Use EVERY vocab word at least once (marked with meaning). Include transition words between sentences to make it flow naturally. Each sentence should be substantive, not too short.
3. "questions": exactly 3 comprehension questions about the passage content. Each question MUST reference at least one vocab word in its "key". Questions should test understanding of the passage, not just vocabulary definitions.
4. "fill": 3-4 items — one per vocab word as the answer. Only use vocab words as answers.
5. "convo": 4-5 turns — a natural dialogue practicing the vocab in a realistic scenario; mark vocab words with meanings in TOKEN arrays; last turn has "suggestions": [].
6. Pinyin must use diacritical tone marks: ā á ǎ à, NOT numbers.
7. The passage, questions, fill items, and conversation should share a single coherent everyday theme.
8. Difficulty appropriate for HSK ${hskLevel}: use ${hskLevel <= 2 ? 'simple grammar, short sentences, basic vocabulary' : hskLevel <= 4 ? 'varied sentence patterns, moderate complexity, some idiomatic expressions' : 'complex grammar, longer sentences, literary or abstract vocabulary'}.

Return ONLY the JSON object. No markdown fences, no explanation, no extra text before or after.`;

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 16000,
      system: 'You output only valid JSON. No markdown, no code blocks, no explanations.',
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
    // Strip accidental markdown fences if present
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const json = JSON.parse(cleaned);

    return NextResponse.json({ ok: true, data: json, vocabWords: targetWords.map(w => w.h) });
  } catch (err) {
    console.error('[daily-content] generation error:', err);
    return NextResponse.json({ error: 'generation failed', detail: String(err) }, { status: 500 });
  }
}
