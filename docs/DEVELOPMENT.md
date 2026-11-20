# 开发指南

Milo 使用 React、TypeScript、Milkdown/ProseMirror 和 Tauri/Rust。领域术语、文件语义、隐私及安全保存契约见根目录 [CONTEXT.md](../CONTEXT.md)；当前用户限制见[已知问题](KNOWN_ISSUES.md)。

## 环境与启动

需要 macOS、Node.js 24、稳定版 Rust、Xcode Command Line Tools；发布构建另需两个 macOS Rust target。按锁文件安装，不在无关任务中升级依赖。

```sh
npm ci
npm run tauri -- dev
```

只运行前端时使用 `npm run dev -- --host 127.0.0.1`。浏览器没有原生文件系统 IPC，相关验证必须使用现有模拟 harness，不能作为桌面应用的保存验收。

## 检查

在仓库根目录运行；CI 定义以 [.github/workflows/ci.yml](../.github/workflows/ci.yml) 为准。

```sh
npm run format:check
npm run typecheck
npm run lint -- --max-warnings=0
npm test
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --locked -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --locked
npm run tauri -- build --debug
```

Markdown 被全仓 Prettier 配置排除，修改文档时显式检查，例如 `npx prettier --check --ignore-path /dev/null README.md README.zh-CN.md CONTEXT.md 'docs/*.md'`。测试 fixture 的精确文本仍应保持不变。默认测试并发失败与低并发重跑须分别记录，不放宽断言或随意延长超时来掩盖问题。

浏览器回归需先安装锁定版本的 Playwright 浏览器，再在另一终端保持开发服务器运行：

```sh
npx playwright install --with-deps chromium webkit
npm run dev -- --host 127.0.0.1
```

在测试终端运行：

```sh
MILO_OUTLINE_ARTIFACTS=/private/tmp/milo-browser-check npm run test:browser
MILO_OUTLINE_ARTIFACTS=/private/tmp/milo-browser-check-webkit MILO_BROWSER=webkit npm run test:browser
```

其余交互脚本按受影响功能选择，名称与 CI 保持一致。`tests/fixtures/outline-long.md` 和源码内 fixtures 是合成回归材料，应保留。`npm run test:performance` 提供浏览器开发样本，不是原生性能预算签核。

## 编辑与交互约束

- 每个编辑回调、保存、监测事件及延迟任务都绑定原文档和版本；切标签不得改变旧任务目标。内容、修改状态、选区、滚动及浮层按标签隔离。当前已访问视图保留撤销和插件状态，不能用丢弃未保存内容、清空撤销或破坏选区来换取内存数字。
- Read 复用编辑视图并禁用修改；模式、主题和布局调整不得无故重建编辑器或写入 Markdown。无文档首页不创建假标签、编辑器、监测器或自动保存任务。
- 保存快照必须属于目标文档的稳定版本；退出等待组合输入、最新发布及写入完成，失败留在应用，取消可继续编辑。真实退出选择不能被后台保存代替；旧异步操作不能批准新请求。恢复副本不包含活跃组合输入，也不等于最终文件。
- 组合稳定要求在定时器采样机会中确认两次 DOM 与不可变编辑器状态稳定且 IME 不活跃，不能单靠原生 `hasMarkedText`、动画帧或经过固定时间放行。代码块保留稳定的内容 DOM；不得过滤命令字母、猜测汉字或自动替用户选择候选。临时组合 `<br>` 的处理不能删除真实硬换行；空单元格规范化仅作用于表格，默认表格对齐只居中呈现，不写入显式 center，与明确指定的左/中/右对齐保留区别。
- 标签激活恢复其模型选区和输入焦点，后台挂载不得抢焦点。浮层关闭先解除焦点陷阱，再恢复触发处选区；迟到回调不能覆盖新操作。输入法组合中的 Enter 不执行搜索打开或查找导航。上下文菜单固定操作目标，浮层 Esc 按层级处理。
- Quick Open 取消只影响当次请求，迟到结果不得激活标签、抢焦点或弹出错误。根扫描失败、部分目录不可读和原文件打开失败保持不同恢复语义；不完整搜索不宣称没有命中。
- 文档是主要视觉区域，窄窗和界面缩放后当前文件、保存状态及恢复操作仍可辨认。保留原生标题栏行为；共享主题变量、系统字体与控件规则，覆盖浅色、深色、暖色及系统外观，尊重减少动态效果。状态不用颜色单独表达，图标有名称，键盘焦点可见，标签和大纲支持顺序遍历。
- 保存错误保持可发现、可折叠且操作可达，不抢正文焦点或持续遮住光标；重试、另存为和原始详情保持层级。错误必须对应实际操作，不能把图片或重读失败误报为保存失败；退出选择中的错误就地显示。
- 正文保持单一滚动容器，大纲滚动独立；位置更新不依赖可能停滞的动画帧。未改变当前标题时保留手动浏览位置。选区工具条不得遮住选中文字或与块控件争抢显示。

## 原生验证与诊断

用可丢弃的合成文件和独立应用标识，不操作真实用户文档、既有会话或偏好。原生界面验证使用 Tauri 生成的 `.app`，保留应用名称、原生标题栏与图标；手工包装裸可执行文件不能验证 Dock 图标。测试后仅恢复测试自己修改的设置。

正常构建、显式 `diagnostics` 构建、浏览器模拟 IPC 与真人输入法结果分别标注。诊断默认关闭；输入文本只允许记录明确限定的隔离合成文件，日志可能改变竞态时序。失败定位需把退出请求、composition/input、文档/EditorState、快照版本、写入及批准退出关联起来；合成事件或单次诊断成功不能证明真人问题已修复，必要的原始失败证据保留在仓库外，不被后续成功覆盖。

已有工具接受显式路径，不默认扫描用户文件：

```sh
node scripts/summarize-native-profile.mjs /private/tmp/milo-profile.jsonl BUILD_ID
node scripts/sample-native-memory.mjs baseline /private/tmp/milo-memory-baseline.json
node scripts/sample-native-memory.mjs sample /private/tmp/milo-memory-baseline.json /private/tmp/Milo-validation.app /private/tmp/milo-memory-sample
```

内存 baseline 在启动隔离应用前采集；sample 只接受系统临时目录中明确指定的新进程 `.app`，进程归属有歧义时停止。比较使用相同构建配置、文件、访问顺序和静置时间，记录主进程及 WebKit 子进程，聚合 physical footprint 去重，不以进程 RSS 简单相加代替。没有完整输入终点或连续帧时，不推断首次可输入或无白屏。

截图、日志、原始采样、补丁、临时应用、内部报告和真实用户文件放在仓库外；现有 `.tmp/` 仅作为被忽略的临时输出。有效脚本、合成 fixture、产品资产与许可证保持在仓库中；忽略规则不能自动移除已跟踪内容。

正式打包、签名和发布授权见[发布指南](RELEASE.md)。
