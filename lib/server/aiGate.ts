import { NextResponse } from 'next/server';
import { consumeAiCredit } from '@/lib/supabase/server';
import {
  looksLikeAnthropicKey, USER_KEY_HEADER,
  userKeyGenerator, serverKeyGenerator, type Generator,
} from '@/lib/server/generator';
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
  if (looksLikeAnthropicKey(userKey)) return { stub, apiKey: userKey, operatorPays: false, usable: true };
  if (serverKeyUsable) return { stub, apiKey: serverKey!, operatorPays: true, usable: true };
  return { stub, apiKey: '', operatorPays: false, usable: stub };
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
  return access.operatorPays
    ? serverKeyGenerator(access.apiKey || 'stub')
    : userKeyGenerator(access.apiKey || 'stub');
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
): Promise<MeterResult> {
  if (access.stub || !access.operatorPays) return { refusal: null, remaining: null };

  const credit = await consumeAiCredit();
  if (credit.allowed) return { refusal: null, remaining: credit.remaining };

  if (credit.reason === 'no_session') {
    return {
      refusal: NextResponse.json(
        { error: 'no_session', message: NO_SESSION_MSG, detail: NO_SESSION_MSG }, { status: 401 },
      ),
      remaining: null,
    };
  }
  return {
    refusal: NextResponse.json(
      { error: 'guest_limit', message: guestLimitMessage, aiRemaining: 0 }, { status: 402 },
    ),
    remaining: 0,
  };
}
