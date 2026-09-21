import Anthropic from '@anthropic-ai/sdk';
import {
  providerOrDefault, providerForKey, looksLikeAnyKey, type AiProvider, type ProviderId,
} from '@/lib/aiProviders';

/**
 * Who is generating, and — the part that matters for billing — WHOSE KEY paid for it.
 *
 * srsly is free to run and free to use. The only thing that costs anything is generating a
 * passage, so a learner who wants that brings their own key: with Anthropic they pay about a
 * cent a passage, with Google or Groq they pay nothing because both have a real free tier,
 * and the operator pays nothing either way. Everything else in the app — dictionaries,
 * lemmatizers, FSRS, cloze blanks, EPUB, audio sync, achievements — has never cost anything
 * and still doesn't.
 *
 * `operatorPays` is the whole reason this is a type and not a bare client. It decides whether
 * a request spends one of the operator-funded AI credits, and getting it backwards either
 * meters someone for a generation they paid for themselves, or gives away tokens the operator
 * is footing the bill for. **It is a fact about WHOSE KEY, never about which provider** — a
 * free-tier Gemini key is still the learner's own key, and metering it would ration somebody
 * on a budget that costs nobody anything.
 *
 * ── TWO TRANSPORTS, ONE INTERFACE ────────────────────────────────────────────
 *
 * `Generator.complete()` was already provider-agnostic — a system prompt in, a string out —
 * which is why adding two providers changed the routes almost not at all. Anthropic goes
 * through its own SDK; Google and Groq both expose an OpenAI-compatible chat-completions
 * endpoint, so one `fetch` serves both, selected by `baseUrl` being present on the provider.
 *
 * **HAND-ROLLED RATHER THAN THE `openai` SDK, AND SAYING SO BECAUSE THIS FILE'S OWN RULE
 * SAYS TO.** CLAUDE.md prefers a well-maintained library and asks for the exception to be
 * stated. This is one endpoint, one request shape, no streaming, no tool use and no
 * pagination — about twenty lines of `fetch`. A whole SDK, its transitive dependencies and
 * its own release cadence is not earned by that, and the cost of being wrong is a JSON body
 * that is trivial to read. Same judgement as `lib/fsrs.ts`.
 *
 * ── `maxTokens` IS A PARAMETER, AND THAT IS WHY THE OTHER ROUTES CAN USE THIS ─
 *
 * It used to be hardcoded at 16,000, which is right for a passage and absurd for three
 * example sentences — so `missed-review` and `grade-response` each built a bare `Anthropic`
 * client to set their own cap, and in doing so pinned themselves to one provider. A learner
 * on a Gemini key would have had their glosses and their grading sent to Anthropic with a
 * Google key attached, failing every time. Making the cap an argument is what let all three
 * routes share one path and one billing answer.
 */

export interface CompleteOptions {
  /** Upper bound on the reply. Clamped to what the provider will actually produce. */
  readonly maxTokens?: number;
  /**
   * Ask the provider to guarantee valid JSON rather than merely requesting it in words.
   *
   * EVERY CALLER IN THIS APP WANTS JSON, and until now the only thing saying so was a system
   * prompt — which Haiku honours and a smaller model treats as a suggestion. The
   * OpenAI-compatible endpoints accept `response_format: { type: 'json_object' }` and will
   * then not emit anything else: no prose preamble, no markdown fence, no trailing apology.
   * That is the difference between a parser that usually works and one that does.
   *
   * OPT-IN RATHER THAN ALWAYS-ON, because `complete()` is a general call and a future caller
   * wanting prose should not have to know to switch this off. Anthropic ignores it — its
   * SDK has no such field, and Haiku did not need one.
   */
  readonly json?: boolean;
}

export interface Generator {
  /** For logs. NEVER contains the key. */
  readonly name: string;
  /** True when this generation is billed to the operator's key, and so must be metered. */
  readonly operatorPays: boolean;
  /** Which service this will reach. For error copy, never for a billing decision. */
  readonly provider: ProviderId;
  complete(system: string, prompt: string, opts?: CompleteOptions): Promise<string>;
}

/** What a route asks for when it says nothing: a whole passage's worth. */
const DEFAULT_MAX_TOKENS = 16000;

