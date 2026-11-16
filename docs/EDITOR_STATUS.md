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

2026-11-16 在 Apple Silicon、macOS 27.2.1、1280×820、界面与文档缩放 100% 下，使用正常 arm64 Release 和合成短文档测量。指标为 Milo、WebContent、GPU、Networking 的聚合 physical footprint，单位为十进制 MB，不直接相加进程列或重复计算共享 IOSurface。恢复/访问场景通常等待 30 秒后采样；Home 没有统一计时锚点。

| 场景                    | 总 footprint |
| ----------------------- | -----------: |
| 干净首页                |     99.68 MB |
| 单标签恢复              |    183.11 MB |
| 5 标签全部访问          |    203.82 MB |
| 10 标签全部访问         |    224.60 MB |
| 20 标签恢复、只访问首篇 |    135.48 MB |
| 20 标签全部访问         |    259.15 MB |
| 20 标签逐篇编辑保存     |    266.47 MB |

20 标签全部访问仍超过 200 MB 预算，主要增长来自 WebContent，并存在明显的 GPU 和采样波动。同进程三轮关闭后的采样为 183.91、198.81、188.21 MB，未呈现单调增长；操作流程和采样时机有差异，不能作为严格的线性泄漏检验。额外一轮以空会话落盘被观察到的时刻为锚点，即时、30 秒、120 秒采样分别为 262.75、184.60、184.91 MB；此锚点包含设置持久化延迟，不等于最后一次点击时刻。**尚未确认真实泄漏，也未排除长期泄漏。** 不同场景和历史样本不能直接计算优化收益。

原生诊断确认：恢复 20 标签仅访问首篇时只创建 1 个 EditorView；全部访问后累计创建 20 个；全部关闭后实际销毁 20 个、存活 0 个，文件监测目录与订阅均归零。混合样本中的图片、代码块和表格 NodeView 也执行了销毁。销毁计数不等于对象已经 GC 或 WebKit/GPU 缓存已归还系统。

已访问的后台标签继续保留 EditorState 和撤销历史。ProseMirror 的状态可保留历史，但仅替换 Milkdown 的公共 view 引用不能转移其内部销毁所有权。有界 EditorView 驱逐、后台视图缓存和跨模式统一撤销尚未实现；没有稳定、安全的优化收益证据。没有通过清空撤销历史、丢弃未保存内容、关闭硬件加速或限制标签数量来降低数字。

## 尚未归因的问题

- 候选输入期间 Cmd+S/Cmd+Q 的 `s/q` 混入仍未解决。自带拼音的自动化逐键样本在段落、标题、代码块、表格单元格和 Source 中都观察到候选受影响；组合文本更新可先于带 meta 的命令 keydown。保存入口确实等待组合结束，但 Cmd+Q 的 DOM 事件到达不等于原生退出请求到达。
- 候选确认后立即保存、切换标签的样本通过了中文磁盘/重开核对；关闭窗口、中文确认后立即退出、最小化和应用切换的完整时序仍未验收。最小 WKWebView 对照未成功使用相同输入源，不能作为上游归因证据。**当前证据不足以归因到 Milo、WKWebView、macOS 输入法或自动化输入。** 保留现有输入逻辑，未通过屏蔽 `s/q` 绕过问题。
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
