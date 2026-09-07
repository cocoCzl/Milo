# Milo macOS release runbook

[English](RELEASE.md) | [简体中文](RELEASE.zh-CN.md)

Milo publishes only GPL-3.0 source and signed, notarized macOS release artifacts. The release workflow starts when a maintainer pushes a version tag such as `v0.1.0`; pull requests and `main` remain covered by the normal CI workflow.

No public GitHub release is being made now. This runbook preserves the signing, notarization, and release steps for a future release.

## One-time GitHub configuration

Configure these repository action secrets before pushing a release tag. Never commit them to the repository or add them to a local `.env` file.

| Secret | Value |
| --- | --- |
| `APPLE_CERTIFICATE` | Base64-encoded Developer ID Application `.p12` certificate |
| `APPLE_CERTIFICATE_PASSWORD` | Password for that `.p12` file |
| `APPLE_SIGNING_IDENTITY` | Developer ID Application signing identity |
| `APPLE_ID` | Apple ID used for notarization |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password for that Apple ID |
| `APPLE_TEAM_ID` | Apple Developer Team ID |
| `KEYCHAIN_PASSWORD` | New random password used only for the ephemeral CI keychain |

The workflow builds `universal-apple-darwin`, imports the Developer ID certificate into a temporary keychain, notarizes the generated DMG with `notarytool`, staples the accepted ticket, confirms Gatekeeper assessment and the 100 MB package cap, then attaches the DMG to a GitHub Release.

## Local release preflight

Run these checks before creating the tag:

```sh
npm ci
npm run test
npm run lint
npm run build
./scripts/build-macos-universal.sh
```

The universal build needs both Rust targets. If the Intel target is missing, install it with:

```sh
rustup target add x86_64-apple-darwin
```

Do not publish an unsigned local DMG as a public release. Apple signing and notarization remain an explicit maintainer step.

## Performance validation record

Before each public release, record results on a 16 GB Apple Silicon Mac with the finalized signed build, a normal macOS desktop session, and no profiler attached:

| Measurement | Method | Budget | Result |
| --- | --- | --- | --- |
| Cold start | Launch from Finder five times after quitting Milo; measure launch to a focused editable document and record the median. | ≤1.5 s | |
| 1 MB document open | Open the fixture five times from Milo; measure command activation to editable document and record the median. | ≤1 s | |
| Idle memory | Wait 30 seconds with one empty saved document; record Milo's memory footprint in Activity Monitor. | ≤200 MB | |
| Package size | Run `stat -f '%z' <dmg>` on the notarized universal DMG. | ≤104857600 bytes | |

The release cannot introduce Mermaid, KaTeX, or Shiki into the initial module graph. Confirm this from the production bundle report before release.
