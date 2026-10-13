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

| 提交（完整 hash） | 标题 |
| --- | --- |
| `78894fd6b7c9ccca1542f35b267996b80b069a25` | test: assert CSS contracts structurally before formatting |
| `31d479dcf5b1c74b852fb9c7541c81b0a11cfac1` | test: await tooltip timer effects without changing assertions |
| `ee8bf496a419026151953473d86dbc7a4de4196e` | chore: add formatting, typed lint and explicit direct dependencies |
| `dc87e3d71e81a0aa90e6b36b81b7ad734bb8c85c` | style: format existing sources without changing behavior |
| `137ca417d5074dd100a35679831511f96a06a548` | fix: release native subscriptions that resolve after cleanup |
| `d0b1ccd77caae4265a4b3560462a7acc876c696b` | refactor: extract copy, document presentation and editor helpers |
| `c6457ebf93d0f492873468f1294e260e4daeb3ea` | test: group editor regressions by behavior with shared fixtures |
| `4fc5752b7ecd3652dfef701f820c1a4fb221ef54` | refactor: narrow captured paths and ProseMirror ranges locally |
| `3501560db066be372a196476d1e307e77151f613` | fix: preserve native string errors from preference storage |
| `1da44c9965df1e9b42a404de26ad540e19577e61` | ci: align macOS and release source checks with local quality gates |
| `99ff104fc567aae6c449ae00efdb2c7ce1dc6d33` | test: preserve quoted CSS contents in structural normalization |
| `f52b8b3c18955433dce83ec6fc2b7e4328c41dbc` | docs: record staged quality work, checks and deferred risk plans |

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
- 宿主打包仍有 macOS hdiutil 的 create、resize、attach、detach、convert deprecation 提示，以及 internet-enable 在 macOS 10.15 移除的工具说明。来自现有 Tauri 打包脚本，不改 SDK/系统工具策略来消除。
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


## 收尾复核与验收（本轮不再扩大源码范围）

### 准确边界及未提交内容

- 实际起始基线：`31fc9378fb8d5b02a3638741f6d1a39b89d5ceda`；最终 HEAD：`f52b8b3c18955433dce83ec6fc2b7e4328c41dbc`，分支 `master`。
- 边界依据是任务开始时的工作区记录、第一项任务提交 `78894fd6…` 的实际 parent，以及连续提交历史/reflog 相互印证；没有用 `HEAD~12` 反推。上表为完整的 12 个实际提交。本轮源码整理以前的提交和用户任务书不计入交付。
- 收尾开始的 `git status --short` 只有 `?? Milo-Codex-Refactor-Brief.md`。保存定向验收结束后的实际状态为：

```text
 M docs/SOURCE-QUALITY-REPORT.zh-CN.md
 M src/hooks/useDocumentSession.test.tsx
?? Milo-Codex-Refactor-Brief.md
```

- 新增未提交变更是本报告的收尾补充和保存定向测试；用户原有未跟踪任务书未修改、未导出。产品源码没有新增修改，既有 12 个提交保持原样；未 rebase、squash、reset、push 或发布。
- 完整已提交 diff 为 88 个文件，9720 行新增、5151 行删除，包含独立格式提交；逐文件理由见上表，阶段边界见提交清单。空目录不受 Git 跟踪，删除结论单列。

### 检查对应的代码状态

已有结果直接引用上文及 `/tmp/milo-quality/{baseline,final}/` 的日志和 command/exit JSON，不重跑整套检查。

| 证据 | 实际代码状态与范围 |
| --- | --- |
| 基线 lint、279 项前端测试、tsc/build、Rust fmt/Clippy/33 项测试 | 起始 `31fc9378…`，当时跟踪文件干净；基线 DMG 打包失败单列，不能算通过。 |
| 最终离线安装与质量检查 | 11:34 的 `npm ci --offline` 使用最终锁文件。11:36–11:39 的 format/typecheck/lint/test/build/Rust 检查发起时 HEAD 是 `1da44c9…`，工作区已有后来提交为 `99ff104…` 的 CSS 测试引号保护改动（测试 11:36:23 开始，该提交 11:36:24 建立）。实际受检源码/测试与 `99ff104…` 相同，不能只按命令开始时的 HEAD 标注。 |
| 宿主 debug DMG 构建 | `99ff104…` 后执行，成功日志为 `final/tauri-debug-host.log`。之后 `f52b8b3…` 仅新增报告，无源码差异，因此上述结果仍适用于最终 HEAD 的源码。 |
| 收尾补生成 `.app` | 本次实际运行 `npm run tauri -- build --debug --bundles app`，exit 0；最终 HEAD `f52b8b3…`，执行时无跟踪文件改动。为获取 DMG 打包后已移除的 `.app`，只选择 app bundle，未重新执行整套测试。命令自身执行了现有 beforeBuildCommand（tsc/Vite）和 Rust debug 编译。日志见交付目录 `app-bundle.log`。 |
| 收尾只读复核 | 对准确基线、各阶段提交和当前工作区做 AST/fixture/import 比较；结果见交付目录 `read-only-review.txt`，脚本 `review.mjs`。报告补充后仅执行 diff/patch 校验；未改相关源码，不需要再跑业务检查。 |

### 原始空目录逐项结论

下列历史结论引用整理开始时的实际文件系统观察；当前目录已经删除，不能仅凭现在不存在倒推。检查使用 `os.path.lexists`、`os.path.islink` 和递归 `os.walk`（包括隐藏/忽略项）、Git 跟踪列表和源码/脚本/配置/文档引用检索；没有查出操作性引用，任务书中的文字提及除外。

| 目录 | 原先存在/为空 | 隐藏、忽略内容和符号链接 | 引用 | 最终处理及原因 | 来源 |
| --- | --- | --- | --- | --- | --- |
| `src/dev/dialog-repro` | 存在，真正为空 | 零文件/子项，普通目录，非 symlink | 无跟踪项、无操作性引用 | `rmdir` 删除，空开发目录无内容可保留 | 无法确认创建者及成因 |
| `src/dev/ime-repro` | 存在，真正为空 | 零文件/子项，普通目录，非 symlink | 无跟踪项、无操作性引用 | `rmdir` 删除，空开发目录无内容可保留 | 无法确认创建者及成因 |
| `src/diagnostics` | 存在，真正为空 | 零文件/子项，普通目录，非 symlink | 无跟踪项、无操作性引用 | `rmdir` 删除，空诊断目录无内容可保留 | 无法确认创建者及成因 |

随后仅删除变空的父目录 `src/dev`。`dist`、`node_modules`、`src-tauri/target` 是生成/依赖目录，本轮没有按废弃源码删除它们。`npm ci --offline` 对依赖目录的干净重装属于安装验证，不能混同源码清理。

### 最终 diff 的只读复核结论

本次没有发现证据充分、需要最小修复的本轮引入问题；没有顺带修复历史高风险问题。以下结论限定于源码与已有回归保护，不宣称真实 WKWebView 行为已验收。

