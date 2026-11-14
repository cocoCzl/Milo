# Editor optimization work record (unreleased)

Baseline: `be11529a2f30224b178a22ea2ffd1885d9bc9a01`, clean `master`; work branch `optimize/local-editor`. No AGENTS.md was present in the repository/ancestor scope. README, CONTEXT, UI_DESIGN, KNOWN_ISSUES, release runbook and current code were reviewed before implementation.

Environment: arm64, macOS 27.2.1 (26B131), Node 24.11.1 / npm 11.6.2, Rust/Cargo 1.94.1. Browser measurements below use Vite development and isolated native IPC. Native builds use `io.github.milo.review20261114`, never production preferences. No dependencies were added/upgraded. Artifacts: `/private/tmp/milo-optimization`; do not commit screenshots, generated fixtures, settings or logs.

Baseline gates: formatting, TypeScript, ESLint, 45 frontend suites / 407 tests, production build, Rust fmt/Clippy and 37 Rust tests passed. An isolated Debug `.app` build and Chromium checks (54 Home geometry / 18 Outline layouts plus interactions) passed. The historical 7.55 MB Universal DMG is compressed distribution size, not resident memory or this build's size.

Existing capabilities retained: four appearance preferences, independent interface/document zoom, font style/width/line height, focus/read modes, outline drawer/inline rail, document find, lazy unvisited tabs and directory levels, session/unnamed recovery, stable IME save boundary, inode-preserving Safe Save V2. No duplicate implementation of these features was introduced.

## Task status

“Implemented” describes code plus automated checks; it never implies the pending native matrix passed.

| Task | Implementation | Verification / remaining work |
| --- | --- | --- |
| 0 Baseline / synthetic fixtures | Implemented; native performance acceptance partial | Repeatable sizes, AST counts, hashes and 1/5/10/20-tab resource matrix. Native cold/warm/input latency/RSS unmeasured. |
| 1 Disk commands | Implemented; native responsiveness pending | Entire transactions run in cancellation-safe ordered blocking workers. Alias/stale expectation/inode, serialization/failure and frontend save/close coordination tests pass. Slow-I/O window response remains native acceptance. |
| 2 Code blocks | Implemented; native IME pending | Menus on demand; at most one open menu's two global handlers; close/read/background/destroy cleanup; alias/unknown labels, copy feedback and keyboard/undo tests. Stable code content DOM retained. |
| 3 Parse / serialize | Partial | Retain separate safety parse (no unsupported-syntax bypass); split dirty signal from full serialization, 350 ms idle / 2 s maximum publication and existing immutable current-doc cache. Same-fixture serialization counts measured below. Worker/shared parse not implemented without evidence of benefit. |
| 4 Startup | Partial; lazy boundary implemented, cold comparison/retry fault injection pending | Editor/Source/safety parsing load on demand, diagnostics split out of Home graph. Production HTML preloads React only. Error/retry UI for chunk/editor creation failures; persistent browser module-fetch failure retry still needs fault-injection acceptance. No unconditional Home prewarm. |
| 5 Images / directory | Partial | Image paste uses Uint8Array/raw binary IPC, preserving original bytes; no default compression. Directory page cache bounded to 8 directories/10,000 entries each/30 s, offset zero and Refresh rescan, metadata changes reject stale continuation. Large-image IPC and native resource footprint unmeasured; existing lazy decode/error behavior retained. |
| 6 Reliability feedback | Implemented; native failure acceptance partial | Separate monitor warning/retry and save errors, failed external read retained, editor create retry, image/opener/path action feedback. Async inspection rechecks identity/revision/composition/save activity before replacing content. |
| 7 Window / navigation | Partial | Native chrome retained; tab reveal, keyboard switching, duplicate parent paths, error/conflict indicators and Back added. Existing wide tree/article/outline and narrow drawer preserved. Native title-bar integration and small-sidebar File/Outline switch not implemented; native traffic-light/fullscreen/inactive acceptance pending. |
| 8 Theme / typography | Partial | Unify theme variables/portals under data-theme; existing Light/Dark/Warm/System and typography retained. Three-theme/high-scale writing screenshots and existing layout suite pass in Chromium. No fonts/icons/renderers added. Full style module split and native contrast/visual matrix remain. |
| 9 Local navigation | Implemented; native opener scenarios pending | Relative Markdown/anchors/path+fragment, Chinese/spaces/encoding validation, tab reuse/canonical paths, bounded Back scroll history, missing-file errors. Edit modifier-click, Read plain click; no WebView navigation. |
| 10 Replace / Quick Open | Implemented; platform keyboard gap recorded | Single/all replacements with one-step undo, marks at start, optional case, protected/read/IME guards, bounded decorations. Cmd+P selected-folder-only bounded/cancellable traversal; arrows/Enter/Escape/focus restore, names/relative paths, retry/no-result UI. Finder/Copy path actions. Source find differs as documented. |
| 11 Background resources | Partial: first layer; second layer blocked on lifecycle design | Active-only menus/find/contextual/outline work; visited view/history retained. 20-tab resource/close counts below. Inactive image resource release is incomplete. Milkdown destroy owns view plus plugins/history; safe bounded view eviction requires a state/view ownership change, not destroy/reparse or history clearing. No leak or RSS pass claimed. |
| 12 Source / round trip | Partial; Source implemented, native matrix pending | Lazy whole-file textarea, one editable owner, stable composition publication, safe saves/conflicts/recovery, Front Matter and BOM/line-ending semantics. Untouched switches preserve bytes; actual Source edits start new WYSIWYG history. Raw HTML stays in Source; other protection stays locked. Round-trip reference probe demonstrates why untouched-block preservation is not implemented. |