/**
 * The model to ask for, overridable per provider without a deploy.
 *
 * `SRSLY_MODEL_GEMINI`, `SRSLY_MODEL_GROQ`, `SRSLY_MODEL_ANTHROPIC`.
 *
 * MODEL IDS ARE THE PART OF THE TABLE WITH A SHELF LIFE, and a stale one is total: every
 * generation 404s until someone edits a source file and redeploys. That happened —
 * `gemini-2.5-flash` was pinned and a learner's perfectly good key came back "model not
 * found" — and the error message said in as many words that it was "not something you can
 * fix", which was only true because there was no way to fix it. Now there is one, and it is
 * an environment variable rather than a setting: picking a model is operating the app, not
 * using it, and offering a learner a free-text model field is offering them a new way to
 * break generation.
 *
 * Server-only on purpose. This never runs in the browser, which is why it lives here and not
 * in `lib/aiProviders.ts` — that module is imported by the client, where `process.env` holds
 * only `NEXT_PUBLIC_*` and a lookup like this would silently read undefined.
 */
function modelFor(p: AiProvider): string {
  const override = process.env[`SRSLY_MODEL_${p.id.toUpperCase()}`]?.trim();
  return override || p.model;
}

function capFor(p: AiProvider, opts?: CompleteOptions): number {
  return Math.min(opts?.maxTokens ?? DEFAULT_MAX_TOKENS, p.maxOutputTokens);
}

/**
 * A failure a learner can act on.
 *
 * The ones that actually happen are a rejected key, a retired model, a spent rate limit and a
 * reply cut off at the model's output cap, and they need four different actions — replace the
 * key, tell the developer, wait, use a bigger model. A single "generation failed" sends
 * everyone to the same dead end, and on a FREE TIER the rate limit is not an edge case: it is
 * the normal way the free option stops working for the afternoon.
 *
 * `truncated` was the fourth and was added late, which is the interesting one: it is not an
 * error the provider reports AT ALL. The request succeeds, the status is 200, and the only
 * sign is `finish_reason` on a reply that is otherwise indistinguishable from a model writing
 * badly — so it was being reported as a prompt problem for as long as the field went unread.
 *
 * Carries no key, no header and no request body. This message reaches a log and a screen.
 */
export class GenerationError extends Error {
  constructor(
    readonly kind: 'auth' | 'model' | 'rate_limit' | 'truncated' | 'server',
    readonly provider: ProviderId,
    message: string,
  ) {
    super(message);
    this.name = 'GenerationError';
  }
}

/**
 * WHICH OF THE THREE THINGS WENT WRONG, AND WHY THE STATUS CODE IS NOT ENOUGH.
 *
 * **Google answers a rejected key with 400, not 401.** Measured against the live endpoint:
 * a bad `AIza…` key returns `400 INVALID_ARGUMENT "Please pass a valid API key"`, and a bad
 * `AQ.…` key returns `400 INVALID_ARGUMENT "Invalid Auth key."`. Reading the status alone
 * filed both under "server" and told the learner to *try again in a moment* — advice that can
 * never work, for the one failure they can actually fix. That is precisely the "three failures
 * need three different actions" mistake this function exists to prevent, so it now reads the
 * message where the status is ambiguous.
 *
 * AUTH IS TESTED BEFORE MODEL because a request with a bad key never gets far enough to be
 * judged against a model name: auth fails first, so a 400 mentioning both is an auth problem.
 *
 * The detail is used to CLASSIFY and is never copied into the thrown message — a provider's
 * error body can echo the request back, and this message reaches a log and a screen.
 */
