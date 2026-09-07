#!/usr/bin/env bash
set -euo pipefail

rustup target add aarch64-apple-darwin x86_64-apple-darwin
npm ci
npm run tauri -- build --target universal-apple-darwin
