import Anthropic from '@anthropic-ai/sdk';

/**
 * Who is generating, and — the part that matters for billing — WHOSE KEY paid for it.
 *
 * srsly is free to run and free to use. The only thing that costs anything is generating a
 * passage, so a learner who wants that brings their own Anthropic key: they pay Anthropic
 * directly, at roughly a cent a passage, and the operator pays nothing. Everything else in
 * the app — dictionaries, lemmatizers, FSRS, cloze blanks, EPUB, audio sync, achievements —
 * has never cost anything and still doesn't.
 *
 * `operatorPays` is the whole reason this is a type and not a bare client. It decides whether
 * a request spends one of the operator-funded AI credits, and getting it backwards either
 * meters someone for a generation they paid for themselves, or gives away tokens the operator
 * is footing the bill for.
 */

const MODEL = 'claude-haiku-4-5';

export interface Generator {
  /** For logs. NEVER contains the key. */
  readonly name: string;
  /** True when this generation is billed to the operator's key, and so must be metered. */
  readonly operatorPays: boolean;
  complete(system: string, prompt: string): Promise<string>;
}

function build(apiKey: string, operatorPays: boolean): Generator {
  const client = new Anthropic({ apiKey });
  return {
    name: `anthropic:${MODEL}${operatorPays ? '' : ' (user key)'}`,
    operatorPays,
    async complete(system, prompt) {
      const res = await client.messages.create({
        model: MODEL,
        max_tokens: 16000,
        system,
        messages: [{ role: 'user', content: prompt }],
      });
      return res.content[0]?.type === 'text' ? res.content[0].text.trim() : '';
    },
  };
}

/** A learner's own key. They are paying, so this generation is not metered. */
export function userKeyGenerator(apiKey: string): Generator {
  return build(apiKey, false);
}

/** The operator's key, from the environment. Metered. */
export function serverKeyGenerator(apiKey: string): Generator {
  return build(apiKey, true);
}

/**
 * An Anthropic key looks like `sk-ant-…`. Checked so an obviously wrong paste fails fast with
 * a clear message instead of costing a round-trip and returning an opaque 401.
 *
 * Deliberately a SHAPE check and nothing more — the only real validation is Anthropic's, and
 * trying to be cleverer here would mean rejecting key formats that do not exist yet.
 */
export function looksLikeAnthropicKey(k: string | undefined | null): boolean {
  return typeof k === 'string' && /^sk-ant-[A-Za-z0-9_-]{16,}$/.test(k.trim());
}

/**
 * The header a learner's key arrives on.
 *
 * A header, never a query string or a URL parameter: those are logged by proxies, CDNs and
 * Next's own request logging as a matter of course, and a logged credential is a leaked one.
 */
export const USER_KEY_HEADER = 'x-srsly-anthropic-key';
