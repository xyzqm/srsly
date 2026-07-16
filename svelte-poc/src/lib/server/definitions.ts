import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { askText } from './llm';
import type { LanguageCode } from '$lib/types';

export interface Definition { reading: string; meaning: string }

const TABLE = 'word_definitions';

let sb: SupabaseClient | null = null;
function client(): SupabaseClient {
  if (sb) return sb;
  const key = env.SUPABASE_SECRET_KEY;
  if (!key || key === 'your-secret-key-here') throw new Error('no-secret-key');
  sb = createClient(PUBLIC_SUPABASE_URL, key, { auth: { persistSession: false } });
  return sb;
}

async function lookup(word: string, lang: LanguageCode): Promise<Definition | null> {
  const { data } = await client().from(TABLE).select('reading, meaning').eq('word', word).eq('lang', lang).maybeSingle();
  return data && data.meaning ? { reading: data.reading, meaning: data.meaning } : null;
}

/** zh-only: a few morphological forms that aren't their own dictionary entry, but whose meaning
 *  is derivable from a base form that likely is. Cheap and deterministic — tried before spending
 *  an LLM call on something regular Chinese morphology already explains. */
async function decomposedLookup(word: string, lang: LanguageCode): Promise<Definition | null> {
  if (lang !== 'zh') return null;

  // Adverbial 地 suffix: 慢慢地 -> 慢慢
  if (word.length >= 2 && word.endsWith('地')) {
    const base = await lookup(word.slice(0, -1), lang);
    if (base) return { reading: '', meaning: base.meaning };
  }
  // AA reduplication: 慢慢 -> 慢 (even-length, first half repeats)
  if (word.length >= 2 && word.length % 2 === 0) {
    const half = word.slice(0, word.length / 2);
    if (word === half + half) {
      const base = await lookup(half, lang);
      if (base) return { reading: '', meaning: base.meaning };
    }
  }
  // AABB reduplication: 高高兴兴 -> 高兴
  if (word.length === 4 && word[0] === word[2] && word[1] === word[3]) {
    const base = await lookup(word[0] + word[1], lang);
    if (base) return { reading: '', meaning: base.meaning };
  }
  return null;
}

/**
 * Resolve a word's reading + meaning, in priority order: the centralized `word_definitions`
 * table (seeded from CC-CEDICT/HSK/COMMON — see scripts/port-dictionaries-to-supabase.ts — and
 * grown incrementally by the LLM tier below) -> a few cheap Chinese morphological decompositions
 * -> a one-off LLM query, cached back into word_definitions for next time.
 */
export async function getDefinition(word: string, lang: LanguageCode): Promise<Definition> {
  const hit = await lookup(word, lang);
  if (hit) return hit;

  const decomposed = await decomposedLookup(word, lang);
  if (decomposed) return decomposed;

  console.log('using an LLM to look up ' + word);

  const raw = await askText(
    `Give the reading and a concise English meaning for this ${lang === 'zh' ? 'Chinese' : 'Japanese'} ` +
    `word or proper name, as it would appear in a short reading passage: "${word}"\n\n` +
    `Respond with EXACTLY one line in the form:\nreading|meaning\n` +
    `${lang === 'zh' ? 'reading = pinyin with tone marks' : 'reading = hiragana'}. No other text.`,
  );
  const [reading = '', meaning = ''] = raw.split('|').map((s) => s.trim());
  const result: Definition = { reading, meaning };

  if (meaning) await client().from(TABLE).upsert({ word, lang, reading, meaning }, { onConflict: 'word,lang' });

  return result;
}