| 核查项 | 证据与结论 |
| --- | --- |
| 机械格式化 | `dc87e3d^ → dc87e3d` 的 TS/JS 编译后运行时 AST 无差异（忽略格式分隔符、等价括号和字面量写法，保留操作符及字符串内容）。基线至最终 CSS 的完整嵌套规则、at-rule 条件、声明、顺序及 important 经 PostCSS 比较等价。JSON/YAML 语义比较仅有已说明的 `.prettierrc.json` CSS 双引号 override；应用配置和工作流排版不改值。Rust 未参与此格式提交。行为修复在其他提交中说明，未夹进格式提交。 |
| CSS 测试迁移 | 逐项对照原 20 项断言：现测试匹配具体选择器成员、声明值和 important、根/直接 media 条件，而非任意位置属性。字体偏好、正文/表格/列表/引用段落边界、编辑/阅读图片选中边界、focus 模式 drawer 例外、reduced-motion 的 important 覆盖及浮层 z-index 绑定仍受约束；theme token 检查范围更明确。CSS 树和顺序未变，保留实际覆盖关系。浮层 token 数值顺序仍为 100/200/300/400/450/500/550/600/700；原测试只保护语义 token 存在、绑定和禁止硬编码值，没有独立断言全部数值大小关系，本轮未声称补齐该历史缺口。helper 不模拟完整 specificity/cascade，也不是任意深度嵌套 media 引擎；当前规则结构已另行比较。 |
| 编辑器测试拆分 | 比较 `c6457eb^` 的 89 个个别源测试语句与分组后的运行时 AST 多重集合，完全一致；共享 fixture 函数也一致。逐组保留 workspace、selection、IME、editingLinks、outline、tables、images、codeBlocks 行为体；external links 原独立测试保留。源文件扫描没有 skip/todo/only。不是以 111/114 的总用例数相同代替行为体核查。 |
| 精确文本与序列化 | 四个跟踪 Markdown fixtures（core/front-matter/gfm/protected-html）与基线 Git blob 字节一致。codec、documentSafety、nativeMarkdownFile、useDocumentSession、tableEmptyCellSerializer 测试的所有字符串/模板 literal 值未变，包含 BOM/CRLF/尾部空格与精确序列化数据。Markdown/fixtures/快照被格式工具排除，EditorConfig 不自动裁尾部空格。 |
| 监听器缺陷修复 | 审阅 16 项参数化回归及既有红绿日志：延迟注册在 cleanup 后完成立即 stop；完成前/后的旧回调均阻断；已注册订阅卸载 stop 一次；注册拒绝在卸载前/后均固定诊断；StrictMode 双注册逆序完成后每个 stop 一次；最新 callback 不增加订阅；非 Tauri 不注册。未把 watch stop 的异步失败混入该修复。 |
| 编辑器身份与生命周期 | `d0b1ccd^ → d0b1ccd` 的 MilkdownEditor 及所有迁移的选区、大纲、代码/图片 NodeView 函数运行时 AST 无差异：插件顺序、GFM IME 过滤、create/destroy、contentDOM、generation、防过期回调及选区快照保留。DocumentPanel/DocumentEditorWorkspace 函数也一致，key 仍为 `document.id:document.editorVersion`，editorId、portal 和 active 传递保留。 |
| 文案与文档模型 | 中英文对象 initializer 一致；interfaceCopy 由临时对象改为模块常量，App 仍按 locale useMemo，没有改文案或引入编辑器重建依赖。createUntitledDocument 仍在原模块递增 ID，纯初始字段搬到 createDocumentState(id)，字段值一致。DocumentOrigin 类型及 revision 字段搬移；useDocumentSession 主体在提取提交前后运行时 AST 一致。 |
| 保存语义及局部收窄 | 后续仅捕获已检查的 watcher/autosave path；origin/revision 捕获、1000ms debounce、savedSnapshot/persistedMarkdown、安全保存调用/前置冲突检查未改。Prism 仅局部捕获 from/to 后判断；未改算法。Rust 源码和 Cargo 文件无 diff，Safe Save 错误文本协议原样保留。已有会话23项、Rust33项结果引用上文，不扩大其证明范围。 |
| 模块/导入/断言 | 迁移函数已从旧宿主模块移除，未留重复实现；当前 src 相对 import/export 都可解析，排除 type-only 边后未检出运行时导入循环。新模块无 any、unknown 双重断言、ts-ignore 或 eslint-disable。Prism 的库边界窄结构断言及已有测试 mock 断言见暂缓表；没有用断言掩盖新增类型问题。 |

### 工程检查落地与保留警告

- **配置已更新**：CI 增加 `format:check`、独立 `typecheck`、Rust fmt/Clippy（`-D warnings`）/test，并安装 rustfmt/clippy；现有 npm test/lint/build/Tauri 构建保留。新增 workflow_call 入口。release 新增复用该 CI 的 verify job，release 以 `needs: verify` 等待验证；现有 release 中的 test/lint、凭据检查、签名/公证和包体检查保留。
- **本地命令通过**：上文日志记录 frontend 301 项、macOS Rust 33 项和其余质量命令；本次 app bundle 命令另有日志。**远端 CI 尚未执行验证**，未 push/触发发布；不能把配置解析或本地命令通过写成远端成功。actionlint 未执行，签名/universal release/公证未执行。
- `format:check` 实际为 `prettier --check .`，只检查；`format` 为 `prettier --write .`，会写文件。本次收尾没有执行 format 写入。
- 安装仅验证本机缓存可满足 `npm ci --offline` 的干净锁定安装（427 包），没有验证全新机器的联网安装，也没有清空全局缓存。
- 保留警告及理由：`whatwg-encoding@3.1.1`、`eslint@9.39.5` 来自现有依赖的 deprecation，本轮不升级整套依赖；Tauri DMG 脚本调用 hdiutil 的 create/resize/attach/detach/convert 有系统 deprecation，internet-enable 是 macOS 10.15 移除功能的说明。本次只读挂载尝试还出现 attach deprecation，遇许可证提示后取消，未接受条款、未挂载。新 app-only 构建没有上述 DMG 工具警告。lint 和 Clippy 保持零警告门槛，没有关检查隐藏警告。

### 真实 macOS 验收：历史阻塞与本次实际结果

历史记录：最初 CUA 绑定工作区构建的 `.app` 后恢复了真实文档标签；未编辑、保存或关闭真实文档，但缺乏启动前设置对照，不能声称那次真实会话完全未变化。创建文档的 `milo.click(8)`（新建文档）随后 `getAXState()` 两次约 90 秒超时，原始错误为 `The automatic permission approval review did not finish before its deadline. Do not assume the action is unsafe based on the timeout alone. You may retry once, or ask the user for guidance or explicit approval.` 后来的临时 HOME 准备/启动也曾在执行前发生同类超时。这些是自动审批超时，不能解释为明确拒绝、已批准或 macOS 系统权限错误。

**本次审批已恢复可用**：通过正常命令审批准备和启动，由代理执行，CUA 点击/键入/原生对话框已实际完成；没有改审批配置、权限、安全机制或使用终端 GUI 绕过。下述实际结果替代原先“所有交互未执行”及要求用户手动启动的当前结论，历史事实保留。

#### 应用和状态隔离的证据

