# Milo UI Design

Milo is a local-first, lightweight WYSIWYG Markdown editor. The Markdown file is always the source of truth: interface state and visual presentation must not introduce a private document format or silently change document content.

This document records durable UI and editor constraints. It is not an implementation plan or a release checklist.

## Product principles

- Keep the document—not application chrome—as the primary visual subject.
- Prefer a quiet, compact interface over decorative surfaces or feature-heavy panels.
- Preserve ordinary Markdown files that remain usable in other editors.
- Keep UI-only actions, appearance changes, navigation, and mode changes out of serialized Markdown.
- Preserve fast startup and responsive editing; optional presentation features must not burden the core writing path.

## Presentation modes

### Edit

Edit mode enables document changes and contextual editing controls.

### Read

Read mode uses the same document and editor instance with editing disabled. It is not a second Markdown renderer and must not rebuild or reserialize the document merely to switch modes.

### Focus

Focus Mode hides application navigation and nonessential chrome while keeping the document centered. It is independent of macOS fullscreen and of merely hiding the Sidebar.

## Workspace layout

The normal workspace consists of the adjustable Sidebar, the Document Workspace, and either an inline Outline or a responsive Outline Drawer.

The Application Bar combines tabs with save feedback/actions; it does not repeat a document title/path row. Tab and save-status tooltips expose the complete path. Long titles truncate within flexible tracks. Dirty, saving, failed and external-change states remain visible; saved status is subdued. The native title bar is unchanged.

The Sidebar has a compact brand, the Current Folder first, and a collapsed Recent section when a folder is open. Folder branches load on expansion and pages expose Load More; failures are local and retryable. The optional dependency/build filter is explicit, not a hidden heuristic.

### Reading widths

| Preference | Article width |
| --- | ---: |
| Narrow | 720 px |
| Standard | 860 px |
| Wide | 960 px |

These widths protect reading comfort and must not expand merely to consume a wide viewport.

### Outline and spacing

- Inline Outline width: 256 px; the top-bar toggle can hide and reopen it.
- Default maximum heading depth is 3, adjustable to 1–6. Section folding is per mounted document; depth preference is local UI storage, never Markdown.
- Current-heading accent, ancestor weight and keyboard focus are distinct.
- Article-to-Outline gap: 24 px.
- Inline Outline is selected when the Document Stage is at least 1150 px wide; narrower layouts use the Drawer.
- The Document Stage remains the sole scrolling container for document content.
- Inline Outline is portalled into a sibling grid layer in Document Area. It shares the Stage's horizontal tracks and reserved rail, but receives its height from the single remaining workspace row below the Application Bar, with 16 px outer insets. Do not size it with viewport subtraction or put it back inside the article's scroll root.
- The Outline header stays visible; only its body scrolls, with 16 px trailing padding and contained overscroll. Short outlines shrink to content.
- Current-heading visibility adjusts only the Outline body's scroll position when the active heading changes and is outside the visible list. Unrelated renders must preserve manual Outline browsing.
- Outline rows scale with Interface Zoom (about 28 px at 100%), keep native full-text titles, and cap deep indentation. Active color applies at every depth in both layouts.

On large layouts, extra space is shared by equal flexible tracks:

```text
minmax(0, 1fr) | document group | minmax(0, 1fr)
```

In Focus Mode, the Article is centered independently of Sidebar and Outline compensation:

```text
minmax(0, 1fr) | article | minmax(0, 1fr)
```

The editor rail reserves only the space required by the Block Handle and related controls; it is not decorative whitespace.

### Outline regression checks

`tests/fixtures/outline-long.md` is synthetic test material with 32 chapters, all six heading depths, duplicate and long mixed-language headings, and the explicit final chapter `32. 最后的收束话术`.

Install dependencies with `npm ci` and the pinned development browser with `npx playwright install --with-deps chromium`. With `npm run dev -- --host 127.0.0.1` running, execute `npm run test:browser`. Playwright is a lockfile-pinned development dependency, never a runtime application dependency. CI runs the same commands and uploads artifacts. Screenshots and measured rectangles go to `/private/tmp/milo-outline-regression`, or the directory set by `MILO_OUTLINE_ARTIFACTS`.

The same harness checks Home with no Document Tabs: its complete empty-state group must be centered in Document Area (2 px horizontal / 12 px vertical tolerance), both buttons must fit, and the stage must not overflow. It covers sidebar on/off where supported, viewport sizes including 1280×800, 1440×900, 1920×1080 and a narrow window, three themes, Interface Zoom 100%/140%, and the transition after closing the last tab.

The harness runs the real App and Milkdown with isolated in-memory native IPC. It measures workspace, header, scroll body and final-row bounds, sends real browser wheel and keyboard input, and checks article scroll isolation, navigation, themes, zoom, tabs, modes, resize and edit/save calls. It does not prove native disk saving, WKWebView painting or macOS trackpad momentum; label native evidence separately in the verification record. Physical trackpad momentum remains untested.

## Appearance

Milo supports System, Light, Dark, and Warm appearances. System follows macOS Light or Dark; Warm remains independent of the operating-system appearance.

