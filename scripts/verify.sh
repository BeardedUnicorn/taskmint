#!/usr/bin/env bash
# Every gate a phase must pass before it merges (CI runs the same steps).
# Usage: scripts/verify.sh
set -euo pipefail
cd "$(dirname "$0")/.."

step() { printf '\n==> %s\n' "$*"; }

step "Coverage policy"
node scripts/check-coverage-policy.mjs

step "Pinned toolchains agree"
node scripts/check-toolchains.mjs

step "Contracts match the Rust (the TypeScript checks below use them)"
scripts/check-contracts.sh

step "Formatting and lint for the TypeScript and JavaScript (biome.jsonc)"
pnpm exec biome ci

step "The release script's logic (node --test)"
pnpm test:scripts

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

printf '\nAll gates passed.\n'
