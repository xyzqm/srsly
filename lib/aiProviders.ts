/**
 * WHICH SERVICE WRITES THE PASSAGE, AND WHY THERE IS NOW MORE THAN ONE.
 *
 * srsly has always been free to run and free to use, with exactly one exception: having a new
 * passage WRITTEN costs money, so that feature is bring-your-own-key. The learner pays the
 * provider directly and the operator pays nothing. That is honest, and it is still a paywall
 * wearing a different hat — "free, as long as you have a credit card at Anthropic" is not free
 * to someone who does not.
 *
 * **GOOGLE AND GROQ BOTH HAVE A GENUINELY FREE TIER**, rate-limited rather than trial-limited.
 * A learner signs up, copies a key, pastes it here, and generates at zero cost to themselves
 * and zero cost to the operator. That is the closest thing to "the app is fully free" that
 * does not involve somebody quietly paying for strangers' tokens — so the provider is now a
 * CHOICE, and the free ones are named as free in the picker.
 *
 * ── ONE TABLE, READ BY BOTH HALVES ───────────────────────────────────────────
 *
 * This module is imported by `lib/userApiKey.ts` (client) and `lib/server/generator.ts`
 * (server), and holds no secrets, no SDK and no environment access — it is constants and
 * regexes. That is deliberate: the shape check the Settings field uses to reject a bad paste
 * and the one the server uses to decide whose money it is were ALREADY two copies of one
 * regex in two files, which is exactly the drift this codebase keeps finding. Now there is
 * one.
 *
 * ── THE MODELS ARE PINNED, AND THEY WILL GO STALE ────────────────────────────
 *
 * Model ids are the part of this table with a shelf life: providers rename and retire them.
 * They live here, in one place, so a rename is one line rather than a search — and
 * `lib/server/generator.ts` surfaces a model-not-found as its own message rather than as a
 * generic failure, because "that model no longer exists" and "your key is wrong" are
 * different problems and a learner cannot tell them apart from a 400.
 *
 * ── WHAT IS NOT CLAIMED ──────────────────────────────────────────────────────
 *
 * A free tier is a RATE LIMIT, not an unlimited supply, and the copy says so. The prompt is
 * tuned for Haiku; a weaker model will sometimes produce a worse passage, and CLAUDE.md
 * records the precedent — `qwen2.5:3b` returned the literal placeholder `WORDS` as a title
 * two times in five where Haiku never did, which is what hardened that instruction. A second
 * provider is a second chance for the prompt to be wrong, so the free ones are offered
 * plainly rather than recommended over the paid one.
 */

export type ProviderId = 'anthropic' | 'gemini' | 'groq';

export interface AiProvider {
  readonly id: ProviderId;
  /** As the learner would name it. */
  readonly name: string;
  /** The model to ask for. Pinned; see the note above about shelf life. */
  readonly model: string;
  /**
   * The largest completion this model will produce, which is NOT the same number for all
   * three and is not a detail. `daily-content` asks for 16,000 because a passage plus its
   * fill items plus a conversation is a long JSON document; a provider that silently caps
   * below what the prompt needs returns TRUNCATED JSON, which arrives as an unparseable reply
   * rather than as "too long". `generator.ts` clamps to this, so the failure is at worst a
   * short passage and never a confusing 502 from a limit nobody declared.
   */
  readonly maxOutputTokens: number;
  /**
   * True when a learner can generate without paying anything — a rate-limited free tier
   * rather than a trial credit that runs out. This is what the picker badges, so it must
   * mean "you will not be charged", not "there is a free trial".
   */
  readonly freeTier: boolean;
  /**
   * OpenAI-compatible chat-completions base URL. Absent for Anthropic, which is called
   * through its own SDK. The presence of this field is what selects the transport.
   */
  readonly baseUrl?: string;
  /** Shape check for a pasted key — see `looksLikeKeyFor`. */
  readonly keyPattern: RegExp;
  /** What an empty field shows. */
  readonly keyPlaceholder: string;
  /**
   * Every prefix this provider's keys are known to start with, commonest first.
   *
   * A LIST RATHER THAN A STRING, because a provider can have more than one live format at
   * once. Google issues both `AIza…` and the newer `AQ.…`, and with a single prefix the mask
   * showed `AIza…7f3a` for a key that begins `AQ.` — a display prefix the key does not have,
   * which is worse than no mask: the whole job of a mask is telling two keys apart.
   *
   * The FIRST entry is the fallback for a key matching none of them, so it should be the one
   * most learners will hold.
   */
  readonly keyPrefixes: readonly string[];
  /** Where to get a key, and what the page is called when you get there. */
  readonly consoleUrl: string;
  readonly consoleLabel: string;
  /** One line under the name in the picker. */
  readonly blurb: string;
}

