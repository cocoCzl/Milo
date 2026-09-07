# Milo

[English](README.md) | [简体中文](README.zh-CN.md)

Milo is a free, local-first Markdown editor for macOS. It opens a Markdown file and lets you write naturally in a focused WYSIWYG surface—without an account, cloud service, backend, or content database.

Your Markdown files remain the source of truth. They stay portable across VS Code, Vim, Obsidian, Typora, Git, and other Markdown tools.

## What Milo is for

- Focused, Typora-like Markdown writing instead of a source-and-preview split.
- Local files first: open, edit, save, and organize ordinary `.md` or `.markdown` files.
- A quiet desktop interface with system appearance, light/dark mode, document zoom, a persistent document outline, sidebar hiding, and Focus Mode.
- A small, privacy-respecting app: no sign-in, telemetry, automatic cloud sync, or network requirement for core writing.

## MVP capabilities

- WYSIWYG CommonMark and GFM editing: headings, emphasis, blockquotes, lists, task lists, tables, links, images, code blocks with language selection and copy, and undo/redo.
- Native Open, Save, Save As, recent files, Current Folder browsing and switching, tabs, startup-session restoration, and external-change protection.
- Byte-preserved YAML Front Matter, UTF-8/BOM and LF/CRLF preservation, protected read-only handling for unsupported documents, and atomic writes.
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

Mermaid, KaTeX, Shiki, Source Mode, export, search, and themes are deliberately deferred so they cannot slow the MVP startup path.

## Requirements

- macOS 13 or later
- Node.js 24
- Rust stable with the macOS toolchain

The validated distribution target is one universal macOS build for Apple Silicon and Intel.

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

The output is a universal DMG under `src-tauri/target/universal-apple-darwin/release/bundle/dmg/`. This creates a local unsigned artifact only; Apple signing, notarization, Gatekeeper validation, and public release remain future maintainer steps.

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
docs/             Future release runbook
```

## Documentation

- [Release runbook](docs/RELEASE.md): future Apple signing, notarization, performance, and release steps.
- [发布说明（简体中文）](docs/RELEASE.zh-CN.md)：未来 Apple 签名、公证、性能验证与发布步骤。

## License

Milo is licensed under [GPL-3.0](LICENSE). Redistributed modified versions must remain available under the GPL with corresponding source code.
