# 输入边界与多标签内存续验（2026-11-15，未发布）

本轮从干净的 `master` / `9939a957e0d53ddd8efdf30df8650d363221c7ff` 开始，直接在主分支实施；没有分支、worktree、推送、发布或真实用户文档修改。接续 [上一轮原生记录](EDITOR_NATIVE_CONTINUATION.md)，旧包已验的保存事务重叠、失败重试、异常恢复不重复签收为新包全矩阵通过。

## 实现与构建身份

两个产品提交：

- `fb39f571ff8b4eeab2070ef5dbb140b604306f92`：输入结束后的状态恢复、取消关闭的源码焦点、显式输入追踪及回归。
- `c96808c01fcee4f9d074a1d34b144152724cb4e7`：同目录文件共享原生监测器、资源计数及回归。

环境为 Apple M4 / 16 GiB / Mac16,1，arm64，macOS 27.2.1（26B131），Node 24.11.1、Rust 1.94.1。无新增依赖。产物根目录 `R=/private/tmp/milo-input-memory-20261115`，包含临时包、隔离样本、设置、JSONL、footprint、AX记录及截图，不提交这些产物。所有包均为 arm64 Release、ad-hoc 签名，非发行安装或 notarization 验证。

| 包（位于 R） | 产品源码／构建 | 标识（前缀 io.github.milo.） | 可执行文件 SHA-256 |
| --- | --- | --- | --- |
| MemoryBefore-Milo.app | 9939a95；追踪调用在正常构建关闭；本轮恢复与 watcher 修改之前 | memory20261115 | 6d770c5999a6cc14a15355eafe8231e7c20db911d9295eb6eaff1b3ba3677bfa |
| InputTrace-Milo.app | 9939a95 加追踪；diagnostics | inputtrace20261115 | 37af1295418a957a7985e3a02ecb8cb51ca423823a59b6feb70d01e7ebf0b7e5 |
| MemoryAfter-Milo.app | c96808c；无 features、无输入追踪／profile | memory20261115 | 83c0bd4e054008eceb1c075c948f70584f40e14a6b71c94657b2058ede659a68 |
| InputFixed-Milo.app | c96808c；diagnostics，VITE_MILO_INPUT_TRACE=1、VITE_MILO_PROFILE=1 | inputfixed20261115 | b574bdb6ed4246a4d94ea4088ff90ce6843d952365961f0e4862d38eeb34f938 |

修复后的两个包均从上述干净提交构建，签名完整性校验通过。诊断内 build 字段为 `input-memory-fixed`，在此映射到 c96808c，不能当作另一个提交。早期追踪包的 `trace-source.diff` 只含 tracked diff，未包括新增追踪文件，**不是完整源码快照**；其二进制身份及事件证据保留，不声称这个 diff 能重建原包。正常前后包始终串行使用相同的专用标识，退出后才写测试设置。正常包文件大小约12.49 MB，不是 DMG 大小或运行内存。

## 单独问题：关闭取消后无法恢复保存

旧 NormalFinal 观察继续作为 **INPUT-STABLE-RECOVERY：原生未复现、根因未定** 跟踪，与候选中 s/q 异常分开。没有把它统一归为工具限制。

本轮旧逻辑追踪包的富文本样本实际经过 compositionstart/update → 点击关闭 → compositionend → ProseMirror composing=false → 应用 settled → 取消关闭 → 继续输入／保存。另一个样本得到 `你好` 并落盘。两次未重现永久等待。源码也收到 end/settled，保存恢复，但取消关闭后没有返回 textarea 焦点，明确复现了产品焦点错误。

代码与先红后绿测试确认两个可修复缺口：