- 当前构建代码：`f52b8b3c18955433dce83ec6fc2b7e4328c41dbc`；原 bundle 为 `src-tauri/target/debug/bundle/macos/Milo.app`。debug arm64 / Milo 0.2.1，macOS 27.0.1（26A434）。本次未改源码、未重复整套检查或重建。
- 全新测试根目录：`/private/tmp/milo-native-acceptance-6l5uxxl7`，测试 HOME 为其 `home`，测试文档目录为其 `documents`。复制同一构建到该根目录的 `Milo.app` 只用于准确绑定 CUA；状态隔离来自 HOME，不能归因于复制或工作目录。
- 设置解析已核实：`src-tauri/src/settings.rs` 的 `app.path().app_config_dir()` → Tauri 2.11.5 的 `dirs::config_dir()` + `io.github.milo.editor` → macOS `HOME/Library/Application Support`；`dirs-sys` 优先读取 HOME。
- 以临时 HOME 环境启动该 app 可执行文件。PID **7396** 的 `ps` 实际路径为 `/private/tmp/milo-native-acceptance-6l5uxxl7/Milo.app/Contents/MacOS/milo`；CUA 全程使用绑定该完整路径的 `nativeTest`，测试标签为 native-a、native-b、native-close。可执行 SHA-256 为 `606a060b303d4bba37561cd1ee3a15124d03389c3e63e4531535370a6ff0fca8`，与原本轮构建一致。
- 实际写入设置路径为 `/private/tmp/milo-native-acceptance-6l5uxxl7/home/Library/Application Support/io.github.milo.editor/settings.json`。启动时 recentFiles/startupSession 为空；主题设置和测试会话随后确实写入此文件。最后核对会话的所有路径均在测试 documents 内，appearance 为 warm。
- 准备时与交互后的真实用户设置 SHA-256 均为 `01d56ac57ec6f3accfab50a5f175821bbf7f39f4a35cccbc87681f769c88ca81`。此结论仅证明这段隔离测试期间该设置文件字节未变，不倒推此前未隔离启动的真实会话。未触碰真实文档或关闭/终止用户实例。

#### 原生操作和磁盘证据

全部界面操作使用 CUA 的 macOS 原生键鼠/AX/截图；没有 DOM 赋值、模拟事件或 jsdom 替代。测试数据的外部写入和磁盘核对使用命令工具，仅限本次创建的测试文件。表中“通过”限定于实际样例，不代表覆盖全部输入法、窗口尺寸或错误分支。

| 项目 | 状态 | 实际操作、观察及证据 |
| --- | --- | --- |
| 创建、输入、保存、自动保存 | 通过 | 原生新建、输入段落，Cmd+S 保存 sheet 到 documents/native-a.md；追加 AUTOSAVE6l5uxxl7 后没有显式保存，磁盘确实包含该段。typeText 最初未保留预期下划线，记录实际文字 MILONATIVEBASE6l5uxxl7，不将未核实的工具行为归因于应用。冲突实验前文件保存在根目录 native-a-before-conflict.md，包含原段落/自动保存/撤销标记。 |
| 撤销、重做 | 通过 | 输入 UNDOTEST6l5uxxl7，Cmd+Z 后 AX 标记消失，Cmd+Shift+Z 后恢复；后续磁盘核对包含该标记。 |
| 另存为取消 | 通过 | Cmd+Shift+S，原生 sheet 中改名 cancelled-copy.md 并取消；原文档路径和内容保留，磁盘没有 cancelled-copy.md，编辑焦点返回。 |
| 表格、代码块输入 | 通过 | 原生选择 CellInput 改为 TABLEEDIT；通过截图坐标进入代码区域新增 CODEEDIT。曾因 AX 代码文本选取没有定位到预期区域而误输入到标题，立即撤销并核实恢复后重新定位，不作为应用缺陷。磁盘保留表格头/行/两列及 javascript 围栏。 |
| 中文输入法组合及确认 | 通过（最终提交样例） | 现有系统输入源包含 Apple SCIM 拼音。通过 Ctrl+Space 切换，逐键 n/i/h/a/o；截图观察到带下划线的 ni hao，按 Space 首候选确认后变为“你好”。普通段落、表格单元格、代码块均执行该过程；磁盘分别包含段落“你好”、TABLEEDIT你好、代码围栏内 CODEEDIT你好。没有粘贴中文字。候选列表未出现在应用窗口截图中，不声明候选列表位置或翻页已验收。组合期间自动保存另有风险观察，见下文。 |
| 选区、链接和返回焦点 | 通过 | 选择 Example link，Cmd+K 打开链接弹层，URL 原为 https://example.com；修改为 https://example.com/acceptance 并应用，随后直接键入 LINKFOCUS。AX 与磁盘均保留目标链接及新增文字；未访问外部链接。 |
| 多标签、滚动、大纲 | 通过 | native-b 含 40 节，原生大纲点击 Section 20 后截图显示该节位于顶部；切 native-a 再切 native-b，截图仍显示 Section 20 和同一滚动位置。只验收当前窗口面板，窄窗口 drawer 未执行。 |
| 编辑/阅读 | 通过 | 切阅读后 AX 从可编辑区域变为文档 text field，表格/代码/正文保留；切回编辑后仍为原内容。未声称完整选区矩阵已验收。 |
| 主题 | 通过（切换）；视觉问题待归因 | 通过测试实例偏好 UI 实际选择 light/dark/warm，截图显示主题改变，设置只写临时 HOME。深色截图中活动标签的浅色背景与浅色文字对比偏低；没有据此认定为本轮新增，未改 UI。 |
| 关闭确认、取消、保存关闭、放弃 | 通过 | 核实 CLOSECONFIRM6l5uxxl7 已落入未保存编辑器后，点击关闭出现“未保存的更改”；继续编辑保留内容且直接输入 CANCELFOCUS 成功。再次保存并关闭，经原生 sheet 存为 native-close.md，磁盘为 CLOSECONFIRM6l5uxxl7 CANCELFOCUS + LF。另建有 DISCARDTEST6l5uxxl7 的未保存测试标签，确认后放弃，仅该标签移除。首次空标签关闭未确认输入成功，不计作缺陷。 |
| 重新打开 | 通过 | Cmd+O 原生对话框选择 native-close.md，重新打开后的 AX 显示 CLOSECONFIRM6l5uxxl7 CANCELFOCUS，与磁盘一致。后来输入法测试的版本保存在根目录 native-close-before-conflict.md，包含“你好”。 |
| 已保存文档外部修改 | 通过 | 命令工具仅改测试文件，应用 AX 显示新内容及 Reloaded external change.；磁盘内容与外部版本一致。 |
| 未保存本地内容与外部版本冲突决策（此前尝试） | 历史未完成；本阶段结果见后文 | 已尝试单次和限时外部写入，但工具跨调用期间自动保存/外部重载先完成；多次返回 AX 元素失效 `Computer Use server error -10005: The element ID is no longer valid`，最后即时选取又因文本已成为新外部版本而失败。没有建立可证实的 dirty 竞争状态、没有观察到冲突决策，因此保留/重载/明确覆盖及磁盘结果均未验收。停止重复时序尝试；所有测试写入进程已完成，不归因于审批或权限。 |

#### 风险观察和剩余范围

