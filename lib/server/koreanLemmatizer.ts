import { disassembleCompleteCharacter, combineCharacter } from 'es-hangul';

/**
 * Server-only Korean lemmatizer: reduces an eojeol (a space-delimited Korean word) to its
 * dictionary form, so a passage word like `먹었어요` resolves to the deck card `먹다`.
 *
 * WHY THIS IS HAND-WRITTEN
 * The other languages each had a shortcut. Japanese has kuromoji, a real morphological
 * analyzer. Spanish had Wiktionary's own `form_of` data, which handed us every irregular
 * for free. Korean has neither: its Wiktionary `form_of` entries are almost entirely
 * hanja→hangul mappings, and verb lemmas carry only ~3 listed forms (해/하여/하니) against a
 * conjugation space of hundreds. So the morphology is done here, by rule.
 *
 * The discipline is the same as lib/server/spanishLemmatizer.ts: generate candidate stems
 * liberally, then accept only those the dictionary confirms. Korean makes that essential —
 * particles and endings are short and highly ambiguous (`이`, `가`, `을` are both particles
 * and parts of ordinary words), so unvalidated stripping would shred real vocabulary.
 *
 * Two kinds of morphology, handled separately:
 *   1. Nouns + josa (particles) — 학교에서 → 학교. Suffix stripping.
 *   2. Verb/adjective conjugation — 먹었어요 → 먹다. Requires jamo-level work, because
 *      endings fuse INTO the stem's final syllable rather than sitting after it
 *      (만나 + 았어요 → 만났어요, where the 았 survives only as a ㅆ batchim).
 */

/** The dictionary questions this module needs answered — same shape as the Spanish one. */
export interface LemmaDict {
  /** Is this a dictionary headword? */
  has(word: string): boolean;
  /** Does this headword carry at least one ordinary (non-proper-noun) sense? */
  isCommonWord(word: string): boolean;
}

/**
 * Particles (josa) that attach to nouns. Sorted longest-first at module load so that
 * `에서` wins over `에`, and `이라고` over `이`.
 */
const JOSA = [
  '에서는', '에게서', '으로는', '이라고', '에게는', '한테서', '이라는',
  '에서', '에게', '한테', '께서', '으로', '부터', '까지', '처럼', '보다',
  '마다', '조차', '마저', '밖에', '이나', '라도', '이라', '하고', '이랑', '라고',
  '이야', '이다', '으로써', '으로서',
  // Copula (이다) endings, which attach to nouns exactly like particles do:
  // 학생이에요 → 학생, 거예요 → 거.
  '이에요', '이었어요', '입니다', '이라면', '예요', '이죠', '이야',
  '은', '는', '이', '가', '을', '를', '의', '에', '도', '만', '로', '와', '과',
  '랑', '나', '야', '아', '여', '께', '들', '서',
].sort((a, b) => b.length - a.length);

/**
 * 것 ("thing") is the most frequent noun in spoken Korean and almost never appears in its
 * full form — it contracts with a following particle into a single syllable: 것+은 → 건,
 * 것+을 → 걸, 것+이 → 게. Rules cannot derive these because the noun itself is rewritten,
 * so the three contractions are listed explicitly.
 */
const GEOT_CONTRACTIONS: Record<string, string> = { '건': '것', '걸': '것', '게': '것' };

/**
 * Verb/adjective endings that appear as whole trailing syllables. Fused endings (the ones
 * that survive only as a batchim, like ㅆ for the past tense or ㄴ/ㄹ/ㅁ for adnominals) are
 * handled separately in `stemCandidates`, since they cannot be sliced off as text.
 * Sorted longest-first so `었어요` is tried before `어요` before `요`.
 */
