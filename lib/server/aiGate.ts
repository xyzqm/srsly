import { NextResponse } from 'next/server';
import { consumeAiCredit } from '@/lib/supabase/server';
import {
  looksLikeAnyKey, USER_KEY_HEADER, PROVIDER_HEADER,
  generatorForProvider, type Generator,
} from '@/lib/server/generator';
import { providerById, providerForKey, DEFAULT_PROVIDER, type ProviderId } from '@/lib/aiProviders';
import { stubEnabled } from '@/lib/server/stubContent';

/**
 * WHO IS PAYING FOR THIS REQUEST, AND MAY IT HAPPEN AT ALL.
 *
 * Every route that can reach Anthropic asks the same three questions in the same order — is
 * there a usable key, whose is it, and if it is the operator's, does this caller have credit
 * — and getting any of them wrong spends someone else's money. This module is the one answer.
 *
 * IT EXISTS BECAUSE THE ANSWER WAS COPIED RATHER THAN SHARED, AND THE COPY WAS INCOMPLETE.
 * `daily-content` did all three inline. `missed-review` was written later, kept the
 * `USER_KEY_HEADER` half — it correctly preferred the learner's key — and simply never
 * acquired the other two: no key check and no meter, so an anonymous guest could spend the
 * operator's tokens on example sentences without limit and without appearing in `ai_usage`.
 * Nothing failed. There is no symptom for "this worked and someone else paid", which is why
 * it survived a guest budget, a rename of that budget's column and a pass that set it to zero.
 *
 * The split into three calls is deliberate, and is about ORDER. Metering must happen after a
 * route has validated its body, or a malformed request burns a credit; the key check wants to
 * happen before the route does any real work. A single do-everything function would force one
 * order on both. What it must NOT be is three decisions a route can half-make, so
 * `operatorPays` is computed HERE and never by a caller — that is precisely the one the copy
 * got wrong — and `meterOrRefuse` is a single call that cannot be partially performed.
 *
 * `generatorFor` exists for the same reason: it is what stops `Generator.operatorPays` and
 * `AiAccess.operatorPays` from being two records of one fact. A route that picked its own
 * generator could meter on one and bill on the other.
 *
 * `tests/aiGate.test.ts` asserts that every route reaching Anthropic either meters through
 * here or refuses guests outright, and that the list of such routes is exactly the known one,
 * so a fourth route is a failing test rather than a quiet bill.
 */

/**
 * Not a budget message: the request reached the meter with no session to charge. Shared,
 * because two routes surfacing the same fault in two wordings is how one of them ends up
 * describing it wrongly.
 */
export const NO_SESSION_MSG =
  'Could not verify your session, so generation was not attempted. Reload the page and try again.';

/**
 * The meter could not be READ — the RPC is missing, a grant was revoked, the network blipped.
 * Distinct from `no_session`, which is a definite answer, because this one is an absence of
 * one. `consumeAiCredit` fails closed so it arrives here rather than as a free generation.
 */
export const UNVERIFIED_MSG =
  'Could not check your usage allowance, so nothing was generated. Try again in a moment.';

/**
 * Only one header is ever read, so the parameter is narrowed to that rather than to
 * `NextRequest`. A `NextRequest` satisfies it structurally, so no caller changes — and a test
 * can hand over a plain object instead of constructing a framework request. The same move
 * `fsrsSchedule` makes by taking a `Schedulable` rather than a whole `DeckWord`.
 */
export interface KeyBearingRequest {
  readonly headers: { get(name: string): string | null };
}