Optional paragraph focus/typewriter, image drag/alt/original tools, PDF/HTML export and Mermaid/math are **not implemented** in this round. No renderer dependency was added to fill the feature list.

## Code observations rechecked against baseline

1. Static DocumentPanel editor import and indirect diagnostics dependency were present; both removed. Home production HTML now preloads React only.
2. Safety inspection before Milkdown remains intentional. Parsing is still duplicated; no claim of eliminating it.
3. Changes used full serialization at publication; current immutable-doc caching already existed. Reused it rather than retaining serialized strings for historical doc nodes. Idle publication batching now coalesces more edits.
4. Each code block eagerly created a menu and global handlers; now menus/handlers exist only while one menu is open.
5. Visited tabs still retain full views/history. Active-only optional work improved; second-layer eviction is not implemented.
6. Document/recovery/image/settings/draft I/O was synchronous; commands now await complete spawn_blocking transactions with FIFO locks. All document jobs share a conservative lane to cover aliases and sidecars; settings/drafts have separate lanes. This can serialize unrelated files and is an explicit throughput tradeoff.
7. Monitor failures were session-only; now visible separately with retry. External changes detected during safety inspection cannot overwrite newly typed input.
8. WYSIWYG edits still normalize whole-body Markdown. Untouched documents keep original bytes; Source is the precise-text option.
9. HTTP(S)-only navigation extended with one validated local resolver, anchors and Back. External links retain the existing system opener boundary.
10. Theme variable duplication under data-color-scheme was consolidated into data-theme. Some component-specific dark selectors remain; this is not a complete stylesheet rewrite.

## Comparable measurements

All numbers in this section are Chromium 151.0.7922.34, Vite development, synthetic documents and simulated native IPC on the same host. They are **not native latency, memory or release budget acceptance**. Scripts and workload definitions are committed; generated evidence is not.

