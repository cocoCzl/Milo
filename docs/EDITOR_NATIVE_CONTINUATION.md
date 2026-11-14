# 原生续验：2026-11-14／15（未发布）

本记录接续 `92dfdeba7ceeb983925ff72077825c7399dddf81`，以本轮实际磁盘、窗口、进程与截图证据为准。直接在 `master`；起点工作区干净，未创建分支或 worktree，未推送、发布或访问真实用户文档。此前 [验收记录](EDITOR_ACCEPTANCE.md) 保留为历史，不能把旧包通过直接算作新路径验收。

## 环境与构建身份

Apple M4／16 GiB／arm64，macOS 27.2.1（26B131），Node 24.11.1，Rust 1.94.1。所有包均为 arm64 Release、独立标识、ad-hoc 签名，不是公开发行或 notarization 验证。

产物根目录 `R=/private/tmp/milo-native-continuation-20261114`。样本、隔离设置备份、截图、日志与包不提交。`R/build-identities.json` 从实际 Info.plist、可执行文件 SHA-256 与源码提交生成。

| 应用（均位于 R） | 源码 | features | 独立标识尾部 | 二进制 SHA-256 |
| --- | --- | --- | --- | --- |
| NativeTest-Milo.app | 5d0370c | diagnostics,native-test | nativecontinuation20261114 | 04c2b7b51f515c3684bc3660bc8f4b266bab68cc702d00d55090d6824077cbb4 |
| NormalRelease-Milo.app | 5d0370c | 无 | normalcontinuation20261114 | 992716e5cd3f89afff32936ce0f50bae0fa29201a767ee008990629f90887bb2 |
| AtomicProfile-Milo.app | c24d569 | diagnostics,native-test | nativecontinuation20261114 | f14051e72a798046056e2d730a8ca6fc2bb11779ef57dfe3a04c4a2740f6f934 |
| NarrowAcceptance-Milo.app | bb70947 | diagnostics | narrowcontinuation20261115 | bf21e3aff99662f34006aecf23c66e5016709a6c72376ca05e816fbcf8235869 |
| **NormalFinal-Milo.app** | **bb709470fbfd478e7c05bfd2f49dd56d5a450384** | **无** | **normalfinal20261115** | **31efff2f5ca67cece87e512a81c12dc1ddb8b5995fe9653b16512d0efc92d760** |

标识前缀均为 `io.github.milo.`。同标识的新诊断包在旧包退出后启动，不并行使用同一设置。NarrowAcceptance 仅构建配置覆盖初始窗口为 720×520，没有改变产品窗口配置。最终正常包未压缩普通文件合计 12,489,439 bytes；不是 DMG 或运行内存。最终包 `codesign --verify --deep --strict` 通过。

本轮三个代码提交依次是：`5d0370ceb7c40cb15cac7f21a03a868c9859fdde`（测试暂停门）、`c24d56915dec819c1833f272e163446f778d2470`（诊断并发写入）、`bb709470fbfd478e7c05bfd2f49dd56d5a450384`（大纲）。后两项未改变保存／输入边界，因此准确引用前包已验保存用例；最终包重新验收受大纲修改影响的布局，并增加正常构建 IME 与资源复核。此后的文档提交不改变包内产品代码。

## 保存重叠、失败重试与异常恢复

暂停门仅在显式 `native-test` feature 且编译期 `MILO_NATIVE_TEST_DIR` 指向 `/private/tmp` 的目录时存在。在 Documents 顺序 worker 内、取得 scope 后、完整安全保存事务前等待；不阻塞 UI，不拆分真实保存事务。消费一次 `arm-save` 后写入含 PID/token 的 `save-waiting.json`，仅对应 `release-TOKEN` 释放，300 秒未释放返回错误且不写入。这是**可控事务前暂停**，不是物理磁盘速度或慢文件系统的测量；默认发行包无法启用。

以下为 NativeTest 原生 UI 操作，依据 gate 状态确认重叠而非固定等待；每次比较实际磁盘，关闭重开核对正文与 Front Matter。

