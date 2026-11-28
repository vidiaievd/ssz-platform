#!/usr/bin/env bash
# ── Clear stale deletion marks in analytics' container directory ─────────────────
#
# Before plan 90, phase 5, step 4b a `content.container.deleted` without a containerId made
# analytics mark the whole `container_directory` deleted (Prisma drops an undefined filter).
# The consumer is fixed, but the rows it marked stayed: their courses vanished from the
# school dashboard ("course health") and from at-risk progress. A later publish or a
# re-create now clears the mark by itself; this script repairs rows that see neither.
# It compares with content_db and, with --apply, clears `deleted_at` on every row whose
# container is alive in content (present, `deleted_at` null). Rows of containers content
# has really deleted or no longer has are left as they are.
#
# Usage: repair-analytics-container-directory.sh            # show the rows only
#        repair-analytics-container-directory.sh --apply    # write them
#
# Env: PG_CONTAINER (default infrastructure-postgres-1), PG_USER (default ssz_admin).

set -euo pipefail

PG="${PG_CONTAINER:-infrastructure-postgres-1}"
PGUSER="${PG_USER:-ssz_admin}"
APPLY=0
[[ "${1:-}" == "--apply" ]] && APPLY=1

psql_at() { docker exec -i "$PG" psql -U "$PGUSER" -v ON_ERROR_STOP=1 -At "$@"; }

# Content's live containers, as CSV ready for COPY.
LIVE_CSV="$(psql_at -d content_db -c "copy (
  select id::text from containers where deleted_at is null order by id) to stdout with (format csv)")"

ACTION="rollback"
[[ $APPLY -eq 1 ]] && ACTION="commit"

{
  cat <<'SQL'
begin;
create temp table live (container_id text primary key);
copy live from stdin with (format csv);
SQL
  printf '%s\n' "$LIVE_CSV"
  printf '\\.\n'
  cat <<'SQL'
select 'revive ' || d.container_id || ' ' || d.title || ' (marked ' || d.deleted_at || ')'
  from container_directory d join live l using (container_id)
  where d.deleted_at is not null order by d.title;
update container_directory d set deleted_at = null
  from live l where l.container_id = d.container_id and d.deleted_at is not null;
SQL
  echo "$ACTION;"
} | psql_at -d analytics_db -q

if [[ $APPLY -eq 1 ]]; then echo "applied"; else echo "dry run — nothing written (pass --apply)"; fi
