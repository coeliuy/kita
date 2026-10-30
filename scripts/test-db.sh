#!/usr/bin/env bash
# Runs the database security tests against a throwaway local PostgreSQL.
# Needs PostgreSQL 15 or later installed (initdb, pg_ctl and psql).
set -euo pipefail
cd "$(dirname "$0")/.."
BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DIR="$(mktemp -d)"
PORT=54329
run() { if [ "$(id -u)" = 0 ]; then su postgres -s /bin/bash -c "$*"; else bash -c "$*"; fi; }
[ "$(id -u)" = 0 ] && chown postgres "$DIR"
trap 'run "$BIN/pg_ctl -D $DIR/data stop -m fast" >/dev/null 2>&1 || true; rm -rf "$DIR"' EXIT
run "$BIN/initdb -D $DIR/data -A trust -U postgres" >/dev/null
run "$BIN/pg_ctl -D $DIR/data -o '-p $PORT -k $DIR' -l $DIR/log start -w" >/dev/null
PSQL="$BIN/psql -h $DIR -p $PORT -U postgres -d postgres -q -v ON_ERROR_STOP=1"
run "$PSQL -f supabase/tests/local_auth_stub.sql"
for f in supabase/migrations/*.sql; do run "$PSQL -f $f"; done
run "$PSQL -t -f supabase/tests/rls_test.sql" 2>&1 | grep -E "ok:|FAILED|ERROR" | sed "s/^psql:[^ ]* //; s/^NOTICE:  //"
echo "Database security tests passed."
