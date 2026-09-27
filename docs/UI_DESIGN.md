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

### Reading widths

| Preference | Article width |
| --- | ---: |
| Narrow | 720 px |
| Standard | 860 px |
| Wide | 960 px |

These widths protect reading comfort and must not expand merely to consume a wide viewport.

### Outline and spacing

- Inline Outline width: 256 px.
- Article-to-Outline gap: 24 px.
- Inline Outline is selected when the Document Stage is at least 1150 px wide; narrower layouts use the Drawer.
- The Document Stage remains the sole scrolling container for document content.

On large layouts, extra space is shared by equal flexible tracks:

```text
minmax(0, 1fr) | document group | minmax(0, 1fr)
```

In Focus Mode, the Article is centered independently of Sidebar and Outline compensation:

```text
minmax(0, 1fr) | article | minmax(0, 1fr)
```

The editor rail reserves only the space required by the Block Handle and related controls; it is not decorative whitespace.

## Appearance

Milo supports System, Light, Dark, and Warm appearances. System follows macOS Light or Dark; Warm remains independent of the operating-system appearance.

Use neutral color for ordinary Sidebar, file, and navigation icons. Accent color is reserved for links, selection, focus, Outline position, and meaningful active state. The Milo mark uses a neutral graphite surface rather than the general accent color.

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

### Safe Save and recovery

On macOS, an existing file uses inode-preserving Safe Save V2. Recovery is evaluated before Markdown is read or an editor session mounts. External modification and unsafe symlink or hard-link states must stop the write. A failed safe save must not silently fall back to replacing an existing file.

### IME

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

An open Current Folder does not imply an open document. With no document tabs, Milo does not create a fake Untitled document, mount Milkdown, start document watching, or autosave. A real unsaved document is created only by an explicit New Document action.

## Related documentation

- [Project overview](../README.md)
- [Known issues](KNOWN_ISSUES.md)
- [Release runbook](RELEASE.md)
