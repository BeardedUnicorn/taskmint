#!/usr/bin/env bash
# The Firestore security rules' tests (firebase/firestore.rules.test.mjs), on
# the emulator. The emulator needs Java 21 or later: the java on PATH, or
# Homebrew's openjdk when that one is older.
set -euo pipefail
cd "$(dirname "$0")/.."

java_major() { "$1" -version 2>&1 | sed -nE 's/.*version "([0-9]+).*/\1/p' | head -1; }

if [ "$(java_major java || echo 0)" -lt 21 ]; then
  brew_java=/opt/homebrew/opt/openjdk/bin/java
  if [ -x "$brew_java" ] && [ "$(java_major "$brew_java")" -ge 21 ]; then
    export PATH="$(dirname "$brew_java"):$PATH"
  else
    echo "The Firestore emulator needs Java 21 or later (brew install openjdk)" >&2
    exit 1
  fi
fi

exec pnpm firebase emulators:exec --project demo-taskmint --only firestore \
  "node --test firebase/firestore.rules.test.mjs"
