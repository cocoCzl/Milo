# Milo 编辑器状态

本文是当前 `master` 的简短实现与验证摘要。逐轮验收原始记录、截图、日志和临时应用均属于本地测试产物，不纳入公共仓库。

## 已完成

- 普通 `.md` 与 `.markdown` 文件仍是权威来源，保留 Front Matter、UTF-8 BOM、LF/CRLF 和安全保存语义。
- 保存、恢复、外部修改冲突、路径规范化、未命名文档恢复和关闭/退出协调已覆盖当前实现；保存失败会保留内存修改。
- 组合输入结束后的状态恢复和源码模式取消关闭后的焦点问题已修复，并有回归测试。
- 同一父目录的文件监测器按规范化目录共享，按文件精确分发事件；20 个访问标签的线程观测从 57 降至 20。单轮 footprint 差异约 1 MB，不能宣称稳定内存收益。
- 当前界面包含编辑/阅读/源码模式、文内查找替换、相对 Markdown 链接和锚点返回、当前文件夹快速打开、文件路径操作、可折叠大纲、主题和独立缩放。

## 可重复测量

测量代码只在显式 diagnostics 构建中启用，默认构建不调用时钟、不写入诊断记录，也不记录正文。`lib-run-entry → home-controls-ready` 的五次样本为：

`410.45、346.63、325.22、342.44、324.98 ms`

最小值 `324.98 ms`，中位数 `342.44 ms`。该边界不代表点击应用、像素显示或首次真实输入。

30 次普通 1 MB 输入样本：

- keydown → 模型：最小/中位数/描述性 nearest-rank P95/最大 = `5 / 5 / 8 / 18 ms`
- beforeinput → 模型：`4 / 4 / 6 / 17 ms`

30 次结构密集 1 MB 输入样本：

- keydown → 模型：`11 / 13 / 15 / 20 ms`
- beforeinput → 模型：`9 / 11 / 12 / 16 ms`

这些 P95 只描述单轮样本，不是跨轮稳定性能预算。像素响应、点击应用到首次可输入、Dock 和部分窗口过渡仍未测量或受工具限制。

## 解析与保存

五次普通 1 MB 打开中：

- 安全解析：`134、123、110、115、117 ms`；最小/中位数/描述性 P95/最大 = `110 / 117 / 134 / 134 ms`
- Milkdown 解析：`112、115、104、102、102 ms`；`102 / 104 / 115 / 115 ms`

结构密集 1 MB 样本的安全解析为 `216 ms`，Milkdown 解析为 `212 ms`，代码高亮为 `13 ms`。安全检查和 Milkdown 使用不同 AST、保护判定和生命周期，目前没有安全复用结果的低风险接口；因此保留“先安全检查、再 WYSIWYG 解析”的顺序。

一次普通长文保存中，safe-save transaction 为 `49 ms`，safe-save IPC 聚合为 `59 ms`；这些是诊断样本，不是稳定 P95。

## 内存状态

指标为正常 arm64 Release 中 Milo、WebContent、GPU、Networking 的 physical footprint，总数不把共享 IOSurface 手工重复相加：

| 场景 | 总 footprint |
| --- | ---: |
| 干净首页 | 96.10 MB |
| 单标签恢复 | 188.53–189.27 MB |
| 20 标签恢复、只访问首篇 | 200.87–208.65 MB |
| 20 标签全部访问 | 225.92 MB |
| 20 标签编辑后 | 约 233.82 MB |
| 全部关闭 | 139.71 MB |

20 标签访问后的主要增量在 WebContent；GPU 增量较小。200 MB 预算在宽窗口 20 标签场景仍未达标。多轮长文打开后自然关闭未显示持续线性增长，但样本不足以证明长期无泄漏。

有界 EditorView 驱逐、后台视图缓存和跨模式统一撤销尚未实现。没有通过清空撤销历史、丢弃未保存内容、关闭硬件加速或限制标签数量来降低数字。

## 尚未归因的问题

- 候选输入期间 Cmd+S/Cmd+Q 偶尔出现 `s/q` 混入；现有证据确认命令和修饰键事件到达，但无法区分自动化投递、macOS 输入法与 WKWebView 上游原因。
- WYSIWYG 编辑可能规范化部分 Markdown 格式，未承诺整篇字节级无损。
- 源码模式和 WYSIWYG 使用不同编辑模型，跨模式统一撤销尚未实现。
- 某些 WebKit 光标绘制、Dock 行为和窗口切换时序仍缺少可靠原生测量。

## 测试范围

适用检查包括：

```sh
npm run format:check
npm run typecheck
npm run lint -- --max-warnings=0
npm test
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --locked -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --locked
```

浏览器脚本使用模拟 IPC，不能替代 Tauri/WKWebView 的原生保存、输入法、窗口生命周期和内存验收。发布仍需按 [RELEASE.md](RELEASE.md) 构建和核对 Universal DMG。

诊断脚本保留在 `scripts/summarize-native-profile.mjs` 和 `scripts/sample-native-memory.mjs`。它们只处理显式传入的测试文件或系统临时目录下明确命名的隔离 `.app`：

```sh
node scripts/summarize-native-profile.mjs /path/to/profile.jsonl BUILD_ID
node scripts/sample-native-memory.mjs baseline /path/to/baseline.json
node scripts/sample-native-memory.mjs sample /path/to/baseline.json /path/to/Milo-validation.app /path/to/sample
```

脚本没有默认真实文档、设置或仓库外部数据路径；没有对应测试产物时会直接报错。