1. 组合边界只在 DOM compositionend 后启动稳定采样。如果 ProseMirror 已结束自身组合而应用漏收 end，后续普通输入仍可能被旧 pending 标记阻塞。现在只在 **应用 pending、尚未进入结束采样、view.composing=false、明确非组合 input** 同时成立时重新进入既有稳定采样。源码 textarea 同样使用 `isComposing=false` 且非组合类型的 input 作为恢复证据。文档／DOM仍须稳定才发布；不因失焦、Escape、时间经过强制解除，不修改 PM 内部 composing，不模拟确认，不删除尾字。
2. 取消关闭原来只找 `.ProseMirror`，源码模式会尝试聚焦隐藏的富文本。现在按文档当前模式选择 textarea 或富文本，并在异步聚焦前重新检查标签存在且仍是活动标签。

回归覆盖：漏 end 且 PM 已结束后普通输入恢复；blur/Escape/组合类型输入不能解除保护；源码漏 end 的继续输入；取消关闭后源码焦点与原先等待的保存任务归属。jsdom 中 mousedown 所需的 elementFromPoint 在该用例局部提供并 finally 恢复。初次缺少此桩产生的未处理异常没有忽略，修正后完整套件无该异常。

修复包的真实原生回归（不是注入 composition）：

| 场景 | 核对与结果 |
| --- | --- |
| Source：逐键 nihao → 组合中点击关闭 → 继续编辑 | trace 有真实 start、insertCompositionText、end、settled；取消后 focusin 的目标为同文档 TEXTAREA。继续粘贴明确 ASCII 标记并 Cmd+S，磁盘包含它；关闭重开一致。通过焦点和恢复路径，**失焦提交的 ni hao 不是中文选词通过**。 |
| 富文本：逐键 nihao → 组合中点击关闭 → 继续编辑 | end 时 PM 状态及随后 settled 可核对，关闭框保存可用；取消后继续编辑、Cmd+S、磁盘与重开一致。未复现不可恢复等待。 |
| 普通查找输入框 | 组合有自身 DOM 事件，不把查找临时文本作为文档修改；保存命令可进入当前文档的稳定刷新。未观察到文档被旧查找组合锁住。候选快捷键异常另见下一节。 |
| 模拟漏 end | 单元回归通过；这是明确的状态分歧测试，**不是原生缺失 end 已复现或旧问题根因已证实**。 |

证据：`close-cancel-trace-before.json`、`trace-before-complete.jsonl`、`fixed-source-trace.json`、`fixed-profile-complete.jsonl`、`fixed-reopen.json`、`fixed-close-states.json`。原生截图 `fixed-source-preedit.png` 显示真实划线 preedit；它不能独自证明中文候选确认。对旧永久等待的后续重点是：若再出现，检查同一 panel/id/revision 上 DOM end、PM composing、应用 pending、close/waiter 是否分歧；已有有界追踪可供复核。

追踪仅显式编译开启：最多2048个内存事件、单调 performance.now、手动 Cmd+Alt+Shift+I 批量落盘，不逐键 IPC。不记录正文、输入数据、路径、选区或普通字符，仅控制键及带修饰的 s/q 命令名；记录焦点、组合／input 类型、修饰键、PM状态、session revision、保存等待和关闭状态。正常包无这些监听或记录。资源快照按 Cmd+Alt+Shift+D 获取；探针只在编辑器创建成功后注册并在清理时移除，不建立轮询。

## 候选中快捷键：新的归因证据与边界

支持的桌面接口只有整体 pressKey(key, durationMs)，没有独立 key-down/up 或系统输入事件观测；没有新的 Dock／最小化／前台切换可观察控制，本轮不重复这些受阻用例。

在普通查找 INPUT 中，逐键 nihao 后 `pressKey('super+s', {durationMs:100})` 得到 nihaos。追踪顺序（同一 performance 时间轴，ms）：

- 215448：compositionupdate、beforeinput(insertCompositionText, isComposing=true)；215449：input。
- 215456：keydown(s, meta=true, isComposing=true)。
- 215457：session:save，原文档 revision=0，wait-stable flushed=true。
- 215528：keyup(s, meta=true)。