function classify(
  status: number, provider: AiProvider, detail: string, operatorPays = false,
): GenerationError {
  const auth = () => new GenerationError('auth', provider.id,
    `${provider.name} rejected the key. Check it in Settings, or paste a fresh one.`);

  if (status === 401 || status === 403) return auth();
  /**
   * A RATE LIMIT NEEDS DIFFERENT ADVICE DEPENDING ON WHOSE KEY HIT IT.
   *
   * Both cases came out as "wait a few minutes and try again", and for a visitor on srsly's
   * SHARED key that is close to useless: the quota is being spent by everybody else opening the
   * portfolio site, so waiting is a guess, and the thing that actually fixes it — a free key of
   * their own, which is not rate-limited by anyone else's traffic — was never mentioned. On the
   * learner's OWN key the reverse is true: they already did the thing, and telling them to
   * connect a key they have connected is advice they cannot take. `lib/server/aiGate.ts` makes
   * exactly this mistake elsewhere and this file records it; it is the same shape.
   *
   * `operatorPays` is the same flag that decides metering, which is the point — whose key it is
   * is one fact, and both answers read it.
   *
   * IT DOES NOT SAY "daily". A provider 429 is usually a per-MINUTE throttle, and free tiers
   * carry both; nothing in the response reliably separates them. Naming the wrong one sends
   * somebody away until tomorrow over a sixty-second wait. srsly's own daily budget is a
   * different thing entirely, refused as a 402 before any request is made — see
   * `meterOrRefuse`.
   */
  if (status === 429) {
    return new GenerationError('rate_limit', provider.id, operatorPays
      ? `srsly's shared key has hit ${provider.name}'s rate limit — it is free, so everyone using the site shares one quota. Connect your own free key in Settings and this stops happening; Google and Groq both give one out free.`
      : `${provider.name} is rate-limiting your key — free tiers cap how often you can generate. Wait a minute or two and try again.`);
  }
  // A 400 is whatever the provider decided to put there, so it is the one status that has to
  // be read rather than mapped.
  if (status === 400 && /\b(api[\s_-]?key|auth|credential|unauthenticated|permission)\b/i.test(detail)) {
    return auth();
  }
  // A retired or renamed model is a 404 everywhere and a 400 on some gateways, and it is the
  // one failure the learner cannot fix — so it says whose problem it is.
  if (status === 404 || (status === 400 && /model/i.test(detail))) {
    return new GenerationError('model', provider.id,
      `${provider.name} does not offer "${modelFor(provider)}". Set SRSLY_MODEL_${provider.id.toUpperCase()} to a model your key can use, or report this — it is not something you can fix from Settings.`);
  }
  /**
   * BUSY IS NOT BROKEN, AND ON A FREE TIER IT IS THE COMMONEST FAILURE OF ALL.
   *
   * Measured in production: a learner's working key on a working model returned **503 twice in
   * a row**, which is Google saying the model is overloaded — nothing to do with the key, the
   * request or the prompt. A bare "returned an error (503)" is technically true and tells them
   * nothing about whose problem it is or whether waiting helps, and the number is the only part
   * of it with any content.
   *
   * It names the model because that is the actionable half for whoever operates the app: a
   * newly-released or preview model is far likelier to be capacity-constrained than a settled
   * one, and `SRSLY_MODEL_*` is how that gets swapped without a deploy.
   */
  if (status === 502 || status === 503 || status === 504) {
    return new GenerationError('server', provider.id,
      `${provider.name} is busy right now — "${modelFor(provider)}" returned ${status}, which means overloaded rather than broken. `
      + 'Wait a minute and try again, or switch provider in Settings.');
  }
  return new GenerationError('server', provider.id,
    `${provider.name} returned an error (${status}). Try again in a moment.`);
}

function anthropicGenerator(provider: AiProvider, apiKey: string, operatorPays: boolean): Generator {
  const client = new Anthropic({ apiKey });
  return {
    name: `anthropic:${modelFor(provider)}${operatorPays ? '' : ' (user key)'}`,
    operatorPays,
    provider: provider.id,
    async complete(system, prompt, opts) {
      try {
        const res = await client.messages.create({
          model: modelFor(provider),
          max_tokens: capFor(provider, opts),
          system,
          messages: [{ role: 'user', content: prompt }],
        });
        return res.content[0]?.type === 'text' ? res.content[0].text.trim() : '';
      } catch (e) {
        const status = (e as { status?: number }).status ?? 0;
        throw classify(status, provider, String((e as Error)?.message ?? ''), operatorPays);
      }
    },
  };
}

