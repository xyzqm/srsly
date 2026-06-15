import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

// Recursively search parsed JSON for arrays of card-like objects
function findCards(val: unknown, depth = 0): Array<{ term: string; def: string }> | null {
  if (depth > 12 || val == null || typeof val !== 'object') return null;

  if (Array.isArray(val)) {
    const cards: Array<{ term: string; def: string }> = [];
    for (const item of val) {
      if (item && typeof item === 'object') {
        const o = item as Record<string, unknown>;
        const term = (o.word ?? o.term ?? o.front) as string | undefined;
        const def  = (o.definition ?? o.back ?? o.meaning) as string | undefined;
        if (term && def && typeof term === 'string' && typeof def === 'string') {
          cards.push({ term: term.trim(), def: def.trim() });
        }
      }
    }
    if (cards.length > 0) return cards;
  }

  for (const v of Object.values(val as Record<string, unknown>)) {
    const result = findCards(v, depth + 1);
    if (result && result.length > 0) return result;
  }
  return null;
}

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"macOS"',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'none',
  'upgrade-insecure-requests': '1',
};

export async function POST(req: NextRequest) {
  let url: string;
  try {
    ({ url } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  if (!url || !url.includes('quizlet.com')) {
    return NextResponse.json({ error: 'Please provide a Quizlet URL.' }, { status: 400 });
  }

  // Extract the numeric set ID from the URL
  const setIdMatch = url.match(/quizlet\.com\/(\d+)/);
  const setId = setIdMatch?.[1];

  // Strategy 1: Quizlet's internal API endpoint (less bot-protected than the HTML page)
  if (setId) {
    try {
      const apiRes = await fetch(
        `https://quizlet.com/webapi/3.2/sets/${setId}?filters[include_ids]=${setId}&perPage=500`,
        { headers: { ...BROWSER_HEADERS, Accept: 'application/json' }, redirect: 'follow' }
      );
      if (apiRes.ok) {
        const json = await apiRes.json();
        const cards = findCards(json);
        if (cards && cards.length > 0) return NextResponse.json({ cards });
      }
    } catch { /* fall through */ }

    // Strategy 2: Try the GraphQL/RPC endpoint some clients use
    try {
      const rpcRes = await fetch(
        `https://quizlet.com/api/3.2/sets/${setId}?filters[include_ids]=${setId}&perPage=500`,
        { headers: { ...BROWSER_HEADERS, Accept: 'application/json' }, redirect: 'follow' }
      );
      if (rpcRes.ok) {
        const json = await rpcRes.json();
        const cards = findCards(json);
        if (cards && cards.length > 0) return NextResponse.json({ cards });
      }
    } catch { /* fall through */ }
  }

  // Strategy 3: Fetch the HTML page and parse __NEXT_DATA__
  try {
    const res = await fetch(url, { headers: BROWSER_HEADERS, redirect: 'follow' });

    if (res.status === 403 || res.status === 429) {
      return NextResponse.json({
        error: 'Quizlet is blocking automated access (bot protection). Use the manual export below instead: open the set in Quizlet → ⋯ More → Export, then paste the text.',
        blocked: true,
      }, { status: 422 });
    }

    if (!res.ok) {
      return NextResponse.json({
        error: `Quizlet returned ${res.status}. The set may be private or the link may be wrong.`,
        blocked: true,
      }, { status: 422 });
    }

    const html = await res.text();

    const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([^<]+)<\/script>/);
    if (nextDataMatch) {
      try {
        const data = JSON.parse(nextDataMatch[1]);
        const cards = findCards(data);
        if (cards && cards.length > 0) return NextResponse.json({ cards });
      } catch { /* fall through */ }
    }
  } catch { /* fall through */ }

  return NextResponse.json({
    error: 'Could not extract cards from this set. Use the manual export below: open the set in Quizlet → ⋯ More → Export, then paste the text.',
    blocked: true,
  }, { status: 422 });
}
