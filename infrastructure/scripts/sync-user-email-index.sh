#!/usr/bin/env bash
# ── Bring user-profile's email lookup copy in line with auth ─────────────────────
#
# `user_email_index` (profiles_db) is a projection: a row is born from `auth.user.registered`
# and its roles follow `auth.user.role_assigned` / `role_removed`. Accounts created before the
# projection existed, roles granted before the role events existed (plan 90, session 17) and
# accounts erased before user-profile listened to `auth.user.deleted` leave it behind auth.
# This compares the two and, with --apply, makes the copy match auth in one transaction:
# missing accounts are added, e-mail and role set rewritten where they differ, rows of
# accounts auth no longer has are removed. Profiles themselves are not touched.
#
# Usage: sync-user-email-index.sh            # show the differences only
#        sync-user-email-index.sh --apply    # write them
#
# Env: PG_CONTAINER (default infrastructure-postgres-1), PG_USER (default ssz_admin).

set -euo pipefail

PG="${PG_CONTAINER:-infrastructure-postgres-1}"
PGUSER="${PG_USER:-ssz_admin}"
APPLY=0
[[ "${1:-}" == "--apply" ]] && APPLY=1

psql_at() { docker exec -i "$PG" psql -U "$PGUSER" -v ON_ERROR_STOP=1 -At "$@"; }

# Auth's view: one row per account, roles sorted, as CSV ready for COPY.
AUTH_CSV="$(psql_at -d auth_db -c "copy (
  select u.id, u.email,
         coalesce(array_agg(r.name order by r.name) filter (where r.name is not null), '{}')
  from users u
  left join user_roles ur on ur.user_id = u.id
  left join roles r on r.id = ur.role_id
  group by u.id, u.email
  order by u.id) to stdout with (format csv)")"

ACTION="rollback"
[[ $APPLY -eq 1 ]] && ACTION="commit"

{
  cat <<'SQL'
begin;
create temp table src (user_id text primary key, email text not null, roles text[] not null);
copy src from stdin with (format csv);
SQL
  printf '%s\n' "$AUTH_CSV"
  printf '\\.\n'
  cat <<'SQL'
create temp view diff as
  select 'add' as change, s.user_id, s.email, s.roles from src s
    where not exists (select 1 from user_email_index i where i.user_id = s.user_id)
  union all
  select 'update', s.user_id, s.email, s.roles from src s
    join user_email_index i on i.user_id = s.user_id
    where i.email is distinct from s.email
       or (select array_agg(x order by x) from unnest(i.roles) x)
          is distinct from (select array_agg(x order by x) from unnest(s.roles) x)
  union all
  select 'remove', i.user_id, i.email, i.roles from user_email_index i
    where not exists (select 1 from src s where s.user_id = i.user_id);
select change || ' ' || user_id || ' ' || email || ' ' || array_to_string(roles, ',')
  from diff order by change, email;
delete from user_email_index i where not exists (select 1 from src s where s.user_id = i.user_id);
insert into user_email_index (user_id, email, roles, updated_at)
  select user_id, email, roles, now() from diff where change in ('add', 'update')
  on conflict (user_id) do update set email = excluded.email, roles = excluded.roles, updated_at = now();
SQL
  echo "$ACTION;"
} | psql_at -d profiles_db -q

if [[ $APPLY -eq 1 ]]; then echo "applied"; else echo "dry run — nothing written (pass --apply)"; fi
