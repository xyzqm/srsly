import { type Generator, GenerationError } from '@/lib/server/generator';

/**
 * ASKING A MODEL FOR JSON AND GETTING JSON BACK, WITH THE RETRIES THAT NEEDS.
 *
 * Lifted out of `app/api/daily-content/route.ts`, where it was pure logic sitting in a file
 * that cannot be imported by a test — so every claim about it was pinned by grepping the
 * route's own source, which catches a deletion and nothing else. The retry rules below are
 * exactly the sort of documented-but-unasserted contract CLAUDE.md says this suite exists for,
 * and two of the three were wrong at some point without anything noticing.
 */

/** Repair common model JSON mistakes before parsing. */
export function repairJson(s: string): string {
  let r = s;
  // Trailing commas before ] or } (most common model mistake)
  r = r.replace(/,(\s*[}\]])/g, '$1');
  // Unescaped newlines inside string values
  r = r.replace(/"([^"\\]*)(\n)([^"\\]*)"/g, (_, a, _nl, b) => `"${a}\\n${b}"`);
  // Strip any BOM or zero-width characters
  r = r.replace(/^\uFEFF/, '').replace(/[\u200B-\u200D\uFEFF]/g, '');
  return r;
}

/** Extract and parse the JSON object from a raw model response. Throws if unparseable. */
export function extractJson(raw: string): Record<string, unknown> {
  // Strip markdown fences if the model wrapped the output
  let cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  /**
   * Narrow to the first `{` … last `}`, WHEREVER the first one is.
   *
   * This tested `jStart > 0`, so it only fired when the model prepended something — and a
   * model that APPENDS instead ("…} Hope this helps!") starts its reply at index 0, skipped
   * the slice, and failed to parse over text sitting after a perfectly good object. Half the
   * cases the line exists for were the half it could not see. Pure JSON slices to itself, so
   * widening it costs nothing.
   */
  const jStart = cleaned.indexOf('{');
  const jEnd = cleaned.lastIndexOf('}');
  if (jStart >= 0 && jEnd > jStart) cleaned = cleaned.slice(jStart, jEnd + 1);
  try {
    return JSON.parse(cleaned);
  } catch {
    return JSON.parse(repairJson(cleaned)); // throws if still invalid
  }
}

export const JSON_ONLY_SYSTEM =
  'You output only valid JSON. No markdown, no code blocks, no explanations.';

/**
 * TWO BUDGETS, BECAUSE THE TWO FAILURES COST COMPLETELY DIFFERENT AMOUNTS.
 *
 * A reply that arrives and cannot be parsed has already been WRITTEN: tokens were spent, the
 * learner waited fifteen seconds, and asking again costs all of that a second time. A 503 has
 * produced nothing at all — it comes back in about a second, before the model has written a
 * word — so retrying it is nearly free.
 *
 * One counter for both meant the cheap failure was rationed by the expensive one. Measured in
 * production: `gemini-3.8-flash` on the free tier answers 503 often enough that two attempts a
 * second apart is a coin flip, and the whole point of a shared free-tier key is that somebody
 * opening the portfolio site sees a passage rather than an apology about capacity.
 *
 * The generation budget stays at 2 deliberately, and raising it is the tempting mistake: three
 * full generations at fifteen seconds each is forty-five, which is close enough to the route's
 * own timeout to turn a bad reply into a dead request.
 */
const MAX_GENERATIONS = 2;
const MAX_TRANSPORT_RETRIES = 2;

/**
 * How long to wait before asking a busy service the same question again.
 *
 * Multiplied by the attempt, so the second wait is longer than the first: congestion that has
 * not cleared in a second may clear in three, and hammering is what produced the 429s that
 * `GenerationError` has to explain. Two requests milliseconds apart are one request as far as
 * an overloaded model is concerned.
 */
const RETRY_PAUSE_MS = 1200;

export interface GenerateJsonResult {
  /** The first reply that parsed AND satisfied `isComplete`. */
  json: Record<string, unknown> | null;
  /** The last reply that merely parsed, so a caller can degrade rather than fail outright. */
  best: Record<string, unknown> | null;
}

/**
 * Run one generation prompt until it yields usable JSON, or until the budgets run out.
 *
 * Throws a `GenerationError` when the provider answered definitively (a bad key, a retired
 * model, a spent rate limit) and when a retried `server` failure never resolved — see the
 * comment on the rethrow below, which is the bug this whole shape exists to prevent.
 */
