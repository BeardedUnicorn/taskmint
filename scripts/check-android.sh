#!/usr/bin/env bash
# The phone's own code (apps/desktop/src-tauri/gen/android): compiles the
# Kotlin and runs its unit tests (the widgets' figures: WidgetFiguresTest).
# Nothing else in verify.sh compiles the Kotlin, and coverage doesn't
# measure it.
#
# It needs what an Android build needs: the Android SDK (ANDROID_HOME), a
# JDK 17 or later, and the files the Tauri CLI writes into the project
# (gitignored: `pnpm tauri android init`, or copied from a checkout that has
# built for Android). Without them it says what's missing and passes, since
# CI's runners and a desktop-only checkout have none of it. With
# TASKMINT_REQUIRE_ANDROID=1 it fails instead (before an Android release).
#
# Usage: scripts/check-android.sh
set -euo pipefail
cd "$(dirname "$0")/../apps/desktop/src-tauri/gen/android"

skip() {
  printf '\n!!! NOT CHECKED: the Android Kotlin and its tests. %s\n\n' "$1" >&2
  if [ "${TASKMINT_REQUIRE_ANDROID:-}" = "1" ]; then exit 1; fi
  exit 0
}

sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
[ -n "$sdk" ] && [ -d "$sdk" ] || skip "ANDROID_HOME isn't set to an Android SDK."

command -v java >/dev/null 2>&1 || skip "There's no java (a JDK 17 or later)."
java_major="$(java -version 2>&1 | sed -n 's/.*version "\([0-9]*\).*/\1/p' | head -n 1)"
[ "${java_major:-0}" -ge 17 ] || skip "java is version ${java_major:-unknown}; the build needs 17 or later."

for written in tauri.settings.gradle app/tauri.build.gradle.kts app/src/main/java/com/taskmint/android/generated/Rust.kt; do
  [ -e "$written" ] || skip "The Tauri CLI's file $written is missing (pnpm tauri android init)."
done

# The Rust library isn't built: the Kotlin compiles and its tests run without it
./gradlew :app:compileArm64DebugKotlin :app:testArm64DebugUnitTest -x rustBuildArm64Debug --console=plain -q
printf 'The Android Kotlin compiles and its tests pass.\n'
