# Milo

Milo is a local-first desktop Markdown editor. Markdown files are the user's documents and remain usable outside Milo.

## Language

**Document Tab**:
An independently editable Markdown document open within Milo's single main window. A tab has its own dirty state and participates in close confirmation.
_Avoid_: editor instance, workspace tab

**Auto Save**:
The default behavior of writing an existing document directly to its Markdown file after roughly one second of idle editing. A new document without a file path remains unsaved until its first explicit save.
_Avoid_: private draft, background backup

**Current Folder**:
The single directory whose recursive Markdown file tree is displayed in the sidebar of the main window. Individually opened documents may exist outside it without becoming part of that tree.
_Avoid_: workspace, vault, project

**Command Surface**:
The native application menu, standard keyboard shortcuts, contextual controls, and compact persistent formatting toolbar through which Milo's file and formatting commands are available. The toolbar exposes common WYSIWYG actions without requiring Markdown syntax knowledge while keeping Markdown as the portable document format.
_Avoid_: ribbon, dashboard toolbar

**Image Asset**:
An image pasted into a saved document, stored under `assets/` beside that document and referenced with a collision-safe relative Markdown path. A document must have a file path before it can receive pasted images.
_Avoid_: attachment blob, embedded image store

**Focus Mode**:
A distraction-free view that hides the sidebar, document tabs, and in-window title controls while leaving the editor and native application menu available. It is separate from merely hiding the sidebar.
_Avoid_: full-screen mode, sidebar hidden state

**Milo Distribution**:
A public GitHub project distributed under GPL-3.0, so redistributed derivative versions must provide corresponding source under the same license.
_Avoid_: proprietary freeware, permissive-license project

**File Tree**:
The sidebar representation of the Current Folder that shows only directories and Markdown documents with `.md` or `.markdown` extensions. Other local resources remain available through document-relative references but are not tree entries.
_Avoid_: file browser, asset browser

**Semantic Paste**:
Pasting rich text converts only formatting with a direct Markdown representation into document structure. Unsupported external styling becomes clean text or paragraphs and is never stored as HTML or a private rich-text format.
_Avoid_: HTML paste, rich-text import

**Front Matter**:
YAML metadata at the beginning of a Markdown document. Milo preserves it byte-for-byte while editing the document body in the MVP, without offering metadata editing controls.
_Avoid_: document properties, editor metadata

**Protected Document**:
A document containing syntax Milo cannot reliably round-trip in the current release. It opens read-only, with its reason shown, so automatic saving cannot destroy unsupported content.
_Avoid_: partially supported document, best-effort edit

**Appearance Preference**:
The persisted choice to follow the operating-system appearance or force Milo into light, dark, or warm mode. `system` resolves to light or dark from macOS; warm is always independent of the operating system. It applies immediately and is stored in the settings JSON file.
_Avoid_: theme pack, skin

**System Typography**:
The platform-provided proportional and monospaced font stacks used by Milo's interface and documents. Milo does not load or bundle third-party fonts in the MVP.
_Avoid_: web font, bundled typeface

**Remote Image**:
An image referenced by an HTTP(S) Markdown URL. Milo does not load it automatically; a user must explicitly request loading, while document-relative and local-file images render directly.
_Avoid_: embedded cloud image, automatic external resource

**External Link**:
A non-local URL in a Markdown document. It opens only through the operating system's default browser when the user command-clicks it, never within Milo's editor surface.
_Avoid_: embedded web view, normal-click navigation

**Supported Text File**:
A UTF-8 Markdown file, optionally with a UTF-8 BOM, whose original LF or CRLF line ending style is retained on save. Files with unverified encodings open read-only.
_Avoid_: arbitrary text file, auto-converted document

**macOS MVP**:
The first supported release target: macOS 13 or later, distributed as one universal package for both Apple Silicon and Intel Macs.
_Avoid_: Apple-Silicon-only release, legacy macOS support

**Public Release**:
A GitHub Release containing a signed and Apple-notarized macOS `.dmg`. Unsigned builds are limited to local development.
_Avoid_: unsigned public build, ad-hoc installer

**Repository Quality Gate**:
Every pull request and main-branch change must pass TypeScript checking, linting, unit tests, and a macOS build check. A version tag additionally triggers signing, notarization, and GitHub Release publication.
_Avoid_: unverified main branch, release-only testing

**Application Settings**:
Global preferences and session state held in one JSON file in the operating system's app-data location. They include appearance, interface and document zoom, window state, recent files and folders, and the last open document-tab session; no settings file is created in a user's document folder.
_Avoid_: folder configuration, document metadata store

**File Association**:
Milo registers as an optional macOS editor for `.md` and `.markdown` files so Finder can open them with Milo. Installation never changes the user's default editor choice automatically.
_Avoid_: default-app takeover, exclusive file ownership

**Code Block Language**:
The optional language identifier on a fenced Markdown code block. Milo preserves it and offers a lightweight in-place selector, while MVP code blocks remain unhighlighted until Shiki support arrives.
_Avoid_: syntax-highlighting theme, executable code