| Same workload / operation | Baseline | Current | Interpretation |
| --- | --- | --- | --- |
| 300 TS code blocks, 9,378 bytes: initially created language menus | 300 | 0 | Deterministic DOM reduction |
| Same sample: elements inside ProseMirror | 6,900 | 2,700 | 4,200 fewer elements; stable code content preserved |
| Same sample: readiness, 5 runs (ms) | 365, 328, 305, 331, 322 | 374, 280, 290, 282, 290 | Small/concurrent dev samples; insufficient evidence for a stable speedup |
| 100 KB plain text, five edits spaced 200 ms, three runs: serialize count | 5 / 5 / 5 | 1 / 1 / 1 | Deterministic batching under this typing cadence; not all typing patterns |
| Same runs: total serializer ms | 9.7 / 12.3 / 12.4 | 1.2 / 1.1 / 2.9 | Serializer work only; not input P50/P95 |
| Save after same runs: additional serialization | 0 / 0 / 0 | 0 / 0 / 0 | Existing cache retained |
| Native cold/warm startup, first input, P50/P95, save latency, aggregate process memory | Unmeasured | Unmeasured | No budget pass or Typora comparison |
| Final arm64 Release .app, sum of regular file bytes | Unmeasured | 12,493,738 bytes (11.91 MiB), uncompressed | Build artifact size, not resident memory or compressed installer |
| Final compressed Universal DMG | Historical 0.3.0: about 7.55 MB | Not built | Current arm64 .app is not comparable to compressed Universal DMG |

For the serializer baseline, an archived baseline checkout used a measurement-only wrapper around the existing `ctx.get(serializerCtx)(view.state.doc)` call: measure `performance.now()` before/after, increment `__miloMetrics["markdown-serialize"].count/totalMs/maxMs`, and return the identical string. Publication timing, cache and editor semantics were unchanged; Vite cache directories were isolated between sources. The wrapper is not a baseline optimization. Current instrumentation is opt-in in the committed source.

The current resource matrix (one sample each; not before/after latency comparison) initially measured approximately 311 ms small mixed, 311 ms 100 KB plain, 916 ms 1 MB plain, 634 ms 1,000 headings, 299 ms 300 code blocks, 597 ms 300 tables, 246 ms 80 synthetic local images, 1,619 ms structured 1 MB. Navigation-to-ready includes dev server/harness costs. Fixture structure differs from the historical dense 1 MB timeout, so it cannot establish improvement over that historical test. Image fixtures are tiny generated PNGs, not large-photo performance samples.

| Tabs | Restored views | Visited / edited views | Elements after visiting | Views / elements after closing |
| --- | --- | --- | --- | --- |
| 1 | 1 | 1 / 1 | 675 | 0 / 79 |
| 5 | 1 | 5 / 5 | 1,579 | 0 / 79 |
| 10 | 1 | 10 / 10 | 2,704 | 0 / 79 |
| 20 | 1 | 20 / 20 | 4,954 | 0 / 79 |

Menu counts stayed zero until opened. ProseMirror document selectionchange registrations scale with retained views (21 including Home/framework baseline at 20 views) and return to 1 after close. This is expected resource retention, not evidence of a leak. No process-memory reduction is inferred. The harness exercises Save and Close if edits are still pending, rather than assuming a fixed sleep completes every save.

`scripts/performanceSamples.mjs` defines mixed Chinese/English, 100 KB/1 MB plain, heading/code/table/image dense and structured 1 MB samples. Manifest records UTF-8 byte size, AST node/type counts, SHA-256, LF and BOM. `create-native-profile-fixtures.mjs` writes only a caller-supplied disposable directory, with 80 generated PNGs and a 20-tab scenario manifest. Use a fresh output directory: the generator refuses to overwrite existing files. No private documents are inputs. Home and tab resources use the real React/Milkdown implementation; only the native boundary is mocked.

Diagnostics remain off unless `VITE_MILO_PROFILE=1`. Existing phases cover recovery/read/IPC, safety parse, Milkdown parse, plugin state initialization, view DOM construction, forced layout and the first trusted key-to-model change. Serialization and safe-save IPC runtime metrics retain count/total/max plus at most 128 recent durations. Native safe-save transaction timing is off by default. Diagnostics do not log content, inputs or paths. A trusted-key probe measures one bounded model change, not enough samples for latency percentiles.

Production profiling build, Chromium with simulated IPC, one sample per fixture (different mode from the development comparison above):

