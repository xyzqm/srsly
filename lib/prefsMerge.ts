import type { UserPrefs, LanguageCode } from './types';
import { canonicalJson } from './canonicalJson';

/**
 * Folding two devices' `prefs` together.
 *
 * ── THE BUG THIS EXISTS FOR ──
 * `prefs` was written as ONE BLOB, last-writer-wins. Every setting travelled with every
 * save, so changing the THEME on a phone also wrote the phone's idea of your level, your
 * retention target, your blank density and which languages you study. Any device holding a
 * stale copy silently reverted every setting the other one had changed — and a preference
 * quietly moving back is close to undetectable, because nothing announces it and the value
 * it reverts to is one you did once choose.
 *
 * ── WHY A THREE-WAY MERGE, NOT A RULE PER FIELD ──
 * These are CHOICES, not tallies. There is no max or union that means anything for a theme:
 * the only honest answer is "whoever changed it last". That needs to know what this device
 * CHANGED, not merely what it holds — and the difference between those two is the entire
 * bug. So the merge takes a BASE (the prefs this device last saw in the cloud) and applies
 * only the fields where `mine` differs from it, onto the cloud's current value. Fields this
 * device did not touch keep whatever the other device set.
 *
 * With no base — a first sync, or a cold cache — there is no way to tell a change from a
 * stale value, so `mine` wins for the scalars. That is the old behaviour, kept deliberately
 * as the floor: losing the learner's just-made change to protect a setting they may not have
 * touched would be the worse trade.
 *
 * ── FOUR FIELDS ARE MERGED REGARDLESS ──
 * `poolAutoDate`, `testedLevels`, `placementSeen` and `languages` are keyed collections that
 * grow, and they are merged per key with a monotonic rule whether or not a base exists. They
 * are the fields where whole-blob replacement did real damage rather than cosmetic damage:
 * losing one language's `poolAutoDate` reintroduces exactly the double-activation avalanche
 * that field was moved into prefs to prevent, and losing a `testedLevels` entry re-locks a
 * band the learner has already passed a test for.
 */

/** Later of two dates. Absent loses. */
function laterDate(a?: string, b?: string): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return a >= b ? a : b;
}

type LangMap<T> = Partial<Record<LanguageCode, T>>;

/** Per-language fold, applied only where both sides have a value. */
function mergeLangMap<T>(
  a: LangMap<T> | undefined,
  b: LangMap<T> | undefined,
  pick: (x: T, y: T) => T,
): LangMap<T> | undefined {
  if (!a && !b) return undefined;
  const out: LangMap<T> = {};
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})] as LanguageCode[]);
  for (const k of keys) {
    const x = a?.[k], y = b?.[k];
    out[k] = x !== undefined && y !== undefined ? pick(x, y) : (x !== undefined ? x : y)!;
  }
  return out;
}

/**
 * Every key that is merged by its own rule rather than by "who changed it".
 *
 * Listed once, and read twice below — as the set to fold, and as the set to SKIP in the
 * three-way pass. Two lists would drift, and the drift would be silent: a key in one and not
 * the other is either merged and then overwritten, or neither.
 */
const MONOTONIC = ['poolAutoDate', 'testedLevels', 'placementSeen', 'languages'] as const;

export function mergePrefs(
  base: UserPrefs | null,
  mine: UserPrefs,
  theirs: UserPrefs | null,
): UserPrefs {
  if (!theirs) return mine;

  const out: UserPrefs = { ...theirs };
  // One alias rather than a cast per line. `UserPrefs` has no index signature — deliberately,
  // since every field is named — so writing to it by computed key needs the widening once.
  const rec = out as unknown as Record<string, unknown>;

  // ── The three-way pass: apply only what THIS device changed ────────────────
  if (base) {
    const keys = new Set([...Object.keys(mine), ...Object.keys(base)]);
    for (const k of keys) {
      if ((MONOTONIC as readonly string[]).includes(k)) continue;
      const mineV = (mine as unknown as Record<string, unknown>)[k];
      const baseV = (base as unknown as Record<string, unknown>)[k];
      if (canonicalJson(mineV) === canonicalJson(baseV)) continue;  // untouched here
      if (mineV === undefined) delete rec[k];   // deliberately cleared
      else rec[k] = mineV;
    }
  } else {
    // No base: cannot tell a change from a stale value, so the local copy wins the scalars.
    for (const [k, v] of Object.entries(mine)) {
      if ((MONOTONIC as readonly string[]).includes(k)) continue;
      rec[k] = v;
    }
  }

  // ── The monotonic pass, base or no base ───────────────────────────────────
  // Later date: this records when the pool last auto-activated, so taking the LATER of two
  // is what keeps a second device from activating a batch the first already did today.
  const poolAutoDate = mergeLangMap(mine.poolAutoDate, theirs.poolAutoDate,
    (x, y) => laterDate(x, y)!);
  // Max: a band unlocked by passing its test stays unlocked.
  const testedLevels = mergeLangMap(mine.testedLevels, theirs.testedLevels,
    (x, y) => Math.max(x, y));
  // OR: having seen the placement test is not something that un-happens.
  const placementSeen = mergeLangMap(mine.placementSeen, theirs.placementSeen,
    (x, y) => x || y);

  if (poolAutoDate) out.poolAutoDate = poolAutoDate;
  if (testedLevels) out.testedLevels = testedLevels;
  if (placementSeen) out.placementSeen = placementSeen;

  // Union, order preserved: `languages` is "in the order they added them", and a language
  // added on one device must not vanish because the other has not seen it yet.
  if (mine.languages || theirs.languages) {
    out.languages = [...new Set([...(theirs.languages ?? []), ...(mine.languages ?? [])])];
  }

  return out;
}
