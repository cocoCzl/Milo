#!/usr/bin/env bash
set -euo pipefail

# This is explicitly an ad-hoc, unnotarized build, never a signing fallback.
# Ignore inherited Apple credentials; no account or certificate is needed.
unset APPLE_CERTIFICATE APPLE_CERTIFICATE_PASSWORD APPLE_ID APPLE_PASSWORD \
  APPLE_APP_SPECIFIC_PASSWORD APPLE_TEAM_ID APPLE_API_KEY APPLE_API_ISSUER \
  APPLE_API_KEY_PATH APPLE_SIGNING_IDENTITY
export APPLE_SIGNING_IDENTITY=-
version=$(node -p "JSON.parse(require('fs').readFileSync('package.json')).version")
node scripts/check-release-version.mjs "v$version"

# A packaging run must never leave an older Milo.app/DMG beside the new
# artifact.  These are build outputs only; source files and the dev binary
# (`src-tauri/target/debug/milo`) are deliberately untouched.
rm -rf \
  src-tauri/target/release/bundle \
  src-tauri/target/universal-apple-darwin/release/bundle

rustup target add aarch64-apple-darwin x86_64-apple-darwin
npm ci
npm run tauri -- build --target universal-apple-darwin -- --locked
./scripts/verify-macos-release.sh