/**
 * ANTHROPIC IS FIRST AND STAYS THE DEFAULT, which is a quality judgement rather than inertia.
 *
 * Every prompt in this app was written and measured against Haiku; the other two are offered
 * because they cost nothing, not because they are better. Someone who already has an Anthropic
 * key should not be nudged off it, and someone who has none should be able to see, in one
 * glance, that two of the three will never charge them.
 */
export const AI_PROVIDERS: readonly AiProvider[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    model: 'claude-haiku-4-5-20251001',
    maxOutputTokens: 32000,
    freeTier: false,
    keyPattern: /^sk-ant-[A-Za-z0-9_-]{16,}$/,
    keyPlaceholder: 'sk-ant-…',
    keyPrefixes: ['sk-ant-'],
    consoleUrl: 'https://console.anthropic.com/settings/keys',
    consoleLabel: 'console.anthropic.com → API keys',
    blurb: 'Claude Haiku. About a cent a passage, billed to you. What every prompt here was written against.',
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    /**
     * THIS PIN HAS GONE STALE TWICE, AND BOTH TIMES IT WAS A TOTAL OUTAGE.
     *
     * `gemini-2.5-flash` was pinned and 404'd. It was replaced with `gemini-2.0-flash` on the
     * reasoning that it was "the longest-established free-tier Flash model and so the likeliest
     * to answer for everyone" — which sounded careful and was a GUESS, made without asking a
     * live key anything. It 404'd too. Being long-established is not evidence of being current;
     * past a retirement date it is evidence of the opposite.
     *
     * What is measured, against one live `AQ.` key in September 2026:
     *   gemini-2.5-flash → 404   (absent)
     *   gemini-2.0-flash → 404   (absent)
     *   gemini-3.8-flash → 503   (PRESENT — busy, which only a real model can be)
     *
     * A 503 is the useful signal there: Google checks auth first and the model next, so being
     * told a model is overloaded proves it exists for that key. That is one key and one moment,
     * so this is the best-evidenced name rather than a verified one — and the reason it no
     * longer has to be guessed is `reportAvailableModels` in lib/server/generator.ts, which
     * asks the provider for the list when a model comes back missing and puts it in the error.
     * The next time this goes stale it should say so itself.
     *
     * `SRSLY_MODEL_GEMINI` overrides it without a deploy.
     */
    model: 'gemini-3.8-flash',
    /**
     * 8,192 is the conservative Flash ceiling and it is well clear of what a passage needs. The
     * route asks for 16,000 as an upper BOUND, not a requirement: for es/fr/ja the model
     * writes plain prose and for zh it writes pipe-segmented text, so a title, its sentences,
     * the fill items and a conversation land in the low thousands even at C2.
     *
     * Kept at the lower figure through the model change deliberately. Asking for MORE than a
     * model will produce is an error on some gateways and a silent truncation on others, and
     * `finish_reason` now reports a truncation as one — so the cost of this being low is
     * nothing, while the cost of it being optimistic is a failure that reads as a bad prompt.
     */
    maxOutputTokens: 8192,
    freeTier: true,
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    /**
     * TWO LIVE FORMATS, AND THE OLD ONE IS NOT DROPPED.
     *
     * Google issues newer keys beginning `AQ.` where they used to begin `AIza`. Both are
     * accepted: replacing the pattern rather than widening it would have silently
     * disconnected every learner already holding an `AIza` key — they would open Settings to
     * find their working key rejected as malformed, with no way to tell why.
     *
     * The `AQ.` arm is deliberately LOOSER than the `AIza` one, because the exact length and
     * alphabet of that format are not something this codebase can verify. That is an
     * acceptable trade here and it is worth being precise about WHY: a shape check does two
     * jobs, and only one of them is weakened. It still cannot collide with `sk-ant-` or
     * `gsk_`, so the security property — never send a key to a company whose format it does
     * not have — is untouched, and `tests/aiProviders.test.ts` asserts that directly. What is
     * weakened is the typo check, so a malformed `AQ.` key reaches Google and comes back as a
     * 401, which `GenerationError` already reports as "Google Gemini rejected the key".
     *
     * THE LENGTH FLOOR IS LOW ON PURPOSE, for the same reason. The two ways to be wrong are
     * not symmetric: too strict rejects a real key and reads as the app being broken — which
     * is the bug that prompted this — while too loose costs one round trip and returns a
     * message naming exactly what happened. Guessing at an unverified format, the floor
     * belongs on the forgiving side. Tighten both the moment the real format is known.
     */
    keyPattern: /^(?:AIza[A-Za-z0-9_-]{30,}|AQ\.[A-Za-z0-9_.-]{10,})$/,
    keyPlaceholder: 'AQ.… or AIza…',
    keyPrefixes: ['AQ.', 'AIza'],
    consoleUrl: 'https://aistudio.google.com/apikey',
    consoleLabel: 'aistudio.google.com → Get API key',
    blurb: 'Gemini Flash. Free tier, rate-limited rather than metered — no card, no bill.',
  },
  {
    id: 'groq',
    name: 'Groq',
    /**
     * THE THIRD STALE PIN, AND THE FIRST ONE THAT WAS ANSWERED RATHER THAN GUESSED.
     *
     * `llama-3.3-70b-versatile` was announced deprecated 2026-06-17 and shut down 2026-08-16,
     * so every Groq generation returned `model_not_found`. Gemini's two outages above were each
     * resolved by picking a plausible name and redeploying; this one was resolved by asking the
     * key, because `reportAvailableModels` now does that on exactly this failure.
     *
     * What one live `gsk_` key answered, 2026-09-21 — all thirteen, and the point is how few of
     * them can write anything:
     *
     *   openai/gpt-oss-120b, openai/gpt-oss-20b, qwen/qwen3.8-27b   ← can write prose
     *   allam-2-7b                                  small Arabic/English chat
     *   openai/gpt-oss-safeguard-20b                a safety classifier
     *   meta-llama/llama-prompt-guard-2-22m / -86m  prompt-injection classifiers
     *   whisper-large-v3 / -turbo                   speech → text
     *   canopylabs/orpheus-v1-english / -arabic-saudi   text → speech
     *   groq/compound, groq/compound-mini           agentic runners, decommissioned 2026-09-21
     *
     * `openai/gpt-oss-120b` is Groq's OWN named migration target for the model that retired,
     * it is the largest general model on the list, and it implements JSON object mode, which
     * `response_format` in `lib/server/generator.ts` asks for. `qwen/qwen3.8-27b` is the named
     * alternative and `SRSLY_MODEL_GROQ` reaches it without a deploy; `openai/gpt-oss-20b` is
     * the migration target for the SMALLER retired model, so it is a downgrade rather than a
     * sibling — a weaker model is a good prompt linter and a bad default.
     *
     * ── AND THE LIST IS WHY THE PIN COULD BE CHOSEN AT ALL ──
     *
     * Eight of those thirteen names carry a slash, and `MODEL_ID` had no slash in it, so the
     * reported list was `whisper-large-v3, whisper-large-v3-turbo, allam-2-7b` — two
     * speech-to-text models and one small chat model, which reads as "this key cannot generate
     * prose". Every candidate that could have fixed it was filtered out one line before the
     * list was printed. The diagnostic did not fail quietly; it produced a confident wrong
     * answer. Fixed in `lib/server/generator.ts`, where the reasoning is written out.
     *
     * Note also the churn: Groq's own migration note points at `qwen/qwen3.6-27b`, which was
     * itself decommissioned 2026-09-14, and `groq/compound` died the day this list was read.
     * A vendor's documentation is evidence about the past. `GET /models` is the present.
     */
    model: 'openai/gpt-oss-120b',
    /**
     * 65,536 is this model's true ceiling and this stays at 16,384 anyway, for the reason the
     * Gemini entry gives: the route asks for 16,000 as an upper BOUND and a passage lands in
     * the low thousands, so the cost of this being conservative is nothing while the cost of
     * it being optimistic is a truncation that reads as a bad prompt.
     *
     * ONE THING IS NEW WITH THIS MODEL, THOUGH, AND IT IS WORTH KNOWING BEFORE TUNING THIS.
     * gpt-oss REASONS, and reasoning tokens are spent out of the same completion budget as the
     * answer — so this number is no longer "how long may the passage be", it is "how long may
     * the thinking plus the passage be". There is ample room at 16,000 for both. If that ever
     * stops being true it announces itself precisely: `finish_reason: length`, which arrives
     * as the `truncated` kind rather than as an unparseable reply.
     */
    maxOutputTokens: 16384,
    freeTier: true,
    baseUrl: 'https://api.groq.com/openai/v1',
    keyPattern: /^gsk_[A-Za-z0-9]{20,}$/,
    keyPlaceholder: 'gsk_…',
    keyPrefixes: ['gsk_'],
    consoleUrl: 'https://console.groq.com/keys',
    consoleLabel: 'console.groq.com → API keys',
    blurb: 'GPT-OSS 120B on Groq. Free tier, and the fastest of the three by a wide margin.',
  },
];