**Editable Table**:
A Markdown table edited visually with cell navigation and contextual row or column changes. Presentation-only column sizing is not saved as a private document representation.
_Avoid_: spreadsheet, layout table

**Atomic Save**:
Writing a document through a fully written temporary file in the same directory followed by an atomic replacement of the original. If writing fails, the original file remains intact and Milo retains the in-memory edit with an error indication.
_Avoid_: direct overwrite, best-effort save

**Background Networking**:
Network activity initiated by Milo without a user's immediate content action. It is prohibited in the MVP: there is no telemetry, analytics, crash reporting, or update check.
_Avoid_: anonymous usage data, passive update polling

**Editor Mode**:
The one active editing representation in a Document Tab: WYSIWYG or, in the second phase, Source Mode. Switching explicitly serializes WYSIWYG to Markdown or parses Markdown into WYSIWYG; a failed parse leaves the source intact in Source Mode.
_Avoid_: simultaneous dual-pane editor, live two-way synchronization

**Granted File Scope**:
The files and folders the user explicitly selects through system dialogs, plus necessary descendants of a selected Current Folder. Milo does not scan or request broad filesystem access outside that scope.
_Avoid_: whole-disk access, background file discovery

**File Tree Boundary**:
The File Tree browses and opens Markdown documents only. Renaming, moving, and deleting files or directories remain Finder operations in the MVP; a new document acquires a file through Save or Save As.
_Avoid_: file manager, destructive tree action

**Interface Locale**:
Milo's first-release interface languages are Simplified Chinese and English. It follows the macOS language by default and permits a persisted manual choice; public project documentation is primarily English with optional Chinese material.
_Avoid_: English-only interface, machine-translated runtime UI

**MVP Accessibility**:
The first release requires keyboard-reachable commands, labelled icon controls, visible focus states, and respect for system reduced-motion and text-scaling preferences.
_Avoid_: mouse-only editor, visual-only controls

**Performance Budget**:
On a 16 GB Apple Silicon Mac, the MVP reaches an editable empty document within 1.5 seconds median, opens a roughly 1 MB Markdown file within one second, uses at most 200 MB while idle, and ships as a universal `.dmg` no larger than 100 MB. Deferred rendering extensions stay out of the startup path.
_Avoid_: subjective lightweight claim, eager extension loading

**Save Feedback**:
A quiet, transient indicator near a document-tab title for a pending or in-progress save, which fades after success. A save failure instead remains visible and actionable; no permanent status bar is used.
_Avoid_: always-visible save status, silent write failure

**Sidebar Layout**:
The adjustable File Tree sidebar, initially about 240 px wide, remains separate from the writing workspace. On wide windows, the writing workspace balances a narrow formatting rail to the left of the centered reading column with a generated Document Outline to the right; these auxiliary rails collapse responsively and disappear in Focus Mode.
_Avoid_: fixed-width navigator, permanent inspector, cramped three-column layout

**Document Outline**:
A read-only navigation rail generated from the current document's Markdown headings. It updates as headings change and moves the editing selection to a heading when chosen, without storing private navigation metadata in the document.
_Avoid_: manually maintained table of contents, document database

**MVP Command Access**:
The native menu, contextual menu, and standard shortcuts that expose first-release commands. A command palette is deliberately deferred.
_Avoid_: command-palette-first interface

**Document Zoom**:
A persisted global display preference that scales Milo's reading and editing typography from 80% to 160%, controlled by standard zoom shortcuts. It never changes the Markdown file.
_Avoid_: document font size, exported style

**Interface Zoom**:
A persisted accessibility preference, adjustable from 90% to 140%, that scales labels and text in Milo's window chrome, menus, File Tree, formatting controls, and Document Outline independently of document content.
_Avoid_: browser zoom, changing document typography

**Orphaned Image Asset**:
An image remaining in an `assets/` directory after its Markdown reference is removed. Milo never deletes it automatically because other documents may use it.
_Avoid_: automatically cleaned attachment, deleted paste image

**Startup Session**:
The available document tabs and Current Folder restored after a normal exit. On first launch or when nothing can be restored, Milo opens a focused Unsaved Document; missing historical paths are removed from recents.
_Avoid_: always-empty launch, persistent workspace database

**Unsaved Document**:
A newly created document that has not yet received a Markdown file path. It is protected by normal close confirmation but has no promised recovery after an unexpected exit.
_Avoid_: draft, temporary note

**External Change**:
A modification to an open document made outside Milo. A clean document reloads it; a document with local unsaved changes requires an explicit choice and is never silently overwritten.
_Avoid_: sync conflict, merge

**Supported Markdown**:
The CommonMark dialect with GitHub Flavored Markdown extensions for tables, task lists, and strikethrough. Content edited by Milo is serialized in this normalized dialect; unsupported syntax is preserved when reliable preservation is possible and otherwise must not be silently lost.
_Avoid_: arbitrary Markdown, private document format