- **已确认现象，未修复**：本阶段四个定向样例确认组合中间文字会落盘，见后文时间顺序；此前界面显示带下划线 ni hao，只读磁盘检查已含 `EXTERNALFINAL6l5uxxl7\n\nni hao\n`。随后 Space 确认，AX 变为“你好”。最终提交样例通过，不等于组合期间保存保护通过。此前静态证据说明会话 autosave 主体/1000ms debounce 未在本轮重写，但没有在旧构建复现此现象，来源仍不能确定；涉及保存/输入法异步模型，本轮不改。
- **观察，未修复**：初次临时实例窗口空白，打开内置 WebKit inspector 后渲染，之后正常关闭 inspector；当时没有测量空白持续时间，无法补写时长；此后本阶段持续操作未见白屏，未重启复现；console 曾显示 IPC CSP 拒绝及 postMessage fallback，系统日志有 WebKit XPC sandbox 消息。仅记录相关现象，不能据此确定因果或本轮回归；没有修改 CSP/标识/权限。
- **未执行**：外部链接跳转、候选翻页/其他输入法、窄窗口大纲 drawer、全部浮层/选区/主题组合。已验收链接应用与关闭确认取消的返回焦点，不能扩写成所有浮层焦点通过。
- 本次无需用户手动启动、持续键入配合或额外授予权限。此前跨工具时序未跑通的缺口已由本阶段代理自行编排补齐；未用单元测试替代原生结果，见后文。
- 前述样例阶段没有新增源码修复或回归测试；本阶段仅新增保存定向测试，产品代码仍未修改。没有重跑旧全仓静态检查、改写提交、push、发布或重新导出交付材料。原生证据为本会话 CUA 原始 AX/截图和上述专用临时文件；不新增重复报告。临时测试实例保留，未终止任何应用。

### 本次复核追加执行记录

- 独立审查子代理已按要求尝试两次，但所选模型均因服务容量错误未返回审查结果；没有把失败代理的输出当作证据。主审查使用只读脚本自行读取基线到最终 HEAD 的差异、源码和测试，结果仍为：TS/JS 机械格式化运行时 AST 无差异，CSS 规则树/声明顺序不变，编辑器 89 个源测试语句多重集合一致，fixture 字节一致，无 skip/todo/only、未解析相对导入或运行时导入循环。
- 本次实际补跑：`npm run test -- --run src/hooks/useNativeListeners.test.tsx src/styles/global.test.ts`，2 个测试文件、36 项通过；`node /tmp/Milo-quality-delivery-f52b8b3/review.mjs`，所有静态复核项通过。没有修改源码，因此没有新增修复或需要扩大检查范围的代码状态。
- 该次静态复核结束时工作区为 `M docs/SOURCE-QUALITY-REPORT.zh-CN.md` 与 `?? Milo-Codex-Refactor-Brief.md`；本阶段又新增 `M src/hooks/useDocumentSession.test.tsx`。12 个提交、基线和最终 HEAD 未改变。

### 保存定向验收收尾（2026-10-13，以下为修复前记录）

本节保留当时的失败证据及暂缓决定；用户随后明确授权的两项修复、当前结果与代码状态见下一节，不再以本节的“未修复”作为当前结论。

本阶段只核查输入法落盘与外部冲突。产品代码和原生 bundle 仍对应 `f52b8b3c18955433dce83ec6fc2b7e4328c41dbc`；最终工作区额外有未提交的定向测试和本报告，用户未跟踪任务书保留。未继续重构、修改主题、调整权限、debounce、watcher 或 Safe Save。源码整理仍为原12提交，前述已通过原生样例按其实际范围保留。

#### 真实组合状态与落盘顺序

专用文件为 `/private/tmp/milo-native-acceptance-6l5uxxl7/documents/ime-save-probe.md`。使用隔离实例 `nativeTest` 的现有 Apple SCIM 拼音输入源，逐键 n/i/h/a/o，真实截图显示蓝色下划线 `ni hao`；Space 才确认“你好”，Escape 才移除组合文字。没有粘贴中文字、DOM 注入或模拟事件。磁盘观察器仅每20ms读取该测试文件，变化写入根目录 `ime-disk-timeline.jsonl`，有600秒截止和 stop marker，现已结束。读磁盘不操作界面；其后的只读 AX/截图仍显示组合下划线和编辑器焦点，排除先失焦提交后取证。候选面板未被窗口截图捕获，候选翻页仍未验收。

等待基于 Milkdown listener 的200ms debounce（`node_modules/@milkdown/plugin-listener/src/index.ts`）和会话自动保存1000ms（`src/hooks/useDocumentSession.ts`）：每次至少1500ms，含300ms I/O余量；实际跨调用更久。下表为实际 epoch 毫秒，组合时间是逐键完成时刻，不冒充捕获到 compositionstart 事件的时刻。

| 场景 | 原生组合键入完成 | 未确认中间文字落盘 | 仍处于组合的只读观察 | 确认/取消操作 | 操作后落盘 |
| --- | --- | --- | --- | --- | --- |
| 空闲开始→确认 | 1791878564603 | 1791878565894：ni hao | 1791878605353 | 1791878616944：Space | 1791878618223：你好 |
| 空闲开始→取消 | 1791878651996 | 1791878653283：ni hao | 1791878698758 | 1791878698860：Escape | 1791878700112：该组合文字移除 |
| 已排队保存→取消 | 1791878788255 | 1791878789553：PENDINGQni hao | 1791878828258 | 1791878828353：Escape | 1791878829616：PENDINGQ |
| 已排队保存→确认 | 1791878858495 | 1791878859783：PENDINGQRni hao | 1791878898797，观察后按键 | 1791878898797：Space | 1791878900061：PENDINGQR你好 |

排队场景在组合开始前分别于1791878788211、1791878858449取得完整 AX，已显示普通编辑 PENDINGQ/PENDINGQR 和“即将保存”，随后才逐键组合，覆盖已有保存任务而非仅空闲开始。此前一次准备 PENDING 时保护条件没有成立，未启动组合，不计入样例。确认和取消后编辑器与磁盘一致；1791878943342原生追加 AFTERIME，1791878944473正常自动落盘，最终保留“你好”、PENDINGQR你好、AFTERIME。

**状态：组合确认/取消和后续保存样例通过；“组合未确认期间不落盘”保护失败/当前不存在。** 原因链为编辑器 `markdownUpdated` 转发组合中间文档、会话 `updateMarkdown` 标记 dirty、1000ms autosave 无组合条件；listener 文档变化 debounce 也没有组合过滤。仅只读对照基线 `31fc9378fb8d5b02a3638741f6d1a39b89d5ceda`：转发、dirty 更新和保存条件同样存在，锁定 listener 7.22.1相同。这说明整理前已存在该机制，**未在基线原生构建复现，现象首次引入版本仍未知**，不宣称完成了旧版本运行对比。

独立方案（暂缓实施）：先明确组合中间态的保存策略，再为真实 composition start/end/cancel 与“开始前已有timer/正在写入”的边界建立回归保护；讨论组合期间暂停排队保存、结束后序列化最终文档及恢复保存的最小接口。不得只凭 view.composing 在单一回调处过滤就宣称竞态已解决。本轮不改输入法或保存异步模型。

#### 冲突的确定性测试层

`src/hooks/useDocumentSession.test.tsx` 仅追加4项，原23项及断言保留，无 skip/todo/fails。使用现有 Vitest fake timers、真实注册到 mock watcher 的回调、可控 read/write Promise；不依赖反复 sleep：

