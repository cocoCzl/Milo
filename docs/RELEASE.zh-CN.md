# Milo macOS 发布说明

[English](RELEASE.md) | [简体中文](RELEASE.zh-CN.md)

## 当前政策

**0.3.0 是首个公开测试版**，通过 GitHub Pre-release 分发 GPL-3.0 源码和 Universal DMG。要求 macOS 13+，同时包含 arm64 与 x86_64。应用 identifier 保持 `io.github.milo.editor`。

明确采用 **ad-hoc 签名**（`signingIdentity: "-"`），没有 Developer ID 身份签名，也不进行 Apple 公证。不需要购买 Apple Developer 会员、提供 Apple 账号凭据、证书或相关 Secrets。不得在正式签名或公证失败后静默降级成此模式。

## 构建与自动门禁

执行 `.github/workflows/ci.yml` 中已有检查：`npm ci`、格式、TypeScript、前端测试、零警告 lint、生产构建、rustfmt、零警告 Clippy、锁定依赖的 Rust 测试与 macOS Debug 包构建。此次准备不升级依赖。

提交源码，记录完整提交号，从干净的源码提交构建：

```sh
node scripts/check-release-version.mjs v0.3.0
./scripts/build-macos-universal.sh
```

脚本清理旧打包输出、按 lockfile 安装 npm 依赖、确保两个 Rust target 存在、使用 Cargo lockfile 构建，并验证最终 DMG。它清除继承的 Apple 签名及公证凭据，明确选择 ad-hoc。产物：

- `src-tauri/target/universal-apple-darwin/release/bundle/dmg/Milo_0.3.0_universal.dmg`
- 同目录 `Milo_0.3.0_universal.dmg.sha256`，使用相对文件名，可直接执行 `shasum -a 256 -c`。

验证脚本检查磁盘映像、只读挂载，核对包内两个版本字段、identifier、plist 和两个 Mach-O 架构的 macOS 13.0 最低要求、架构、签名以及 100 MiB 体积上限。全部成功后才生成校验文件。

| 检查 | 本次测试版的含义 |
| --- | --- |
| `codesign --verify --deep --strict --all-architectures` | 必须通过，证明 ad-hoc 签名完整性，不证明发布者身份 |
| `codesign -d --verbose=4 --arch …` | 两个架构均须为 `Signature=adhoc`，无 TeamIdentifier、无 Developer ID 身份 |
| Apple 公证和票据 | 未执行，不得声称已公证或 Apple 认证 |
| `spctl --assess --type execute` | 预期策略拒绝（退出码 3），如实记录，不算信任通过；其他工具错误阻止验证 |

签名损坏、架构缺失、版本错误、最低系统要求异常或映像异常仍阻止打包。生成 DMG 和校验文件后不再修改或重签包内应用。

## 候选包验收与边界

挂载或安装最终 DMG，启动其中确切的应用，开关偏好设置并修改后恢复一个偏好，编辑保存临时文档，关闭重开并核对磁盘内容。没有新失败时，不重复历史多轮偏好设置排查。

实机范围为 Apple Silicon（arm64）/ macOS 27.0.1（26A434）；Intel 和 macOS 13–26 未实机覆盖。公开发布前：

1. 在可丢弃的已保存文档中使用真实中文输入法确认候选词，分别验证自动保存、立即切换应用、最小化恢复、Command-S、正常关闭／退出，再重开对比磁盘文字。粘贴和合成事件不计入输入法验收。
2. 用真实浏览器下载最终附件，确认 DMG 带 `com.apple.quarantine`，核对哈希，拖到“应用程序”、推出映像并检查真实首次打开提示。优先按 Apple 的“隐私与安全性 → 仍要打开”操作，依据实际结果修正文档。本地直接启动或手动添加隔离属性不能代替。草稿附件的下载、哈希和隔离属性已核对；覆盖设备上的手动安装、系统允许和首次打开由维护者确认，未独立记录每个提示的准确措辞。
3. 在 16 GB Apple Silicon Mac、正常前台且无 profiler 的会话中记录性能：五次冷启动至文档可编辑的中位数 ≤1.5 秒；五次打开约 1 MB 文档中位数 ≤1 秒；空闲 30 秒后占用 ≤200 MB。主机或操作能力不能可靠测量时明确保留缺口，不声称通过。确认 Mermaid、KaTeX、Shiki 未进入初始生产模块图。包体积由脚本检查。

当前问题见[已知问题](KNOWN_ISSUES.md)，草稿正文使用[简洁中英文发布说明](RELEASE_NOTES_0.3.0.md)。公开发布前根据实际结果更新待验证状态。

