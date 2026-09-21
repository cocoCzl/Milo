#!/usr/bin/env bash
set -euo pipefail

# A packaging run must never leave an older Milo.app/DMG beside the new
# artifact.  These are build outputs only; source files and the dev binary
# (`src-tauri/target/debug/milo`) are deliberately untouched.
rm -rf \
  src-tauri/target/release/bundle \
  src-tauri/target/universal-apple-darwin/release/bundle

rustup target add aarch64-apple-darwin x86_64-apple-darwin
npm ci
npm run tauri -- build --target universal-apple-darwin