- **通过**：排队保存500ms时外部变化、延迟读取期间再次编辑；读取完成后冲突保留最新本地和旧persisted版本，推进1000ms不写盘。保留本地后继续编辑、普通保存均不得覆盖外部；随后明确重新载入，清除dirty并再推进1000ms，无writer调用。
- **通过**：无watcher通知时，999ms不触发autosave预检，1000ms启动；延迟预检期间外部变化/本地再次编辑，解析后进入pending，两版保持、两个writer均未调用。
- **通过**：明确覆盖之前不写；覆盖使用当前外部版本作为Safe Save expectedDisk。延迟写入期间的新编辑保留dirty，磁盘仅提交已决定的保存快照。
- **部分通过/失败**：冲突另存为取消保留原路径、本地dirty与外部版且不写；选择新副本路径期望成功的断言失败（actual false），其后副本成功分支断言未执行。该断言保留，不通过 skip、放宽成功预期或关闭检查换取通过。

第一次执行为25通过/2失败。新增测试最初错误地期待“保留后再次编辑”仍持续为retained；定向源码确认编辑时会清空提示、预检再变pending，现改为逐步断言 retained→null→pending，增加明确重载后无写断言；两版内容/dirty与零写入的安全断言未放宽。最后执行 `npm run test -- --run src/hooks/useDocumentSession.test.tsx`：**26通过/1失败，exit 1**（最终测试内容，失败位于新副本保存断言）。该文件 Prettier 写入命令曾执行但未改变文件；最终 `npx prettier --check src/hooks/useDocumentSession.test.tsx`、`npx eslint src/hooks/useDocumentSession.test.tsx --max-warnings 0`、`npx tsc --noEmit -p tsconfig.app.json`通过。后者检查整个src含新增测试，不是重新运行全仓构建/测试。原Rust Safe Save和既有全仓检查仅引用前文旧证据，本阶段未重跑，不能称新增测试后全仓绿。

#### 真实未保存冲突层

同一隔离实例，专用 `documents/conflict-probe.md`。外部任务只监控该文件，看到原生保存的唯一ARM标记后650ms写一次指定EXTERNAL版本，180秒截止，写后退出；脚本 `conflict-write-once.py` / `conflict-write-second.py` / `conflict-write-reload.py` 和 `conflict-write-timeline.jsonl` 位于测试根目录，三个任务均已exit 0。未暂停正式保存、修改计时器、关闭watcher或注入冲突UI。

首次尝试跨CUA调用：外部写1791879298777，本地编辑观察1791879305010，顺序不成立，只算干净重载，不算冲突。第二次将保存和再次编辑放进同一CUA调用：1791879329232 AX显示 ARMCONFLICT2LOCALCONFLICT2、“即将保存”；1791879329426（194ms之后）外部写，写前磁盘仅ARMCONFLICT2。随后真实提示“Milo已暂停保存”，本地仍为LOCAL版。建立成功后仅增加一个重新载入分支场景：1791879469129本地dirty观察，1791879469332（203ms之后）外部写，写前磁盘仅ARMCONFLICT3；之后提示冲突并保留LOCAL版。共两次建立尝试及一个有目的的重载场景，没有无限碰时序。

| 原生检查 | 状态 | 界面与磁盘证据 |
| --- | --- | --- |
| 决策前暂停自动保存 | 通过 | 本地ARMCONFLICT2LOCALCONFLICT2保留，提示暂停；磁盘持续EXTERNALCONFLICT2 + LF，未静默丢本地或覆盖外部。 |
| 冲突另存为取消 | 通过 | 原生Save sheet取消，本地、原路径及冲突提示不变，磁盘仍外部版。 |
| 冲突另存为新副本 | 失败 | 原生sheet选择documents/conflict-copy.md并Save；返回后仍原路径/本地/冲突提示，副本不存在、原文件仍EXTERNALCONFLICT2。与新增失败测试一致。 |
| 保留后继续编辑 | 通过（安全约束） | 保留提示暂停；原生追加AFTERRETAIN后提示短暂消失，再由autosave预检恢复pending。等待至少1500ms后磁盘仍EXTERNALCONFLICT2，未未经决定覆盖。持续retained提示不是当前行为。 |
| 明确覆盖 | 通过 | 再选保留、点击“覆盖外部版本”，磁盘确认为ARMCONFLICT2LOCALCONFLICT2AFTERRETAIN + LF，界面已保存。 |
| 明确重新载入 | 通过 | 另一个已证明dirty的冲突中点击“重新载入文件”；编辑器EXTERNALCONFLICT3、已保存/Reloaded external change.，磁盘同为EXTERNALCONFLICT3 + LF。 |

#### 需要独立修复的事项与最终状态

1. **冲突另存为新副本失败：基线已存在的阻断逻辑，未修复。** `saveToPath` 在externalChange存在且目标path不同于原path时直接return false；基线同一分支存在，不是本轮新增。独立方案：区分冲突原路径保存与新路径副本保存，保留原文件不覆盖的规则及新目标原有安全写入要求；使用本次失败测试作回归入口，再补目标已有文件、取消、写失败、延迟保存/切标签和序列化元数据场景。不借验收修改Safe Save算法或错误协议。
2. **组合中间文本落盘：已确认，首次引入版本未知；独立保存策略议题。** 确认/取消后恢复正常不能抵消中间文字曾落盘的事实。修复建议见上文，本轮不实施。
3. 深色标签对比度继续暂缓；首次空白窗口的持续时间未知、未作重启复现，本阶段未见持续白屏或操作阻塞，不修改主题/CSP/权限。

本阶段最终设置核对：测试startupSession/recentFiles的全部路径仍在专用documents目录；真实设置SHA-256仍为 `01d56ac57ec6f3accfab50a5f175821bbf7f39f4a35cccbc87681f769c88ca81`。不读取真实文档内容，不清理真实状态，不终止用户实例。审批与工具现已可用，无需用户继续键入或准备环境。新增测试和报告保留未提交；未发布、push、生成重复报告或再次导出patch。原交付patch仍仅覆盖原12提交，不包含本阶段未提交新增测试。

### 两项保存缺陷的授权修复与验收（2026-10-13）

原源码整理12个提交完整保留，原交付 HEAD 为 `f52b8b3c18955433dce83ec6fc2b7e4328c41dbc`。本阶段仅增加两个独立修复提交，无 amend/rebase/reset/push/发布：

1. `168daf7ce3fce962c1f12fda2d62ef4043ec6ff6` — `fix: allow conflict Save As to a new document path`
2. `613f781a5c9d0105b081238fceeabb9ba3ca0fab` — `fix: guard document saves until IME composition settles`（本次已验证源码 HEAD；文档收尾前 HEAD）

此前未提交的4项冲突定向测试核对为本次代理所写，保留并纳入第一项修复，未覆盖用户工作。原生验收结束时产品代码及测试均已提交；当时工作区仅 `M docs/SOURCE-QUALITY-REPORT.zh-CN.md` 与 `?? Milo-Codex-Refactor-Brief.md`，后者为用户任务书，未修改或提交；当时本节报告补充未提交，现由文档收尾提交单独收录。原交付 patch 仍只覆盖原12提交，本阶段没有重复导出材料。

#### 根因、修改文件与回归保护

