# Milo

[English](README.md) | [简体中文](README.zh-CN.md)

Milo is a free, local-first Markdown editor for macOS. It opens a Markdown file and lets you write naturally in a focused WYSIWYG surface—without an account, cloud service, backend, or content database.

Your Markdown files remain the source of truth. They stay portable across VS Code, Vim, Obsidian, Typora, Git, and other Markdown tools.

Milo 0.3.0 is the first public beta, distributed as a GitHub Pre-release. Its candidate is in a draft visible to maintainers; public download will be available after publication.

## What Milo is for

- Focused, Typora-like Markdown writing instead of a source-and-preview split.
- Local files first: open, edit, save, and organize ordinary `.md` or `.markdown` files.
- A quiet desktop interface with system appearance, light/dark mode, document zoom, a persistent document outline, sidebar hiding, and Focus Mode.
- A small, privacy-respecting app: no sign-in, telemetry, automatic cloud sync, or network requirement for core writing.

## MVP capabilities

- WYSIWYG CommonMark and GFM editing: headings, emphasis, blockquotes, lists, task lists, tables, links, images, code blocks with language selection and copy, and undo/redo.
- Native Open, Save, Save As, recent files, Current Folder browsing and switching, tabs, startup-session restoration, and external-change protection.
- Byte-preserved YAML Front Matter, UTF-8/BOM and LF/CRLF preservation, protected read-only handling for unsupported documents, and inode-preserving safe save with crash recovery on macOS.
- Image paste into a document-adjacent `assets/` folder using relative Markdown links.
- Remote images load only after an explicit action; external links open only with command-click.
- macOS menus, keyboard shortcuts, accessibility labels, reduced-motion support, and a restrained writing surface.

## Privacy and data model

Milo stores document content only in your local Markdown files. Application preferences, recent paths, and session metadata are small JSON settings stored outside your document folders; Markdown bodies are never copied into a database or cloud service.

Remote image URLs are never requested until you choose to load a particular image. Milo does not ship an embedded browser, account system, analytics service, or backend API.

## Technology

- Desktop: Tauri 2 and Rust
- Interface: React, TypeScript, Vite, CSS Variables, and Lucide icons
- Editor: Milkdown, ProseMirror, Remark, and GFM
- Native services: Tauri dialogs, file watching, JSON application settings, and system menus

Mermaid, KaTeX, Shiki, Source Mode, export, and search are deliberately deferred so they cannot slow the MVP startup path.

## Download and install

Users need **macOS 13 or later**. Node.js, Rust and source build tools are unnecessary. The Universal DMG contains both Apple Silicon (arm64) and Intel (x86_64) architectures.

1. Once published, select **v0.3.0 / Pre-release** on [GitHub Releases](https://github.com/cocoCzl/Milo/releases). Download `Milo_0.3.0_universal.dmg` and its `.sha256` file. In the download directory, verify with `shasum -a 256 -c Milo_0.3.0_universal.dmg.sha256`.
2. Open the DMG, drag Milo to Applications, eject the disk image, then open Milo from Applications.
3. Milo is **ad-hoc signed**, without a Developer ID identity signature or Apple notarization. macOS may block the first opening. After checking the source and checksum, try opening it once, then go to **System Settings → Privacy & Security → Open Anyway** for Milo and follow the system prompts. Wording varies by macOS version; see [Apple's instructions](https://support.apple.com/en-us/102445).

Passing ad-hoc signature integrity checks does not imply Apple certification or Gatekeeper trust. Do not disable Gatekeeper globally or remove quarantine from the entire download directory. The draft attachment was downloaded in Chrome with quarantine retained and its checksum verified. The maintainer confirmed manually installing it, allowing it through the system prompts and opening a document on arm64 / macOS 27.0.1. This confirms that installation path on one host, not every prompt or all application features; other macOS versions may differ.

Hardware coverage: Apple Silicon (arm64), macOS 27.0.1 (26A434). Intel and macOS 13–26 have not been tested on hardware. An earlier local candidate passed a native pinyin confirmation/Auto Save smoke check; the full Chinese IME candidate-window/save-timing matrix awaits human verification; see [Known issues](docs/KNOWN_ISSUES.md). Use disposable or backed-up documents for beta testing.

Report problems through [GitHub Issues](https://github.com/cocoCzl/Milo/issues), including app version, macOS version, chip, reproduction steps and relevant screenshots. Avoid sharing private documents.

## Development requirements

Source development requires Node.js 24, Rust stable, Xcode Command Line Tools and both macOS Rust targets.

## Local development

```sh
npm ci
npm run tauri -- dev
```

The command starts Vite and the native Milo window. No account, server, database, or network connection is needed after dependencies are installed.

## Quality checks

```sh
npm run test
npm run lint
npm run build
```

## Build a universal macOS artifact

```sh
./scripts/build-macos-universal.sh
```

The output is a universal DMG under `src-tauri/target/universal-apple-darwin/release/bundle/dmg/`. This explicitly creates an ad-hoc signed, unnotarized beta, verifies signature integrity, architectures, versions, minimum OS and package size, then generates a `.sha256` file. No Apple account, certificate or Secrets are required.

## Project layout

```text
src/
  app/            Application composition
  components/     Small presentational components
  editor/         Milkdown editor and Markdown boundary
  file-system/    Native file, image, link, and launch boundaries
  hooks/          Document session and native-event coordination
  settings/       JSON-backed application preferences
  styles/         Typography-first visual system
src-tauri/        Rust commands, macOS menu, packaging, and native services
docs/             UI contracts, known issues, and release runbooks
```

## Documentation

- [UI design and editor invariants](docs/UI_DESIGN.md)
- [Known issues](docs/KNOWN_ISSUES.md)
- [Release runbook](docs/RELEASE.md): beta packaging, verification and release steps.
- [发布说明（简体中文）](docs/RELEASE.zh-CN.md)：测试版打包、验证与发布步骤。

## License

Milo is licensed under [GPL-3.0](LICENSE). Redistributed modified versions must remain available under the GPL with corresponding source code.
