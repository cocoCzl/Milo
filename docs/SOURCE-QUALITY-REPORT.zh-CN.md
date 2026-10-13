# Milo 本地源码质量整理报告

执行日期：2026-10-13。范围：任务书中的低风险整理、两项有回归保护的缺陷修复和职责拆分。

## 工作区和核查

- 初始分支 `master`，HEAD `31fc9378fb8d5b02a3638741f6d1a39b89d5ceda`。`git diff` / 暂存区无已有源码改动，唯一未跟踪文件为用户的 `Milo-Codex-Refactor-Brief.md`；该文件始终保留，未纳入提交。
- 检索工作区及上级约束，未发现适用的 AGENTS.md。React 整理参考本机 `vercel-react-best-practices` 技能，不引入性能重构。
- 确认 `src/dev/dialog-repro`、`src/dev/ime-repro`、`src/diagnostics` 存在、非符号链接；用 `os.walk` 检查隐藏文件和忽略内容，均为空；`git ls-files -- src/dev src/diagnostics` 无跟踪项；源码、脚本、配置与文档中无有效使用引用（任务书本身除外）。用 `rmdir` 从子目录到 `src/dev` 删除。未触碰 dist/node_modules/target 清理。
- 两个原生 listen hook 的延迟注册泄漏仍存在；CSS 排版断言仍存在；缺失直接依赖仍存在，额外识别 `@milkdown/ctx`、`@milkdown/transformer` 类型导入；CONTEXT 的高亮描述过期；CI 缺格式和 Rust 检查。
- Safe Save 仍使用 Rust `contains` / TS 正则识别错误；本轮不迁移协议。
- 环境：macOS 27.0.1 / arm64，Node 24.11.1、npm 11.6.2、rustc/cargo 1.94.1；不宣称最低 Rust 1.77.2 已验证。无依赖批量升级。

## 独立审查阶段

所有改动均为本地提交，没有 push、发布或签名凭据操作。

| 提交 | 内容 |
| --- | --- |
| `78894fd` | test: assert CSS contracts structurally before formatting |
| `31d479d` | test: await tooltip timer effects without changing assertions |
| `ee8bf49` | chore: add formatting, typed lint and explicit direct dependencies |
| `dc87e3d` | style: format existing sources without changing behavior |
| `137ca41` | fix: release native subscriptions that resolve after cleanup |
| `d0b1ccd` | refactor: extract copy, document presentation and editor helpers |
| `c6457eb` | test: group editor regressions by behavior with shared fixtures |
| `4fc5752` | refactor: narrow captured paths and ProseMirror ranges locally |
| `3501560` | fix: preserve native string errors from preference storage |
| `1da44c9` | ci: align macOS and release source checks with local quality gates |
| `99ff104` | test: preserve quoted CSS contents in structural normalization |

`dc87e3d` 为独立的机械排版阶段（58 个文件），包含 CSS 双引号格式 override。源码字符串字面量以及规范化后的 CSS 规则/声明值和顺序经独立脚本核对；仅 content 引号写法视为等价。该阶段原有 279 项测试通过。Markdown、fixtures、快照、锁文件及 Rust 未被批量格式化。

## 逐文件变更

下表逐项列出所有相对初始 HEAD 有变化的文件。标为“仅格式”的文件没有本轮逻辑改动；其余文件的机械格式变化与后续行为/职责修改分属不同提交。