| 改动 | 文件 | 原因及边界 |
| --- | --- | --- |
| 冲突另存为准入 | `src/hooks/useDocumentSession.ts` | 原失败测试的返回值为 false，writer 尚未调用；不是目标 mock 写入错误。将 externalChange 的原路径预检限制在 `savedSnapshot.path === path`，不同路径仍以 null expectedDisk 调用原 Safe Save，未设 allowExternalOverwrite=true，未全局清冲突。原路径冲突保护保留。 |
| 冲突回归 | `src/hooks/useDocumentSession.test.tsx` | 原成功断言保留，红→绿。追加 pending/retained 新副本、取消/写失败、原路径、已有目标/身份错误传播、watcher 换绑与旧回调阻断、新路径自动保存、延迟写入中编辑/切标签及 origin/revision/保存快照保护。前述4项确定性冲突测试亦保留。 |
| 编辑器组合边界 | `src/editor/milkdown/compositionSaveBoundary.ts`（新增）、`src/editor/milkdown/MilkdownEditor.tsx` | start/update 同步关闭保存边界。compositionend 仍关闭边界，待 view.composing=false、PM 文档及 DOM 在渲染帧间连续两次比较稳定后，序列化当前文档再释放；input、插件更新及 DOM 变化重置稳定观察。结束前新组合、销毁会取消等待并释放观察器。现有插件相对顺序和编辑器身份保持；markdownUpdated 使用当前 view.state.doc，避免延迟 listener 转发旧事务文本。 |
| 文档级保存准入 | `src/hooks/documentSessionModel.ts`、`src/hooks/useDocumentSession.ts` | 每标签 isComposing；阻止创建组合中的自动保存任务，并在最终入口及异步预检后复查。手动保存、另存为、保存关闭不得虚报成功。已开始的已确认快照照常写完，但新编辑/组合保留 dirty；保存关闭只在最新标签无 dirty/组合时关闭。确认/取消稳定后重新计算内容与磁盘基线并恢复原1000ms自动保存。 |
| 组合状态衔接 | `src/app/App.tsx`、`src/app/DocumentPanel.tsx` | 按 DocumentOrigin 传递组合状态，避免全局开关误阻其他标签；没有重建编辑器或修改 UI 样式。 |
| 组合回归 | `src/editor/milkdown/MilkdownEditor.ime.test.tsx`、`src/hooks/useDocumentSession.test.tsx`、`src/app/App.test.tsx` | 新边界/API不存在时先红，再实现；覆盖空闲/已排队组合、确认/取消/后续编辑、组合前已确认待存内容、多标签独立、手动保存/另存为/保存关闭、预检 Promise 交错、旧写完成与新组合、取消回到已写快照、end先于最终DOM/input、新组合重启与销毁。测试装置修正未删或放宽安全断言，无新增 skip/todo。 |

compositionend 本身不足以证明内容稳定：当前 ProseMirror 会先解除 composing，再由 DOM observer 和延迟 endComposition 完成同步；WKWebView 最后 input 也可能随后到达。本阶段增加局部边界而非重写整套异步状态模型。未强制确认候选、丢弃事务、延长 debounce 或中断底层写入。输入法现象首次引入版本仍未知，本阶段没有继续历史追溯。Rust 源码、Safe Save 算法及错误协议未改。

#### 修复后实际检查

下列检查均在两项代码修复完成后执行，对应完整源码提交 `613f781a5c9d0105b081238fceeabb9ba3ca0fab` 的产品/测试内容；本节新构建和原生验收亦对应此源码状态。之后仅原生操作测试数据和更新报告，没有继续改相关代码。没有以旧 f52b8b3 的检查替代新结果。

