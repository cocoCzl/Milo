# Known Issues

Milo is under active development and testing. This document tracks known product issues and post-redesign work without treating them as resolved.

## P1 — Preferences intermittent WKWebView paint state

Preferences can intermittently enter a state where the dialog lifecycle, modal accessibility subtree, focus trap, and input isolation are active, but the dialog and backdrop have no visible pixels. A window expose has previously caused the surface to repaint.

The issue is confirmed intermittent, its root cause is unresolved, and Milo currently has no production workaround. Portal ownership, fixed versus absolute positioning, backdrop filtering, and opening animation have not been established as sufficient causes.

## P2 — WebKit soft-wrap boundary caret painting

At some soft-wrap boundaries, WebKit can paint the native caret in an unexpected visual position. ProseMirror selection, DOM state, Markdown, and dirty state remain correct. This is currently treated as a visual issue.

## Post-redesign backlog

- Define the stale Recent-file experience for paths deleted outside Milo.
- Consider optional macOS native-window integration separately from the current application shell.
