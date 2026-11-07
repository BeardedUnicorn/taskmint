#!/usr/bin/env bash
# Every gate a phase must pass before it merges (CI runs the same steps).
# Usage: scripts/verify.sh
set -euo pipefail
cd "$(dirname "$0")/.."

step() { printf '\n==> %s\n' "$*"; }

step "Coverage policy"
node scripts/check-coverage-policy.mjs

step "Pinned toolchains agree (rust-toolchain.toml, .node-version, the Dockerfiles)"
node scripts/check-toolchains.mjs

step "Contracts match the Rust (the TypeScript checks below use them)"
scripts/check-contracts.sh

step "TypeScript (sources and tests)"
pnpm typecheck

step "Build (the desktop build must precede cargo: generate_context! embeds its dist)"
pnpm build

step "Unit tests with coverage gates"
pnpm test:coverage

step "Rust format"
cargo fmt --all --check

step "Rust lints"
cargo clippy --workspace --all-targets -- -D warnings
# With the TypeScript derives and the contracts generator, and the desktop's
# failpoints
cargo clippy -p taskmint-core --features ts --all-targets -- -D warnings
cargo clippy -p taskmint --features failpoints --all-targets -- -D warnings

step "Server database (compose db; the server tests make their own databases on it)"
docker compose up -d --wait db
export DATABASE_URL="postgres://taskmint:${POSTGRES_PASSWORD:-taskmint}@127.0.0.1:${DB_PORT:-5433}/taskmint"

step "Rust tests"
cargo test --workspace

step "Rust coverage: taskmint-core at 100%"
# Instrumented binaries from an earlier run count too (a function is scored
# by its best build), so each run measures from a clean slate
cargo llvm-cov clean --workspace
cargo llvm-cov -p taskmint-core --summary-only \
  --ignore-filename-regex "$(node scripts/check-coverage-policy.mjs --rust-ignore-regex crates/taskmint-core)" \
  --fail-under-lines 100 --fail-under-functions 100 --fail-under-regions 100

step "Rust coverage: the desktop shell at 100% (failpoints on)"
cargo llvm-cov -p taskmint --features failpoints --summary-only \
  --ignore-filename-regex "$(node scripts/check-coverage-policy.mjs --rust-ignore-regex apps/desktop/src-tauri)" \
  --fail-under-lines 100 --fail-under-functions 100 --fail-under-regions 100

step "The server's gates in Linux: query metadata, 100% coverage (compose test profile, as CI runs them)"
docker compose --profile test run --rm --build server-tests

step "The images, smoke-tested as a stack of their own, with the desktop's server mode and the extension on it (the dev stack and its data are left alone)"
(
  export COMPOSE_PROJECT_NAME=taskmint-verify
  export DB_PORT=15433 SERVER_PORT=13000 WEB_PORT=18080
  export PUBLIC_ORIGIN="http://localhost:${WEB_PORT}" COOKIE_SECURE=false
  export ADMIN_USERNAME=verify-admin ADMIN_PASSWORD="$(openssl rand -hex 16)"
  trap 'docker compose down -v >/dev/null 2>&1' EXIT
  docker compose up --build -d --wait
  node scripts/smoke.mjs
  # The smoke test accepted an invite through the web app: its access log
  # has the link with the secret replaced, and no log has the secret
  # (Read first: grep -q stops reading early, which pipefail counts as failing)
  logs=$(docker compose logs web server)
  grep -q '/api/v1/invites/\[redacted\]/accept' <<<"$logs"
  if grep -E '/(invite|reset|invites|password-resets)/[A-Za-z0-9_-]{43}' <<<"$logs"; then
    echo "A link's secret reached the logs" >&2
    exit 1
  fi
  # The desktop's server mode on the same stack (apps/desktop/src-tauri/tests/server_mode.rs)
  TASKMINT_SERVER_URL="http://localhost:${WEB_PORT}" cargo test -q -p taskmint --test server_mode -- --ignored
  # The built browser extension delivering to it (apps/extension/live-check.mjs)
  TASKMINT_URL="http://localhost:${WEB_PORT}" node apps/extension/live-check.mjs
)

printf '\nAll gates passed.\n'
