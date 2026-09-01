#!/bin/sh
# Kiwi Pro · archive iOS signée et export App Store Connect, en une commande.
#
#   KIWI_DEVELOPMENT_TEAM=XXXXXXXXXX sh tools/app-archive.sh            # archive + .ipa
#   KIWI_DEVELOPMENT_TEAM=XXXXXXXXXX sh tools/app-archive.sh --upload   # + envoi TestFlight
#
# Le Team ID n'existe qu'en variable d'environnement (docs/ops/APP.md §8) : il
# est injecté dans le projet Xcode par build setting et dans une copie temporaire
# de app/ios/ExportOptions.plist. Rien n'est écrit dans le dépôt.
# Prérequis une seule fois : Xcode connecté au compte Apple de l'organisation
# (Xcode › Settings › Accounts) pour que la signature automatique fonctionne.
set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd)
TEAM=${KIWI_DEVELOPMENT_TEAM:-}
case "$TEAM" in
  [A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9]) ;;
  *) echo "KIWI_DEVELOPMENT_TEAM doit être le Team ID Apple (10 caractères)." >&2; exit 2 ;;
esac
export DEVELOPER_DIR=${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}

OUT=${KIWI_ARCHIVE_OUT:-"$ROOT/app/ios/build"}
mkdir -p "$OUT"
STAMP=$(date +%Y%m%d-%H%M)
ARCHIVE="$OUT/KiwiPro-$STAMP.xcarchive"
EXPORT="$OUT/export-$STAMP"
OPTS="$OUT/ExportOptions-$STAMP.plist"

cd "$ROOT/app"
npm run build
npx cap sync ios

xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$ARCHIVE" \
  KIWI_DEVELOPMENT_TEAM="$TEAM" -allowProvisioningUpdates archive

sed "s/KIWI_DEVELOPMENT_TEAM/$TEAM/" ios/ExportOptions.plist > "$OPTS"
if [ "${1:-}" = "--upload" ]; then
  # destination=upload : xcodebuild pousse directement vers App Store Connect.
  /usr/libexec/PlistBuddy -c "Set :destination upload" "$OPTS"
fi
xcodebuild -exportArchive -archivePath "$ARCHIVE" -exportOptionsPlist "$OPTS" \
  -exportPath "$EXPORT" -allowProvisioningUpdates
rm -f "$OPTS"

BUNDLE=$(grep -o 'name="kiwi-bundle" content="[^"]*"' "$ROOT/app/www/index.html" | sed 's/.*content="//; s/"$//' | cut -c1-12 || true)
echo
echo "Archive : $ARCHIVE"
echo "Export  : $EXPORT"
echo "Git     : $(git -C "$ROOT" rev-parse --short HEAD) · bundle ${BUNDLE:-?}"
echo "Noter ces trois lignes dans la fiche TestFlight (docs/ops/APP.md §8)."