| 文件 | 类别 | 修改理由 |
| --- | --- | --- |
| [.editorconfig](../.editorconfig) | 规范配置 | 两空格缩进；Rust 四空格；不全局裁剪尾部空格。 |
| [.github/workflows/ci.yml](../.github/workflows/ci.yml) | CI | 保留全部现有检查，补 format/typecheck/Rust fmt/Clippy/test；安装 rustfmt、clippy；支持 workflow_call。 |
| [.github/workflows/release.yml](../.github/workflows/release.yml) | 格式 / CI | 先依赖同一 macOS 验证；保留原测试、lint 和签名/公证流程；安装 Rust 工具组件。 |
| [.prettierignore](../.prettierignore) | 规范配置 | 排除生成目录、依赖、锁文件、Markdown、精确 fixtures/快照和 Rust。 |
| [.prettierrc.json](../.prettierrc.json) | 规范配置 | TS/JS 单引号、无分号、100 列；CSS 保持双引号风格。 |
| [CONTEXT.md](../CONTEXT.md) | 文档 | 修正 Code Block Language：实际使用 miloPrism/Refractor，高亮不再描述为等待 Shiki。 |
| [eslint.config.js](../eslint.config.js) | 规范配置 | projectService；Promise 与类型导入检查；浏览器、Node 配置与测试文件作用域；零警告入口保留。 |
| [package-lock.json](../package-lock.json) | 依赖锁定 | 同步直接依赖与 Prettier 3.8.4；原有包版本均未变；只新增 Prettier 包条目。 |
| [package.json](../package.json) | 规范配置 / 依赖 | 新增 format、format:check、typecheck；直接声明 Milkdown ctx/prose/transformer/utils、refractor、测试用 PostCSS 和 Prettier。 |
| [src-tauri/capabilities/default.json](../src-tauri/capabilities/default.json) | 仅格式 | Prettier 统一换行、缩进与排版；保留语义。 |
| [src/app/App.test.tsx](../src/app/App.test.tsx) | 仅格式 | Prettier 统一换行、缩进与排版；保留语义。 |
| [src/app/App.tsx](../src/app/App.tsx) | 职责拆分 / 类型 / 格式 | 提取文案、展示和面板；顶层装配保留；稀疏标签映射改为 Partial<Record<...>>。 |
| [src/app/DocumentContext.tsx](../src/app/DocumentContext.tsx) | 职责拆分 | 原文档上下文栏原样迁移，无布局或文案改动。 |
| [src/app/DocumentPanel.tsx](../src/app/DocumentPanel.tsx) | 职责拆分 | 原文档面板及 editor workspace；保留 editor key、portal 容器和 outline 责任。 |
| [src/app/documentPresentation.ts](../src/app/documentPresentation.ts) | 职责拆分 | 标题、文件名、状态文本及状态色调的既有纯函数。 |
| [src/app/interfaceCopy.ts](../src/app/interfaceCopy.ts) | 职责拆分 | 中英文原文与 locale 解析；共同 InterfaceCopy 类型和 satisfies，保留函数型文案。 |
| [src/app/tabViewState.ts](../src/app/tabViewState.ts) | 职责拆分 / 类型 | 原稀疏标签状态裁剪函数；保留同对象返回优化，消除末尾类型断言。 |
| [src/components/ApplicationMoreMenu.tsx](../src/components/ApplicationMoreMenu.tsx) | 仅格式 | Prettier 统一换行、缩进与排版；保留语义。 |
| [src/components/FileSidebar.test.tsx](../src/components/FileSidebar.test.tsx) | 仅格式 | Prettier 统一换行、缩进与排版；保留语义。 |
| [src/components/FileSidebar.tsx](../src/components/FileSidebar.tsx) | 仅格式 | Prettier 统一换行、缩进与排版；保留语义。 |
| [src/components/ModeSwitch.tsx](../src/components/ModeSwitch.tsx) | 仅格式 | Prettier 统一换行、缩进与排版；保留语义。 |
| [src/components/OutlineToggle.tsx](../src/components/OutlineToggle.tsx) | 仅格式 | Prettier 统一换行、缩进与排版；保留语义。 |
| [src/components/PreferencesDialog.test.tsx](../src/components/PreferencesDialog.test.tsx) | 仅格式 | Prettier 统一换行、缩进与排版；保留语义。 |
| [src/components/PreferencesDialog.tsx](../src/components/PreferencesDialog.tsx) | 仅格式 | Prettier 统一换行、缩进与排版；保留语义。 |
| [src/components/Select.test.tsx](../src/components/Select.test.tsx) | 仅格式 | Prettier 统一换行、缩进与排版；保留语义。 |
| [src/components/Select.tsx](../src/components/Select.tsx) | 仅格式 | Prettier 统一换行、缩进与排版；保留语义。 |
| [src/components/Tooltip.test.tsx](../src/components/Tooltip.test.tsx) | 测试适配 / 格式 | 等待 5 处 act 计时器操作；保持原断言。 |
| [src/components/Tooltip.tsx](../src/components/Tooltip.tsx) | 仅格式 | Prettier 统一换行、缩进与排版；保留语义。 |
| [src/editor/markdown/codec.test.ts](../src/editor/markdown/codec.test.ts) | 仅格式 | Prettier 统一换行、缩进与排版；保留语义。 |
| [src/editor/markdown/documentSafety.test.ts](../src/editor/markdown/documentSafety.test.ts) | 仅格式 | Prettier 统一换行、缩进与排版；保留语义。 |
| [src/editor/markdown/documentSafety.ts](../src/editor/markdown/documentSafety.ts) | 仅格式 | Prettier 统一换行、缩进与排版；保留语义。 |
| [src/editor/milkdown/BlockHandle.test.tsx](../src/editor/milkdown/BlockHandle.test.tsx) | 仅格式 | Prettier 统一换行、缩进与排版；保留语义。 |
| [src/editor/milkdown/BlockHandle.tsx](../src/editor/milkdown/BlockHandle.tsx) | 仅格式 | Prettier 统一换行、缩进与排版；保留语义。 |
| [src/editor/milkdown/BlockMenu.test.tsx](../src/editor/milkdown/BlockMenu.test.tsx) | 仅格式 | Prettier 统一换行、缩进与排版；保留语义。 |
| [src/editor/milkdown/BlockMenu.tsx](../src/editor/milkdown/BlockMenu.tsx) | 仅格式 | Prettier 统一换行、缩进与排版；保留语义。 |
| [src/editor/milkdown/EditorContextMenu.tsx](../src/editor/milkdown/EditorContextMenu.tsx) | 仅格式 | Prettier 统一换行、缩进与排版；保留语义。 |
| [src/editor/milkdown/EditorLinkPopover.tsx](../src/editor/milkdown/EditorLinkPopover.tsx) | 仅格式 | Prettier 统一换行、缩进与排版；保留语义。 |
| [src/editor/milkdown/EditorOutline.test.tsx](../src/editor/milkdown/EditorOutline.test.tsx) | 仅格式 | Prettier 统一换行、缩进与排版；保留语义。 |
| [src/editor/milkdown/EditorOutline.tsx](../src/editor/milkdown/EditorOutline.tsx) | 仅格式 | Prettier 统一换行、缩进与排版；保留语义。 |
| [src/editor/milkdown/MilkdownEditor.codeBlocks.test.tsx](../src/editor/milkdown/MilkdownEditor.codeBlocks.test.tsx) | 测试分组 | 原 codeBlocks 行为用例原样迁移；未减少断言。 |
| [src/editor/milkdown/MilkdownEditor.editingLinks.test.tsx](../src/editor/milkdown/MilkdownEditor.editingLinks.test.tsx) | 测试分组 | 原 editingLinks 行为用例原样迁移；未减少断言。 |
| [src/editor/milkdown/MilkdownEditor.images.test.tsx](../src/editor/milkdown/MilkdownEditor.images.test.tsx) | 测试分组 | 原 images 行为用例原样迁移；未减少断言。 |
| [src/editor/milkdown/MilkdownEditor.ime.test.tsx](../src/editor/milkdown/MilkdownEditor.ime.test.tsx) | 测试分组 | 原 ime 行为用例原样迁移；未减少断言。 |
| [src/editor/milkdown/MilkdownEditor.links.test.tsx](../src/editor/milkdown/MilkdownEditor.links.test.tsx) | 仅格式 | Prettier 统一换行、缩进与排版；保留语义。 |
| [src/editor/milkdown/MilkdownEditor.outline.test.tsx](../src/editor/milkdown/MilkdownEditor.outline.test.tsx) | 测试分组 | 原 outline 行为用例原样迁移；未减少断言。 |
| [src/editor/milkdown/MilkdownEditor.selection.test.tsx](../src/editor/milkdown/MilkdownEditor.selection.test.tsx) | 测试分组 | 原 selection 行为用例原样迁移；未减少断言。 |
| [src/editor/milkdown/MilkdownEditor.tables.test.tsx](../src/editor/milkdown/MilkdownEditor.tables.test.tsx) | 测试分组 | 原 tables 行为用例原样迁移；未减少断言。 |
| [src/editor/milkdown/MilkdownEditor.test.tsx](../src/editor/milkdown/MilkdownEditor.test.tsx) | 测试分组 / 类型 / 格式 | 保留 workspace 行为；其余 7 组原测试迁移；导入真实模块；图片文案接口不再需两处 unknown 双重断言。 |
| [src/editor/milkdown/MilkdownEditor.tsx](../src/editor/milkdown/MilkdownEditor.tsx) | 职责拆分 / 格式 | 消费独立选区、大纲和 NodeView 模块；插件顺序、GFM IME 过滤、create/destroy、portal 均保留。 |
| [src/editor/milkdown/SelectionToolbar.tsx](../src/editor/milkdown/SelectionToolbar.tsx) | 仅格式 | Prettier 统一换行、缩进与排版；保留语义。 |
| [src/editor/milkdown/blockControls.ts](../src/editor/milkdown/blockControls.ts) | 仅格式 | Prettier 统一换行、缩进与排版；保留语义。 |
| [src/editor/milkdown/blockHandleHover.test.ts](../src/editor/milkdown/blockHandleHover.test.ts) | 仅格式 | Prettier 统一换行、缩进与排版；保留语义。 |
| [src/editor/milkdown/blockHandleHover.ts](../src/editor/milkdown/blockHandleHover.ts) | 仅格式 | Prettier 统一换行、缩进与排版；保留语义。 |
| [src/editor/milkdown/codeBlockNodeView.ts](../src/editor/milkdown/codeBlockNodeView.ts) | 职责拆分 | 既有语言选择、复制、stable pre contentDOM；缩小文案接口；生命周期原样。 |
| [src/editor/milkdown/contextualEditorStore.ts](../src/editor/milkdown/contextualEditorStore.ts) | 仅格式 | Prettier 统一换行、缩进与排版；保留语义。 |
| [src/editor/milkdown/editorCommands.test.ts](../src/editor/milkdown/editorCommands.test.ts) | 仅格式 | Prettier 统一换行、缩进与排版；保留语义。 |
| [src/editor/milkdown/editorCommands.ts](../src/editor/milkdown/editorCommands.ts) | 仅格式 | Prettier 统一换行、缩进与排版；保留语义。 |
| [src/editor/milkdown/editorCopy.ts](../src/editor/milkdown/editorCopy.ts) | 职责拆分 | 既有 EditorCopy 类型和默认文案。 |
| [src/editor/milkdown/editorSelection.ts](../src/editor/milkdown/editorSelection.ts) | 职责拆分 | 既有 DOM 选区同步、contextmenu PM 选区读取及 href helper；保留 WebKit 防御与 Cell/NodeSelection。 |
| [src/editor/milkdown/editorTestFixtures.ts](../src/editor/milkdown/editorTestFixtures.ts) | 测试分组 | 提取真实共享的选区、表格、图片和滚动装置。 |
| [src/editor/milkdown/headingNavigation.ts](../src/editor/milkdown/headingNavigation.ts) | 职责拆分 | 既有 heading id 缓存、DOM 校验、滚动/选区计算及模型读取；保留全部容差。 |
| [src/editor/milkdown/imageNodeView.ts](../src/editor/milkdown/imageNodeView.ts) | 职责拆分 / 类型 | 既有本地/远程 NodeView；缩小文案接口；保留 generation、过期事件及 destroy 防护。 |
| [src/editor/milkdown/miloPrism.ts](../src/editor/milkdown/miloPrism.ts) | 类型收窄 / 格式 | 局部捕获并收窄 replacement step 的 from/to，去掉两处 !；保留并注释库边界的窄范围断言。 |
| [src/editor/milkdown/safariCompositionHardbreak.ts](../src/editor/milkdown/safariCompositionHardbreak.ts) | 仅格式 | Prettier 统一换行、缩进与排版；保留语义。 |
| [src/editor/milkdown/tableAlignment.ts](../src/editor/milkdown/tableAlignment.ts) | 仅格式 | Prettier 统一换行、缩进与排版；保留语义。 |
| [src/editor/milkdown/tableEmptyCellSerializer.test.ts](../src/editor/milkdown/tableEmptyCellSerializer.test.ts) | 仅格式 | Prettier 统一换行、缩进与排版；保留语义。 |
| [src/editor/milkdown/tableEmptyCellSerializer.ts](../src/editor/milkdown/tableEmptyCellSerializer.ts) | 仅格式 | Prettier 统一换行、缩进与排版；保留语义。 |
| [src/file-system/nativeFileWatcher.ts](../src/file-system/nativeFileWatcher.ts) | 仅格式 | Prettier 统一换行、缩进与排版；保留语义。 |
| [src/file-system/nativeMarkdownFile.test.ts](../src/file-system/nativeMarkdownFile.test.ts) | 仅格式 | Prettier 统一换行、缩进与排版；保留语义。 |
| [src/file-system/nativeMarkdownFile.ts](../src/file-system/nativeMarkdownFile.ts) | 仅格式 | Prettier 统一换行、缩进与排版；保留语义。 |
| [src/hooks/documentSessionModel.ts](../src/hooks/documentSessionModel.ts) | 职责拆分 | 文档/标签/来源类型、空标签、纯文档构造、标签构造及路径标题函数。 |
| [src/hooks/nativeSubscription.ts](../src/hooks/nativeSubscription.ts) | 缺陷修复 | effect 停止标记；延迟 resolve 立即释放；注册拒绝有固定诊断，不记录 payload 或原生错误详情。 |
| [src/hooks/useDocumentSession.test.tsx](../src/hooks/useDocumentSession.test.tsx) | 仅格式 | Prettier 统一换行、缩进与排版；保留语义。 |
| [src/hooks/useDocumentSession.ts](../src/hooks/useDocumentSession.ts) | 职责拆分 / 类型 / 格式 | 提取纯模型和 readableError；ID 分配仍在原模块；局部捕获已检查的 watcher/autosave path，去掉两处 !；保存模型不变。 |
| [src/hooks/useNativeCommandListener.ts](../src/hooks/useNativeCommandListener.ts) | 缺陷修复 / 格式 | 将订阅释放交给小 helper，保留最新 callback ref；cleanup 后不再转发命令。 |
| [src/hooks/useNativeFileOpenListener.test.tsx](../src/hooks/useNativeFileOpenListener.test.tsx) | 仅格式 | Prettier 统一换行、缩进与排版；保留语义。 |
| [src/hooks/useNativeFileOpenListener.ts](../src/hooks/useNativeFileOpenListener.ts) | 缺陷修复 / 格式 | 同上，防止延迟注册的文件打开订阅泄漏。 |
| [src/hooks/useNativeListeners.test.tsx](../src/hooks/useNativeListeners.test.tsx) | 新增回归 | 两种 hook 共 16 项：正常卸载、延迟释放、拒绝、过期回调、最新回调、StrictMode 重复挂载、浏览器预览。 |
| [src/lib/readableError.ts](../src/lib/readableError.ts) | 职责拆分 | 原会话 unknown-to-message 函数；原生非空字符串、非空 Error.message 和上下文 fallback。 |
| [src/settings/applicationSettings.test.ts](../src/settings/applicationSettings.test.ts) | 仅格式 | Prettier 统一换行、缩进与排版；保留语义。 |
| [src/settings/useApplicationSettings.test.tsx](../src/settings/useApplicationSettings.test.tsx) | 新增回归 / 格式 | 新增 6 项加载/保存错误用例，验证字符串、Error、空值、未知对象及失败后偏好值不回退。 |
| [src/settings/useApplicationSettings.ts](../src/settings/useApplicationSettings.ts) | 缺陷修复 / 格式 | 复用 readableError，保留原生字符串错误；原 fallback 文案和保存队列不变。 |
| [src/settings/useEffectiveColorScheme.test.tsx](../src/settings/useEffectiveColorScheme.test.tsx) | 仅格式 | Prettier 统一换行、缩进与排版；保留语义。 |
| [src/styles/global.css](../src/styles/global.css) | 仅格式 | Prettier 统一换行、缩进与排版；保留语义。 |
| [src/styles/global.test.ts](../src/styles/global.test.ts) | 测试适配 | 原 20 项测试保留；选择器、媒体条件、声明值、!important 及禁止声明结构断言替代源码排版正则；保护引号内语义。 |
| [tsconfig.json](../tsconfig.json) | 仅格式 | Prettier 统一换行、缩进与排版；保留语义。 |
| [vite.config.ts](../vite.config.ts) | 仅格式 | Prettier 统一换行、缩进与排版；保留语义。 |
| [docs/SOURCE-QUALITY-REPORT.zh-CN.md](SOURCE-QUALITY-REPORT.zh-CN.md) | 交付记录 | 本报告：核查、阶段、逐文件理由、检查结果、例外与后续方案。 |