Use neutral color for ordinary Sidebar, file, and navigation icons. Accent color is reserved for links, selection, focus, Outline position, and meaningful active state. The Milo mark uses a neutral graphite surface rather than the general accent color.

Default typography uses zero heading tracking, with H1/H2/H3 at 1.8/1.45/1.2 times the document base and weights 680/650/620. Paragraph spacing and the existing three themes share variables; no heading spaces or numbering are inserted into Markdown. Focus Mode uses 38–64 px top padding, keeps the article centered and exposes Exit · Esc and Outline controls without rebuilding the editor.

## Contextual editing

- The Selection Toolbar appears only for an eligible text selection and must not obscure selected text.
- The Block Handle identifies the current block with low visual noise.
- Opening the Block Menu freezes its target; later pointer movement must not retarget the command.
- Selection Toolbar and Block Handle must not compete for visibility.
- Context Menu, Block Menu, Link Popover, Select, Tooltip, and modal surfaces follow explicit overlay and Escape priority.
- Read mode must not expose editing-only controls.

## Accessibility and motion

- Commands and resize controls must be keyboard reachable.
- Icon-only controls require accessible names.
- Focus indicators use `:focus-visible` and must remain legible in every appearance.
- Directional resize keys prevent default scrolling and respect the same min/max and persistence path as pointer resize.
- Reduced Motion disables nonessential animation without changing final layout or visibility.
- Modal focus trapping, Escape behavior, and focus restoration are interaction contracts, not optional polish.

## Editor core invariants

### Document origin and tab isolation

Every editor callback, autosave, watcher event, and delayed task remains bound to its originating document. Switching tabs must not redirect an older callback to the newly active document. Content, dirty state, presentation mode, scroll position, Outline state, and contextual overlays remain isolated between document tabs.

### Document Find

Command-F opens model-based literal find in Edit and Read. Enter/Shift-Enter navigate, Escape closes and returns focus without moving the editing selection. Query input composition must not trigger navigation. All matches use ProseMirror decorations, with a separate current-match treatment; no DOM wrapping, dirty state or history changes. A 100 ms query debounce and an immutable-document text index avoid rebuilding the index on selection/navigation. Tab switches clear the query.

### Safe Save and recovery

On macOS, an existing file uses inode-preserving Safe Save V2. Recovery is evaluated before Markdown is read or an editor session mounts. External modification and unsafe symlink or hard-link states must stop the write. A failed safe save must not silently fall back to replacing an existing file.

Window close and application quit coordinate all tabs sequentially; Cancel restores the affected tab and focus. Saving, failures and unsettled composition cannot be silently discarded by native termination. A window close hides the macOS window; Quit exits only after approval. Unnamed stable dirty documents have independent app-data recovery copies; damaged copies report errors while valid copies still restore.

### IME

Composition completion samples immutable document identity and DOM mutation generations on timer opportunities, not animation frames or full `innerHTML` reads. Two stable samples with IME inactive are required; elapsed time alone never authorizes saving. Manual save waits for this boundary; close confirmation disables Save until settled.

WebKit composition replacement may create a temporary bare `<br>` at the DOM boundary. That artifact must not become a real Markdown hard break. Genuine Shift+Enter, pasted HTML breaks, and authored Markdown hard breaks remain supported.

### Table serialization

Table alignment semantics remain distinct:

```text
null / default -> centered presentation without explicit alignment
left           -> explicit left
center         -> explicit center
right          -> explicit right
```

Empty-cell normalization is scoped to structural table cells and headers. It must not become a global `<br>` cleanup rule.

### No-document state

Home uses one explicit Document Area row. Its stage occupies row 1 with a single column and symmetric padding; it must not inherit the extra document-information row. Center the entire empty-state group against this workspace, after the Application Bar and beside the visible sidebar.

An open Current Folder does not imply an open document. With no document tabs, Milo does not create a fake Untitled document, mount Milkdown, start document watching, or autosave. A real unsaved document is created only by an explicit New Document action.

## Related documentation

- [Project overview](../README.md)
- [Known issues](KNOWN_ISSUES.md)
- [Release runbook](RELEASE.md)

Outline current-position updates run directly from passive article scroll events. Do not gate them only on animation frames: an interactive WKWebView can report its page hidden and stall that clock. Reveal the current outline row with its own `scrollTop`, matching the existing native document navigation workaround. Manual browsing still survives updates that do not change the active heading. Native acceptance also found stalled tab-background color transitions after theme changes; tab colors now paint immediately.

Native visual checks must launch a Tauri-generated `Milo.app` (`npm run tauri -- build --debug --bundles app`), not a hand-written `.app` wrapper around a bare executable. A wrapper without `CFBundleIconFile` and `Contents/Resources/icon.icns` cannot validate the Dock icon. Temporary size overrides must retain the Milo name, title and original icon; restore only the test-owned settings afterward. Keep generated test matrices, screenshots, logs and temporary verification reports outside the repository. Never commit test evidence, private documents or user settings.