| Fixture | Safety inspection ms | Milkdown parse ms | State init marker delta ms | State-to-view-DOM marker delta ms | Layout/editable mark from start ms |
| --- | --- | --- | --- | --- | --- |
| Small mixed | 18.8 | 1.3 | 2.1 | 4.2 | 58.4 |
| Plain 1 MB | 97.9 | 92.7 | 11.1 | 3.5 | 316.9 |
| 300 code blocks | 21.1 | 7.2 | 9.0 | 5.8 | 82.9 |
| Structured 1 MB | 235.7 | 203.2 | 51.4 | 161.5 | 704.0 |

These are single samples, not input percentiles or native open-budget results. Safety inspection includes first-use module loading; the IPC mock returns in about 0–0.1 ms and **does not measure disk I/O**. State/DOM deltas are phase markers, not isolated additive totals. Explicit first forced-layout calls measured 0–0.1 ms after browser layout may already have run. Parsing remains substantial for structured input; no Worker benefit is claimed without a matched clone/startup/cancellation comparison. The simpler safety parser remains complete and on the current path. Production measurements avoid dev StrictMode consuming the first effect's diagnostic profile before its discarded instance can emit readiness.

Reproduce phase probes with `VITE_MILO_PROFILE=1 npm run build -- --outDir /private/tmp/<fresh-profile-dist>`, `npx vite preview --outDir /private/tmp/<fresh-profile-dist> --host 127.0.0.1 --port 1423`, then `MILO_TEST_URL=http://127.0.0.1:1423 MILO_OUTLINE_ARTIFACTS=/private/tmp/<fresh-evidence> node scripts/measure-open-phases-browser.mjs`. This profiling build is separate from the final ordinary Release `.app` and does not change its flags or distribution output.

## Behavior and undo contracts

- Markdown files remain authoritative; safe-save recovery and conflict checks were not removed or split into unprotected concurrent steps. Existing-file safe writes remain inode-preserving. Frontend callbacks retain original tab/document/path identities; older save snapshots cannot mark later input clean.
- Auto Save deadlines are per document. Other tabs' input/save state no longer restarts every pending deadline. A bounded timer also samples unnamed recovery without waiting forever for global typing idle; unsettled IME content is excluded.
- Source covers the **whole file including Front Matter**. BOM and LF/CRLF remain file metadata. Untouched textarea entry normalizes its DOM value for comparison only and does not publish/rewrite. Edited text follows the same save/conflict/recovery path. The inactive visual view is read-only and its stale publications are rejected; external reload increments the Source view key to avoid stale textarea writes. Save completion compares the whole source, including Front Matter, so a metadata-only edit made during an older write stays dirty.
- Unchanged Source return preserves the visual view/history. Source edits invalidate that view and start a new visual undo history upon successful safe conversion; native textarea undo is local to the Source view. This is explicit and does not promise cross-mode undo continuity. Source has exact case-sensitive whole-file Find Next/wrap; visual replacement is not offered there.
- WYSIWYG matches span marks inside one textblock, not paragraphs/cells/atoms. Newline replacements are excluded; replacements inherit marks at the match start and all replacements are one explicit undo boundary. Decorations do not enter content/history; only up to 500 nearby match decorations render.
- Reference probe covers quotes, lists and tables sharing a distant link definition. Milkdown resolves all three links and serialization produces inline links, discarding definition identity. Reusing unedited source blocks without dependency tracking could leave stale/dangling links. This is technical evidence against claiming safe block splicing today; **lossless WYSIWYG editing is not implemented**.

## Validation and limits

Final automated commands: `npm run format:check`, `npm run typecheck`, `npm run lint -- --max-warnings=0`, `npm test` (48 files / 439 tests), `npm run build`; `cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check`, `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --locked -- -D warnings`, `cargo test --manifest-path src-tauri/Cargo.toml --locked` (40 tests); isolated arm64 Release `npm run tauri -- build --bundles app --config '{"identifier":"io.github.milo.review20261114"}'`.

