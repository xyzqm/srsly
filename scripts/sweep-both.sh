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
# So this script exists to make "both, today" one command that cannot be half-done. It keeps
# one row per provider per day in measurements/paired-log.tsv, which after a week IS the result.
#
# ⚠ ONE ROW PER PROVIDER PER DAY, AND IT USED TO APPEND INSTEAD — WHICH IS A DOUBLE-COUNT.
# `run_one` ended in `>> "$LOG"`, so running this twice on one afternoon wrote the day twice.
# That is not extra data and CLAUDE.md already says why: `passageTopic(date, language, level,
# offset)` is a pure function of the date, and a fresh sweep wipes the day's cache and restarts
# `offset` at 0 — so the second run regenerates the IDENTICAL topic sequence and measures the
# same sample again. The log carried 2026-09-29 three times over for exactly this reason, and
# the cumulative line at the foot summed the duplicates: it reported groq n=190 over 10 days
# where the truth was 181 over 7. `upsert_row` REPLACES a day's row now, and `normalise_log`
# repairs a file that was written before it did.
#
# ⚠ AND THE ROWS ARE ONLY COMPARABLE WHILE THE BAND TABLE HOLDS STILL. `analyse-sweep` scores a
# dump against whatever `lib/data/cefr-levels.json` says TODAY, so a row is a measurement of the
# passages AND of the table that was current when it ran. Re-scoring the 2026-09-28 dump after
# the fact reads 11.2% where the log recorded 13.5% — same 25 passages, nothing else changed —
# because `8b44317` pinned fifteen more words to A1 later that same day. Every other row in the
# log re-scores to exactly what it recorded, so the table has been still since 09-29 and 09-28
# was the one row measured on the old one.
#
# Nothing here can detect that: the script cannot know which table a row was scored against.
# What it can do is keep the DUMP, which is why `measurements/<provider>-<day>/` is not deleted
# — a row whose dump survives can be re-scored onto the current table and rejoin the series. A
# row whose dump is gone (the early gemini days wiped theirs on a re-run) cannot, and is stuck
# wherever it was measured. If you change the band table mid-week, re-score every surviving dump
# before reading the log as a series.
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

TAB="$(printf '\t')"

# Replace this (day, provider)'s row rather than adding a second one, and keep the file sorted
# by day then provider so it reads as a series. Writing through a temp file and moving it is
# what stops an interrupted run truncating the only copy of the week's results.
upsert_row() {                    # $1=day $2=provider $3=n $4=pooled $5=mean $6=sd
  local tmp; tmp="$(mktemp)"
  {
    head -1 "$LOG"
    {
      awk -F'\t' -v d="$1" -v p="$2" 'NR>1 && !($1==d && $2==p)' "$LOG"
      printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$@"
    } | sort -t"$TAB" -k1,1 -k2,2
  } > "$tmp"
  mv "$tmp" "$LOG"
}

# Collapse a log written by the old appending version: LAST row wins for each (day, provider).
# Last rather than largest-n, because that is what `upsert_row` would have produced had it
# always existed — the repair and the fix agree, so re-running this is a no-op on a clean file.
# Idempotent and safe to run on every sweep, which is why it runs on every sweep.
normalise_log() {
  [ -f "$LOG" ] || return 0
  local tmp; tmp="$(mktemp)"
  {
    head -1 "$LOG"
    awk -F'\t' 'NR==FNR { if (FNR>1) last[$1 FS $2]=FNR; next }
                 FNR>1 && last[$1 FS $2]==FNR' "$LOG" "$LOG" | sort -t"$TAB" -k1,1 -k2,2
  } > "$tmp"
  if ! cmp -s "$tmp" "$LOG"; then
    echo "   (paired-log.tsv held duplicate day/provider rows — collapsed to the last of each)"
    mv "$tmp" "$LOG"
  else
    rm -f "$tmp"
  fi
}

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
  upsert_row "$DAY" "$name" "${n:-0}" "$pooled" "$mean" "$sd"
  echo "   $name: n=${n:-0}  pooled $pooled  per-passage $mean ± $sd"
}

[ -f "$LOG" ] || printf 'day\tprovider\tn\tpooled\tper_passage_mean\tsd\n' > "$LOG"
normalise_log

run_one gemini .env.sweep
run_one groq   .env.sweep.groq

echo
echo "=== the running log — this is the result, once it has a week in it ==="
column -t -s "$(printf '\t')" "$LOG"
echo
awk -F'\t' 'NR>1 && $3+0>0 { n[$2]+=$3; d[$2]++ } END {
  printf "cumulative: "; for (p in n) printf "%s n=%d over %d day(s)   ", p, n[p], d[p]; print "" }' "$LOG"
