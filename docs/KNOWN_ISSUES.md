# Known Issues

Milo 0.3.0 is the first public beta. Use disposable or backed-up documents when testing. The maintainer accepts the verification gaps below for this Pre-release, including an explicit exception to the performance release gates. These gaps are not test passes and remain follow-up work.

## Unreleased writing optimization

The source branch adds coordinated native close/quit, stable-content saves, unnamed recovery, bounded Outline navigation, lazy tabs/folders, compact chrome and document find. See [the verification record](OPTIMIZATION_2026-10.md) for tests, raw timing samples and screenshot pairs. These changes do not alter the published 0.3.0 binary.

This branch has **not** passed the native performance budgets. Browser development measurements show a substantial Outline scroll reduction and fewer initial editors, but no material 1 MB open improvement. A denser 1 MB heading/code/table stress sample exceeded the browser harness’s 60-second readiness limit; this remains a large-structure limitation. Edited Markdown still normalizes unrelated bullets/fences/table formatting/hard breaks; full-document byte preservation is not implemented.

Final arm64 Release checks cover native find, sequential dirty-tab quit, cancellation/focus and save-before-window-hide. Final-source real Chinese IME confirmation followed by immediate save/quit, app-switch and minimize remains unverified; previous release results cannot be inherited. Intel and older macOS are untested. Visited editors intentionally remain mounted, so this round does not claim low memory after visiting ten large documents or a native resource-release budget pass. Native cold-start/1 MB latency and ownership-attributed total footprint are unmeasured.

The sections below retain evidence for the published 0.3.0 beta. Its budget exception is historical and does not approve this optimization.

## Preferences visibility — fixed, bounded validation

The invisible, input-blocking preferences modal was fixed by removing entry animations that could stall in WKWebView. No reproducible invisible modal remains in the tested Release scope. Native checks covered appearance, zoom, dismissal, focus, continued editing, saving and restart persistence on arm64 / macOS 27.0.1. Other hardware and supported macOS versions remain outside that evidence.

## Real Chinese IME — save checks passed, window timing incomplete

Native pinyin keys confirmed Chinese in independent disposable Markdown files. Auto Save, immediate Command-S and normal document close with “Save and Close” passed actual disk comparison and document close/reopen. No pasted Chinese, text injection or synthetic composition events were used.

The app-switch and minimize samples also retained Chinese on disk and reopening, but the actual immediate foreground/minimized transitions were not independently observed. Those two timing cases are not fully covered. No loss of confirmed Chinese text was established. They remain follow-up verification rather than blockers for this accepted 0.3.0 Pre-release.

## Distribution and compatibility

The Universal package targets macOS 13+, arm64 and x86_64. Hardware coverage is limited to arm64 / macOS 27.0.1 (26A434); Intel and macOS 13–26 are untested on hardware. It uses ad-hoc signing without Developer ID identity or Apple notarization; Gatekeeper trust assessment rejected it as expected. This is not Apple certification.

The actual release attachment was downloaded in Chrome with quarantine retained and its checksum verified. The maintainer confirmed manual installation, system permission and first opening. The installed application matched the attachment. This is one-host installation evidence, not full platform acceptance. Follow the [README installation steps](../README.md#download-and-install).

## Performance — accepted exception for 0.3.0 Pre-release

Reliable cold-start and approximately 1 MB document-open latency measurements remain unavailable. Memory observations include Milo and its related WebKit processes: aggregate idle footprint was 186.52 MB with an empty test tab active and the real document retained, versus 250.32 MB in an earlier state retaining an additional preedit test tab. These are different running scenarios, not an isolated baseline or an overall budget pass.

The original targets remain documented in the [release runbook](RELEASE.md). The maintainer explicitly waives them as publication gates for this 0.3.0 Pre-release only; no performance optimization, invented measurement or general budget relaxation is implied.

## P2 — WebKit soft-wrap boundary caret painting

At some soft-wrap boundaries, WebKit can paint the caret in an unexpected visual position. Selection, Markdown and dirty state remain correct; this is currently a visual issue.

## Post-redesign backlog

- Native Recent-file read failures now show an explicit error without creating an unrelated empty tab (unreleased); retain retry/removal access.
- Consider optional macOS native-window integration separately.