const VERB_ENDINGS = [
  '었습니다', '았습니다', '였습니다', '겠습니다', '으십시오', '이었어요', '였어요',
  '었어요', '았어요', '겠어요', '으세요', '으니까', '습니다', '습니까', '으려고',
  '는데요', '은데요', '잖아요', '어야죠', '아야죠', '겠어요',
  '었다', '았다', '였다', '겠다', '어요', '아요', '여요', '예요', '네요', '군요',
  '는다', '은데', '는데', '지만', '어서', '아서', '여서', '으면', '니까', '어야', '아야',
  '려고', '거든', '지요', '고요', '세요', '겠어', '잖아', '는지', '은지', '을까', '을게',
  '을래', '니다', '으로', '에요',
  // Quotative and interrogative endings, which dominate the remaining misses in
  // conversational text: 있다고, 없다면, 있나요, 뭐한대.
  '다고', '다면', '나요', '가요', '더라', '길래', '든지', '든가', '대요', '냐고',
  '다', '고', '지', '게', '기', '는', '요', '어', '아', '여', '자', '죠', '면', '서', '니', '며',
  '은', '을', '던', '나', '네', '군',
].sort((a, b) => b.length - a.length);

/** Batchim that mark a fused grammatical ending rather than part of the stem. Compound
 *  batchim (ㄺ, ㅄ) arrive decomposed as two jamo and so never match here — correctly, since
 *  the ㅅ of 없 is part of the stem, not an ending. */
const FUSED_BATCHIM: Record<string, true> = { 'ㅆ': true, 'ㄴ': true, 'ㄹ': true, 'ㅁ': true, 'ㅂ': true };

/**
 * es-hangul reports COMPOUND vowels as their two constituent jamo — 돼 comes back with
 * jungseong "ㅗㅐ", not "ㅙ" — and `combineCharacter` likewise expects that decomposed form.
 * Passing a precomposed vowel does not throw, it silently builds the WRONG syllable
 * (combineCharacter('ㄷ', 'ㅚ') returns 니, not 되), so every compound vowel in this file
 * goes through these constants rather than being written literally.
 */
const WA = 'ㅗㅏ';   // ㅘ — 봐, 와
const WEO = 'ㅜㅓ';  // ㅝ — 줘, 워
const WAE = 'ㅗㅐ';  // ㅙ — 돼
const OE = 'ㅗㅣ';   // ㅚ — 되

interface Syl { choseong: string; jungseong: string; jongseong: string }

function decompose(ch: string): Syl | undefined {
  try {
    const d = disassembleCompleteCharacter(ch);
    return d ? { choseong: d.choseong, jungseong: d.jungseong, jongseong: d.jongseong } : undefined;
  } catch {
    return undefined;
  }
}

function compose(s: Syl): string {
  try {
    return combineCharacter(s.choseong, s.jungseong, s.jongseong || undefined);
  } catch {
    return '';
  }
}

/** Replace the final syllable of `word` with `syl`. */
function withLast(word: string, syl: Syl): string {
  const composed = compose(syl);
  return composed ? word.slice(0, -1) + composed : '';
}

/** Append a batchim to the final syllable of `word` (no-op if it already has one). */
function addBatchim(word: string, jong: string): string {
  if (!word) return '';
  const d = decompose(word[word.length - 1]);
  if (!d || d.jongseong) return '';
  return withLast(word, { ...d, jongseong: jong });
}

/**
 * Forms reachable by removing a fused grammatical batchim from the final syllable —
 * 먹었- (ㅆ = past), 사는/간 (ㄴ), 갈 (ㄹ), 먹음 (ㅁ), 합 (ㅂ from -ㅂ니다).
 */
