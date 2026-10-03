#!/usr/bin/env bash
# ── Plan 63, phase 5 → 7: a daily reading of the two memory models ────────────
#
# Phase 5 writes a card per grammar atom beside the exercise and gap cards that have
# always been there, and phase 7 may only switch the old ones off once the two have been
# compared. A comparison made from one snapshot on the last day is not a comparison: what
# is wanted is how the schedules *diverged*, which means a reading a day.
#
# Nothing here produces evidence. Shadow cards are written by learners doing exercises;
# this only records where both models stand each evening. If nobody studies that day, the
# numbers repeat — which is itself worth seeing in the series.
#
# Writes one directory per day and appends one line to summary.tsv. Safe to run twice.
# Silent about a stand that is switched off: that is an ordinary evening, not an error.

set -uo pipefail

OUT_ROOT="${SHADOW_SNAPSHOT_DIR:-$HOME/ssz-platform-shadow}"
PG=infrastructure-postgres-1
DAY="$(date +%F)"
STAMP="$(date --iso-8601=seconds)"
DIR="$OUT_ROOT/$DAY"
LOG="$OUT_ROOT/snapshot.log"

mkdir -p "$OUT_ROOT"

note() { printf '%s  %s\n' "$STAMP" "$*" >> "$LOG"; }

if ! docker exec "$PG" pg_isready -q 2>/dev/null; then
  note "stand down — nothing recorded"
  exit 0
fi

mkdir -p "$DIR"

# psql as one database's owner; -A -F$'\t' keeps the output diffable and awk-able, and
# `footer=off` drops the "(N rows)" line psql prints even unaligned — left in, it counts
# as a row and every number in the summary is one too many.
q() {
  local db="$1" user="$2" sql="$3"
  docker exec "$PG" psql -U "$user" -d "$db" -A -F$'\t' -P footer=off -c "$sql" 2>/dev/null
}

# 1. The new model: one card per grammar atom, written in shadow.
q learning_db learning_service "
  SELECT user_id, content_id AS atom_id, track, state, due_at, stability, difficulty,
         reps, lapses, last_reviewed_at, created_at
    FROM srs_review_cards
   WHERE content_type = 'grammar_atom'
   ORDER BY user_id, content_id;
" > "$DIR/grammar-atom-cards.tsv"

# 2. The old model, for the same learners: the exercise and gap cards a switch-off would
#    suspend. Kept whole rather than aggregated — the interesting question in a fortnight
#    may not be the one being asked today.
q learning_db learning_service "
  SELECT user_id, content_type, content_id, track, state, due_at, stability,
         reps, lapses, last_reviewed_at
    FROM srs_review_cards
   WHERE content_type IN ('exercise', 'exercise_gap')
     AND user_id IN (SELECT DISTINCT user_id FROM srs_review_cards
                      WHERE content_type = 'grammar_atom')
   ORDER BY user_id, content_type, content_id;
" > "$DIR/exercise-cards.tsv"

# 3. The addresses as they stand today. An author may re-anchor or retire one, and then
#    yesterday's rows have to be read against yesterday's map.
q content_db content_service "
  SELECT t.exercise_id, t.item_key, t.atom_id, t.role, a.key, a.track
    FROM exercise_item_targets t
    JOIN grammar_rule_atoms a ON a.id = t.atom_id
   WHERE t.atom_type = 'grammar_rule_atom'
   ORDER BY t.exercise_id, t.item_key;
" > "$DIR/grammar-targets.tsv"

# 4. What the day actually produced, from the side that records every rating.
q analytics_db analytics_service "
  SELECT user_id, atom_id, content_type, modality, role, rating_applied,
         passed, score, stability_after, occurred_at
    FROM atom_evidence
   WHERE atom_type = 'grammar_rule_atom'
   ORDER BY occurred_at;
" > "$DIR/grammar-atom-evidence.tsv"

# Header rows are part of psql's output; subtract one, and never report -1 for a file
# that failed to write.
rows() { local n; n=$(($(wc -l < "$1" 2>/dev/null || echo 1) - 1)); ((n < 0)) && n=0; echo "$n"; }

ATOM_CARDS=$(rows "$DIR/grammar-atom-cards.tsv")
OLD_CARDS=$(rows "$DIR/exercise-cards.tsv")
TARGETS=$(rows "$DIR/grammar-targets.tsv")
EVIDENCE=$(rows "$DIR/grammar-atom-evidence.tsv")

# Ratings that landed since the previous snapshot — the number that says whether the
# fortnight is collecting anything at all.
YESTERDAY_EVIDENCE=$(awk -F'\t' '$1 == "evidence_total" {last = $2} END {print last + 0}' \
  <(awk -F'\t' 'NR > 1 {print "evidence_total\t" $5}' "$OUT_ROOT/summary.tsv" 2>/dev/null))
NEW_EVIDENCE=$((EVIDENCE - YESTERDAY_EVIDENCE))
((NEW_EVIDENCE < 0)) && NEW_EVIDENCE=0

if [[ ! -f "$OUT_ROOT/summary.tsv" ]]; then
  printf 'date\tatom_cards\told_cards\tgrammar_targets\tevidence_total\tevidence_new\n' \
    > "$OUT_ROOT/summary.tsv"
fi

# One line per day, last write of the day wins.
grep -v "^$DAY	" "$OUT_ROOT/summary.tsv" > "$OUT_ROOT/summary.tmp" 2>/dev/null
mv "$OUT_ROOT/summary.tmp" "$OUT_ROOT/summary.tsv"
printf '%s\t%s\t%s\t%s\t%s\t%s\n' \
  "$DAY" "$ATOM_CARDS" "$OLD_CARDS" "$TARGETS" "$EVIDENCE" "$NEW_EVIDENCE" \
  >> "$OUT_ROOT/summary.tsv"

note "atom_cards=$ATOM_CARDS old_cards=$OLD_CARDS targets=$TARGETS evidence=$EVIDENCE (+$NEW_EVIDENCE)"
