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

function capFor(p: AiProvider, opts?: CompleteOptions): number {
  return Math.min(opts?.maxTokens ?? DEFAULT_MAX_TOKENS, p.maxOutputTokens);
}

/**
 * A failure a learner can act on.
 *
 * The three that actually happen are a rejected key, a retired model and a spent rate limit,
 * and they need three different actions — replace the key, tell the developer, wait. A single
 * "generation failed" sends everyone to the same dead end, and on a FREE TIER the rate limit
 * is not an edge case: it is the normal way the free option stops working for the afternoon.
 *
 * Carries no key, no header and no request body. This message reaches a log and a screen.
 */
export class GenerationError extends Error {
  constructor(
    readonly kind: 'auth' | 'model' | 'rate_limit' | 'server',
    readonly provider: ProviderId,
    message: string,
  ) {
    super(message);
    this.name = 'GenerationError';
  }
}

function classify(status: number, provider: AiProvider, detail: string): GenerationError {
  if (status === 401 || status === 403) {
    return new GenerationError('auth', provider.id,
      `${provider.name} rejected the key. Check it in Settings, or paste a fresh one.`);
  }
  if (status === 429) {
    return new GenerationError('rate_limit', provider.id,
      `${provider.name}'s free tier is rate-limited and you have hit the limit for now. Wait a few minutes and try again.`);
  }
  // A retired or renamed model is a 404 everywhere and a 400 on some gateways, and it is the
  // one failure the learner cannot fix — so it says whose problem it is.
  if (status === 404 || (status === 400 && /model/i.test(detail))) {
    return new GenerationError('model', provider.id,
      `${provider.name} no longer offers "${provider.model}". This needs updating in srsly — it is not something you can fix.`);
  }
  return new GenerationError('server', provider.id,
    `${provider.name} returned an error (${status}). Try again in a moment.`);
}

function anthropicGenerator(provider: AiProvider, apiKey: string, operatorPays: boolean): Generator {
  const client = new Anthropic({ apiKey });
  return {
    name: `anthropic:${provider.model}${operatorPays ? '' : ' (user key)'}`,
    operatorPays,
    provider: provider.id,
    async complete(system, prompt, opts) {
      try {
        const res = await client.messages.create({
          model: provider.model,
          max_tokens: capFor(provider, opts),
          system,
          messages: [{ role: 'user', content: prompt }],
        });
        return res.content[0]?.type === 'text' ? res.content[0].text.trim() : '';
      } catch (e) {
        const status = (e as { status?: number }).status ?? 0;
        throw classify(status, provider, String((e as Error)?.message ?? ''));
      }
    },
  };
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
    name: `${provider.id}:${provider.model}${operatorPays ? '' : ' (user key)'}`,
    operatorPays,
    provider: provider.id,
    async complete(system, prompt, opts) {
      const messages = system
        ? [{ role: 'system', content: system }, { role: 'user', content: prompt }]
        : [{ role: 'user', content: prompt }];

      let res: Response;
      try {
        res = await fetch(`${provider.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            // Bearer, never a query parameter: a key in a URL is logged by every hop.
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: provider.model,
            max_tokens: capFor(provider, opts),
            messages,
          }),
        });
      } catch {
        // DNS, TLS, timeout — the request never reached them, so it is not their error to
        // report and definitely not a key problem.
        throw new GenerationError('server', provider.id,
          `Could not reach ${provider.name}. Check your connection and try again.`);
      }

      if (!res.ok) {
        // Read the body for the model-name check, and never put it in the thrown message —
        // a provider error body can echo request fields back.
        const detail = await res.text().catch(() => '');
        throw classify(res.status, provider, detail);
      }

      const json = await res.json().catch(() => null) as
        { choices?: { message?: { content?: string } }[] } | null;
      return json?.choices?.[0]?.message?.content?.trim() ?? '';
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
