# Known Issues

Milo 0.3.0 is the first public beta. Use disposable or backed-up documents when testing.

## Preferences visibility — fixed mechanism, bounded validation

The historical invisible, input-blocking preferences modal depended on transparent entry animations that could stall in WKWebView. Commit `92b5bd8` removes those animations so the dialog and backdrop are immediately visible. No reproducible invisible modal remains in the tested Release scope. The underlying page-visibility cause is unknown; further investigation needs a concrete new failure.

Earlier native acceptance on Apple Silicon / macOS 27.0.1 covered 30 open/close cycles, light/dark/warm appearance, zoom, dismissal methods, focus isolation, app switching, minimize/restore, continued editing, saving and restart persistence. This is prior regression evidence, not a claim of full platform coverage. Intel and older supported macOS versions have not been tested on hardware.

## Real Chinese IME — human verification pending

Candidate confirmation and save timing with a real Chinese input method remain unverified. No corresponding save failure or data loss has been reproduced. Composition settlement deliberately waits for stable rendering frames; persistent suspension could defer saving. Pasted Chinese and synthetic composition tests do not establish native IME acceptance.

On the final candidate, use a disposable saved Markdown file and confirm a distinct Chinese phrase. Separately check idle Auto Save, immediate app switching, minimize/restore, immediate Command-S, and normal close/quit with save protection. Reopen and compare the actual saved text after each case. Unconfirmed or cancelled candidates are not expected saved text.

## Distribution and coverage

The Universal package targets macOS 13+, arm64 and x86_64. Native coverage is limited to arm64 on macOS 27.0.1 (26A434). It uses ad-hoc signing without Developer ID identity or Apple notarization, so Gatekeeper trust rejection is expected. Browser download with quarantine and the normal Privacy & Security / Open Anyway installation path must be checked after a downloadable release attachment is available. Local artifact launch is separate evidence.

## P2 — WebKit soft-wrap boundary caret painting

At some soft-wrap boundaries, WebKit can paint the native caret in an unexpected visual position. ProseMirror selection, DOM state, Markdown and dirty state remain correct. This is currently a visual issue.

## Post-redesign backlog

- Define the stale Recent-file experience for paths deleted outside Milo.
- Consider optional macOS native-window integration separately from the current application shell.