export interface AiAccess {
  /** `SRSLY_STUB_AI=1` — canned content, no key, no call, no credit. */
  readonly stub: boolean;
  /** The key this request must use. Empty when only the stub is available. */
  readonly apiKey: string;
  /**
   * True when the OPERATOR's key is paying, which is the only case that may be metered. A
   * learner on their own key is spending their own money and must never be rationed on top
   * of it; the stub spends nothing at all.
   */
  readonly operatorPays: boolean;
  /** False when there is no usable key and no stub, so the route cannot proceed. */
  readonly usable: boolean;
  /**
   * Which service this key reaches. Read for the transport and for error copy, NEVER for a
   * billing decision — `operatorPays` is about whose key it is, and a free-tier Gemini key is
   * the learner's own key exactly as an Anthropic one is.
   */
  readonly provider: ProviderId;
}

/**
 * The learner's own key, if they connected one in Settings, else the operator's.
 *
 * The learner's wins when present: they asked to pay for their own generations, so there is
 * no reason to spend the operator's. It is used for THIS REQUEST ONLY and never written
 * anywhere — not to a log, not to a database, not into an error response — and it arrives on
 * a header rather than in the body or the URL because URLs are routinely logged by proxies
 * and platforms, and a logged credential is a leaked one.
 */
export function resolveAiAccess(req: KeyBearingRequest): AiAccess {
  const stub = stubEnabled();
  // SRSLY_API_KEY first, to avoid being blocked by Claude Code's ANTHROPIC_API_KEY='' override.
  const serverKey = process.env.SRSLY_API_KEY || process.env.ANTHROPIC_API_KEY;
  const serverKeyUsable = !!serverKey && serverKey !== 'your-api-key-here';

  const userKey = req.headers.get(USER_KEY_HEADER)?.trim() || '';
  if (looksLikeAnyKey(userKey)) {
    return {
      stub, apiKey: userKey, operatorPays: false, usable: true,
      provider: providerFor(userKey, req.headers.get(PROVIDER_HEADER)),
    };
  }
  if (serverKeyUsable) {
    return {
      stub, apiKey: serverKey!, operatorPays: true, usable: true,
      // The operator's key is whatever they configured; its own shape decides where it goes,
      // so an operator running on a free tier needs no second environment variable.
      provider: providerForKey(serverKey)?.id ?? DEFAULT_PROVIDER,
    };
  }
  return { stub, apiKey: '', operatorPays: false, usable: stub, provider: DEFAULT_PROVIDER };
}

/**
 * WHICH COMPANY THIS CREDENTIAL IS ABOUT TO BE SENT TO, AND WHY THE SHAPE OVERRULES THE CLIENT.
 *
 * The client states the learner's choice in `PROVIDER_HEADER`, which is the authoritative
 * record of what they picked in Settings. The key's own SHAPE still wins when the two
 * disagree, and that ordering is the one security decision in this function: a key whose
 * format belongs unmistakably to Anthropic, sent to Google because a header said so, is a
 * live credential handed to a company that was never meant to see it. Nothing the client says
 * should be able to cause that, including a client that is simply out of date.
 *
 * The header is what is left when the shape says nothing — a key format none of the three
 * patterns knows yet. `looksLikeAnyKey` gates entry to this function, so today that can only
 * happen if a pattern is loosened later; it is handled rather than assumed away.
 */
function providerFor(key: string, declared: string | null): ProviderId {
  return providerForKey(key)?.id ?? providerById(declared)?.id ?? DEFAULT_PROVIDER;
}

/**
 * The client for this request, carrying the billing answer already decided above.
 *
 * The `|| 'stub'` is not a fallback key and cannot be used as one: it is reached only when
 * there is no key at all, which by `usable` means the stub is on and nothing will be sent.
 * The Anthropic SDK throws on an empty `apiKey` at CONSTRUCTION, before any call, so a
 * placeholder is what lets a stubbed route build the object it never uses.
 */
export function generatorFor(access: AiAccess): Generator {
  return generatorForProvider(access.provider, access.apiKey || 'stub', access.operatorPays);
}

/**
 * 503, not 402. There is no key at all, which is a fact about the SERVER and not about the
 * caller's budget — and the client must not latch it as a spent allowance. The message is the
 * route's own, because "add a key to do X" is only useful when it names X.
 */
