# Known Issues

Milo 0.3.0 is the first public beta. Use disposable or backed-up documents when testing. The maintainer accepts the verification gaps below for this Pre-release, including an explicit exception to the performance release gates. These gaps are not test passes and remain follow-up work.

## Unreleased writing optimization

### 2026-11-15 input recovery and memory follow-up

See [the targeted native record](EDITOR_INPUT_MEMORY.md) for current c96808c build identities. The old close-cancel permanent waiting observation remains a separate unresolved native issue; it did not reproduce in the targeted runs. A reproducible missed-compositionend recovery gap and Source close-cancel focus bug are fixed with regressions and bounded native disk/reopen checks. Recovery requires positive non-composition input evidence and, for ProseMirror, its own composing=false; blur, Escape or a timeout never force completion.

Candidate-time Cmd+S in a plain search input now has meta=true keydown/up and an actual session save command, while the composition update introducing s precedes the JavaScript keydown. This excludes complete modifier loss or a missing save command for that sample, but does not distinguish automation/macOS/WKWebView upstream behavior. Do not merge this with the separate permanent-wait issue or remove typed letters.

Native watchers now share one non-recursive resource per canonical parent directory with exact-file dispatch and reference-counted cleanup. Twenty visited tabs reduced Milo threads from 57 to 20; matched normal Release footprint was 230.92→230.15 MB, edited 234.88→233.82 MB (single samples; no significant improvement claim). The 200 MB budget is still exceeded; restored-only one-view state already measured about 213 MB, GPU about 72 MB. A standalone normal 1 MB scenario measured 275.11 MB. EditorView eviction, exact heap allocation attribution and normal startup/input/display latency are still incomplete. Source undo boundaries remain unchanged.

### Earlier build-specific evidence

The development source adds coordinated native close/quit, stable-content saves, unnamed recovery, bounded Outline navigation, lazy tabs/folders, compact chrome, local link/Back navigation, find/replace, folder Quick Open and whole-file Source mode. See [current implementation/verification status](EDITOR_OPTIMIZATION.md). These changes do not alter the published 0.3.0 binary.

Earlier development acceptance (before the current optimization) recorded that the isolated arm64 Tauri Release passed disk/reopen checks for ordinary saves, independent unnamed recovery, quit cancellation/save/discard, and save failure retention. Actual Finder cold opens, opening with no visible window, duplicate-file handling, confirmed native pinyin followed by save/quit, and Chinese input in code blocks and empty table cells were checked. These are bounded observations, not complete platform acceptance.

Still unverified: Dock reopening; candidate confirmation immediately followed by app switching or minimization; and saving/closing during unconfirmed composition. In one unconfirmed-composition attempt, Command-S was followed by an extra `s` in the marked pinyin. Available key-send records cannot distinguish an automation issue from an application issue; this remains an unresolved observation. Intel and older macOS are untested.

Native performance budgets are **not signed off**. Browser development timings do not establish native Release performance. A historical dense 1 MB heading/code/table browser stress sample exceeded the harness's 60-second readiness limit. The new deterministic sample completes in Chromium development, but has a different structure and cannot establish a speedup against that historical sample. Release profiling locates much of structured-document open time in parsing; it does not measure earliest input readiness or establish a before/after improvement. Visited editors intentionally remain mounted to retain undo history. Native footprint samples vary by scenario and do not establish either a leak or a resource-release budget pass. The historical 0.3.0 budget exception does not apply to this source.

The previous continuation is recorded in [native continuation acceptance](EDITOR_NATIVE_CONTINUATION.md); [earlier acceptance](EDITOR_ACCEPTANCE.md) retains build-specific history. That record’s final normal arm64 Release is `bb70947` without diagnostics or fault injection. Separate opt-in native-test builds passed controlled pre-transaction save overlaps (newer body/Front Matter, tab switch, close and quit), retry after permission restoration without external edits, and independent visual/Source unnamed-draft crash recovery across startup. The pause gate runs in the ordered blocking worker and is absent from ordinary releases; it is not a physical slow-disk benchmark.

Real system-pinyin key input now has bounded disk/reopen evidence in paragraphs, headings, code, empty/existing table cells and Source, plus find/replace/Quick Open field observations. The final normal build passed confirmed pinyin immediately followed by quit/save/restart. Candidate-time Cmd+S/Cmd+Q still appended Latin `s`/`q` in some attempts, including a plain search input; TextEdit calibration did not establish reliable conversion. Candidate blur/close also produced Latin text, and one final-build close attempt remained unsettled until the disposable edit was explicitly discarded. These observations are unresolved, not dismissed as tooling or signed off as product behavior. Immediate app-switch/minimize transitions remain unobserved independently; Dock object lookup times out and no supported desktop screenshot can identify its icon. These are concrete tool/verification gaps, not a claim that native IME inherently requires a human. No missing system permission was established.

Two native findings are fixed with regressions: a failed writable-open previously left CommitStarted and could roll back a subsequent external edit during recovery; Save As could return `/tmp` while reads returned `/private/tmp`, creating two tabs for one file. The final package reran affected cases after both fixes. Older acceptance evidence must not be used to sign off these newer save paths.

The historical WebKit Outline Tab failure is fixed with explicit focusability. Chromium and WebKit now pass the complete layout/interaction suite, including reverse traversal and collapsed descendants. Actual WKWebView now passes the multi-level forward/reverse/collapsed-descendant and Escape-focus sequence at 720×520 with 140% interface zoom. A newly found fitted-document bug selected Last while the whole document was visible at its top; `bb70947` requires actual scrolling before applying the bottom tolerance. Unit, Chromium/WebKit and final native screenshots verify Root current-heading state remains distinct from Last keyboard focus. Fullscreen and all window states are not exhaustively covered.

Visited views retain history and ProseMirror selection listeners. Unused Milkdown listener serialization/timers were removed; image destruction clears requests and handlers. Inactive image suspension and bounded EditorView eviction are incomplete. The real lifecycle probe preserves exact State/undo across view recreation, but replacing editorViewCtx does not transfer Milkdown's internal captured view ownership; see the acceptance record. Independent 1/5/10/20 restore/visit/edit/disk-check/close experiments now pass in the opt-in test build. Twenty edited tabs retain about 223 MB aggregate physical footprint; the final normal Release independently retains about 228 MB for twenty visited tabs, exceeding the unchanged 200 MB budget. All-close normal Release measured about 160 MB, including a later idle sample. Five 1 MB open/edit/undo/close cycles had non-monotonic footprint peaks followed by natural reclamation and substantial WebKit reclaimable pages. Closed view counts return to zero; neither counts nor memory alone establish a leak, long-term stability or a budget pass. Native first-input percentiles, five cold starts and a matched pre-optimization native baseline remain unmeasured.

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

### 2026-11-15 measurement follow-up

The source now has an opt-in, clock-calibrated diagnostics path and a repeatable disposable-process footprint sampler. Five `lib-run-entry → home-controls-ready` samples and repeated 1 MB open/input samples are recorded in `docs/EDITOR_INPUT_MEMORY.md`; these are stage and model timings, not click-to-pixel latency. Normal Release 20-tab restored-only footprint remains 200.87–208.65 MB in the 1280×820 scenario and 184.03–184.34 MB at 720×520; the 200 MB budget is not signed off. WebContent allocation categories and one-factor window/view experiments do not yet justify a safe EditorView eviction or CSS change. System Open dialog success was reproduced with confirmed file-row selection; no product filter change was needed.