| 实际命令 | 状态及结果 |
| --- | --- |
| `npm run format:check` | 通过，只检查格式，不写文件。开发期间仅对修改文件使用 Prettier 写入，没有全仓格式化。 |
| `npm run typecheck` | 通过。 |
| `npm run lint -- --max-warnings 0` | 通过，零警告门槛保留。 |
| `npm run test` | 通过，36文件/321项；16:46:52开始、12.72秒。定向迭代中会话39项、IME10项、App28项通过。 |
| `npm run build` | 通过。 |
| `cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check` | 通过。 |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --locked -- -D warnings` | 通过。 |
| `cargo test --manifest-path src-tauri/Cargo.toml --locked` | 通过，33项；保留已有目标拒绝、symlink/hardlink/身份及磁盘版本保护、F1–F7恢复和开发崩溃暂停回归。 |
| `npm run tauri -- build --debug --bundles app` | 经正常审批执行并通过，含新前端构建和Rust编译；app-only，无DMG签名/公证/发版。 |

这些是本地命令结果；远端 CI 未执行，新机器联网安装未验证，未重新安装依赖或清空缓存。CI/发布前检查配置和保留依赖警告仍见前文，没有关闭检查。

#### 新构建、实际进程和隔离证据

- 构建来源：`/Users/cococzl/Documents/github/Milo/src-tauri/target/debug/bundle/macos/Milo.app`；实际操作副本：`/private/tmp/milo-native-acceptance-6l5uxxl7/fixed-613f781/Milo.app`。二者可执行文件 SHA-256 相同：`3520d843d9073bd8c247292e8c4850e8c0cc8afb1c59ec2500a7bc83ce8b02ac`。
- 测试环境：macOS 27.0.1（26A434）、arm64、原生 WKWebView；新进程 PID 13069 的命令行指向上述副本和新测试文档。CUA 绑定 `fixedTest`，不是旧实例或已安装应用。
- 使用已验证的 HOME 重定向方式，新的 HOME 为 `/private/tmp/milo-native-acceptance-6l5uxxl7/fixed-613f781/home`；实际设置位于其 `Library/Application Support/io.github.milo.editor/settings.json`。启动时全新、未导入真实会话；结束时 startupSession/recentFiles 全部仅指向同根 `documents` 下本阶段测试文件。隔离证据是进程、实际设置和窗口路径，不仅是复制.app或目测标签。
- 真实设置启动前与本阶段结束 SHA-256 均为 `01d56ac57ec6f3accfab50a5f175821bbf7f39f4a35cccbc87681f769c88ca81`；未操作真实文档/标签，未重置偏好或终止已有实例。新的实例首屏直接渲染，本阶段没有观察到持续白屏；不据此推翻此前未知时长的首次空白记录。

#### 修复后原生输入法证据

专用 `documents/save-fix-ime.md`；真实 Apple SCIM 拼音逐键输入 nihao，截图显示蓝色组合下划线 ni hao，Space确认“你好”、Escape取消。一次输入源误切到英文的准备步骤已排除，不计为中文组合；未用粘贴中文、DOM或模拟事件。每次等待至少1500ms，依据200ms listener＋原1000ms autosave＋300ms余量；跨调用实际更久。读磁盘不切换焦点，其后截图仍显示组合状态。

| 原生样例 | 状态 | 顺序及磁盘内容（epoch毫秒） |
| --- | --- | --- |
| 空闲开始组合，不确认 | 通过 | 清洁基线1791881475621为 `FIXEDIMEBASE\n`；1791881488474组合键入完成；1791881511321磁盘仍基线，随后截图仍有下划线。 |
| 候选确认并恢复保存 | 通过 | 1791881543079 Space；观察器1791881544159记录 `FIXEDIMEBASE你好\n`，后续磁盘核对一致。 |
| 已排队保存后组合→取消 | 通过 | 1791881587053 AX已有 PENDING 和“即将保存”；1791881587092组合键入完成；1791881614046磁盘仍 `FIXEDIMEBASE你好\n`，截图仍处组合；1791881626410 Escape；1791881627491保存 `FIXEDIMEBASE你好PENDING\n`，未丢失组合前已确认编辑。 |
| 取消后普通输入保存 | 通过 | 原生追加ASCII AFTERCANCEL；1791881673351磁盘变 `FIXEDIMEBASE你好PENDINGAFTERCANCEL\n`。 |
| 组合中手动保存/保存关闭 | 原生未完成；确定性回归通过 | 尝试 Cmd+S 被输入法/工具解释为追加组合字母s，未到达保存入口，已删除该s；不能算手动保存通过。点击UI会先失焦，未冒充组合中的保存关闭证据。 |

只读20ms观察器仅监控该文件，有600秒截止和stop marker，现exit 0。`fixed-ime-disk.jsonl` 的清洁基线之后仅记录基线→你好→PENDING→AFTERCANCEL，未出现未确认拼音落盘；开始/结束事件的精确时间由确定性测试覆盖，原生记录是按键完成/操作时间，不虚称抓取了浏览器事件时间。原生未扩展到候选翻页、所有输入源、多标签同时组合或底层写完成的逐时序竞争；这些边界按测试层结果报告。

#### 修复后原生冲突证据

外部任务 `external-write-once.py` 限定本阶段三个指定测试文件，看到原生保存的ARM标记后650ms写一次外部版本，180秒截止，均已exit 0。未暂停保存、改debounce、关watcher或伪造UI。四个有明确目的的场景均一次建立成功：

| 场景 | 本地dirty观察 | 外部写入 | 写前磁盘 |
| --- | --- | --- | --- |
| pending新副本 | 1791881932518：FIXARM1FIXLOCAL1 | 1791881932712：FIXEXTERNAL1 | FIXARM1 + LF |
| retained新副本 | 1791882198882：FIXARM2FIXLOCAL2 | 1791882199040：FIXEXTERNAL2 | FIXARM2 + LF |
| 明确覆盖 | 1791882327389：FIXARM3FIXLOCAL3 | 1791882327598：FIXEXTERNAL3 | FIXARM3 + LF |
| 明确重新载入 | 1791882390982：FIXARM4FIXLOCAL4 | 1791882391176：FIXEXTERNAL4 | FIXARM4 + LF |

以上dirty AX均为“即将保存”，在外部写前；之后提示暂停保存、本地内容仍在，不能误算为干净文档重载。证据为CUA原始AX/截图、只读磁盘核对及 `fixed-conflict-timeline.jsonl`。

| 原生检查 | 状态 | 实际观察及磁盘核对 |
| --- | --- | --- |
| pending另存为取消 | 通过 | 原生sheet取消，仍原路径、本地FIXARM1FIXLOCAL1及冲突提示，原文件FIXEXTERNAL1。 |
| 已有目标写入失败 | 通过（预期拒绝） | 选择专用 occupied-target.md，并在原生面板确认Replace；Safe Save显示拒绝无expected disk version覆盖已有目标。原路径、本地及冲突仍在；occupied-target仍 `OCCUPIED_TARGET_BASE\n`，原文件仍 `FIXEXTERNAL1\n`。未降低保护使其成功。 |
| pending另存到新文件 | 通过 | pending-copy.md为 `FIXARM1FIXLOCAL1\n`，路径/最近文件更新、界面已保存；原文件仍 `FIXEXTERNAL1\n`。 |
| 新路径后续自动保存、旧源事件 | 通过 | 原生追加COPYAUTO，新文件变 `FIXARM1FIXLOCAL1COPYAUTO\n`，原文件仍外部版。随后专门将旧源改为OLD_SOURCE_EVENT，当前新文件编辑器/已保存状态未被污染；此后旧源磁盘变化是测试主动写入，不是Save As覆盖。 |
| 保留后继续编辑不覆盖外部 | 通过 | 追加RETAINEDIT后原有行为retained→提示清空→pending，磁盘仍 `FIXEXTERNAL2\n`；未未经决定写入。再次保留后进入下一样例。 |
| retained另存到新文件 | 通过 | retained-copy.md为 `FIXARM2FIXLOCAL2RETAINEDIT\n`，原文件仍 `FIXEXTERNAL2\n`，新路径已保存。 |
| 明确覆盖 | 通过 | 决策前磁盘仍FIXEXTERNAL3；选择保留后点击覆盖外部版本，磁盘 `FIXARM3FIXLOCAL3\n`，界面已保存。 |
| 明确重新载入 | 通过 | 决策前磁盘FIXEXTERNAL4、本地FIXARM4FIXLOCAL4；点击重新载入后编辑器/磁盘均FIXEXTERNAL4，已保存并提示Reloaded external change. |
| 目标身份冲突、保存中编辑/切标签、原路径保护全部边界 | 原生未逐项执行；确定性回归通过 | 会话测试和Rust既有保护测试覆盖；不以其结果冒充全部原生路径。 |

本阶段两项产品缺陷已修复，新增回归和本地完整前端/Rust检查通过，新的原生样例通过上述实际范围；没有观察到仍需修改的本轮问题。原生未完成项已列明，不将样例通过写成所有事件时序均通过。深色标签对比度、此前空白窗口和其他历史风险继续单独记录，不混入修复。

原生验收报告补充后仅补跑 `npx prettier --check docs/SOURCE-QUALITY-REPORT.zh-CN.md` 与 `git diff --check`，均通过；当时git status仍仅报告修改与用户未跟踪任务书。没有因文档更新重复执行产品测试或构建。

#### 文档收尾提交与源码验证状态

本次独立文档提交标题为 `docs: finalize source quality and save fix acceptance report`，仅收录本报告。文档提交后的 HEAD 为包含本节的该提交，可用 `git log -1 --format=%H -- docs/SOURCE-QUALITY-REPORT.zh-CN.md` 定位，完整 hash 在本次交付回复中另行记录；其父提交及本次验证对应的源码提交均为 `613f781a5c9d0105b081238fceeabb9ba3ca0fab`。文档提交未修改产品或测试，未重新执行源码测试、构建或原生验证；已有通过、失败及未执行证据按上文实际阶段保留。

用户任务书 `Milo-Codex-Refactor-Brief.md` 保留为未跟踪文件，不纳入文档提交。原有提交历史、隔离测试环境和数据保留；未 push、发布或操作真实文档、偏好设置和会话。本轮到此结束。

### 独立复核材料与最终分类

仓库外交付目录：`/tmp/Milo-quality-delivery-f52b8b3/`（系统临时目录，需长期保存请另行复制）。

该目录是原12提交交付时的历史快照，未因两个修复或本次文档提交重新生成；其中 HEAD、工作区状态和未提交报告 patch 均对应当时，不代表当前 HEAD 或报告全文。

- `committed.patch`：`git diff --binary --full-index 31fc9378… f52b8b3…` 的完整已提交 patch，不包含未提交报告补充或用户任务书。
- `diff-stat.txt`、`commits.txt`、`manifest.json`：准确基线/HEAD、12项完整提交、统计、代码状态/产物指纹和工作区状态。
- `uncommitted-report.patch`、`git-status.txt`：报告的收尾改动单独导出；用户任务书仅列为未跟踪，不导出其内容。
- `review.mjs` / `read-only-review.txt`：只读复核脚本及结果；`app-bundle.log`：本次 app-only 构建记录；`SHA256SUMS`：交付文件校验。
- 完整 committed.patch 在外部临时基线树验证可应用，并与最终 HEAD 的跟踪树内容核对；报告未提交 patch 也单独验证。此校验只验证交付材料完整性，不代替测试或实机验收。

**已验证**：原12个整理提交及其静态/构建/原生证据保留。两项授权修复已独立提交到613f781，修复后的321项前端、33项Rust及格式/类型/lint/构建检查通过；新.app原生组合未确认不落盘、确认/取消后恢复保存、pending/retained另存新文件、取消/已有目标拒绝、新路径自动保存、旧源事件、保留继续编辑、明确覆盖/重载样例通过。每层范围见上文，不声明所有原生交互通过。

**待人工验收/未执行**：窄窗口drawer、候选翻页/其他输入法及完整浮层矩阵；组合中原生手动保存/保存关闭未可靠到达入口、保存中的逐时序竞争及目标身份冲突未逐项原生执行（确定性测试已通过）。无需用户持续键入配合，本阶段样例由代理完成。远端CI、联网新机器安装、最低Rust和正式发布链仍未执行。

**明确暂缓**：深色标签对比度、此前首次空白窗口的单独复现；Safe Save算法/错误协议、整套异步状态模型、编辑器create/destroy/图片/对话框/watcher stop的其他历史失败路径、CSS拆分和性能优化。冲突另存为阻断与组合中间文本落盘不再列为未修复，授权的两项修复至此收尾，不泛化继续优化。

### 独立视觉修正：宽屏 inline 大纲（2026-10-13）

用户另行授权的局部视觉任务，基于 `dd1c39caf0549d07d4b335bb9111ed1a41810bc3`；不属于前述源码整理或保存修复的范围扩张。提供的 `img.png`、`img_1.png` 均保留为用户未跟踪文件，不纳入提交。本次仅修改：

- `src/styles/global.css`：只在 `.document-editor-workspace--inline` 下移除大纲底色、边框/左线、阴影及表头横线；表头保留图标和文案，用现有 text-secondary、medium 字重，空提示用 text-secondary 保持可读。不设置容器opacity，不改共用drawer表头/底板和主题变量。
- `src/styles/global.test.ts`：新增inline视觉契约及drawer实体背景/边框/阴影/层级保护，保留现有网格/256px列宽、标题高度、六级缩进、省略、当前标记、悬停/焦点和滚动条断言；没有删改失败断言或skip/todo。新增契约先在旧CSS下失败（缺少transparent），实现后通过。
- 本报告：仅记录本次验证。TSX、定位/portal、1150px文档区断点、正文布局、滚动/导航、保存/输入法及正式应用标识/发布配置均未修改。

#### 本次实际检查

| 检查 | 结果 |
| --- | --- |
| `npm run test -- --run src/styles/global.test.ts src/app/App.test.tsx` | 通过：21+28，共49项。 |
| `npm run test -- --run src/editor/milkdown/EditorOutline.test.tsx src/editor/milkdown/MilkdownEditor.outline.test.tsx` | 通过：5+13，共18项。 |
| `npx prettier --check src/styles/global.css src/styles/global.test.ts` | 通过。 |
| `npx eslint src/styles/global.test.ts --max-warnings 0` | 通过。 |
| `npm run tauri -- build --debug --bundles app` | 正常审批后通过，含tsc/Vite/Rust编译；原生验收使用该次新构建。 |
| `git diff --check` | 通过。 |

只跑受影响检查，没有重复全仓测试、Rust/Safe Save测试或静态审计；前述完整源码验证仍对应613f781，不冒充本次全仓重验。没有push/发版。

#### 原生视觉对比和隔离

证据目录：`/private/tmp/milo-outline-visual-v29w6lgg/screenshots/`，完整窗口截图命名 `before-{light,dark}-{empty,levels,long}.png` 与 `after-{light,dark}-{empty,levels,long}.png`；`compare-{light,dark}-{empty,levels,long}.png` 为原始截图同区域裁切并排（左前/右后），没有生成或修改界面像素。

两套实例使用同一组专用文档：outline-empty.md、outline-levels.md（h1–h6及长标题）、outline-long.md（65项）；每对截图同一文件、1280×820窗口、文档/界面缩放100%、侧栏隐藏、正文和目录均从顶部开始。截图为2560×1640；六对截图的正文矩形 `(80,250)-(1900,1500)` 像素逐一相同，具体矩形及比较结果在证据根 `visual-comparison.json`。这验证所观察正文位置/宽度不变，不代替全部尺寸和全部滚动位置验收。

- **通过**：浅色/深色三种状态的底板、左线和表头横线消失，标题/提示位置稳定；多级缩进、长标题省略和长目录独立滚动条仍在，当前章节强调色/细标记保留。
- **通过**：修改后原生点击Section05定位正文，再按Tab，下一目录项呈现清晰焦点环；当前项和鼠标悬停反馈同时可见，证据 `after-dark-inline-keyboard.png`。
- **通过（本次实际条件）**：1280窗口展开224px侧栏后文档区低于1150px，原生触发drawer；实体背景/分隔线/遮罩及导航层级保留，Escape关闭且入口焦点环可见，证据 `after-dark-drawer.png`、`after-dark-drawer-closed.png`。专注模式覆盖drawer同样保留实体背景，证据 `after-dark-focus-drawer.png`。未单独拖动窗口逐个遍历更窄尺寸。
- **通过**：暖色主题inline多级标题及drawer可读，证据 `after-warm-levels.png`、`after-warm-drawer.png`；暖色未生成修改前后矩阵。
- **未确认**：一次原生滚轮尝试未可靠命中目录滚动区域，观察到正文滚动，不能据此宣称长目录独立滚动交互通过；保留 `after-warm-scroll-before.png`、`after-warm-scroll-after.png`。独立滚动的CSS契约通过，相关规则未修改；本次没有继续反复尝试。

最初旧CUA绑定只读返回了非测试窗口，未执行任何输入/设置动作，立即停止使用该绑定。随后通过正常审批启动两套新的临时HOME（home-before/home-after）；仅临时.app副本的Info.plist使用不同测试显示名/标识并重新ad-hoc签名，防止CUA按共用正式标识选错进程，未修改仓库正式标识或安全配置。实际设置均位于各临时HOME的 `Library/Application Support/io.github.milo.editor/settings.json`，startupSession/recentFiles均只含本阶段测试目录。结束时真实设置SHA-256仍为 `01d56ac57ec6f3accfab50a5f175821bbf7f39f4a35cccbc87681f769c88ca81`；未修改真实文档、标签或偏好，未终止用户实例。

修改前实例 `Milo Outline Before.app` PID15752，来源为613f781旧构建（dd1c39c仅文档）；修改后实例 `Milo Outline After.app` PID16492，来源为本次CSS工作区构建。两者在证据根目录，CUA分别绑定独立测试标识。本次正式构建可执行文件SHA-256为 `f869ec895fd55b3fbd9bdd7fe99a01f9aa2039d5038b6227766e7c7e519b7bb0`；临时重新签名副本SHA-256为 `74d86477b227f1e5d526f4961805ed3ee42565ff457bdb36d561bbe487a09a10`（前副本df664defab0e9cb87c4dac90107d28f85da6d057a177168ec1cf9038c276a068），签名元数据差异不当作源码变化。

本次构建/测试/原生样例对应dd1c39c加本独立提交的CSS及测试内容，之后仅补充报告，不再改相关源码；提交完整hash在交付回复记录。深色标签、首次空白窗口及其他暂缓项仍保持前述范围。本视觉任务到此结束。
