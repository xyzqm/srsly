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

/** Auto-fill pinyin from hanzi. Returns empty string if unknown. */
export function autoFillPinyin(hanzi: string): string {
  if (!hanzi) return '';
  if (HAN_PIN[hanzi]) return toneNumToMark(HAN_PIN[hanzi]);
  const chars = [...hanzi];
  const parts = chars.map(c => HAN_PIN[c]);
  if (parts.some(p => !p)) return '';
  return parts.map(p => toneNumToMark(p)).join('');
}