export const DEFAULT_PROVIDER: ProviderId = 'anthropic';

const BY_ID = new Map<ProviderId, AiProvider>(AI_PROVIDERS.map(p => [p.id, p]));

/** The provider with this id, or undefined. Takes a bare string so a header can be validated. */
export function providerById(id: string | null | undefined): AiProvider | undefined {
  return id ? BY_ID.get(id as ProviderId) : undefined;
}

/** Same, but never undefined — for the many places that just need a table to read from. */
export function providerOrDefault(id: string | null | undefined): AiProvider {
  return providerById(id) ?? BY_ID.get(DEFAULT_PROVIDER)!;
}

/**
 * Whether a pasted string has the shape of a key for this provider.
 *
 * A SHAPE CHECK AND NOTHING MORE. The only real validator is the provider itself, and being
 * cleverer here means rejecting key formats that do not exist yet. It earns its place by
 * turning a typo into an immediate, specific message instead of a round trip and an opaque
 * 401 — and, now that there is a picker, by catching a Groq key pasted into the Gemini field,
 * which is the new mistake this feature makes possible.
 */
export function looksLikeKeyFor(id: ProviderId, key: string | null | undefined): boolean {
  const p = BY_ID.get(id);
  return !!p && typeof key === 'string' && p.keyPattern.test(key.trim());
}