| 用例 | 结果／核对 |
| --- | --- |
| Source 保存 A 时继续修改 FM／正文为 B，并切到另一标签 | 通过。A 暂停时磁盘旧版本，另一篇不变；释放 A 后磁盘 A，内存 B 仍未保存；B 新 token 等待，释放后磁盘完整 B。旧完成没有把 B 标记已保存。 |
| B 保存中关闭标签 | 通过。关闭框保存／放弃禁用，允许继续编辑；释放后保存关闭、重开为 B。 |
| WYSIWYG 保存 C 时输入 D、关闭窗口 | 通过。等待时关闭动作禁用；释放后取消关闭再保存，FM 与 C+D 落盘一致。 |
| Source 保存 E 时改 F、请求退出 | 通过。等待时关闭动作禁用；释放后最终 F 落盘、保存关闭退出；重启整文件 F。 |
| 无外改的保存失败与重试 | 通过。chmod 0444 实际拒绝写入，磁盘 F、内存 G 和错误保留；仅恢复 0644 权限，没有改正文，Retry 后完整 G，错误清除，关闭重开一致。 |
| 两个未命名草稿异常终止 | 通过。Edit 草稿 H、含 FM/raw HTML 的 Source 草稿 I 生成独立恢复副本；核对 PID 39607 的完整专用包路径后仅 SIGKILL 该进程。重启分别恢复，Source 语法保护保留；明确放弃后恢复目录为空。未覆盖未确认 IME 的崩溃恢复。 |

证据：`slow-overlap-A-B.png`、`crash-drafts-before.json`、`terminated-test-pid.json`、`crash-source-restored.png`。只操作专用包，没有 killall。上述测试没有发现新的旧 revision 覆盖或正文归属回归；这不是所有关闭排列、真实慢盘／拔盘或所有别名文件身份的穷尽证明。此前的另存为、外部修改／明确覆盖、Finder 用例仍按原记录的准确构建引用。

## 真实 IME：方法、通过范围与异常

使用 CUA `App.pressKey` 逐键 `n i h a o`（每键 durationMs 100），不是 paste、typeText、setValue 或模拟 composition。只读查询系统输入源：`com.apple.keylayout.PinyinKeyboard`，selected `com.apple.inputmethod.SCIM.ITABC`。编辑位置先点击或 `selectText(..., cursor_after)` 确认；截图观察划线 `ni hao`，Space 后转为 `你好`。没有捕获独立候选列表面板，不能宣称看到了候选列表；依据是系统拼音源、逐键划线组合态及确认后的中文转换。工具没有公开 macOS raw keydown/up 或发键底层实现，`isTrusted` 不是独立通过标准。

TextEdit 对照使用自建未保存空白文档：同一逐键方法、不同持续时间、坐标激活与输入源切换核实后，出现 Latin／英文自动更正，Space 为 `Nihao `或 `Zhongwen `；没有建立可靠的对照成功。因此不能据此将下述异常归因 Milo。未修改或保存真实 TextEdit 文档。

| 位置／操作 | 结果与对应包 |
| --- | --- |
| 普通段落、确认后连续 Cmd+S | NormalRelease 通过两轮，磁盘 `你好中文`，重开核对。 |
| Source 区域、确认后连续 Cmd+S | NormalRelease 通过，整文件磁盘与重开中文一致。 |
| 标题／代码块／空表格单元格／已有内容单元格 | AtomicProfile 分别独立样本通过：Heading你好、围栏内你好、空单元格你好、Existing你好；均保存并关闭重开。 |
| 查找、替换、快速打开输入框 | 分别确认中文；查找／替换未执行正文替换，快速打开 Escape 恢复正文焦点。不是候选中所有 Enter/Escape 的穷尽矩阵。 |
| 连续输入后撤销／重做／保存 | AtomicProfile 独立样本通过，磁盘依次为原样、你好。 |
| 确认后立即切标签 | AtomicProfile 连续 Space→点击另一标签，已核对活动标签；返回后保存与磁盘正确。切走后的首次读盘仍旧，因此没有签收后台自动保存时限。 |
| 确认后立即 Cmd+Q | **NormalFinal 通过**。预先保存组合态证据；连续 Space→Cmd+Q，中间无截图／AX；出现可保存的退出框，保存关闭，进程 47367 及其 47373/374/375 WebKit 均消失；磁盘 `Confirmed:你好`，重启显示相同且已保存。 |
| 确认后立即原生关闭窗口 | NormalFinal 第二次尝试：通过明确 cursor_after 定位后连续 Space→关闭按钮，提示可保存，磁盘／随后窗口内容为 `Confirmed:你好`。工具读取再次得到可见窗口，无法独立证明窗口保持隐藏，故窗口过渡部分不签收。 |
| 确认后立即最小化 | NormalFinal 连续 Space→原生最小化按钮，磁盘／关闭重开为 `Confirmed:你好`；工具随后仍返回窗口截图，实际最小化／恢复过渡未被独立确认，部分完成。 |
| 确认后切换应用 | AtomicProfile 向 TextEdit 坐标点击后 noWindowsAvailable；磁盘中文正确，但未独立确认前台切换，部分完成。 |

