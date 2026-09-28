#!/bin/sh
# Kiwi Pro: checked source -> signed archive -> local App Store Connect export.
# Set KIWI_DEVELOPMENT_TEAM and a new positive KIWI_BUILD_NUMBER explicitly.
# --upload is opt-in, never the default. See docs/ops/APP_STORE.md.
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
case "${1:-}" in ''|--upload) ;; *) echo 'Usage: app-archive.sh [--upload]' >&2; exit 2;; esac
TEAM=${KIWI_DEVELOPMENT_TEAM:-}
case "$TEAM" in
  [A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9]) ;;
  *) echo 'KIWI_DEVELOPMENT_TEAM must identify the confirmed Apple publisher.' >&2; exit 2;;
esac
BUILD=${KIWI_BUILD_NUMBER:-}
case "$BUILD" in ''|*[!0-9]*|0*) echo 'KIWI_BUILD_NUMBER must be a new positive integer.' >&2; exit 2;; esac
if [ -n "$(git -C "$ROOT" status --porcelain --untracked-files=normal)" ]; then
  echo 'Archive requires clean, committed source. Preserve changes and commit only after validation.' >&2; exit 2
fi
export DEVELOPER_DIR=${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}
OUT=${KIWI_ARCHIVE_OUT:-"$ROOT/app/ios/build"}
mkdir -p "$OUT"
OUT=$(cd "$OUT" && pwd)
RUN=$(mktemp -d "$OUT/release-$BUILD-XXXXXX")
ARCHIVE="$RUN/KiwiPro.xcarchive"
EXPORT="$RUN/export"
OPTS="$RUN/ExportOptions.plist"
PACKAGE="$ROOT/app/ios/App/CapApp-SPM/Package.swift"
cp "$PACKAGE" "$RUN/Package.swift.source"
cleanup() { cp "$RUN/Package.swift.source" "$PACKAGE"; rm -f "$OPTS"; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
cd "$ROOT"
# Gate the exact commit, and preserve its output with the archive evidence.
node tools/check.js > "$RUN/check.log" 2>&1 || { tail -60 "$RUN/check.log"; exit 1; }
cd "$ROOT/app"
npm run build > "$RUN/bundle.log" 2>&1
npx --no-install cap sync ios > "$RUN/sync.log" 2>&1
# The generated SPM path rewrite is not release source.
cp "$RUN/Package.swift.source" "$PACKAGE"
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$ARCHIVE" \
  CURRENT_PROJECT_VERSION="$BUILD" KIWI_DEVELOPMENT_TEAM="$TEAM" \
  -allowProvisioningUpdates archive > "$RUN/archive.log" 2>&1 || { tail -60 "$RUN/archive.log"; exit 1; }
sed "s/KIWI_DEVELOPMENT_TEAM/$TEAM/" ios/ExportOptions.plist > "$OPTS"
xcodebuild -exportArchive -archivePath "$ARCHIVE" -exportOptionsPlist "$OPTS" \
  -exportPath "$EXPORT" -allowProvisioningUpdates > "$RUN/export.log" 2>&1 || { tail -60 "$RUN/export.log"; exit 1; }
# Verify the exported signature and inspect the exact shipped bundle, not the
# development-signed archive. This is local validation, not server acceptance.
unzip -q "$EXPORT/App.ipa" -d "$RUN/inspection"
EXPORTED_APP="$RUN/inspection/Payload/App.app"
codesign --verify --deep --strict "$EXPORTED_APP" > "$RUN/signature.log" 2>&1
codesign -dv --verbose=4 "$EXPORTED_APP" >> "$RUN/signature.log" 2>&1
test "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$EXPORTED_APP/Info.plist")" = 'com.kiwios.pro'
test "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$EXPORTED_APP/Info.plist")" = "$BUILD"
test -f "$EXPORTED_APP/PrivacyInfo.xcprivacy"
test -f "$EXPORTED_APP/public/native-privacy.js"
if [ "${1:-}" = '--upload' ]; then
  /usr/libexec/PlistBuddy -c 'Set :destination upload' "$OPTS"
  xcodebuild -exportArchive -archivePath "$ARCHIVE" -exportOptionsPlist "$OPTS" \
    -exportPath "$RUN/upload" -allowProvisioningUpdates > "$RUN/upload.log" 2>&1 || { tail -60 "$RUN/upload.log"; exit 1; }
fi
cp "$ROOT/app/www/.kiwi-bundle.json" "$RUN/bundle-manifest.json"
printf 'Git: %s\nBuild: %s\nArchive: %s\nExport: %s\n' "$(git -C "$ROOT" rev-parse HEAD)" "$BUILD" "$ARCHIVE" "$EXPORT" | tee "$RUN/release.txt"
echo 'Export success is not App Review or physical-device acceptance. Complete the release gate.'
