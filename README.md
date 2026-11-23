# Milo

[English](README.md) | [简体中文](README.zh-CN.md)

Milo is a local-first Markdown editor for macOS. Write visually or edit the source while keeping ordinary Markdown files that work in other editors.

The current local development version is **0.3.3 (unreleased)**; the available public download is **v0.3.0 Pre-release**. Local changes are not a published release.

## Features

- Visual, Read and Source modes for Markdown with tables, task lists, images and code blocks.
- Tabs, folder browsing, recent files and Quick Open; document search, replacement and outline navigation.
- Auto Save for saved documents, Save As, external-change checks and recovery of unsaved documents.
- Light, Dark and Warm themes, Focus Mode, keyboard controls and separate document/interface zoom.

## Download and start

Milo targets **macOS 13+**. The public Universal DMG supports Apple Silicon and Intel; actual hardware coverage is described in [Known issues](docs/KNOWN_ISSUES.md).

1. Download the DMG and matching `.sha256` file from [v0.3.0 Pre-release](https://github.com/cocoCzl/Milo/releases/tag/v0.3.0).
2. In the download directory, run `shasum -a 256 -c Milo_0.3.0_universal.dmg.sha256`, then drag Milo to Applications.
3. Open Milo and choose a Markdown file, or create a document and use Save to choose its location. Existing files save automatically after idle editing; new documents need an explicit first save.

The download is ad-hoc signed and **not Apple-notarized**. If macOS blocks it, verify the source and checksum, then use **System Settings → Privacy & Security → Open Anyway**. Do not disable Gatekeeper globally.

**Beta:** use backed-up files. An unresolved code-block IME issue may save raw Pinyin when quitting before confirming a candidate. Confirm input before quitting and check saved content; see [Known issues](docs/KNOWN_ISSUES.md) for this and other limitations.

## Files and privacy

Markdown files remain authoritative. WYSIWYG edits may normalize Markdown formatting; Source mode exposes the whole file, including Front Matter. Undo is separate across modes.

Preferences, session metadata and recovery copies stay in local app data, outside document folders. Recovery copies can lag edits and do not replace saving. Pasted images use an `assets/` folder beside the saved document. Remote images load only on request. Milo has no account, telemetry, automatic cloud sync or background update check.

## Local development

On macOS, install Node.js 24, stable Rust and Xcode Command Line Tools, then run:

```sh
npm ci
npm run tauri -- dev
```

- [Development guide](docs/DEVELOPMENT.md) — setup, checks and engineering constraints (Chinese)
- [Known issues](docs/KNOWN_ISSUES.md) — current defects and verification limits (Chinese)
- [Release guide](docs/RELEASE.md) — maintainer packaging and publication (Chinese)

## License

[GPL-3.0](LICENSE).