/**
 * The provider a key's SHAPE says it belongs to, if exactly one claims it.
 *
 * The learner's stored choice is authoritative and this is the fallback — it exists for two
 * real cases: a key stored before the picker existed (there was only Anthropic, and those
 * keys must keep working untouched), and a request that carries a key but no provider header.
 *
 * Returns undefined when nothing matches AND when more than one does. A key two providers
 * both claim is ambiguous, and guessing at a credential's destination is how a key gets sent
 * to the wrong company; `tests/aiProviders.test.ts` asserts the patterns stay disjoint so the
 * second case cannot arise quietly.
 */
export function providerForKey(key: string | null | undefined): AiProvider | undefined {
  if (typeof key !== 'string') return undefined;
  const k = key.trim();
  const hits = AI_PROVIDERS.filter(p => p.keyPattern.test(k));
  return hits.length === 1 ? hits[0] : undefined;
}

/** Any provider at all, for "is this a usable key from someone". */
export function looksLikeAnyKey(key: string | null | undefined): boolean {
  return !!providerForKey(key);
}

/** The prefix a key actually carries, or the provider's commonest as a fallback. */
export function prefixOf(p: AiProvider, key: string): string {
  return p.keyPrefixes.find(pre => key.startsWith(pre)) ?? p.keyPrefixes[0];
}

/**
 * `sk-ant-…7f3a` — enough to tell two keys apart, never enough to use.
 *
 * The whole key is never rendered back to the screen: it is shoulder-surfable, it lands in
 * screenshots and screen shares, and the learner already has a copy of it.
 *
 * THE PREFIX COMES FROM THE KEY, NOT FROM THE TABLE. With one hardcoded prefix per provider,
 * a Google key beginning `AQ.` was masked as `AIza…7f3a` — a display prefix the key does not
 * have. That is worse than showing nothing: the entire job of a mask is letting someone tell
 * two of their own keys apart, and one that lies about the first four characters cannot.
 */
export function maskKeyFor(id: ProviderId, key: string): string {
  const p = providerOrDefault(id);
  const v = key.trim();
  const prefix = prefixOf(p, v);
  if (v.length < prefix.length + 8) return `${prefix}…`;
  return `${prefix}…${v.slice(-4)}`;
}
