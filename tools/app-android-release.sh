#!/bin/sh
# Kiwi Pro Android: checked source -> signed Play bundle (.aab), ready to upload.
# The Android twin of tools/app-archive.sh. See docs/ops/APP.md and APP_STORE.md.
#
#   KIWI_VERSION_CODE=2 sh tools/app-android-release.sh
#
# KIWI_VERSION_CODE must be higher than every bundle Play has already seen.
# KIWI_VERSION_NAME defaults to the iOS MARKETING_VERSION, so both stores show
# the same version. The upload key lives outside the repo:
#   KIWI_ANDROID_KEYSTORE  default ~/.kiwi-signing/kiwi-pro-upload.jks
#   its password           macOS Keychain, service kiwi-android-upload, account kiwi-pro
#                          (or KIWI_ANDROID_KEYSTORE_PASSWORD in CI)
# Nothing here uploads to Play: the bundle is handed to the Play Console by hand.
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
CODE=${KIWI_VERSION_CODE:-}
case "$CODE" in ''|*[!0-9]*|0*) echo 'KIWI_VERSION_CODE must be a new positive integer.' >&2; exit 2;; esac
NAME=${KIWI_VERSION_NAME:-$(sed -n 's/.*MARKETING_VERSION = \([0-9.]*\);.*/\1/p' "$ROOT/app/ios/App/App.xcodeproj/project.pbxproj" | head -1)}
case "$NAME" in ''|*[!0-9.]*) echo 'KIWI_VERSION_NAME must look like 1.0.1.' >&2; exit 2;; esac
KEYSTORE=${KIWI_ANDROID_KEYSTORE:-"$HOME/.kiwi-signing/kiwi-pro-upload.jks"}
[ -f "$KEYSTORE" ] || { echo "Upload key not found at $KEYSTORE (see docs/ops/APP_STORE.md §1, Google)." >&2; exit 2; }
PASS=${KIWI_ANDROID_KEYSTORE_PASSWORD:-$(security find-generic-password -s kiwi-android-upload -a kiwi-pro -w 2>/dev/null || true)}
[ -n "$PASS" ] || { echo 'Upload key password not found in the Keychain (service kiwi-android-upload).' >&2; exit 2; }
if [ -n "$(git -C "$ROOT" status --porcelain --untracked-files=normal)" ]; then
  echo 'Release requires clean, committed source. Preserve changes and commit only after validation.' >&2; exit 2
fi
export JAVA_HOME=${JAVA_HOME:-/opt/homebrew/opt/openjdk@21}
export ANDROID_HOME=${ANDROID_HOME:-"$HOME/Library/Android/sdk"}
# Not under app/android/build: `gradlew clean` deletes that whole folder
# (rootProject.buildDir) halfway through the run. out/ is gitignored.
OUT=${KIWI_RELEASE_OUT:-"$ROOT/app/android/out/releases"}
mkdir -p "$OUT"
OUT=$(cd "$OUT" && pwd)
RUN=$(mktemp -d "$OUT/release-$CODE-XXXXXX")
cd "$ROOT"
SOURCE=$(git rev-parse HEAD)
# Version and key settings are not test inputs; left in the environment they
# would change every pass-cache key (tools/check-pool.js).
env -u KIWI_VERSION_CODE -u KIWI_VERSION_NAME -u KIWI_ANDROID_KEYSTORE -u KIWI_ANDROID_KEYSTORE_PASSWORD -u KIWI_RELEASE_OUT \
  node tools/check.js > "$RUN/check.log" 2>&1 || { tail -60 "$RUN/check.log"; exit 1; }
if [ "$(git rev-parse HEAD)" != "$SOURCE" ] || [ -n "$(git status --porcelain --untracked-files=normal)" ]; then
  echo 'Source changed during validation; restart the release from a clean commit.' >&2; exit 1
fi
cd "$ROOT/app"
# Install exactly the lockfile, as the iOS release does.
npm ci --no-audit --no-fund > "$RUN/npm.log" 2>&1 || { tail -40 "$RUN/npm.log"; exit 1; }
npm run build > "$RUN/bundle.log" 2>&1
npx --no-install cap sync android > "$RUN/sync.log" 2>&1
cd "$ROOT/app/android"
KIWI_ANDROID_KEYSTORE="$KEYSTORE" KIWI_ANDROID_KEYSTORE_PASSWORD="$PASS" \
KIWI_ANDROID_KEY_ALIAS=kiwi-pro KIWI_ANDROID_KEY_PASSWORD="$PASS" \
  ./gradlew --console=plain clean bundleRelease -PKIWI_VERSION_CODE="$CODE" -PKIWI_VERSION_NAME="$NAME" \
  > "$RUN/gradle.log" 2>&1 || { tail -60 "$RUN/gradle.log"; exit 1; }
unset PASS
AAB="$RUN/kiwi-pro-$NAME-$CODE.aab"
cp app/build/outputs/bundle/release/app-release.aab "$AAB"
# An unsigned bundle builds fine and Play refuses it: prove the signature here.
"$JAVA_HOME/bin/jarsigner" -verify "$AAB" > "$RUN/signature.log" 2>&1 || { cat "$RUN/signature.log"; exit 1; }
grep -q 'jar verified' "$RUN/signature.log" || { cat "$RUN/signature.log"; exit 1; }
BUNDLE=$(sed -n 's/.*empreinte \([0-9a-f]*\).*/\1/p' "$RUN/bundle.log" | tail -1)
{
  echo "source $SOURCE"
  echo "versionCode $CODE"
  echo "versionName $NAME"
  echo "bundle $BUNDLE"
  echo "sha256 $(shasum -a 256 "$AAB" | cut -d' ' -f1)"
} > "$RUN/release.txt"
cat "$RUN/release.txt"
echo "Play bundle: $AAB"
