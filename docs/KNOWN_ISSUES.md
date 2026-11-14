# Known Issues

Milo 0.3.0 is the first public beta. Use disposable or backed-up documents when testing. The maintainer accepts the verification gaps below for this Pre-release, including an explicit exception to the performance release gates. These gaps are not test passes and remain follow-up work.

## Unreleased writing optimization

The development source adds coordinated native close/quit, stable-content saves, unnamed recovery, bounded Outline navigation, lazy tabs/folders, compact chrome, local link/Back navigation, find/replace, folder Quick Open and whole-file Source mode. See [current implementation/verification status](EDITOR_OPTIMIZATION.md). These changes do not alter the published 0.3.0 binary.

Earlier development acceptance (before the current optimization) recorded that the isolated arm64 Tauri Release passed disk/reopen checks for ordinary saves, independent unnamed recovery, quit cancellation/save/discard, and save failure retention. Actual Finder cold opens, opening with no visible window, duplicate-file handling, confirmed native pinyin followed by save/quit, and Chinese input in code blocks and empty table cells were checked. These are bounded observations, not complete platform acceptance.

Still unverified: Dock reopening; candidate confirmation immediately followed by app switching or minimization; and saving/closing during unconfirmed composition. In one unconfirmed-composition attempt, Command-S was followed by an extra `s` in the marked pinyin. Available key-send records cannot distinguish an automation issue from an application issue; this remains an unresolved observation. Intel and older macOS are untested.

Native performance budgets are **not signed off**. Browser development timings do not establish native Release performance. A historical dense 1 MB heading/code/table browser stress sample exceeded the harness's 60-second readiness limit. The new deterministic sample completes in Chromium development, but has a different structure and cannot establish a speedup against that historical sample. Release profiling locates much of structured-document open time in parsing; it does not measure earliest input readiness or establish a before/after improvement. Visited editors intentionally remain mounted to retain undo history. Native footprint samples vary by scenario and do not establish either a leak or a resource-release budget pass. The historical 0.3.0 budget exception does not apply to this source.

The latest follow-up builds, actual disk/close/Finder checks, process-memory data and precise remaining cases are recorded in [native acceptance](EDITOR_ACCEPTANCE.md). Final acceptance uses arm64 Release + opt-in diagnostics at `65ef8c4`, in an isolated bundle and disposable files. It passed bounded Source/Front Matter immediate saves, Save As and canonical-path tab reuse, visual autosave/undo/redo disk checks, denied-write retention, cancelled quit, external-after-failure conflict protection, explicit overwrite/reopen, unnamed first-save/recovery-copy cleanup, mixed draft quit/discard/save and Finder process/window reopening. This is not a full native matrix or real Chinese IME pass. Controlled slow-I/O overlaps, crash recovery across startup, Dock, candidate timing and complete native window/layout coverage remain open.

Two native findings are fixed with regressions: a failed writable-open previously left CommitStarted and could roll back a subsequent external edit during recovery; Save As could return `/tmp` while reads returned `/private/tmp`, creating two tabs for one file. The final package reran affected cases after both fixes. Older acceptance evidence must not be used to sign off these newer save paths.

The historical WebKit Outline Tab failure is fixed with explicit focusability. Chromium and WebKit now pass the complete layout/interaction suite, including reverse traversal and collapsed descendants. Actual WKWebView screenshots show the close-button/title focus ring and reverse return; the entire multi-level/narrow/high-zoom native focus matrix remains pending.

Visited views retain history and ProseMirror selection listeners. Unused Milkdown listener serialization/timers were removed; image destruction clears requests and handlers. Inactive image suspension and bounded EditorView eviction are incomplete. The real lifecycle probe preserves exact State/undo across view recreation, but replacing editorViewCtx does not transfer Milkdown's internal captured view ownership; see the acceptance record. Twenty visited tabs measured about 228 MB aggregate physical footprint, exceeding the unchanged 200 MB budget in that scenario. Closed editor counts return to zero; process memory retention alone establishes neither a leak nor a pass. Native first-input percentiles, five cold starts and a matched pre-optimization native baseline remain unmeasured.

Source uses a lazy whole-file textarea with coherent focus/typography and no resize handle. Exactly reverted text preserves visual history; actual Source changes start a new visual history on return. The UI states this boundary and offers one read-only, in-session pre-edit checkpoint. Unified cross-mode undo is not implemented. Unsupported raw HTML remains in Source; decoding errors stay locked. Source supports exact case-sensitive whole-file previous/next search, without replacement. An experimental Source Replace All was withdrawn after actual WebKit undo did not preserve the intended boundary. Long Source entry/save has browser coverage and bounded native observation, not a native latency percentile pass.

Edited Markdown normalizes unrelated bullets, fences, table formatting and hard breaks; full-document byte preservation is not implemented.

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