function batchimVariants(p: string): string[] {
  const out: string[] = [];
  if (!p) return out;
  const d = decompose(p[p.length - 1]);
  if (!d || !d.jongseong || !FUSED_BATCHIM[d.jongseong]) return out;

  const bare = { ...d, jongseong: '' };
  const stripped = withLast(p, bare);
  if (stripped) out.push(stripped);
  // ㅆ marks the past tense, and the vowel in front of it is itself a contraction:
  // 갔 → 가, but 썼 → 쓰 and 예뻤 → 예쁘. Offer the 으-restored form too.
  if (d.jongseong === 'ㅆ' && (d.jungseong === 'ㅏ' || d.jungseong === 'ㅓ')) {
    const restored = withLast(p, { ...bare, jungseong: 'ㅡ' });
    if (restored) out.push(restored);
  }
  // ㄹ-final stems drop their ㄹ before ㄴ/ㅂ/ㅅ endings: 사는 → 살다, 압니다 → 알다.
  if (d.jongseong === 'ㄴ' || d.jongseong === 'ㅂ') {
    const rl = addBatchim(stripped, 'ㄹ');
    if (rl) out.push(rl);
  }
  return out;
}

/**
 * Forms reachable by undoing ONE vowel contraction or consonant irregularity on the final
 * syllable. A syllable led by ㅇ is a bare ending vowel sitting after the stem (도와, 나아,
 * 들어); anything else has fused into the stem's own syllable (봐 = 보+아, 줘 = 주+어).
 */
function vowelVariants(p: string): string[] {
  const out: string[] = [];
  const push = (s: string) => { if (s) out.push(s); };
  if (!p) return out;

  const last = p[p.length - 1];
  const d = decompose(last);
  if (!d) return out;
  const head = p.slice(0, -1);
  const prev = head ? decompose(head[head.length - 1]) : undefined;
  const isBareVowel = d.choseong === 'ㅇ';

  // 하다 verbs: 해 is 하 + 아 contracted.
  if (last === '해') push(head + '하');
  // 되다: 돼 is 되 + 어 contracted.
  if (d.jungseong === WAE) push(withLast(p, { ...d, jungseong: OE }));

  // ㅂ-irregular: the stem's ㅂ becomes 오/우 before a vowel ending —
  // 돕+아 → 도와, 무겁+어 → 무거워, 새롭+은 → 새로운.
  if (isBareVowel && head && [WA, WEO, 'ㅜ', 'ㅗ'].includes(d.jungseong)) {
    push(addBatchim(head, 'ㅂ'));
  }
  if (d.jungseong === WA) push(withLast(p, { ...d, jungseong: 'ㅗ' }));   // 봐 → 보, 와 → 오
  if (d.jungseong === WEO) push(withLast(p, { ...d, jungseong: 'ㅜ' }));  // 줘 → 주
  if (d.jungseong === 'ㅕ' && !isBareVowel) {
    push(withLast(p, { ...d, jungseong: 'ㅣ' }));                          // 기다려 → 기다리
  }
  // ㅎ-irregular: the stem's ㅎ drops and the vowel becomes ㅐ — 그렇+어 → 그래, 어떻 → 어때.
  if (d.jungseong === 'ㅐ') {
    const restored = withLast(p, { ...d, jungseong: 'ㅓ' });
    push(addBatchim(restored, 'ㅎ'));
  }

  if (d.jungseong === 'ㅏ' || d.jungseong === 'ㅓ') {
    if (isBareVowel && head) {
      push(head);                                   // 먹어 → 먹
      push(addBatchim(head, 'ㅅ'));                 // 나아 → 낫 (ㅅ-irregular)
      if (prev?.jongseong === 'ㄹ') {
        push(withLast(head, { ...prev, jongseong: 'ㄷ' })); // 들어 → 듣 (ㄷ-irregular)
      }
    } else {
      push(withLast(p, { ...d, jungseong: 'ㅡ' }));  // 써 → 쓰, 예뻐 → 예쁘 (으-irregular)
    }
    // 르-irregular: the stem's 르 becomes ㄹ + 라/러 (모르 → 몰라, 부르 → 불러).
    if (d.choseong === 'ㄹ' && prev?.jongseong === 'ㄹ') {
      push(withLast(head, { ...prev, jongseong: '' }) + '르');
    }
  }

  // ㄷ-irregular recoverable from the stem's own batchim: 들 → 듣.
  if (d.jongseong === 'ㄹ') push(withLast(p, { ...d, jongseong: 'ㄷ' }));

  return out;
}