因此“修饰键完全没送到 WebView”或“应用没收到保存命令”不能解释这次样本。导致 s 的组合更新先于 JS keydown／命令处理，且普通输入框也发生，证据把范围缩到自动化发键、macOS 输入与 WKWebView 上游衔接；**尚不能在三者中归因**。没有用它修改正常输入语义，未重复 Cmd+Q。TextEdit 旧校准不稳定的限制仍在，不声称对照通过。

## 同条件正常 Release 内存

复用合成中英样本：每篇93 B，1标题、4段落（含结构内）、2列表项、1引用、0代码／表格／图片；SHA-256 `8f209662b2d205e294cda382185ea8ad5a4194da8d44e88b1648e38186878282`。20份独立文件，不以字节数代替结构负载。每轮从相同初始文本、相同隔离设置、1280×820窗口、界面／正文100%、浅色、文件树可见开始；20篇恢复只初始化首篇，明确点击首标签使窗口激活后再测。不是将后台启动的低GPU样本与可见窗口相减。

前后包同一设备、构建条件、样本和操作：恢复 → 逐个访问 → 逐篇末尾粘贴 ASCII+n、点击保存 → 全部正常关闭 → 重开首篇。编辑结果20/20逐字节相同，见 `before-edited-disk.json` / `after-edited-disk.json`。每阶段至少30秒无AX、截图、构建、前端测试或其他本轮测试工作后采样；不终止用户其他应用。采样之前已退出不需要的专用诊断包、停止旧测试服务。

进程识别：记录启动前全体PID；精确 app 可执行路径对应 Milo，加此次新出现的 WebContent/GPU/Networking 各一个（断言总计4）。保存逐阶段PID/ps/footprint JSON。此方法依赖本轮无其他同时新启 WebKit 应用，不能普遍当作父子关系识别器。

下表单位为十进制 MB。逐进程为工具报告的 physical footprint；“工具总计”原样取 `footprint -p ... --noCategories -f bytes -j` 的 total footprint。它与逐进程之和存在262,144 B的工具聚合差值，未自行解释为某类共享页或手工重算。RSS（KiB）、reclaimable、wired、clean另外留档，不混算。每格只有一次样本，无显著性／百分位结论。

| 构建／阶段 | Milo | WebContent | GPU | Networking | 工具总计 |
| --- | ---: | ---: | ---: | ---: | ---: |
| before / home | 30.97 | 49.60 | 13.14 | 5.95 | 99.39 |
| before / single | 34.10 | 80.40 | 71.04 | 5.90 | 191.17 |
| before / restored20-controlled | 35.14 | 101.02 | 71.14 | 5.69 | 212.73 |
| before / visited20-controlled | 32.75 | 120.96 | 71.78 | 5.69 | 230.92 |
| before / edited20-controlled | 33.79 | 122.70 | 73.01 | 5.65 | 234.88 |
| before / closed20-controlled | 32.72 | 93.73 | 15.86 | 5.65 | 147.71 |
| after / home | 32.70 | 50.35 | 13.88 | 5.73 | 102.40 |
| after / single | 34.06 | 85.85 | 71.66 | 5.65 | 196.97 |
| after / restored20-controlled | 34.51 | 102.09 | 71.63 | 5.69 | 213.65 |
| after / visited20-controlled | 31.69 | 120.57 | 72.47 | 5.69 | 230.15 |
| after / edited20-controlled | 32.39 | 122.39 | 73.66 | 5.64 | 233.82 |
| after / closed20-controlled | 32.00 | 94.19 | 16.63 | 5.65 | 148.21 |
| after / single-1mb | 39.68 | 156.01 | 73.96 | 5.72 | 275.11 |

早期 `before/restored20` 未激活窗口，不能与可见场景比较。早期 `before/edited20` 因输入源影响，20篇未得到预期ASCII标记，明确作废（249.76 MB不作为前测）；原文件副本及原始JSON仍保留。有效对照为后缀 controlled 的重跑。Home/single是独立较早的前测与后测，只作绝对观察；20篇对照为重新启动的独立会话。after 关闭前额外切回首篇核对内容，关闭后的极小差异不可宣传为改善或回归。

