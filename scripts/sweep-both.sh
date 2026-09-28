#!/usr/bin/env bash
#
# BOTH PROVIDERS, SAME DAY, PAIRED — the protocol CLAUDE.md says is the only affordable way
# to settle Gemini against Groq.
#
# Three attempts measured the two providers and none was a result. The last one had the same
# band table and ran a day apart: Gemini 15.1% +/- 3.3 (n=7) against Groq 11.1% +/- 6.2 (n=6),
# t = 1.42 against a design needing 8.1 points. The blocker is structural, not luck — Gemini's
# free tier yields about SEVEN passages before the daily quota is spent, so n=30 in one evening
# cannot be bought at any price in patience.
#
# What works instead is accumulating: run BOTH on the SAME day, every day, for about a week.
# n reaches ~35 each, and pairing on the day cancels the topic confound outright rather than
# apologising for it — `lib/passageTheme.ts` seeds topic and form on the date, and the last run
# showed exactly why that matters: 7 of Gemini's 78 above-level tokens were `cafeteria`, because
# the day's draw handed it two passages about cafes.
#
# So this script exists to make "both, today" one command that cannot be half-done. It appends
# one row per provider per day to measurements/paired-log.tsv, which after a week IS the result.
#
#   bash scripts/sweep-both.sh          # 30 passages per provider at A1
#   PER=10 bash scripts/sweep-both.sh   # a shorter run
#
# Gemini first, deliberately: its quota is the scarce one and Groq recovers from throttling
# with waits, so spending Groq's time first would eat the evening before Gemini is reached.
set -uo pipefail
cd "$(dirname "$0")/.."

PER="${PER:-30}"
LEVEL="${LEVEL:-1}"
LANG_CODE="${LANG_CODE:-es}"
DAY="$(date +%Y-%m-%d)"
LOG="measurements/paired-log.tsv"

if ! curl -s -o /dev/null --max-time 5 http://localhost:3000; then
  echo "The dev server is not answering on :3000. Start it first, in another tab:"
  echo
  echo "    SRSLY_MODEL_GEMINI=gemini-3.7-flash npm run dev"
  echo
  echo "The override matters: the pinned gemini-3.8-flash has returned 503 on three separate"
  echo "days, and 3.7-flash generates in 12-28s. Without it the Gemini half of this is wasted."
  exit 1
fi

run_one() {                       # $1 = provider label, $2 = env file
  local name="$1" envfile="$2" dir="measurements/${1}-${DAY}"
  if [ ! -f "$envfile" ]; then
    echo "!! $envfile is missing — skipping $name. Put its key there, never on a command line."
    return
  fi
  echo
  echo "=== $name — $PER passages at level $LEVEL, into $dir ==="
  set -a; . "./$envfile"; set +a
  node scripts/sweep-readability.mjs http://localhost:3000 "$dir" "$PER" "$LEVEL" "$LANG_CODE"
  unset SRSLY_SWEEP_KEY          # never leave one provider's key set for the next run

  if [ ! -f "$dir/level-${LEVEL}.json" ]; then
    echo "   $name produced no dump — nothing to measure."
    return
  fi
  SWEEP_DIR="$dir" npx vitest run --config scripts/analyse-sweep.vitest.mts >/dev/null 2>&1
  local line; line="$(sed -n '2p' "$dir/readability.txt")"
  local n;    n="$(sed -n '1p' "$dir/readability.txt" | grep -o 'n=[0-9]*' | cut -d= -f2)"
  local pooled mean sd
  pooled="$(echo "$line" | grep -o 'pooled [0-9.]*%'      | awk '{print $2}')"
  mean="$(  echo "$line" | grep -o 'per-passage [0-9.]*%' | awk '{print $2}')"
  sd="$(    echo "$line" | grep -o '± [0-9.]*%'           | awk '{print $2}')"
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$DAY" "$name" "${n:-0}" "$pooled" "$mean" "$sd" >> "$LOG"
  echo "   $name: n=${n:-0}  pooled $pooled  per-passage $mean ± $sd"
}

[ -f "$LOG" ] || printf 'day\tprovider\tn\tpooled\tper_passage_mean\tsd\n' > "$LOG"

run_one gemini .env.sweep
run_one groq   .env.sweep.groq

echo
echo "=== the running log — this is the result, once it has a week in it ==="
column -t -s "$(printf '\t')" "$LOG"
echo
awk -F'\t' 'NR>1 && $3+0>0 { n[$2]+=$3; d[$2]++ } END {
  printf "cumulative: "; for (p in n) printf "%s n=%d over %d day(s)   ", p, n[p], d[p]; print "" }' "$LOG"
