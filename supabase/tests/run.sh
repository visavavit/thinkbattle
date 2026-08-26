#!/usr/bin/env bash
#
# Replays every migration in supabase/migrations against a throwaway local
# Postgres and runs the behaviour tests in this directory against the result.
#
# Nothing here talks to the real project. It exists because the rules that make
# image attachments safe — you may only post your own upload, hiding a take
# takes its picture down, nothing reaches storage without a ledger row that can
# delete it again — live in triggers, and a trigger nobody has ever fired is a
# comment with syntax highlighting.
#
# Usage:  supabase/tests/run.sh [/path/to/pg/bin]
#
# Needs a Postgres 16 server binary directory (initdb, pg_ctl, psql) and a
# non-root user to run the cluster as; Postgres refuses to start as root.
set -euo pipefail

PGBIN="${1:-/usr/lib/postgresql/16/bin}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORK="${TT_TEST_DIR:-$(mktemp -d)}"

"$PGBIN/initdb" -D "$WORK/data" -U postgres --auth=trust >/dev/null
"$PGBIN/pg_ctl" -D "$WORK/data" -l "$WORK/log" \
  -o "-k $WORK -p 5433 -c listen_addresses=" start >/dev/null
trap '"$PGBIN/pg_ctl" -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true' EXIT

P="$PGBIN/psql -h $WORK -p 5433 -U postgres"
$P -d postgres -q -c 'create database tt' >/dev/null
PSQL="$P -d tt -v ON_ERROR_STOP=1 -q"

# Supabase gives a project an auth schema, four roles, a realtime publication
# and pg_cron/pg_net. None of that ships with plain Postgres.
$PSQL -c 'create publication supabase_realtime' >/dev/null 2>&1 || true
$PSQL -f "$ROOT/supabase/tests/00-supabase-shim.sql" >/dev/null

# pg_cron and pg_net cannot be installed here, and the migrations only use them
# to schedule jobs — not something these tests are about.
mkdir -p "$WORK/mig"
for f in "$ROOT"/supabase/migrations/*.sql; do
  sed -E 's/^create extension if not exists (pg_cron|pg_net);/select 1;/I' "$f" > "$WORK/mig/$(basename "$f")"
done

# Two passes: the migration files are not a strictly ordered history — a couple
# reference tables created by a later-timestamped file — so anything that fails
# first time round is retried once its dependencies exist. Two are expected to
# fail both times and are listed in README.md.
deferred=()
for f in "$WORK"/mig/*.sql; do
  $PSQL -f "$f" >/dev/null 2>&1 || deferred+=("$f")
done
for f in "${deferred[@]:-}"; do
  [ -n "$f" ] || continue
  $PSQL -f "$f" >/dev/null 2>&1 || echo "note: $(basename "$f") did not apply (see README.md)"
done

fail=0
for t in "$ROOT"/supabase/tests/*.sql; do
  case "$(basename "$t")" in 00-*) continue;; esac
  echo "== $(basename "$t")"
  if ! $PSQL -f "$t" 2>&1 | grep -E 'PASS|FAIL|ERROR'; then fail=1; fi
done
exit $fail