### 已实现的资源优化及收益

原来每个文件建立一个 plugin:fs watch，notify debouncer／FSEvents资源随标签增加。现在按 canonical 文件父目录共享一个非递归 watch，按事件路径分发给精确文件订阅；目录本身事件通知相关订阅，避免漏掉目录删除／rename。并发注册共享初始化Promise，初始化失败可重新订阅，最后一个订阅才释放，停止幂等。同路径多个订阅独立管理，不拓宽授权或扫描范围。

原生20篇访问阶段 Milo线程数 **57 → 20**（包含UI／worker等，不把全部线程都称监测器）。同条件工具总计 **230.92 → 230.15 MB**，编辑后 **234.88 → 233.82 MB**，差异小于约1.1 MB，单轮不能宣称稳定内存改善；原生Milo进程节约约1 MB，其他进程有波动。仍未达到不变的200 MB预算。

共享监测器原生回归通过：非活动文件外部更新后切回重载；dirty时冲突暂停保存、保留本地、显式覆盖后核对实际磁盘；关闭一个订阅后同目录其他文件继续更新；所有关闭后资源归零。首次磁盘断言未考虑 Milkdown 对 `_` 的既有反斜线转义，按语义文本核对后通过，不把它记作内容丢失，也不宣称WYSIWYG字节保真。

### 成本分解与仍未实现的能力

诊断包同样20篇（此处是已保存ASCII样本，不用于正常包内存相减）：

| 阶段 | 视图 | DOM元素 | 插件实例 | undo/redo深度总和 | 序列化缓存字符 / 初始字符 | 目录watch / 订阅 |
| --- | ---: | ---: | ---: | --- | --- | --- |
| 恢复后手动快照 | 1 | 628 | 20 | 0 / 0 | 0 / 72 | 1 / 20 |
| 逐个访问 | 20 | 1098 | 400 | 0 / 0 | 0 / 1451 | 1 / 20 |
| 逐个编辑 | 20 | 1094 | 400 | 20 / 0 | 1642 / 1451 | 1 / 20 |
| 全部关闭 | 0 | 442 | 0 | 0 / 0 | 0 / 0 | 0 / 0 |

所有阶段图片与语言菜单为零，故不能把当前样本的成本归于图片解码或菜单。插件数含诊断插件，不等于独立堆内存大小；undoDepth不是历史字节数，DOM计数也不是全局监听器计数。诊断中20次编辑序列化总33 ms、保存IPC总786 ms，仅为定位数据，不替代正常包耗时或原生事务。

已观察到的主要组成：可见编辑场景GPU约71–74 MB，Home约13–17 MB；20只恢复1view已经约213 MB。逐个访问增加约16–18 MB、主要在WebContent；逐篇小修改再增加约4 MB。缓存文本只有几千字符，不足以解释总量，未取得EditorState／历史的精确heap字节归属。关闭后视图与订阅归零，但WebContent保留约94 MB；单个关闭点不能证明泄漏或长期稳定。

**有界视图缓存、后台图片暂停和统一跨模式撤销尚未实现。** 本轮没有为了数字清空历史、重读磁盘或销毁组合中的编辑器。20view并非全部超额来源，单纯驱逐19view不应承诺达标。仍需继续对可见窗口图形资源、WebContent堆／缓存做更细归属与受控实验。

Milkdown 7.22.1的具体所有权约束：`core/src/internal-plugin/editor-view.ts` 创建的局部 view被插件cleanup闭包持有，cleanup调用该实例destroy；MILKDOWN_VIEW_CLEAR 的plugin view还操作原始root/container。只换 editorViewCtx不能移交销毁所有权。应用 publish/输入边界/图片异步回调等又按ctx取得当前view。安全attach/detach需同时定义ctx状态、容器、插件view、异步事务／保存flush和销毁边界；把空state塞入现有view也会触发plugin view销毁，不能直接签收为安全停车。本轮未实施高风险替代方案，原生切回后内容、撤销/重做、保存及关闭均保留；视图驱逐后的选择/滚动/IME全套验收尚无实现可验。