## 0.3.0 实际草稿候选 — 2026-10-24

- 源码／tag：`v0.3.0` → `797035ab4d9305a1989134854b0d9cd3f0820a35`。[草稿](https://github.com/cocoCzl/Milo/releases/tag/untagged-c8ce94d17f7237023627)保持 Draft + Pre-release，不作为 Latest。
- 成功的 [Release 运行](https://github.com/cocoCzl/Milo/actions/runs/40093107626)使用工作流提交 `6bba1d5` 安装缺失的 `rg`，重新构建已有且未移动的 tag。两个 master CI 和发布源码质量门禁均通过；tag 后无运行时代码或依赖变化。
- 实际上传并下载的 DMG 为 **7,545,711 字节**；SHA-256：`784ee2e694ae4943c8d5d367985d02c87b2cfa3bb463657d89bc6865d26230a9`；匹配校验文件 91 字节。此包取代此前本地候选。浏览器下载保留隔离属性；映像、版本、身份、最低系统要求、双架构及严格 ad-hoc 签名完整性均通过。Gatekeeper 明确拒绝（退出码 3），无 Developer ID 或 Apple 公证。
- 维护者确认已手动安装、完成系统允许并首次打开文档。这是用户确认的安装证据，不是根据截图声称全部功能通过。运行进程来自 `/Applications/Milo.app/Contents/MacOS/milo`；已安装应用的全部文件与实际草稿附件一致。
- 对已安装草稿使用临时文档，偏好设置及遮罩可见、Escape／按钮关闭、100% → 110% 缩放持久化并恢复 100%、显式保存／自动保存、标签页关闭重开及磁盘内容对比均通过。保留真实文档、当前文件夹与原会话，未重写设置文件或重置会话。为保留正在使用的会话，没有重复应用重启。
- 原生拼音按键进入预编辑，但无法可靠控制候选窗口并确认提交。未确认文字不应落盘；关闭保护正常出现，仅丢弃了该临时输入。完整真实输入法时序仍交人工确认，粘贴与合成事件不计入验收。

## 有限性能结果与剩余确认

在 16 GB arm64 / macOS 27.0.1 上沿用现有预算。保留真实文档、空临时文档前台，闲置 30 秒后间隔 5 秒采样三次，总 physical footprint 中位数为 **186.52 MB／177.88 MiB**。代表样本包含 Milo 29.328 MB、WebContent 127.977 MB、GPU 21.923 MB、Networking 7.291 MB。通过系统 responsible PID 归属进程，不按名称混入其他应用；按进程求和，未对全局共享内存去重。此双标签状态低于 200 MB，但不是独立空会话基线。此前额外保留未确认预编辑测试标签时为 **250.32 MB／238.72 MiB**，高于预算；丢弃该临时预编辑并关闭标签后下降。两个观察结果均保留，不声称所有内存场景通过。

1,048,576 字节的测试文件成功打开。有限的一次“点击至可访问性观察”耗时 2.905 秒，包含工具传输及观察等待，不能当作应用自身耗时，也不能证明五次中位数满足 1 秒预算。为保留用户的使用中会话，没有通过重启测冷启动。整体性能仍未签核，未做优化或调整预算。

剩余人工步骤：

1. 在可丢弃的已保存文档中使用真实中文输入法，亲眼选择候选词；分别验证空闲自动保存、确认后立即切换应用、最小化恢复、Command-S、正常关闭。每项重开核对已确认文字。未确认／取消的预编辑不应当作应保存内容。
2. 在合适会话中用本地计时／屏幕录制排除自动化延迟，分别测五次冷启动至空文档可编辑（中位数 ≤1.5 秒）、五次约 1 MB 打开（中位数 ≤1 秒）。独立空会话内存基线可用于区分会话负载与上述观察，200 MB 原预算保持不变。

安装与首次打开已有维护者确认，无需重复。Intel／macOS 13–26 仍未实机覆盖。Release 保持草稿，等待维护者确认公开发布。

## 工作流与交接

已有 tag 已推送并生成草稿。工作流针对选定源码 tag 执行现有质量检查，核对应用版本，构建并验证 Universal DMG，仅上传 DMG 和校验文件，明确保持 **`draft: true`、`prerelease: true`、`make_latest: 'false'`**。手动重跑入口接受已有 tag，不移动 tag。不上传构建目录或开发依赖，也不引入更新器。

记录验收期间保持草稿及附件；仅文档跟进不改变已打 tag 的应用。公开发布仍需维护者单独确认，不移动 tag，不用此前本地 DMG 替换实际附件。