export async function generateJson(
  generator: Generator,
  prompt: string,
  isComplete: (j: Record<string, unknown>) => boolean,
  label: string,
  pause: (ms: number) => Promise<void> = ms => new Promise(r => setTimeout(r, ms)),
): Promise<GenerateJsonResult> {
  let json: Record<string, unknown> | null = null;
  let best: Record<string, unknown> | null = null;
  /**
   * THE LAST THING THE PROVIDER SAID, KEPT SO IT CAN BE SAID AGAIN.
   *
   * Retries exhausted, this returned two nulls — and the route then had nothing to report but
   * its own guess, which is that the reply could not be read. MEASURED IN PRODUCTION: Google
   * answered 503 twice (the model was overloaded), the loop swallowed both, and the learner
   * was told the model was not following the format srsly asks for. Their key was fine, the
   * model was fine, the prompt was fine.
   *
   * `server` is the kind that gets retried, so it is precisely the kind that reaches the end
   * of this loop still unreported. A retry that exhausts itself must hand back WHY, or
   * retrying converts a known failure into an unknown one.
   */
  let lastError: GenerationError | null = null;
  let generations = 0;
  let transportFails = 0;

  while (generations < MAX_GENERATIONS && transportFails <= MAX_TRANSPORT_RETRIES) {
    let raw = '';
    try {
      raw = await generator.complete(JSON_ONLY_SYSTEM, prompt, { json: true });
    } catch (err) {
      /**
       * A REJECTED KEY DOES NOT BECOME VALID ON THE SECOND ATTEMPT.
       *
       * Everything used to be caught and retried, which is right for a garbled reply and wrong
       * for every failure the provider has already answered definitively. A bad key was
       * retried and then reported as a bare 500, so a learner whose key was wrong waited
       * through several round trips to be told nothing. On a rate limit it is worse than
       * useless: retrying is the one thing a 429 asks you to stop doing.
       */
      if (err instanceof GenerationError && err.kind !== 'server') throw err;
      if (err instanceof GenerationError) lastError = err;
      transportFails++;
      console.error(
        `[${label}] transport failure ${transportFails}/${MAX_TRANSPORT_RETRIES} ` +
        `(${generator.name}): ${String(err)}`,
      );
      // Nothing was written, so this does NOT spend a generation — see the two budgets above.
      if (transportFails <= MAX_TRANSPORT_RETRIES) await pause(RETRY_PAUSE_MS * transportFails);
      continue;
    }

    generations++;
    try {
      const parsed = extractJson(raw);
      best = parsed;
      if (isComplete(parsed)) { json = parsed; break; } // parsed AND has required blocks
      /**
       * A SAMPLE OF THE REPLY, because "incomplete" on its own is undiagnosable.
       *
       * This said only that an attempt failed, so a model whose output the parser cannot use —
       * the exact failure a prompt tuned for one model hits on another — left no evidence of
       * WHAT it returned. Truncated hard: this is a log line, not a transcript.
       */
      console.error(
        `[${label}] generation ${generations}/${MAX_GENERATIONS} incomplete ` +
        `(${generator.name}) keys=[${Object.keys(parsed).join(',')}] sample=${JSON.stringify(raw.slice(0, 300))}`,
      );
    } catch (err) {
      /**
       * The sample belongs on THIS branch too, and for a long time it was only on the one
       * above — which is the likelier of the two, since a reply that is not JSON fails here
       * and never reaches a completeness check. The failure actually happening was the one
       * leaving no evidence, and `SyntaxError: Unexpected token` names the parser rather than
       * the reply. Instrumentation that misses the common path reads as proof it did not
       * happen.
       */
      console.error(
        `[${label}] generation ${generations}/${MAX_GENERATIONS} unparseable ` +
        `(${generator.name}): ${String(err)} chars=${raw.length} ` +
        `sample=${JSON.stringify(raw.slice(0, 300))}`,
      );
    }
  }

  /**
   * NOTHING PARSED AND THE PROVIDER SAID WHY, so say that rather than guessing.
   *
   * Only when `best` is null: a reply that parsed but came back incomplete is a real partial
   * answer, and degrading to it is the deliberate behaviour this function was built for. And
   * only for a `GenerationError` — a parse failure genuinely is "the reply could not be read",
   * which the route already says accurately, and rethrowing a SyntaxError would turn a useful
   * 502 into a bare 500.
   */
  if (json === null && best === null && lastError) throw lastError;
  return { json, best };
}