## 有限长文与启动验证

正常包打开普通1 MB样本（1,001,442 B，复用生成器manifest），通过文件树进入富文本、实际粘贴 NATIVE1MB、Cmd+S、磁盘标记、撤销及再次保存。最终SHA恢复 `396e5b6b7e020aee53bc5022390d1228a3396b9de99373606309fc27438d7ff0`。独立重启仅此长文的内存如上表，属于正常Release绝对数据。

正常Home启动、会话恢复、文档打开均实际执行，但 **进程启动→首个可输入、首次真实输入时间、按键→模型、像素显示响应、1 MB打开延迟及P50/P95未测量**。当前CUA启动／AX读回包含工具等待，没有独立的正常包阶段标记或显示采样；不能用7–10秒的工具往返、layout标记或诊断旧数据填充这些指标。没有取得五次冷启动中位数，启动／打开预算仍未验收。“冷”未清OS文件缓存，不能称真正冷缓存实验。

1 MB交互前读取一次大AX树约59万字符，未在连续输入／保存之间读取；安静内存前亦停止读取至少30秒。不是低干扰输入时延测量。系统Open对话框在选择本轮1 MB副本后按钮持续disabled，路径与截图已核对，改从已授权测试树打开；未修改文件筛选或把这一未归因观察隐藏为成功。未复现到可判断是原生对话框、控制焦点还是产品过滤问题，留作独立续查。

## 最终检查、清理与待办

- Prettier、TypeScript、ESLint零警告、前端生产构建通过；完整Vitest **50文件／453项**通过（`unit-final.log`）。新增状态／session与watcher测试均先观察失败再修复；未删测试或扩大超时。
- Rust fmt、默认全target Clippy（locked，-D warnings）、默认Rust **42项**通过；Rust产品代码未改，未重复故障注入矩阵。
- Chromium和WebKit现有写作工具回归均通过：三主题、界面高缩放、链接返回、替换保存、源码未改切换／保护保存、快速打开。为**浏览器＋模拟IPC**，不是原生IME。Chromium指定缓存缺失是首次环境失败，改用已安装默认缓存通过，失败日志保留；临时Vite首次沙箱监听EPERM，经授权只绑定127.0.0.1后通过。
- 正常与diagnostics Release构建、两个修复包签名校验通过。未做Universal／DMG／发布验证。
- 本轮应用经原生菜单正常退出；路径/PID核对后归档日志。旧临时Vite45409、本轮Vite56153仅在核对精确路径后SIGTERM，未使用killall，不关闭真实Milo或其他用户应用。隔离产物保留供复核，未清理真实资源。

仍为产品待办：旧INPUT-STABLE-RECOVERY原生根因；20标签／1 MB内存预算；细分堆与图形成本；安全有界view策略；源码统一撤销。仍为测量／工具边界：正常包启动和输入／显示时延；候选快捷键上游归因；独立Dock、最小化与切应用观察。没有发现必须让用户授权的新系统权限，**本轮无需用户操作**，也不把未解决项标为通过或要求用户接手整套矩阵。

原生截图：`R/fixed-source-preedit.png`、`R/diagnostic-twenty-tabs.png`；浏览器截图：`R/{chromium,webkit}-writing/tools-*.png`。均标明来源，无新UI重构。记录与KNOWN_ISSUES及实现说明同步；未完成能力不因已记录而算完成。需要回退时在保留后续工作、确认干净工作区后按 `git revert c96808c`、`git revert fb39f57` 顺序创建反向提交，勿reset／重写历史；文档提交可单独反向处理。
