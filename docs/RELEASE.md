# Milo macOS release runbook

[English](RELEASE.md) | [简体中文](RELEASE.zh-CN.md)

## Current policy

**0.3.0 is the first public beta**, distributed under GPL-3.0 through a GitHub Pre-release. Ship one Universal DMG for macOS 13+, containing arm64 and x86_64. Keep the application identifier `io.github.milo.editor`.

This release explicitly uses **ad-hoc signing** (`signingIdentity: "-"`). It has no Developer ID identity signature and no Apple notarization. Apple Developer membership, certificates, Apple account credentials and related GitHub Secrets are unnecessary. A failed identity-signing or notarization attempt must never silently fall back to this mode.

## Build and automated gates

Run the checks in `.github/workflows/ci.yml`: `npm ci`, formatting, TypeScript, frontend tests, lint with zero warnings, production build, rustfmt, Clippy with zero warnings, locked Rust tests and a bundled macOS Debug build. Do not upgrade dependencies as part of release preparation.

Commit the source, record its full SHA, and build from that clean source commit:

```sh
node scripts/check-release-version.mjs v0.3.0
./scripts/build-macos-universal.sh
```

The script installs locked npm dependencies, ensures both Rust targets exist, builds with Cargo's lockfile, and verifies the final DMG. It removes old packaging output first. It clears inherited Apple signing/notarization credentials and explicitly selects ad-hoc signing. Outputs:

- `src-tauri/target/universal-apple-darwin/release/bundle/dmg/Milo_0.3.0_universal.dmg`
- The adjacent `Milo_0.3.0_universal.dmg.sha256`, using a relative filename for portable `shasum -a 256 -c` verification.

`verify-macos-release.sh` checks the image, mounts it read-only, checks both bundle versions, unchanged identifier, macOS 13.0 in the plist and both Mach-O slices, both architectures, ad-hoc status and signature integrity, and the 100 MiB cap. It generates the checksum only after successful verification.

| Check | Meaning for this beta |
| --- | --- |
| `codesign --verify --deep --strict --all-architectures` | Must pass: ad-hoc signature integrity, not publisher identity |
| `codesign -d --verbose=4 --arch …` | Must show `Signature=adhoc`, no TeamIdentifier, for both slices; no Developer ID authority |
| Apple notarization / stapled ticket | Not performed; never claim notarization or Apple certification |
| `spctl --assess --type execute` | Expected policy rejection (exit 3), recorded as rejection, never a trust pass; other tool errors fail verification |

Damaged signatures, a missing architecture, wrong version, deployment target or malformed image still block packaging. Do not sign or modify the bundle after creating its DMG/checksum.

## Candidate acceptance and coverage

Mount or install the final image, launch that exact application, open/close preferences and change/restore a preference, edit/save a disposable file, close/reopen and compare disk content. Do not rerun historical multi-cycle preferences investigations without a new failure.

Native coverage is Apple Silicon (arm64), macOS 27.0.1 (26A434). Intel and macOS 13–26 are not hardware-validated. Before public publication:

1. Confirm real Chinese IME candidates in a disposable saved file; check idle Auto Save, immediate switching, minimize/restore, Command-S and normal close/quit, reopening to compare disk text. Paste/synthetic events do not count.
2. Download the final attachment in a real browser, confirm `com.apple.quarantine` on the downloaded DMG, verify its checksum, drag to Applications, eject, and exercise the actual first-open prompts. Prefer Apple's **Privacy & Security → Open Anyway** path; adjust the README if observed behavior differs. A local build launch or manually assigned quarantine is not this test. No attachment is available during local-only preparation, so this remains pending.
3. Record release performance on a 16 GB Apple Silicon Mac, normal foreground session without a profiler: median of five cold starts to editable document ≤1.5 s; median of five roughly 1 MB document opens ≤1 s; idle footprint after 30 s ≤200 MB. If the host or UI cannot support reliable measurement, report the gap instead of claiming a pass. Confirm Mermaid, KaTeX and Shiki remain outside the initial production module graph. The package budget is checked automatically.

See [Known issues](KNOWN_ISSUES.md) for current product status and [bilingual release notes](RELEASE_NOTES_0.3.0.md) for the draft release body. Pending checks must be updated with actual results before public publication.

## Release workflow and handoff

After maintainer approval, push the reviewed commit and `v0.3.0`. The tag triggers existing CI, checks all five application version sources against the tag, builds and verifies the DMG and checksum, and uploads only those two artifacts. `.github/workflows/release.yml` explicitly sets **`draft: true`, `prerelease: true`, `make_latest: 'false'`**. No build directory, dependency directory or updater is shipped.

Local preparation does not push, create a remote tag or publish a Release. The workflow rebuilds from the tagged commit, so its DMG checksum can differ from the local candidate (packaging timestamps/signature metadata). Verify and accept the exact uploaded attachment, record its checksum, then publish the reviewed draft as a Pre-release only after the remaining checks and maintainer confirmation. Do not relabel an old DMG as 0.3.0.