/**
 * Every stem this surface could plausibly have come from. Deliberately over-generates —
 * `stemToLemma` throws away anything the dictionary doesn't confirm, so a wrong guess is
 * free but a missing one is a permanent miss.
 *
 * The two transformation families COMPOSE, and must be applied in sequence rather than in
 * parallel: 왔어 loses its ending to give 왔, drops the ㅆ to give 와, and only then does
 * the ㅘ→ㅗ contraction yield 오 → 오다. Applying each rule only to the original surface
 * (the first version of this function) resolved none of that class.
 */
function stemCandidates(p: string): string[] {
  const seeds = [p, ...batchimVariants(p)];
  const out = new Set<string>();
  for (const seed of seeds) {
    if (!seed) continue;
    out.add(seed);
    for (const v of vowelVariants(seed)) out.add(v);
  }
  return [...out];
}

/** First candidate stem whose dictionary form (stem + 다) is a real headword. */
function stemToLemma(p: string, dict: LemmaDict): string | undefined {
  for (const cand of stemCandidates(p)) {
    const lemma = cand + '다';
    if (dict.has(lemma)) return lemma;
  }
  return undefined;
}

/** Resolve a conjugated verb/adjective to its dictionary form. */
function verbLemma(word: string, dict: LemmaDict): string | undefined {
  for (const ending of VERB_ENDINGS) {
    if (!word.endsWith(ending)) continue;
    const p = word.slice(0, word.length - ending.length);
    if (!p) continue;
    const lemma = stemToLemma(p, dict);
    if (lemma) return lemma;
  }
  // No recognisable ending: the surface may already be a bare stem (먹 → 먹다), or carry
  // only a fused batchim (간 → 가다).
  return stemToLemma(word, dict);
}

/** Resolve a noun carrying particles to the bare noun. */
function nounLemma(word: string, dict: LemmaDict): string | undefined {
  // 것-contractions first: 그건 → 그것, 그걸 → 그것, 이게 → 이것.
  const tail = word[word.length - 1];
  const expanded = GEOT_CONTRACTIONS[tail];
  if (expanded && word.length > 1) {
    const full = word.slice(0, -1) + expanded;
    if (dict.has(full)) return full;
    if (dict.has(expanded)) return expanded;
  }

  for (const josa of JOSA) {
    if (!word.endsWith(josa)) continue;
    const stem = word.slice(0, word.length - josa.length);
    // One-syllable remainders are far more often a coincidence than a real noun, so they
    // only count when the dictionary calls them an ordinary word (나, 집, 물 all qualify).
    if (!stem) continue;
    if (dict.isCommonWord(stem)) return stem;
    // Plural 들 can sit between the noun and its particle: 친구들이 → 친구.
    if (stem.endsWith('들') && stem.length > 1) {
      const bare = stem.slice(0, -1);
      if (dict.isCommonWord(bare)) return bare;
    }
  }
  return undefined;
}

/**
 * Resolve `word` to its dictionary form, or undefined when it already IS one (or nothing
 * plausible was found). Callers treat undefined as "no base form" and omit RawTok's 4th
 * element, exactly as the Japanese and Spanish paths do.
 */
export function lemmatizeKo(word: string, dict: LemmaDict): string | undefined {
  const w = word.trim();
  if (!w) return undefined;

  // Already a headword — 학교, 친구, and dictionary-form verbs like 먹다 all stop here.
  // Unlike Spanish this is rarely ambiguous: Korean inflected forms are almost never
  // headwords themselves, so an early exit costs little and protects real vocabulary.
  if (dict.has(w)) return undefined;

  // Nouns before verbs. Where both parse (나는 = 나 + 는, but also a form of 날다), the
  // nominal reading is overwhelmingly the intended one in running text.
  const noun = nounLemma(w, dict);
  if (noun && noun !== w) return noun;

  const verb = verbLemma(w, dict);
  if (verb && verb !== w) return verb;

  return undefined;
}