Browser commands: `npm run test:browser` (Chromium: 54 Home geometry / 18 Outline layout cases plus interaction regressions), `node scripts/test-writing-tools-browser.mjs` (three themes, Dark at 140% interface zoom, local link/Back, replace/save/marks, Escape, unchanged Source, protected Source save/conversion refusal, Quick Open reuse), `node scripts/test-resource-browser.mjs` (Home, eight workloads and four tab-count workflows, plus 1 MB Source entry/edit/save). Resource failures are collected for evidence and cause a nonzero exit after the matrix. Set `MILO_OUTLINE_ARTIFACTS` to a disposable output directory, `MILO_TEST_URL` for a running Vite server. `MILO_BROWSER=webkit` selects WebKit; `PLAYWRIGHT_BROWSERS_PATH` may point to an isolated install.

WebKit 26.5 (Playwright 2336): writing-tools interactions passed with simulated IPC. Full layout suite **fails** at the existing Outline all-buttons Tab traversal (`test-outline-browser.mjs:214`); the same failure reproduces against archived baseline HEAD on port 1421. Geometry cases before that point ran, but the full WebKit suite is not a pass. Do not change assertions or use this as native accessibility acceptance. Follow up with macOS full-keyboard-access settings and actual WKWebView traversal; explicit button focus/arrow navigation versus default Tab policy must be distinguished.

During development, a 600 ms publication experiment broke existing undo grouping and was discarded (350 ms passes). Final review also caught a Front Matter-only Source edit being marked clean by an older save completion; whole-source comparison plus a delayed-write regression now covers it. Browser tests caught replacement-at-mark-start formatting loss and wrapper-induced grid collapse; both fixed without dropping assertions. The resource harness initially assumed all edits had saved, missed `alertdialog`, and hit the existing 12-path session truncation. The first two were corrected in the harness; the cap was raised consistently in native/frontend settings to 64 bounded paths and covered by a 20-path regression. An aggressively concurrent check produced asynchronous Milkdown teardown errors despite all test assertions passing; a focused lifecycle run and subsequent complete suites passed without suppressing errors or raising timeouts.

Actual native observation on an isolated arm64 Release bundle: fresh Home; native Open dialog on a disposable file; whole-file Source save with Front Matter/raw HTML; actual disk equality and close/reopen equality; refusal to force unsafe conversion; close to Home and clean quit. Chinese content was **pasted**, not IME. Attempted key entry did not expose a confirmed candidate/composition, so it proves no Chinese IME case. Final race fixes have unit/browser coverage and a fresh bundle, not a repeated native acceptance matrix.

Still pending: native paragraph/heading/code/empty-table composition matrix; unconfirmed candidate save/close; immediate save/tab/app/minimize/close/quit after confirmation; native failure/close coordination matrix; Finder/Dock/no-window launch/reopen; slow-I/O responsiveness; full native theme/zoom/window matrix; Intel/older macOS; aggregate Milo plus related WebKit footprint; matched cold/warm restoration timings and sufficiently sampled P50/P95. Universal DMG/release verification is not performed. Original release budgets remain unchanged.

Screenshots are browser evidence, stored outside git: `writing-tools/tools-{light,dark,warm}-{edit,source,quick-open}.png`, plus `final-browser/` and `webkit-writing/`. Source is stated in the final delivery; no generated evidence is committed. No new save/IME/history/conflict regression is established by final automated checks, but simulated IME events and browser IPC are not native acceptance. The 1 MB Source entry/edit/save browser sample passed (about 243 ms entry in one development run); this is neither a long-source native latency pass nor a percentile.

No push, merge, public Release, real-user document mutation, image cleanup, telemetry, database or background networking occurred. README (English/Chinese), CONTEXT, UI_DESIGN, KNOWN_ISSUES and RELEASE describe the implemented unreleased behavior and explicitly retain these limitations. Local commits separate native I/O, frontend behavior, and validation/documentation; revert in reverse order on a clean worktree, preserving any later user edits.


Implementation commits: `dcc04dd` (native ordered I/O), `181b273` (frontend writing tools/performance/reliability), `5a3b0ae` (Front Matter save race). The following documentation/validation commit completes this record; obtain the final hash from `git log`. No generated/native test configuration is staged with these commits.