**未通过、未归因的观察保留：**

- 候选中 Cmd+S 使划线拼音追加 `s`；普通查找 input 也复现，超出 ProseMirror 范围。候选中 Cmd+Q 追加 `q`，未看到退出请求。不能当作保存／退出请求已送达，亦不能直接称工具或产品缺陷。
- 候选中点关闭标签会弹出关闭框；取消后 Latin `nihao` 出现并随后保存。该样本不能证明候选保护通过；失焦提交语义仍需定位。
- NormalFinal 首次关闭窗口尝试截图为 `ni haoConfirmed:`，不是中文确认成功；保存关闭持续禁用，取消后 UI 仍“即将保存”，Escape／导航未建立稳定状态，磁盘保持原始文本。已保留 AX／截图并明确放弃**该可丢弃样本**。第二次用明确选区位置成功，不抹去首次异常；不能按等待时长擅自解除组合保护。
- Source 候选中保存／关闭／退出、每种工具输入框候选操作、可靠最小化／切应用时序尚未完整执行。没有将少量成功扩大为真实 IME 全部通过。

截图包括 `milo-pinyin-preedit.png`、`ime-*.png`、`normal-ime-source.png`、`normal-ime-find-replace.png`、`normal-final-quit-preedit.png`、`normal-final-confirmed-quit-dialog.png`、`normal-final-confirmed-quit-reopened.png`、`normal-final-immediate-close-observation.png`、`normal-final-close-retry-preedit.png`、`normal-final-confirmed-close-reopened.png`、`normal-final-minimize-preedit.png` 与 `normal-final-minimize-after.png`，均为**实际原生应用**截图。Latin 异常不是通过截图。

## Dock 与自动化边界

CUA 支持应用截图、AX、坐标／元素点击、组合键、文本选择和 getApp。`typeCharacters` 仅 Linux，`computer.launch_app` 在本运行时不可调用。没有文档化的全桌面截图接口。多次取得 `com.apple.dock` 超时，inventory 无可操作 Dock；应用截图不能可靠定位 Dock 图标，未盲点。**实际 Dock 点击为工具阻塞／未验证**，未用 Finder 或 getApp 唤起替代。

本轮没有明确的辅助功能／屏幕录制权限拒绝，因此不要求用户盲目授予权限。超时、cgWindowNotFound、noWindowsAvailable 或工具耗时不作为应用响应性能。不要求用户接手整套验收；后续需要能暴露 Dock／窗口过渡或可靠组合键投递的工具路径，再由代理续验。

## 独立 1／5／10／20 标签矩阵

NativeTest 每轮退出并重置**隔离**会话，使用可重复生成的小混排样本（初始 93 B，后附唯一 ASCII 修订）。每轮只恢复、逐个访问、逐个 ASCII 编辑／Cmd+S 并逐篇读盘、切回首篇、逐个关闭；5／10／20 另从 Home 重开首篇，1 标签未单列重开记录。中文 IME 不作为此矩阵前提。

下表 footprint 是 Milo＋仅属于该轮的 GPU／WebContent／Networking 逐进程 physical footprint 合计 bytes，**未共享页去重**。RSS 在原始 ps 中单列 KiB。通过启动前后进程差集及共同退出识别关联 WebKit，不把所有系统 WebKit 相加。

