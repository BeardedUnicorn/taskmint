#!/usr/bin/env bash
# The server's own gates: its query metadata (.sqlx) matches the queries,
# and its tests cover it 100%. DATABASE_URL names a Postgres the tests may
# create databases on (each test makes its own).
#
# Runs on the host from verify.sh, and in Linux as the compose `server-tests`
# service (profile `test`), as CI's docker job runs it:
#
#   docker compose --profile test run --rm --build server-tests
#
# Needs sqlx-cli 0.8.6, cargo-llvm-cov and node (the coverage policy).
set -euo pipefail
cd "$(dirname "$0")/.."
: "${DATABASE_URL:?set DATABASE_URL to a Postgres the tests may create databases on}"

step() { printf '\n==> %s\n' "$*"; }

step "Server database migrated (the query check reads its schema)"
(cd apps/server && cargo sqlx migrate run)

step "Server query metadata (.sqlx) matches the queries"
(cd apps/server && cargo sqlx prepare --check)

step "Server coverage (100%)"
# Instrumented builds from an earlier run count too (a function is scored by
# its best build), so measure from a clean slate. Dependencies stay built.
cargo llvm-cov clean --workspace
cargo llvm-cov -p taskmint-server \
  --fail-under-lines 100 --fail-under-functions 100 --fail-under-regions 100 \
  --ignore-filename-regex "$(node scripts/check-coverage-policy.mjs --rust-ignore-regex apps/server)"
