# Milo

[English](README.md) | [简体中文](README.zh-CN.md)

Milo is a local-first Markdown editor for macOS. It opens ordinary Markdown files in a focused WYSIWYG editor while keeping those files portable and authoritative.

The current source version is **0.3.1 (unreleased)**. The GitHub v0.3.0 Pre-release is a historical build; current `master` contains later editor and reliability work.

## Features

- CommonMark and GFM editing with headings, emphasis, quotes, lists, task lists, tables, links, images and code blocks.
- Edit, Read and whole-file Source modes with on-demand editor loading.
- Native Open, Save, Save As, recent files, folder browsing, tabs and session restoration.
- Safe saving with conflict checks, recovery copies, Front Matter, UTF-8 BOM and LF/CRLF handling.
- Relative Markdown links, anchors, Back navigation, document find/replace and folder-scoped Quick Open.
- Outline navigation, themes, independent document/interface zoom, Focus Mode and accessible keyboard controls.
- Image paste into a document-adjacent `assets/` folder using relative Markdown links.
- Remote images load only after an explicit action; core writing has no account, telemetry or cloud dependency.

## Files and privacy

Markdown files remain the source of truth. Preferences, recent paths, session metadata and recovery copies stay outside document folders. Milo does not use a database, account system, telemetry service or automatic cloud sync. Use disposable or backed-up files when testing pre-release builds.

WYSIWYG editing can normalize parts of Markdown formatting. Source mode preserves the complete file, including Front Matter, for content that should not be converted safely. Cross-mode undo is not unified yet; see [Known issues](docs/KNOWN_ISSUES.md).

## Platform and download

Milo targets macOS 13 or later. The v0.3.0 public Pre-release provides a Universal DMG for Apple Silicon and Intel. It is ad-hoc signed and not notarized.

Download the DMG and checksum from [GitHub Releases](https://github.com/cocoCzl/Milo/releases), verify with `shasum -a 256 -c`, then move Milo to Applications. If macOS blocks the first launch, use **System Settings → Privacy & Security → Open Anyway** after checking the source and checksum. Do not disable Gatekeeper globally.

Native coverage is strongest on Apple Silicon. The 20-tab physical footprint exceeds the 200 MB budget, though a memory leak has not been established. Chinese IME candidate input with Cmd+S/Cmd+Q remains unresolved and unattributed; see [Known issues](docs/KNOWN_ISSUES.md) and [Editor status](docs/EDITOR_STATUS.md) for measurements and acceptance limits.

## Development

Requirements: Node.js 24, stable Rust, Xcode Command Line Tools and the macOS Rust targets.

```sh
npm ci
npm run tauri -- dev
```

## Checks

```sh
npm run format:check
npm run typecheck
npm run lint -- --max-warnings=0
npm test
npm run build
npm run test:browser
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --locked -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --locked
```

Browser checks use simulated native IPC. Native release packaging follows [RELEASE.md](docs/RELEASE.md).

## Documentation

- [Documentation index](docs/README.md)
- [Editor status](docs/EDITOR_STATUS.md) — current implementation, performance samples and acceptance limits
- [Known issues](docs/KNOWN_ISSUES.md) — unresolved behavior and attribution limits
- [UI design constraints](docs/UI_DESIGN.md)
- [Release runbook](docs/RELEASE.md)
- [发布说明（简体中文）](docs/RELEASE.zh-CN.md)

## License

Milo is licensed under [GPL-3.0](LICENSE).