## 基线与最终检查

“通过”指命令实际 exit 0，不包含实机 UI 验收。原项目没有 format / typecheck 脚本，基线类型检查用 `npx tsc -b`，build 本来已包含 TypeScript 检查。

| 检查 | 基线 | 最终结果 |
| --- | --- | --- |
| `npm run lint -- --max-warnings=0` | 通过；[baseline/lint.log](/tmp/milo-quality/baseline/lint.log) | 通过；[final/lint.log](/tmp/milo-quality/final/lint.log) |
| `npm run test` | 通过，28 文件 / 279 项；[baseline/test.log](/tmp/milo-quality/baseline/test.log) | 通过，36 文件 / 301 项；[final/test.log](/tmp/milo-quality/final/test.log) |
| `npm run typecheck` | 通过（npx tsc -b）；[baseline/typecheck.log](/tmp/milo-quality/baseline/typecheck.log) | 通过；[final/typecheck.log](/tmp/milo-quality/final/typecheck.log) |
| `npm run build` | 通过；[baseline/build.log](/tmp/milo-quality/baseline/build.log) | 通过；[final/build.log](/tmp/milo-quality/final/build.log) |
| `cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check` | 通过；[baseline/rust-fmt.log](/tmp/milo-quality/baseline/rust-fmt.log) | 通过；[final/rust-fmt.log](/tmp/milo-quality/final/rust-fmt.log) |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --locked -- -D warnings` | 通过；[baseline/clippy.log](/tmp/milo-quality/baseline/clippy.log) | 通过；[final/clippy.log](/tmp/milo-quality/final/clippy.log) |
| `cargo test --manifest-path src-tauri/Cargo.toml --locked` | 通过，macOS 33 项；[baseline/rust-test.log](/tmp/milo-quality/baseline/rust-test.log) | 通过，macOS 33 项；[final/rust-test.log](/tmp/milo-quality/final/rust-test.log) |
| `npm run tauri -- build --debug` | 失败：DMG bundle_dmg.sh；[baseline/tauri-debug.log](/tmp/milo-quality/baseline/tauri-debug.log) | 沙箱内失败；宿主环境详细重跑通过；[final/tauri-debug.log](/tmp/milo-quality/final/tauri-debug.log) |
| `npm run format:check` | 脚本尚不存在；配置后首次检查发现排版不统一 | 通过；[日志](/tmp/milo-quality/final/format.log) |
| `npm ci --offline` | 未运行（先保留既有安装测基线） | 通过，重新安装 427 个包；[日志](/tmp/milo-quality/final/npm-ci.log) |
| `npm run tauri -- build --debug -vv` | 未运行 | 沙箱内失败后宿主环境通过；[沙箱日志](/tmp/milo-quality/final/tauri-debug-verbose.log)、[宿主日志](/tmp/milo-quality/final/tauri-debug-host.log) |
| `git diff --check` | 无已有 diff | 通过 |

- 未使用无参数的联网 `npm ci`；实际运行 `npm ci --offline`，使用本机缓存进行真实锁文件干净安装，依赖未改版。`npm install --package-lock-only --offline` 成功同步锁文件。首次直接依赖 offline install 因缓存元数据缺失失败，随后根据已有锁文件版本补齐根声明再同步，没有擅自升级。
- 安装保留两项已有依赖 deprecation 警告：`whatwg-encoding@3.1.1`、`eslint@9.39.5`。本轮不批量升级；lint、Clippy 均为零警告通过。离线安装的审计输出不作为新的安全评估结论。
- Tauri 基线和最终沙箱命令 exit 1；详细日志确认 `hdiutil: create failed - 设备未配置`，编译并非失败。宿主环境重跑 exit 0，产物：`src-tauri/target/debug/bundle/dmg/Milo_0.2.1_aarch64.dmg`。使用工具批准的沙箱提升，没有修改应用权限、CSP、签名、公证或 bundle 配置。
- 宿主打包仍有 macOS hdiutil 的 create/convert deprecation 提示，以及 internet-enable 在 macOS 10.15 移除的工具说明。来自现有 Tauri 打包脚本，不改 SDK/系统工具策略来消除。
- 没有新引入的最终测试/类型/lint/Rust 失败。开发中的提取导入、测试装置导出与 CSS scope 错误均已修复，并重跑对应检查，未删除测试或放宽断言。
- CI YAML 用 js-yaml 解析并核对 workflow_call、release 的 uses/needs；GitHub Actions 远程运行与 actionlint 未执行（本机无 actionlint），不能宣称远端 CI 已通过。
- 原始日志保存在 `/tmp/milo-quality/`，系统清理临时目录后可能不可用；本报告保留命令和结果。

## 测试保护与修复证据

- CSS：20 项原测试保留字体、尺寸、主题、滚动、拖拽区、浮层层级、图片、表格与段落节奏契约。比较确切选择器和媒体条件、确切声明值及 !important；保留禁止 transform/错误 overflow 等负向保护。引号内部内容不裁剪、不变形。jsdom 计算样式检查继续保留。
- Tooltip：3 项测试仍保护悬浮延迟、失焦/卸载释放和视口边界；5 处 act 改为 await，未减少原断言。
- 原生监听器：新增 16 项，修复前 10 项失败并报告 4 次未处理拒绝；修复后 16 项及原文件打开 2 项通过。[失败证据](/tmp/milo-quality/native-listeners-red.log)、[修复结果](/tmp/milo-quality/native-listeners-green.log)。检查 stop 次数与回调结果，而非只测不抛错。
- 偏好错误：新增 6 项；修复前 2 项失败（原生字符串加载/保存原因丢失），修复后全部 12 项通过。[失败证据](/tmp/milo-quality/settings-errors-red.log)、[修复结果](/tmp/milo-quality/settings-errors-green.log)。可见行为变化仅为显示原生提供的非空错误字符串；Error 与 fallback 保持。
- 编辑器：89 个源测试语句（含参数化测试，共 111 项）迁移前后编译后的测试体完全一致；加现有 external links 3 项，9 个文件 114 项全部通过。原 Markdown 精确内容和序列化断言保留。
- 保存/会话：23 项 useDocumentSession 测试保持并通过，覆盖保存期间继续输入、另存为/取消、自动保存、外部冲突、重试、关闭、恢复、来源隔离、图片异步目标等。Front Matter 与 codec/native file 的 BOM/LF/CRLF 测试也在完整测试内通过。
- Rust：在本机 macOS 条件编译下实际运行 33 项；包含 F1–F7、恢复标记、inode、外部版本检查、symlink/hardlink/sidecar 保护及故障暂停。`src-tauri/src/*.rs`、Cargo.toml/Cargo.lock 均无源码 diff。

## 未实施、未验证与下一阶段方案

| 事项 | 当前证据 / 例外 | 回归保护和方案 |
| --- | --- | --- |
| Safe Save 错误协议 | `src-tauri/src/file_system.rs:289` 使用 contains 分类；`src/file-system/nativeMarkdownFile.ts:67` 用正则识别；会话还识别外部修改字符串。未改协议。 | 先建立 TS/Rust 共同的类别、未知错误、恢复失败契约测试；内部枚举映射到兼容的旧文本，再讨论版本化 envelope；未知/恢复失败始终阻断覆盖，不新增 fallback 写入。 |
| Safe Save 算法 / 保存调度 | 本轮无算法、write/fsync 顺序、inode、恢复决策、1000ms debounce 或 ref/state 模型改动；现有测试通过不等于所有并发模型已验证。 | 继续以 origin/revision/save snapshot 为约束；任何优化先加跨标签、保存中输入、关闭、迟到完成与故障重试矩阵，再做单独方案和测量。 |
| 编辑器 create/destroy | `MilkdownEditor.tsx:334/336/355` Promise 没有 rejection 分支，cleanup 与创建完成后仍可能各调用 destroy；本轮原样保留。 | 可控制创建/销毁 resolve/reject 的库边界装置；覆盖卸载先发生、StrictMode、二次清理和失败后 UI；明确单一销毁责任后最小修改，不能通过新依赖触发重建编辑器。 |
| 图片读取/粘贴 | `MilkdownEditor.tsx:428` 的 arrayBuffer/onPasteImage 链无末尾 catch；文档会话 pasteImage 内已处理资产失败。 | 模拟读取拒绝、写入拒绝、卸载和切换标签；固定来源、选区快照及编辑器身份；明确读取错误的可见反馈归属后独立修复，不修改序列化。 |
| 文件对话框 | useDocumentSession openDocument 与 saveAsDocument 在 await pick* 周围无 catch；取消已有测试，拒绝未保护。 | 新增原生字符串/Error 拒绝、取消、对话框期间切换/关闭来源标签的测试；open/saveAs 各自按原目标反馈，避免从当前标签重新找目标。 |
| watcher stop | `useDocumentSession.ts:564/589` void stop() 不处理异步释放拒绝，注册拒绝和 stopped 判断已有保护。 | 可控制 watch resolve/stop reject 的回归；确认清理后的回调隔离，释放错误用固定诊断，不把成功保存降为失败，不记录路径内容。 |
| 代码复制 | `codeBlockNodeView.ts:112` clipboard.writeText rejection 未处理。 | 模拟 clipboard 缺失/拒绝及 NodeView destroy；保留只读复制行为，确定最小反馈后单独修复。 |
| 可忽略降级 | 外链 opener 的 catch(() => undefined)、初始文件探测降级 null、偏好队列前序 catch 属于现有失败责任路径，本轮保留。 | 不机械删除 catch；如需要可见反馈，先建立边界测试并确认文案/焦点行为。 |
| 错误辅助复用 | 会话与偏好已统一 readableError；App 的 folder browse 仍只接受 Error 并用 locale fallback，未改变其可见错误文案。 | 文件夹浏览原生字符串、disposed 和最近目录清理的回归先行，再决定复用；避免顺带改变错误协议。 |
| 宽泛断言 | 图片测试移除 2 处双重断言；Prism Step 的窄范围结构断言有库边界理由；测试模拟 ProseMirror view 等断言保留。 | 不用 any/global disable 掩盖边界；进一步收窄需针对相应 Step/NodeView mock 回归。 |
| CSS 职责分文件 | 本轮先完成结构测试和格式；global.css 暂不拆分。 | 保持规则顺序和 specificity；先准备同内容、窗口大小和显示设置的 WKWebView 主题/浮层比对，再按连续职责块搬移。不引入 @layer/CSS Modules。 |
| macOS/WKWebView 实机验收 | **未运行**中英文输入法、段落/表格输入、链接选区、图片/代码、撤销重做、标签滚动、阅读/编辑、焦点浮层和主题外观的人机验收。仅构建运行在 macOS；没有完整可控实机输入法与同基线 UI 验收记录。 | 使用同组临时 Markdown、相同窗口/缩放/主题，按任务书逐项验收并记录；不得把本轮 jsdom 通过当作验收。 |
| 性能/包体 | 未做受控测量；未宣称性能、体积或实机稳定性改善。 | 独立测量和优化，不与本轮源码整理混做。 |
| release / 签名 / 公证 | **未运行**发布验证、签名、公证、网络 release；只改必要源码校验的依赖关系，原签名步骤保留。 | 由正常授权的发布流程执行，不在源码整理中使用凭据或自动 push。 |

任务书所有条目已核查并在此分类；以上高风险及实机事项不是已完成声明。下一阶段先补齐 WKWebView 手动验收与异步失败矩阵，再讨论协议和状态模型方案。
