/**
 * JSON with object keys sorted, so two values that differ only in key order compare equal.
 *
 * Postgres round-trips JSONB through its own representation and does not promise to give
 * back the key order it was handed. Comparing raw `JSON.stringify` output would therefore
 * report every value as changed on every read, which is exactly the false positive that
 * would make a skip-if-unchanged check do nothing.
 *
 * Its own module because two callers now need it — the migration's skip-if-unchanged check
 * and `lib/prefsMerge.ts`, which has to ask "did THIS device change this field?" of values
 * that may be objects. A second copy would drift the first time either was corrected.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : v);
}