| 标签 | 恢复 footprint B | 访问 footprint B | 编辑 footprint B | 全关闭 footprint B | 恢复→访问→关闭 view / DOM |
| --- | ---: | ---: | ---: | ---: | --- |
| 1 | 189,484,296 | 同恢复 | 185,879,816 | 120,229,128 | 1/460 → 1/460 → 0/251 |
| 5 | 187,010,576 | 195,923,472 | 199,675,456 | 128,355,928 | 1/528 → 5/648 → 0/303 |
| 10 | 196,545,848 | 202,952,088 | 206,556,592 | 139,464,088 | 1/655 → 10/873 → 0/368 |
| 20 | 204,197,344 | 219,205,112 | 222,629,392 | 143,494,624 | 1/870 → 20/1193 → 0/368 |

所有打开阶段 visibleView=1，语言菜单=0、图片=0；关闭 view=0。20 标签编辑后无 AX／截图、每 10 秒外部采样四值：222,662,160、222,727,696、222,793,232、222,858,768 B，超过未放宽的 200 MB 预算。CPU 为 ps 点值，不能替代完整空闲窗口统计。序列化次数分别 1／5／10／20，总耗时 2／8／15／22 ms；保存 IPC 次数相同，总耗时 41／208／413／805 ms；不能解释为原生事务或输入百分位。

证据：`matrix-memory.jsonl`、逐阶段 footprint/ps、`verified-metrics-summary.json`。临时 helper 的闭包把 10／20 事件写进 `matrix-5-events.json`，内含 n=5 不可靠；已按准确 PID 42037／42631、时间戳与 snapshot 交叉重新归属，原始文件保留。PID 40600 的五标签窗口不可用／空白尝试单列排除，使用重新启动 PID 41917 的有效实验。

### 正常 Release 复核

NormalFinal 无 diagnostics／native-test，独立设置恢复已有可丢弃 20 个样本，样本包含上一轮唯一编辑标记，未重写文件。PID 47854＋新出现的 47856／47857／47858 三个 WebKit：仅恢复 212,651,488 B，逐个访问 228,019,728 B；无 AX／截图 23 秒后 227,921,424 B。随后 48 秒点为 246,173,200 B，但该点与前端单元测试重叠，**不用于安静空闲预算／CPU 判断**。仍可确认正常包的 20 标签高占用并非诊断功能独有。未将不同源码、标记长度、观测负荷的两轮相减宣传优化收益。

随后切回首篇、关闭全部 20 篇回 Home，footprint 160,452,088 B，约 168 秒后 160,402,936 B；之后从 Home 成功重开首篇。`normal-final-twenty-visits.json` 与 AX 记录确认操作；没有在此正常包重复全部 20 篇编辑，逐篇落盘证据来自上表诊断包。采样时旧隔离 AtomicProfile 进程仍驻留，但已在启动前差集中排除，不计入这四个进程；这不是清空其他负载的独占机器实验。NormalFinal 最后经原生菜单退出，AtomicProfile 仍保留供排查，不是正式 Milo。正常包另一轮 IME／大纲测试后的 Home 两点为 149,196,400／149,212,784 B（间隔 21 秒），不是干净冷启动基线。更早 102,059,440 B 的样本与打开操作时间边界不够明确，不用于 Home 预算。

### 长文档反复开关

NativeTest 同一 PID 42631，普通 1 MB（1,001,442 B）五轮打开→真实 x→撤销→Cmd+S→关闭，每轮磁盘 SHA-256 保持 `396e5b6b7e020aee53bc5022390d1228a3396b9de99373606309fc27438d7ff0`。

- 打开至布局标记 ms：278、280、274、280、270；读取恢复＋IPC 10–20，安全检查 108–120，Milkdown 100–110。不是 Finder 冷启动或首次实际可输入，不能签收完整打开预算。
- key-to-model 标记 ms：2、2、2、2、2。每轮打开后一次 AX，然后连续发键；按键到模型之间无 AX。仅五个原始样本，不报告 P50/P95，不等同像素显示响应。
- 五轮关闭 footprint B：172,445,512、179,883,848、319,835,976、440,242,112、187,109,312。自然回落但不能据此证明长期稳定；RSS 仍可较高（最后 593,104 KiB）。WebContent 类别报告 footprint 120,145,216 B、可回收 456,572,928 B，其中 WebKit Malloc 311,361,536、graphics 142,278,656。不能把 RSS、可回收页与 footprint 混算或单凭单次峰值宣称泄漏。

