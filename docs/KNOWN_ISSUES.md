# Known Issues

Milo 0.3.0 is the first public beta. Use disposable or backed-up documents when testing.

## Preferences visibility — fixed mechanism, bounded validation

The historical invisible, input-blocking preferences modal depended on transparent entry animations that could stall in WKWebView. Commit `92b5bd8` removes those animations so the dialog and backdrop are immediately visible. No reproducible invisible modal remains in the tested Release scope. The underlying page-visibility cause is unknown; further investigation needs a concrete new failure.

Earlier native acceptance on Apple Silicon / macOS 27.0.1 covered 30 open/close cycles, light/dark/warm appearance, zoom, dismissal methods, focus isolation, app switching, minimize/restore, continued editing, saving and restart persistence. This is prior regression evidence, not a claim of full platform coverage. Intel and older supported macOS versions have not been tested on hardware.

## Real Chinese IME — human verification pending

Full candidate-window and save-timing acceptance with a real Chinese input method remains pending. On the 0.3.0 candidate, native pinyin keys `n`, `i`, then Space produced `你`; Auto Save wrote it to disk and document/app reopening preserved it. This is a real input-method smoke check, not pasted text, but the candidate window could not be reliably observed/controlled for the complete timing matrix. No corresponding save failure or data loss has been reproduced. Composition settlement deliberately waits for stable rendering frames; persistent suspension could defer saving. Pasted Chinese and synthetic composition tests do not establish native IME acceptance.

On the installed draft, a further attempt reached preedit but could not reliably confirm/control the native candidate window. Normal close protection appeared and only that disposable, unconfirmed input was discarded; it is not an established loss of confirmed text.

On the final candidate, use a disposable saved Markdown file and confirm a distinct Chinese phrase. Separately check idle Auto Save, immediate app switching, minimize/restore, immediate Command-S, and normal close/quit with save protection. Reopen and compare the actual saved text after each case. Unconfirmed or cancelled candidates are not expected saved text.

## Distribution and coverage

The Universal package targets macOS 13+, arm64 and x86_64. Native coverage is limited to arm64 on macOS 27.0.1 (26A434). It uses ad-hoc signing without Developer ID identity or Apple notarization, so Gatekeeper trust rejection is expected. The actual draft attachment was downloaded in Chrome with quarantine retained and its checksum verified. The maintainer confirmed manual installation, system permission and first opening with a document visible. The running `/Applications/Milo.app` was subsequently compared file-for-file with that attachment and matched. This is one-host installation evidence, not a claim of Apple trust or complete functional acceptance.

## Performance — bounded observations, timing incomplete

On the 16 GB arm64 host, 30-second-idle aggregate physical footprint (Milo plus its responsible WebKit WebContent/GPU/Networking processes) was 186.52 MB with the real document retained and an empty test tab active. An earlier state retaining an additional unconfirmed-preedit test tab measured 250.32 MB, above the existing 200 MB budget; closing that disposable tab reduced it. This is not an isolated empty-only baseline or an all-scenarios pass. A 1 MB file opened, but reliable five-run startup/open timing remains unconfirmed because native automation delay cannot establish the subsecond budgets. See the [release runbook](RELEASE.md) for method and limits; no performance optimization or budget change is included in this release follow-up.

## P2 — WebKit soft-wrap boundary caret painting

At some soft-wrap boundaries, WebKit can paint the native caret in an unexpected visual position. ProseMirror selection, DOM state, Markdown and dirty state remain correct. This is currently a visual issue.

## Post-redesign backlog

- Define the stale Recent-file experience for paths deleted outside Milo.
- Consider optional macOS native-window integration separately from the current application shell.
