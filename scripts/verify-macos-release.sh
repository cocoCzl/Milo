#!/usr/bin/env bash
set -euo pipefail

version=$(node -p "JSON.parse(require('fs').readFileSync('package.json')).version")
node scripts/check-release-version.mjs "v$version"
dmg="${1:-src-tauri/target/universal-apple-darwin/release/bundle/dmg/Milo_${version}_universal.dmg}"
test -f "$dmg"
test "$(stat -f '%z' "$dmg")" -le 104857600
hdiutil verify "$dmg"
mount_point=$(mktemp -d "${TMPDIR:-/tmp}/milo-release.XXXXXX")
cleanup() {
  hdiutil detach "$mount_point" >/dev/null || true
  rmdir "$mount_point" || true
}
trap cleanup EXIT
# Tauri embeds our GPL license in the image; answer its mount-time notice
# explicitly so this read-only verification also works without an interactive stdin.
printf 'Y\n' | hdiutil attach "$dmg" -readonly -nobrowse -mountpoint "$mount_point"
app="$mount_point/Milo.app"
plist="$app/Contents/Info.plist"
for key in CFBundleShortVersionString CFBundleVersion; do
  test "$(/usr/libexec/PlistBuddy -c "Print :$key" "$plist")" = "$version"
done
test "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$plist")" = io.github.milo.editor
test "$(/usr/libexec/PlistBuddy -c 'Print :LSMinimumSystemVersion' "$plist")" = 13.0
binary="$app/Contents/MacOS/milo"
architectures=$(lipo -archs "$binary")
echo "Architectures: $architectures"
case "$architectures" in
  'arm64 x86_64'|'x86_64 arm64') ;;
  *) echo 'Expected exactly arm64 and x86_64' >&2; exit 1 ;;
esac
for arch in arm64 x86_64; do
  signature=$(codesign -d --verbose=4 --arch "$arch" "$app" 2>&1)
  echo "$signature"
  echo "$signature" | rg -q '^Signature=adhoc$'
  echo "$signature" | rg -q '^TeamIdentifier=not set$'
  minimum=$(otool -l -arch "$arch" "$binary" | awk '/LC_BUILD_VERSION/ {build=1} build && /minos/ {print $2; build=0}')
  test "$minimum" = 13.0
done
codesign --verify --deep --strict --all-architectures --verbose=2 "$app"
echo 'PASS: ad-hoc signature integrity, both architectures, version, identity and macOS 13.0 minimum'
echo 'Developer ID: absent. Apple notarization: not performed.'
set +e
spctl --assess --type execute --verbose=4 "$app"
assessment=$?
set -e
echo "Gatekeeper trust assessment exit status: $assessment (rejection is expected for this unnotarized prerelease; it is not a trust pass)"
# An assessment tool error is different from the expected policy rejection.
test "$assessment" -eq 3
directory=$(dirname "$dmg")
filename=$(basename "$dmg")
(cd "$directory" && shasum -a 256 "$filename" > "$filename.sha256" && shasum -a 256 -c "$filename.sha256")
