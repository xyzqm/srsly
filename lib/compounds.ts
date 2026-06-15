import { lookupWordAsync } from './data/dict';

/**
 * Validate the compounds entered for a card. Returns a warning message if any
 * compound looks wrong, else null. Two checks per compound:
 *   1. It must contain the card's character (else it's a different word entirely).
 *   2. It should be a recognized word (checked against the full CC-CEDICT).
 *
 * The dictionary check is best-effort: if CC-CEDICT can't be reached it falls back
 * to the local dictionary, so a transient network failure won't wrongly flag a word.
 * The caller shows this as a confirm() the user can override.
 */
export async function checkCompounds(hanzi: string, compounds: string[]): Promise<string | null> {
  const problems: string[] = [];
  for (const raw of compounds) {
    const w = raw.trim();
    if (!w) continue;
    if (!w.includes(hanzi)) {
      problems.push(`"${w}" doesn't contain ${hanzi}`);
      continue;
    }
    const entry = await lookupWordAsync(w);
    if (!entry.pinyin && !entry.meaning) {
      problems.push(`"${w}" doesn't look like a real word`);
    }
  }
  if (problems.length === 0) return null;
  return `Some compounds look off:\n${problems.map(p => `• ${p}`).join('\n')}\n\nAdd them anyway?`;
}
