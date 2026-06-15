const TONE_MAP: Record<string, string[]> = {
  a: ['a','ā','á','ǎ','à'],
  e: ['e','ē','é','ě','è'],
  i: ['i','ī','í','ǐ','ì'],
  o: ['o','ō','ó','ǒ','ò'],
  u: ['u','ū','ú','ǔ','ù'],
  v: ['ü','ǖ','ǘ','ǚ','ǜ'],
};

/** Convert tone-number string to tone-mark string: "laji3" → "lǎjī", "lv4" → "lǜ" */
export function toneNumToMark(s: string): string {
  // neutral tone (5 or no number): strip number
  s = s.replace(/([a-zü]+)5/gi, '$1');
  // v = ü substitute
  s = s.replace(/([^a-z])v([1-4])/gi, '$1ü$2').replace(/^v([1-4])/gi, 'ü$1');
  s = s.replace(/([^a-zü])v(?![1-5a-z])/gi, '$1ü').replace(/^v(?![1-5a-z])/gi, 'ü');

  return s.replace(/([a-zü]+)([1-4])/gi, (_m, syl: string, toneStr: string) => {
    const tone = parseInt(toneStr);
    const lc = syl.toLowerCase();
    let targetIdx = -1;
    let which = '';

    for (const v of ['a', 'e']) {
      const idx = lc.indexOf(v);
      if (idx >= 0) { targetIdx = idx; which = v; break; }
    }
    if (targetIdx < 0) {
      if (lc.includes('ou')) { targetIdx = lc.indexOf('o'); which = 'o'; }
      else {
        for (let i = lc.length - 1; i >= 0; i--) {
          if ('iuvaeoü'.includes(lc[i])) {
            targetIdx = i;
            which = lc[i] === 'ü' ? 'v' : lc[i];
            break;
          }
        }
      }
    } else {
      which = lc[targetIdx] === 'ü' ? 'v' : which;
    }

    if (targetIdx < 0 || !TONE_MAP[which]) return syl;
    const origChar = syl[targetIdx];
    const isCap = origChar === origChar.toUpperCase() && origChar !== origChar.toLowerCase();
    const marked = isCap ? TONE_MAP[which][tone].toUpperCase() : TONE_MAP[which][tone];
    return syl.slice(0, targetIdx) + marked + syl.slice(targetIdx + 1);
  });
}

const HAN_PIN: Record<string, string> = {
  '垃圾': 'la1ji1', '环境': 'huan2jing4', '回收': 'hui2shou1',
  '保护': 'bao3hu4', '习惯': 'xi2guan4', '减少': 'jian3shao3',
  '分类': 'fen1lei4', '城市': 'cheng2shi4',
  '垃': 'la1', '圾': 'ji1', '环': 'huan2', '境': 'jing4', '回': 'hui2',
  '收': 'shou1', '保': 'bao3', '护': 'hu4', '习': 'xi2', '惯': 'guan4',
  '减': 'jian3', '少': 'shao3', '分': 'fen1', '类': 'lei4',
  '城': 'cheng2', '市': 'shi4', '民': 'min2', '山': 'shan1',
  '水': 'shui3', '火': 'huo3', '土': 'tu3', '金': 'jin1',
  '木': 'mu4', '日': 'ri4', '月': 'yue4', '天': 'tian1',
  '地': 'di4', '人': 'ren2', '大': 'da4', '小': 'xiao3',
  '中': 'zhong1', '国': 'guo2', '心': 'xin1', '手': 'shou3',
  '真': 'zhen1', '好': 'hao3', '学': 'xue2', '校': 'xiao4',
};

const PINYIN_TONE_MARK = /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/i;
const PINYIN_ONLY = /^[a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüv'\s]+$/i;

/**
 * If a definition leads with tone-marked pinyin (e.g. "háng - a row", "nǐ · you"),
 * split it into { pinyin, meaning }. This lets imported polyphones keep distinct,
 * correct readings — the dictionary returns one reading per character, but a
 * "Character → Pinyin + Definition" card carries the right reading in its text.
 *
 * Conservative by design: only fires when the leading segment is punctuation-delimited
 * AND actually contains a tone mark, so English-first definitions are never altered.
 * Returns null when no leading pinyin is found.
 */
export function splitLeadingPinyin(def: string): { pinyin: string; meaning: string } | null {
  const trimmed = (def || '').trim();
  if (!trimmed) return null;
  const m = trimmed.match(/^([^\-–—:;·,()/]+)[\-–—:;·,()/]+\s*(.+)$/);
  if (!m) return null;
  const head = m[1].trim();
  const meaning = m[2].trim();
  if (!head || !meaning) return null;
  if (!PINYIN_TONE_MARK.test(head)) return null;   // leading segment must look like pinyin
  if (!PINYIN_ONLY.test(head)) return null;        // …and contain no stray English/punctuation
  if (head.split(/\s+/).length > 4) return null;   // pinyin is a few syllables, not a phrase
  return { pinyin: head, meaning };
}

/** Canonical form for comparison: tone numbers → marks, drop spaces/separators, lowercase. */
function canonPinyin(s: string): string {
  return toneNumToMark(s).normalize('NFC').replace(/[\s'·]/g, '').toLowerCase();
}

/**
 * Returns a warning message if `pinyin` looks wrong for `hanzi`, else null.
 * Checks: (1) only valid pinyin characters, and (2) it matches one of
 * `knownReadings` (dictionary + polyphone readings supplied by the caller).
 *
 * The match is tone-SENSITIVE, so wrong tones (ma2ma2 vs māma) AND missing
 * tones (mama vs māma) are both flagged — pinyin auto-fills with correct tones,
 * so a toneless value means the user deleted them. Genuinely neutral-tone words
 * are NOT flagged: their correct reading is itself toneless, so it still matches.
 * The caller passes knownReadings so this stays free of dictionary imports.
 */
export function checkPinyin(pinyin: string, hanzi: string, knownReadings: string[]): string | null {
  const p = (pinyin || '').trim();
  if (!p) return null;
  // 1. Valid pinyin characters only (allow tone numbers, which blur to marks on save)
  if (!PINYIN_ONLY.test(p.replace(/[1-5]/g, ''))) {
    return `"${pinyin}" doesn't look like valid pinyin. Add it anyway?`;
  }
  // 2. Cross-check against known readings — only warn when we have a reference
  const known = knownReadings.map(canonPinyin).filter(Boolean);
  if (known.length === 0 || known.includes(canonPinyin(p))) return null;
  const refs = [...new Set(knownReadings.filter(Boolean))].map(r => `"${r}"`).join(' or ');
  return `${hanzi} is usually read ${refs}, not "${pinyin}". Add it anyway?`;
}

/** Auto-fill pinyin from hanzi. Returns empty string if unknown. */
export function autoFillPinyin(hanzi: string): string {
  if (!hanzi) return '';
  if (HAN_PIN[hanzi]) return toneNumToMark(HAN_PIN[hanzi]);
  const chars = [...hanzi];
  const parts = chars.map(c => HAN_PIN[c]);
  if (parts.some(p => !p)) return '';
  return parts.map(p => toneNumToMark(p)).join('');
}
