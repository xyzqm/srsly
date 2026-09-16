import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import type { LanguageCode } from '@/lib/types';
import { getLanguageConfig, levelLabel } from '@/lib/languageConfig';
import { resolveAiAccess, meterOrRefuse, noKeyRefusal } from '@/lib/server/aiGate';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * THIS ROUTE SPENDS MONEY, AND FOR A LONG TIME IT WAS THE ONLY ONE THAT DID SO UNWATCHED.
 *
 * It was written after `daily-content` and copied one third of its billing logic: it read
 * `USER_KEY_HEADER` and preferred the learner's key, which is the half that is easy to see
 * working. It never acquired the other two thirds — no key check and no meter — so an
 * anonymous guest with no key of their own fell through to `SRSLY_API_KEY` and had their
 * example sentences billed to the operator, without limit and without a row in `ai_usage`.
 *
 * Nothing about that looks like a bug from either side. The learner gets their sentences; the
 * operator gets a bill with no request attached to it. It is the argument for `lib/server/aiGate.ts`
 * in one file: the three questions are now asked in one place, by every route that can reach
 * Anthropic, and `tests/aiGate.test.ts` fails if a fourth one forgets to ask them.
 */

/** Accurate at a guest limit of zero, where "you have used your free generations" is not. */
const GUEST_LIMIT_MSG =
  'Example sentences are written by Claude, and generation is not free for guests. Sign in, or add your own Anthropic API key in Settings.';
const NO_KEY_MSG =
  'Add your own Anthropic API key in Settings to generate example sentences. The words and their character breakdowns need no key.';
/**
 * The stub serves canned PASSAGES and has nothing to say here, so this route refuses rather
 * than generating while stubbed. `meterOrRefuse` skips the meter under `SRSLY_STUB_AI=1` on
 * the promise that no call is made — taking that skip and then calling anyway would bill the
 * operator under the one flag that exists to guarantee it cannot happen.
 */
const STUB_MSG =
  'SRSLY_STUB_AI is on and there is no canned content for example sentences, so none were generated.';

interface WordInput { h: string; p: string; m: string; }

interface RequestBody {
  words: WordInput[];
  language: LanguageCode;
  level: number; // HSK 1-6 for zh; JLPT stored as 1-5 where 5=N5 for ja; CEFR 1-6 for es
}

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 });
  }
  const { words, language, level } = body;

  /**
   * Answered before the gate, deliberately. Asking for sentences for no words is a no-op with
   * a correct empty answer, and turning it into a 503 on a keyless server would report a
   * missing credential for a request that needs none. It is also why the meter comes after:
   * a credit spent on a request that generates nothing is a charge for nothing.
   */
  if (!words?.length) return NextResponse.json({ sentences: {} });

  const access = resolveAiAccess(req);
  if (access.stub) return noKeyRefusal(STUB_MSG);
  if (!access.usable) return noKeyRefusal(NO_KEY_MSG);

  const { refusal } = await meterOrRefuse(access, GUEST_LIMIT_MSG);
  if (refusal) return refusal;

  const config = getLanguageConfig(language);
  const levelDesc = levelLabel(language, level);
  // `p` is the reading slot — empty for languages with no reading layer (es), so it is
  // omitted rather than printed as an empty pair of parentheses.
  const wordList = words
    .map(w => (config.hasReadings && w.p ? `${w.h} (${w.p}, "${w.m}")` : `${w.h} ("${w.m}")`))
    .join('\n');

  // Inflecting languages must be told to leave the word in its dictionary form, or the
  // example sentences come back conjugated and no longer match the card being reviewed.
  const formRule = config.usesBaseForms
    ? 'Each sentence MUST contain the word in EXACTLY the dictionary form shown (do not conjugate or pluralise it).'
    : 'Each sentence MUST contain the word exactly as shown.';

  const prompt = `Generate 3 short example sentences at ${levelDesc} level for each ${config.name} word below.
Rules:
- ${formRule}
- Keep sentences ${config.shortSentenceLimit} each.
- Use ${levelDesc}-appropriate vocabulary.
- Return ONLY valid JSON, no explanation.

Words:
${wordList}

Output format:
{"sentences": {"<word>": ["sentence1", "sentence2", "sentence3"]}}`;

  try {
    /**
     * A bare client rather than `generatorFor`, and the reason is `max_tokens`. `Generator`
     * is built for passages and asks for 16,000; three sentences per word is what 1,500 was
     * chosen for, and a cap is the only thing standing between a confused reply and a long
     * one. Billing cannot drift from metering by doing this: the key is `access.apiKey`, the
     * same object the meter above read `operatorPays` from.
     */
    const client = new Anthropic({ apiKey: access.apiKey });
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });
    const raw = response.content[0].type === 'text' ? response.content[0].text : '';
    const match = raw.match(/\{[\s\S]*\}/);
    /**
     * 502, not an empty 200. An unparseable reply is a FAILURE, and returning `{}` with a
     * success status made it indistinguishable from "this word has no sentences" — which the
     * client then wrote to localStorage as the answer, permanently. Ask what an empty value
     * MEANS before rendering a sentence about it.
     */
    if (!match) {
      return NextResponse.json(
        { error: 'unparseable', message: 'The reply could not be read. Try again.' }, { status: 502 },
      );
    }
    return NextResponse.json(JSON.parse(match[0]));
  } catch (e) {
    console.error('missed-review error:', e);
    return NextResponse.json(
      { error: 'generation_failed', message: 'Something went wrong generating the sentences. Try again.' },
      { status: 500 },
    );
  }
}