没有匹配的优化前原生基线，不报告速度／内存改善百分比；冷启动五样本、实际首次输入、像素响应、输入 P50/P95、全局监听器数、正常最终包 1 MB 重复采样仍未测量。此轮未新增标题／代码／表格／图片大型矩阵，准确沿用历史诊断包数据，不能称最终包全部性能通过。后台 view 仍有 20 个，未启用破坏撤销的驱逐策略；安全 attach/detach 的具体 Milkdown 所有权阻塞见历史验收记录。

## 修复及回归

1. **诊断 JSONL 并发交错。** 五行旧日志损坏（205、206、325、326、327），源于多次 append 写入被 worker 交错。先复现红测试，再改为整行序列化、进程内 Mutex 保护 append；8×80 条并发回归验证完整唯一。旧文件不修补，569 条有效记录和坏行审计分别保留；c24d569 PID 44251 的 122 条新记录验证无新增坏行（`final-profile-audit.json`）。正常无 diagnostics 路径不变。
2. **短文档大纲误选 Last。** 原生截图 Root 正文在顶部却高亮 Last；全文适配视口时剩余滚动距离也是零，被误判文末。现在仅实际 scrollTop>0 才用文末容差。新增两个单元回归及 Chromium／WebKit 100%／140% 场景：焦点 Last、当前位置 Root、正文 scrollTop=0、零写入。未删除原断言或增加任意等待。
3. **原生大纲键盘。** 最终 NarrowAcceptance 720×520、UI 140%／正文 100%：关闭→Root 折叠→Root→Child 折叠→Child→Grandchild→Sibling→Last；折叠 Root 后跳过隐藏后代，Shift+Tab 返回，Escape 关闭恢复触发按钮。NormalFinal 原生 Root 高亮及 Last 键盘焦点分离，正文不修改。不是 fullscreen／所有窗口状态的全矩阵。

对应实际原生截图：`native-minimum-140-outline.png`、`native-minimum-140-restored-focus.png`、`normal-final-outline-top.png`、`normal-final-outline-top-last-focus.png`；焦点记录 `outline-minimum-140-focus.json`。`chromium-outline-final/` 与 `webkit-outline-final/` 内截图是**浏览器＋模拟 IPC**，不得冒充原生。

## 质量检查与下一步边界

- `npm run format:check`、`npm run typecheck`、`npm run lint -- --max-warnings=0`、`npm test`、`npm run build` 通过；最终单元测试 **49 文件／447 项**，`unit-final.log` 留档。
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`、默认 Clippy `--all-targets --locked -- -D warnings`、默认 Rust tests **42** 通过；native-test **43**，diagnostics＋native-test **44**；组合 Clippy 通过。原安全保存 F1–F7 未移除。
- Chromium 与 WebKit 各 **54 Home 几何／18 Outline 布局及完整交互**通过，新增短文档断言均执行。WebKit 复用已安装的 `PLAYWRIGHT_BROWSERS_PATH=/private/tmp/milo-optimization/playwright`，首次默认缓存缺失是环境失败，成功日志另存，没有跳过用例。
- 最终正常 Release 与诊断 Release 均构建成功；原生实际操作和证据如上，没有“构建通过即原生全通过”的结论。

仍需代理后续定位：组合中快捷键追加 Latin／失焦提交、窗口最小化和前台切换的独立观察、Dock 可访问路径；真实慢文件系统故障、正常包低干扰启动／显示响应重复测量、20 标签保留成本及更长重复周期。源码统一跨模型撤销、有界 view 缓存与后台图片暂停仍未实现；本轮未扩展新功能。

目前不需要用户授予权限或接手整个矩阵。若现有桌面接口维持这些边界，对应项保持“工具阻塞／未验证”；不会用粘贴、固定等待、命令行激活或清空历史伪造通过。