/**
 * ASK THE PROVIDER WHAT IT ACTUALLY OFFERS, AND PUT IT WHERE SOMEBODY WILL SEE IT.
 *
 * A pinned model id is the one part of `lib/aiProviders.ts` with a shelf life, and a stale one
 * is a total outage rather than a degradation. It has now happened twice — `gemini-2.5-flash`
 * retired, then `gemini-2.0-flash` retired behind it — and both times the only way forward was
 * to guess a name, redeploy, and read the error again. The model that finally worked was found
 * by ACCIDENT, because it happened to answer 503 (busy) instead of 404 (absent).
 *
 * Both providers implement the OpenAI `GET /models`, so the answer is one request away on a
 * path that has already failed completely. It costs a round trip on a request that is dead
 * anyway, and it is the difference between an error that ends the conversation and one that
 * finishes it.
 *
 * ── THREE THINGS IT DELIBERATELY DOES NOT DO ─────────────────────────────────
 *
 * It never THROWS: this runs inside a failure path, and a failure here must not replace the
 * real error — the one saying a model is missing is strictly more useful than one saying the
 * model list could not be fetched.
 *
 * It never picks a model automatically. Substituting a model the learner did not choose is a
 * silent change to what generation costs and how it reads, which is the class of fallback this
 * codebase refuses everywhere. It reports; a human sets `SRSLY_MODEL_*`.
 *
 * And it SHAPE-CHECKS every id before showing it. These names arrive from a third party and
 * end up in a log line and on a screen, so anything that is not plausibly a model id is
 * dropped rather than echoed. `models/` prefixes are stripped because that is the form
 * `modelFor` emits and the form the chat endpoint takes.
 */
const MODEL_ID = /^[A-Za-z0-9](?:[A-Za-z0-9._:-]{0,62}[A-Za-z0-9])?$/;

