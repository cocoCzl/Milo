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
2. 用真实浏览器下载最终附件，确认 DMG 带 `com.apple.quarantine`，核对哈希，拖到“应用程序”、推出映像并检查真实首次打开提示。优先按 Apple 的“隐私与安全性 → 仍要打开”操作，依据实际结果修正文档。本地直接启动或手动添加隔离属性不能代替。仅本地准备时没有可下载附件，此项保留待办。
3. 在 16 GB Apple Silicon Mac、正常前台且无 profiler 的会话中记录性能：五次冷启动至文档可编辑的中位数 ≤1.5 秒；五次打开约 1 MB 文档中位数 ≤1 秒；空闲 30 秒后占用 ≤200 MB。主机或操作能力不能可靠测量时明确保留缺口，不声称通过。确认 Mermaid、KaTeX、Shiki 未进入初始生产模块图。包体积由脚本检查。

当前问题见[已知问题](KNOWN_ISSUES.md)，草稿正文使用[简洁中英文发布说明](RELEASE_NOTES_0.3.0.md)。公开发布前根据实际结果更新待验证状态。

## 0.3.0 本地候选验收记录 — 2026-10-24

- 从干净源码提交 `8bb63c8ddc25c23074be2d091d28c46e980b3041` 构建；后续验收文档更新不改变应用代码或打包配置。
- DMG **7,866,299 字节**，SHA-256：`5f9bd1f55afd6e65214c82a6abfbf26be0c50cbb04d9679f3d44f5e4c4eb2aa0`；同目录校验文件 91 字节。
- 已有本地 CI 门禁通过：362 项前端测试、33 项 Rust 测试、格式、TypeScript、lint、rustfmt、Clippy、生产构建和 Debug 打包。最终 Universal 构建、映像、双架构及最低系统要求、严格 ad-hoc 签名完整性验证均通过。Gatekeeper 实际**拒绝**（退出码 3），不声称 Developer ID 身份签名或 Apple 公证。
- 在 16 GB arm64 / macOS 27.0.1 上只读挂载最终映像并启动其中确切的可执行文件。偏好设置及遮罩像素、Escape／关闭按钮、100% → 110% 缩放持久化、编辑、显式保存／自动保存、文档关闭重开、正常关闭窗口后进程退出、应用重启与会话恢复通过。已恢复缩放，并在退出后逐字节恢复原有设置／会话文件。映像仅含应用及 Applications 链接等安装资源，无源码构建工具或依赖目录。
- 原生按键 `n`、`i`、空格产生“你”，自动保存落盘，重开后保留。候选窗口的稳定操作及确认后立即切换／最小化／手动保存／关闭的完整时序仍待人工确认；本次证据不是中文粘贴或合成事件。
- 仅打开一个空的已保存文档并闲置 30 秒后，`vmmap` 测得**主进程 physical footprint 35.3 MiB**。未包含独立 WebKit 进程，因此不算总内存预算完整签核。冷启动／文件打开计时和总内存确认仍需人工；原生自动化调用延迟无法可靠证明亚秒级指标。锁定的构建输入不包含延后的 Mermaid／KaTeX／Shiki 包。
- 本轮没有可下载附件，未进行浏览器下载隔离后的安装测试。未推送、未创建远端 tag 或 Release 草稿、未公开发布。

## 工作流与交接

维护者确认后再推送审核后的提交和 `v0.3.0`。工作流运行已有 CI，检查五处应用版本与 tag 一致，构建并验证 DMG 和校验文件，仅上传这两个附件。明确设置 **`draft: true`、`prerelease: true`、`make_latest: 'false'`**，不上传构建目录或开发依赖，不引入自动更新。

本地准备不推送、不创建远端 tag、不公开发布。工作流会从 tag 提交重新构建，打包时间和签名元数据可能使哈希与本地候选包不同；必须验收最终上传附件并记录其哈希，再经维护者确认后将草稿公开为 Pre-release。不能把旧版 DMG 改名冒充 0.3.0。