export function noKeyRefusal(message: string): NextResponse {
  return NextResponse.json({ error: 'no_api_key', message }, { status: 503 });
}

export interface MeterResult {
  /** Non-null means STOP and return this. Null means proceed. */
  readonly refusal: NextResponse | null;
  /**
   * The server's authoritative remaining allowance, to echo back as `aiRemaining` so the
   * client's localStorage mirror can be corrected. `null` means "not metered, not counted" —
   * a signed-in account, a learner's own key, or the stub — and `syncGuestAiRemaining`
   * deliberately treats null as "leave the mirror alone" rather than as zero.
   */
  readonly remaining: number | null;
}

/**
 * Charge one operator-funded credit, or hand back the refusal to return.
 *
 * A null `refusal` means proceed. Call it AFTER validating the request body — a 400 that has
 * already spent a credit is a charge for nothing.
 *
 * THE STUB SKIP IS A CONTRACT, NOT A CONVENIENCE. Metering is skipped when `stub` is on
 * because the caller promises not to reach Anthropic at all in that case. A route that took
 * the skip and then made the call anyway would spend the operator's tokens under a flag whose
 * entire promise is "no key, no credit, no cost" — so a route with no canned content of its
 * own must refuse while stubbed rather than quietly generate.
 *
 * A MISSING SESSION IS NOT A SPENT BUDGET. `consume_ai_credit()` refuses for two unrelated
 * reasons and they must not wear each other's clothes: `no_session` is 401 so the client does
 * not latch `markGuestAiExhausted()` and lock a working account out of generation until
 * storage is cleared, while `guest_limit` is the 402 the client does latch.
 */
export async function meterOrRefuse(
  access: AiAccess,
  guestLimitMessage: string,
  dailyLimitMessage: string = guestLimitMessage,
): Promise<MeterResult> {
  if (access.stub || !access.operatorPays) return { refusal: null, remaining: null };

  const credit = await consumeAiCredit();
  if (credit.allowed) return { refusal: null, remaining: credit.remaining };

  /**
   * ONLY A SPENT BUDGET MAY BE A 402, and the default runs the other way deliberately.
   *
   * This was written as "no_session is 401, everything else is 402", which reads as equivalent
   * and is not: 402 is the status the client LATCHES, writing the budget to spent in
   * localStorage. So any reason the server grows later — `unverified` did, the moment
   * consumeAiCredit began failing closed — would have locked a working account out of
   * generation until site data was cleared, over a transient network error. An unrecognised
   * refusal is by definition not a known spent budget, so it takes the status that says
   * "could not determine" rather than the one that says "you have used it all".
   *
   * `daily_limit` is the SECOND known one, added with migration 0008, and it is listed here
   * explicitly rather than by loosening the rule to "anything ending in _limit". The whole
   * point of the default is that a reason this function has never heard of is not evidence of
   * a spent budget; a new one earns its 402 by being named.
   *
   * The two carry different copy because they need different advice: a guest is told to sign
   * in or bring a key, while someone already signed in can only bring a key or come back
   * tomorrow. Handing an account holder the guest's message tells them to do a thing they
   * have already done.
   */
  if (credit.reason === 'guest_limit' || credit.reason === 'daily_limit') {
    return {
      refusal: NextResponse.json(
        {
          error: credit.reason,
          message: credit.reason === 'daily_limit' ? dailyLimitMessage : guestLimitMessage,
          aiRemaining: 0,
        },
        { status: 402 },
      ),
      remaining: 0,
    };
  }
  const message = credit.reason === 'no_session' ? NO_SESSION_MSG : UNVERIFIED_MSG;
  return {
    refusal: NextResponse.json(
      // `detail` because the client reads that first when surfacing a non-402 failure.
      { error: credit.reason ?? 'unverified', message, detail: message }, { status: 401 },
    ),
    remaining: null,
  };
}
