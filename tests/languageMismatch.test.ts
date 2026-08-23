import { describe, it, expect } from 'vitest';
import { declaredMismatch, scriptMismatch, mismatchWarning, languageFromTag } from '@/lib/languageMismatch';

const ES = 'El camarón está en la playa mientras el sol sube despacio sobre el agua tranquila.';
const FR = 'Le chat dort sur la table pendant que la pluie tombe doucement sur les toits gris.';
const ZH = '学生们在学校里打扫教室。老师说得很清楚，大家都懂了他的意思。下课以后他们要休息。';
const JA = 'わたしは まいにち がっこうへ いきます。ともだちと はなして、ほんを よみます。';

describe('declaredMismatch', () => {
  it('compares the primary subtag only', () => {
    expect(declaredMismatch('es-MX', 'es')).toBe(false);
    expect(declaredMismatch('es-419', 'es')).toBe(false);
    expect(declaredMismatch('EN-GB', 'es')).toBe(true);
  });

  it('treats absent or junk metadata as no evidence', () => {
    expect(declaredMismatch(undefined, 'es')).toBe(false);
    expect(declaredMismatch('', 'es')).toBe(false);
    expect(declaredMismatch('x', 'es')).toBe(false);
  });

  // The reported bug: a Chinese edition of Le Petit Prince declares `简体中文`, which is a
  // display name and not a tag at all. Reading it as one warned that a Chinese book, opened
  // in a Chinese session, was not Chinese.
  it('ignores a display name where a tag was expected', () => {
    expect(declaredMismatch('简体中文', 'zh')).toBe(false);
    expect(declaredMismatch('Chinese', 'zh')).toBe(false);
    expect(declaredMismatch('English (US)', 'fr')).toBe(false);
    expect(declaredMismatch('Español', 'zh')).toBe(false);
  });

  // A language has more than one code, and publishers use all of them.
  it('accepts every legitimate code for the study language', () => {
    expect(declaredMismatch('zho', 'zh')).toBe(false);
    expect(declaredMismatch('chi', 'zh')).toBe(false);
    expect(declaredMismatch('cmn', 'zh')).toBe(false);
    expect(declaredMismatch('zh-Hans', 'zh')).toBe(false);
    expect(declaredMismatch('jpn', 'ja')).toBe(false);
    expect(declaredMismatch('spa', 'es')).toBe(false);
    expect(declaredMismatch('fra', 'fr')).toBe(false);
    expect(declaredMismatch('fre', 'fr')).toBe(false);
  });

  // None of the above may cost us the case the warning exists for.
  it('still catches a genuinely different language', () => {
    expect(declaredMismatch('es', 'zh')).toBe(true);
    expect(declaredMismatch('en', 'fr')).toBe(true);
    expect(declaredMismatch('fr', 'es')).toBe(true);
    expect(declaredMismatch('ja', 'zh')).toBe(true);
  });
});

describe('mismatchWarning on a real book', () => {
  // Long enough to clear scriptMismatch's "too little to judge" floor of 20 script
  // characters — a real chapter has thousands, but a one-line fixture does not.
  const chinese = '我们今天去公园散步，天气很好，孩子们在草地上玩得很开心。';

  it('says nothing about a Chinese book in a Chinese session', () => {
    expect(mismatchWarning('zh', { declared: '简体中文', text: chinese })).toBeNull();
  });

  // The declared name is useless, but the prose is not — the script check has to carry it.
  it('still warns when that same book is opened in a Spanish session', () => {
    const warning = mismatchWarning('es', { declared: '简体中文', text: chinese });
    expect(warning).toBeTruthy();
    expect(warning).toContain('does not look like');
  });
});

describe('scriptMismatch fires on the unambiguous cases', () => {
  it('flags CJK text in a Latin-script session', () => {
    expect(scriptMismatch(ZH, 'es')).toBe(true);
    expect(scriptMismatch(JA, 'fr')).toBe(true);
  });

  it('flags Latin text in a CJK session — the case that shredded camarón', () => {
    expect(scriptMismatch(ES, 'zh')).toBe(true);
    expect(scriptMismatch(FR, 'ja')).toBe(true);
  });

  it('flags kana in a Chinese session, since Chinese never uses it', () => {
    expect(scriptMismatch(JA, 'zh')).toBe(true);
  });
});

describe('scriptMismatch stays quiet when it should', () => {
  it('does not flag a language reading itself', () => {
    expect(scriptMismatch(ES, 'es')).toBe(false);
    expect(scriptMismatch(FR, 'fr')).toBe(false);
    expect(scriptMismatch(ZH, 'zh')).toBe(false);
    expect(scriptMismatch(JA, 'ja')).toBe(false);
  });

  it('does NOT flag kanji-only Japanese, which is real', () => {
    expect(scriptMismatch('新聞社会面記事全文掲載。日本語漢字表記法研究発表会場案内。', 'ja')).toBe(false);
  });

  it('tolerates a proper noun or a loanword in the wrong script', () => {
    expect(scriptMismatch('我今天去了 Starbucks 和朋友一起喝咖啡，然后我们回家了。', 'zh')).toBe(false);
    expect(scriptMismatch('Mi canción favorita se llama 上を向いて歩こう y es preciosa.', 'es')).toBe(false);
  });

  it('will not judge a fragment', () => {
    expect(scriptMismatch('Hola', 'zh')).toBe(false);
    expect(scriptMismatch('', 'zh')).toBe(false);
  });
});

describe('mismatchWarning', () => {
  it('prefers the declared language when there is one', () => {
    expect(mismatchWarning('es', { declared: 'en', text: ES })).toMatch(/“en”/);
  });

  it('falls back to the script when nothing is declared', () => {
    expect(mismatchWarning('zh', { text: ES })).toMatch(/does not look like/);
  });

  it('is null when everything agrees', () => {
    expect(mismatchWarning('es', { declared: 'es-MX', text: ES })).toBeNull();
    expect(mismatchWarning('zh', { text: ZH })).toBeNull();
  });
});

describe('languageFromTag places a book on a shelf', () => {
  it('reads every code we accept', () => {
    expect(languageFromTag('es')).toBe('es');
    expect(languageFromTag('ES-MX')).toBe('es');
    expect(languageFromTag('zho')).toBe('zh');
    expect(languageFromTag('fre')).toBe('fr');
  });

  // Undefined means "no idea", never "not this one" — the caller shows such a book everywhere
  // rather than hiding it, so a wrong guess here would lose someone's book.
  it('refuses to guess from a display name or an unknown language', () => {
    expect(languageFromTag('简体中文')).toBeUndefined();
    expect(languageFromTag('Chinese')).toBeUndefined();
    expect(languageFromTag('de')).toBeUndefined();
    expect(languageFromTag(undefined)).toBeUndefined();
    expect(languageFromTag('')).toBeUndefined();
  });
});