async function reportAvailableModels(
  provider: AiProvider, apiKey: string, err: GenerationError,
): Promise<void> {
  try {
    const res = await fetch(`${provider.baseUrl}/models`, {
      headers: { authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return;
    const body = await res.json() as { data?: { id?: unknown }[] };
    const ids = (body?.data ?? [])
      .map(m => (typeof m?.id === 'string' ? m.id.replace(/^models\//, '') : ''))
      .filter(id => MODEL_ID.test(id));
    if (ids.length === 0) return;

    console.error(`[generator] ${provider.id} offers this key: ${ids.join(', ')}`);

    // Names near the one that was asked for, since a pinned id going stale is almost always a
    // version bump rather than a change of family.
    const family = modelFor(provider).split(/[-.]/)[0];
    const near = ids.filter(id => id.startsWith(family));
    const suggest = (near.length > 0 ? near : ids).slice(0, 4);
    /**
     * Appended rather than rebuilt, so this cannot change what KIND of failure was reported or
     * lose the sentence naming the env var. `Error.message` is an ordinary writable property.
     */
    err.message += ` Your key can use: ${suggest.join(', ')}.`;
  } catch {
    // Best effort, by design. See above.
  }
}

/**
 * Google and Groq, through the chat-completions shape they both implement.
 *
 * The system prompt is a `system` MESSAGE rather than a top-level field, which is the one
 * real difference from the Anthropic call above and is what the OpenAI shape expects. An
 * empty `system` is omitted entirely rather than sent as an empty message, because a blank
 * system turn is a real turn and some models answer it.
 */
function openAiCompatGenerator(provider: AiProvider, apiKey: string, operatorPays: boolean): Generator {
  return {
    name: `${provider.id}:${modelFor(provider)}${operatorPays ? '' : ' (user key)'}`,
    operatorPays,
    provider: provider.id,
    async complete(system, prompt, opts) {
      const messages = system
        ? [{ role: 'system', content: system }, { role: 'user', content: prompt }]
        : [{ role: 'user', content: prompt }];

      const send = async (withJsonMode: boolean): Promise<Response> => {
        try {
          return await fetch(`${provider.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              // Bearer, never a query parameter: a key in a URL is logged by every hop.
              authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: modelFor(provider),
              max_tokens: capFor(provider, opts),
              messages,
              // Only when asked, and only here: the field is part of the OpenAI shape, which
              // is what these two implement. See CompleteOptions.json.
              ...(withJsonMode ? { response_format: { type: 'json_object' } } : {}),
            }),
          });
        } catch {
          // DNS, TLS, timeout — the request never reached them, so it is not their error to
          // report and definitely not a key problem.
          throw new GenerationError('server', provider.id,
            `Could not reach ${provider.name}. Check your connection and try again.`);
        }
      };

      const wantsJson = !!opts?.json;
      let res = await send(wantsJson);

      /**
       * ONE RETRY WITHOUT JSON MODE, AND ONLY FOR THE ERROR THAT NAMES IT.
       *
       * `response_format` is part of the OpenAI shape and both providers implement that shape,
       * but "implements the shape" is not the same as "accepts every field of it", and which
       * fields a given model accepts is not something this codebase can verify from here.
       * Without this, a provider that rejects the field would fail EVERY generation — strictly
       * worse than the unreliable-JSON problem the field was added to solve.
       *
       * Narrow on purpose: a 400 that explicitly names the parameter, one retry, and a log
       * line so it is visible rather than silently absorbed. Any other failure is reported as
       * itself. This is a transport detail being negotiated, not content being substituted —
       * the learner gets the same passage either way, which is why it is a retry and not a
       * fallback of the kind this codebase refuses.
       */
      if (wantsJson && res.status === 400) {
        const detail = await res.clone().text().catch(() => '');
        if (/response_format|json_object/i.test(detail)) {
          console.warn(`[generator] ${provider.id} rejected JSON mode; retrying without it`);
          res = await send(false);
        }
      }

      if (!res.ok) {
        // Read the body for the model-name check, and never put it in the thrown message —
        // a provider error body can echo request fields back.
        const detail = await res.text().catch(() => '');
        const err = classify(res.status, provider, detail, operatorPays);
        /**
         * "NOT SOMETHING YOU CAN FIX" IS ONLY TRUE IF NOBODY SAYS WHAT WOULD FIX IT.
         *
         * A stale model id is a TOTAL outage — every generation 404s — and the message for it
         * has twice now sent somebody off to guess at names one redeploy at a time.
         * `gemini-2.5-flash` was pinned and retired; `gemini-2.0-flash` replaced it and turned
         * out to be retired as well; the one model that worked was found by accident, because
         * it answered 503 instead of 404.
         *
         * Both providers expose the OpenAI `GET /models`, so the list is one request away on a
         * path that has already failed completely. It is BEST-EFFORT — a failure here must
         * never replace the real error, which is the one that says a model is missing.
         */
        if (err.kind === 'model') await reportAvailableModels(provider, apiKey, err);
        throw err;
      }

      const json = await res.json().catch(() => null) as {
        choices?: { message?: { content?: string }; finish_reason?: string }[];
        usage?: { completion_tokens?: number };
      } | null;
      const choice = json?.choices?.[0];
      const content = choice?.message?.content?.trim() ?? '';
      // An enum, not prose — but it arrives from the provider, so it is shape-checked before
      // it is allowed anywhere near a message or a log line.
      const finish = /^[a-z_]{1,32}$/i.test(choice?.finish_reason ?? '') ? choice!.finish_reason! : '';

      /**
       * ONE LINE SAYING WHAT CAME BACK, BECAUSE THE ROUTE ABOVE CANNOT SEE ANY OF THIS.
       *
       * A 200 with a reply the parser cannot use is the hardest failure in this pipeline to
       * diagnose, and until now the only evidence of it was a `SyntaxError` several layers up.
       * These three numbers separate the cases outright: a truncated reply has
       * `finish=length`, a filtered one has no content, and a model writing prose instead of
       * JSON has plenty of both. Carries no key, no prompt and no reply text.
       */
      console.info(
        `[generator] ${provider.id}/${modelFor(provider)} finish=${finish || 'unknown'} ` +
        `chars=${content.length} out_tokens=${json?.usage?.completion_tokens ?? '?'} cap=${capFor(provider, opts)}`,
      );

      /**
       * A REPLY THAT STOPS AT THE CAP IS NOT A REPLY, AND IT IS THE ONE FAILURE THAT LOOKS
       * EXACTLY LIKE A BAD PROMPT.
       *
       * The route asks for JSON, so a reply cut off at the token limit is invalid JSON with an
       * unterminated string — which arrives at `extractJson` as a parse error and is reported
       * as "the model is not following the format". That sends whoever is debugging it to
       * rewrite a prompt that was fine, while the actual problem is a number in
       * `lib/aiProviders.ts`. CLAUDE.md predicted this exact confusion when the per-provider
       * clamp went in; `finish_reason` is the field that settles it, and it was being dropped.
       *
       * RETRYING IS POINTLESS HERE, which is why it is a `GenerationError` rather than an
       * empty string: the same prompt against the same cap truncates again, three times, and
       * then reports the wrong cause anyway. The kinds exist so a failure names the action
       * that fixes it, and this one's action is a bigger model.
       */
      if (finish === 'length') {
        throw new GenerationError('truncated', provider.id,
          `${provider.name} hit its output limit before finishing the reply. `
          + `"${modelFor(provider)}" can only write ${provider.maxOutputTokens} tokens at once, which is not enough for this. `
          + `Set SRSLY_MODEL_${provider.id.toUpperCase()} to a model with a larger output limit, or use another provider.`);
      }

      /**
       * NO CONTENT AT ALL IS A FAILURE, NOT AN EMPTY PASSAGE.
       *
       * This returned `''`, which every caller then handed to a JSON parser — so a reply
       * withheld by a safety filter (Google returns a choice with no content rather than an
       * error) surfaced as a syntax error about position 0. Same family as the loading state
       * rendered as an answer: a value meaning "nothing came back" was being used as a value
       * meaning "it came back empty".
       */
      if (!content) {
        throw new GenerationError('server', provider.id,
          `${provider.name} returned an empty reply${finish ? ` (${finish})` : ''}. `
          + 'This is usually temporary — try again, or try another provider in Settings.');
      }
      return content;
    },
  };
}

/**
 * The client for one request, built from the provider the key belongs to.
 *
 * Per request, never at module scope: a module-scoped client is fixed at import time and
 * would bill every learner to whichever key happened to be present when the process started.
 */
export function generatorForProvider(
  provider: ProviderId, apiKey: string, operatorPays: boolean,
): Generator {
  const p = providerOrDefault(provider);
  return p.baseUrl
    ? openAiCompatGenerator(p, apiKey, operatorPays)
    : anthropicGenerator(p, apiKey, operatorPays);
}

/** A learner's own key. They are paying — or paying nothing — so this is not metered. */
export function userKeyGenerator(apiKey: string, provider?: ProviderId): Generator {
  return generatorForProvider(provider ?? providerForKey(apiKey)?.id ?? 'anthropic', apiKey, false);
}

/** The operator's key, from the environment. Metered. */
export function serverKeyGenerator(apiKey: string, provider?: ProviderId): Generator {
  return generatorForProvider(provider ?? providerForKey(apiKey)?.id ?? 'anthropic', apiKey, true);
}

/**
 * An Anthropic key looks like `sk-ant-…`.
 *
 * Kept as its own named export because the ANTHROPIC shape is still what the operator's
 * environment key is expected to have, and because it reads better at the call site than
 * `looksLikeKeyFor('anthropic', k)`. The pattern itself lives in lib/aiProviders.ts with the
 * other two, so the client's check and the server's cannot drift apart.
 */
export function looksLikeAnthropicKey(k: string | undefined | null): boolean {
  return providerForKey(k)?.id === 'anthropic';
}

/** Any provider's key shape — what decides that a request carries a learner's own credential. */
export { looksLikeAnyKey };

/**
 * The headers a learner's key and provider arrive on.
 *
 * A header, never a query string or a URL parameter: those are logged by proxies, CDNs and
 * Next's own request logging as a matter of course, and a logged credential is a leaked one.
 *
 * `USER_KEY_HEADER` keeps its historical name for the same reason the localStorage entry
 * does — it is sent by every already-deployed client, and renaming it would make every
 * learner's connected key invisible to the server the moment the two halves were a version
 * apart.
 */
export const USER_KEY_HEADER = 'x-srsly-anthropic-key';
export const PROVIDER_HEADER = 'x-srsly-ai-provider';
