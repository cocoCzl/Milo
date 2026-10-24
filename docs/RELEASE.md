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
2. Download the final attachment in a real browser, confirm `com.apple.quarantine` on the downloaded DMG, verify its checksum, drag to Applications, eject, and exercise the actual first-open prompts. Prefer Apple's **Privacy & Security → Open Anyway** path; adjust the README if observed behavior differs. A local build launch or manually assigned quarantine is not this test. The draft attachment download/checksum/quarantine checks are complete, and manual installation, system permission and first opening are maintainer-confirmed on the covered host; exact prompt wording was not independently recorded.
3. Record release performance on a 16 GB Apple Silicon Mac, normal foreground session without a profiler: median of five cold starts to editable document ≤1.5 s; median of five roughly 1 MB document opens ≤1 s; idle footprint after 30 s ≤200 MB. If the host or UI cannot support reliable measurement, report the gap instead of claiming a pass. Confirm Mermaid, KaTeX and Shiki remain outside the initial production module graph. The package budget is checked automatically.

See [Known issues](KNOWN_ISSUES.md) for current product status and [bilingual release notes](RELEASE_NOTES_0.3.0.md) for the draft release body. Pending checks must be updated with actual results before public publication.

## 0.3.0 actual draft candidate — 2026-10-24

- Source/tag: `v0.3.0` → `797035ab4d9305a1989134854b0d9cd3f0820a35`. Draft: https://github.com/cocoCzl/Milo/releases/tag/untagged-c8ce94d17f7237023627. It remains Draft + Pre-release, not Latest.
- The successful [Release run](https://github.com/cocoCzl/Milo/actions/runs/40093107626) uses workflow commit `6bba1d5` to provision missing `rg` and rebuild the existing, unmoved tag. Both master CI runs and the release source quality gate passed. No runtime code or dependency changes followed the tag.
- Actual uploaded/downloaded DMG: **7,545,711 bytes**; SHA-256 `784ee2e694ae4943c8d5d367985d02c87b2cfa3bb463657d89bc6865d26230a9`. Matching checksum file: 91 bytes. This supersedes the earlier local candidate. Browser download retained quarantine. Image/version/identity/minimum-OS/both-architecture and strict ad-hoc integrity checks passed; Gatekeeper rejected it (exit 3). No Developer ID or notarization.
- The maintainer confirmed manual installation, system permission and first opening with a document visible. This is user-confirmed installation evidence, not screenshot-based full acceptance. Running process `/Applications/Milo.app/Contents/MacOS/milo` and every installed bundle file matched the actual draft attachment.
- On the installed draft, disposable-file smoke checks passed: visible preferences/backdrop, Escape/button dismissal, 100% → 110% persisted zoom and restoration to 100%, explicit save/Auto Save, document close/reopen and saved-content comparison. The real document, Current Folder and original session were preserved; no settings file was rewritten or session reset. App restart was deliberately not repeated in the live user session.
- Native pinyin keys reached preedit, but candidate-window control/confirmation could not be reliably established. Unconfirmed input was not expected on disk; close protection appeared, and only that disposable input was discarded. The full real IME timing matrix remains for human confirmation; pasted text and synthetic events do not count.

## Finite performance results and remaining checks

The 16 GB arm64 / macOS 27.0.1 host still uses the existing budgets. With the real document retained and an empty disposable document active, three samples after 30 seconds idle (five seconds apart) gave a median **186.52 MB / 177.88 MiB** total physical footprint: Milo 29.328 MB, WebContent 127.977 MB, GPU 21.923 MB and Networking 7.291 MB (representative sample). Processes were attributed by the OS responsible PID, not by name alone; per-process physical footprints are summed without global shared-memory deduplication. This observed two-tab state is below 200 MB, but is not an isolated empty-only baseline. An earlier sample with the additional unconfirmed-preedit test tab retained measured **250.32 MB / 238.72 MiB**, above budget; it fell after discarding that disposable preedit/closing its tab. Both observations are retained; do not claim all memory states pass.

The 1,048,576-byte test file opened successfully. One finite click-to-accessibility observation took 2.905 seconds, including automation transport and observation waits; this cannot establish application-only latency or a five-run median against the one-second budget. Cold starts were not measured by restarting the live user session. Overall performance sign-off is incomplete, and no optimization or budget change was made.

Remaining human steps:

1. In a disposable saved file, use a real Chinese IME, visibly choose a candidate phrase, then separately test idle Auto Save, immediate app switch, minimize/restore, Command-S and normal close. Reopen after each and compare the confirmed phrase. Cancelled/unconfirmed preedit is not expected saved content.
2. In a suitable session, measure five cold launches to an editable empty document (median ≤1.5 s) and five approximately 1 MB opens (median ≤1 s), using a local timer/screen recording that excludes automation delays. An isolated empty-only memory baseline can distinguish session load from the observations above; the existing 200 MB budget remains unchanged.

Installation and first opening are already maintainer-confirmed and need not be repeated. Intel/macOS 13–26 remain outside hardware coverage. Keep the Release as a draft until the maintainer confirms publication.

## Workflow and handoff

The existing tag has already been pushed and its draft created. The workflow runs the existing quality gate against the selected source tag, checks all application versions, builds/verifies the Universal DMG and uploads only the DMG and checksum. It explicitly keeps **`draft: true`, `prerelease: true`, `make_latest: 'false'`**. A manual rerun accepts an existing tag and does not move it. No build/dependency directory or updater is shipped.

Keep the current draft and attachments unchanged while recording acceptance. Documentation-only follow-ups do not alter the tagged application. Public publication remains a separate maintainer confirmation; do not move the tag or substitute the previous local DMG.
