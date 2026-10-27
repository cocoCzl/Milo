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

## 0.3.0 release identity and completed checks

- [Public Pre-release](https://github.com/cocoCzl/Milo/releases/tag/v0.3.0), not stable Latest. The maintainer authorized publication on 2026-10-24.
- Unchanged source/tag: `v0.3.0` → `797035ab4d9305a1989134854b0d9cd3f0820a35`. The successful [Release run](https://github.com/cocoCzl/Milo/actions/runs/40093107626) built that tag using workflow commit `6bba1d5`; source quality gates passed. Subsequent changes are documentation/workflow only.
- Existing attachment: `Milo_0.3.0_universal.dmg`, **7,545,711 bytes**, SHA-256 `784ee2e694ae4943c8d5d367985d02c87b2cfa3bb463657d89bc6865d26230a9`; matching checksum file: 91 bytes. Do not move the tag, replace the attachment or rebuild for documentation updates.
- Image, version, identifier, minimum macOS, both architectures and strict ad-hoc integrity passed. Gatekeeper trust assessment rejected it (exit 3); no Developer ID or notarization.
- Browser download retained quarantine; the installed application matched the attachment. Manual installation, system permission and first opening are maintainer-confirmed, not a claim based on screenshots. Follow the README's Apple Privacy & Security / Open Anyway instructions; exact prompts vary.
- Preferences, editing/save and document close/reopen smoke checks passed. Real Chinese IME Auto Save, immediate Command-S and Save and Close passed actual disk/reopen comparison using native pinyin, without paste or synthetic composition. Real documents, preferences and the original session were preserved.

## Accepted beta limitations and performance exception

The maintainer explicitly accepts these gaps for public 0.3.0 Pre-release distribution. They remain unverified or incomplete, not test passes or prerequisites to repeat before this publication:

- Actual immediate app-switch and minimize/restore IME transitions were not fully observed; those samples did retain Chinese on disk/reopen.
- Cold-start and approximately 1 MB file-open latency were not reliably measured.
- Memory observations span different running scenarios. Aggregate Milo plus related WebKit idle footprint was 186.52 MB in a two-tab state and 250.32 MB in an earlier additional-preedit-tab state. Process physical footprints were summed without global shared-memory deduplication. This is not an isolated baseline or an overall budget pass.
- Hardware coverage is arm64 / macOS 27.0.1 (26A434); Intel and macOS 13–26 are untested on hardware.

The original performance targets are median of five cold starts to editable document ≤1.5 s, median of five approximately 1 MB opens ≤1 s, and idle aggregate footprint after 30 s ≤200 MB on a 16 GB Apple Silicon Mac. These publication gates have an explicit **exception for this 0.3.0 Pre-release only**. Future verification retains the targets; no fabricated measurements, compatibility claims or general relaxation is allowed. Existing measurements are observations, not performance sign-off.

See [Known issues](KNOWN_ISSUES.md) and the [bilingual release body](RELEASE_NOTES_0.3.0.md). No further application tests or build are required for this documentation/publication handoff.

## Publication procedure

Automation creates drafts with `draft: true`, `prerelease: true`, `make_latest: 'false'`, attaching only the Universal DMG and checksum. Public publication sets `draft: false`, keeps `prerelease: true` and `make_latest: false`, using the maintainer's explicit authorization. For 0.3.0 that authorization includes the limitations above.

Before publication compare the existing remote tag and both attachments against the recorded identity; stop on any mismatch. Update the release body without replacing assets. After publication check anonymous page access and download the public assets to verify SHA-256. Documentation-only commits do not alter the tagged application; this final handoff runs only documentation checks, as explicitly requested.

## Verification after writing optimization (unreleased)

The 0.3.0 exception and documentation-only handoff above apply only to that historical publication. Subsequent source changes require the complete CI gate, pinned Playwright browser installation and the original performance budgets. Follow [the current verification record](OPTIMIZATION_2026-10.md); do not promote browser development timings or old IME checks to native acceptance. For disposable native checks, `npm run tauri -- build --bundles app --config '{"identifier":"io.github.milo.validation"}'` creates a genuine Tauri Release app with separate app-data; do not run it over the user's real session. That arm64 test build is not a Universal DMG release. No release was produced by this optimization task.
