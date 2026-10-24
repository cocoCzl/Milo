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

## 0.3.0 发布身份与已完成验证

- [公开 Pre-release](https://github.com/cocoCzl/Milo/releases/tag/v0.3.0)，不作为稳定版 Latest。维护者于 2026-10-24 明确授权公开发布。
- 源码／tag 保持 `v0.3.0` → `797035ab4d9305a1989134854b0d9cd3f0820a35`。成功的 [Release 运行](https://github.com/cocoCzl/Milo/actions/runs/40093107626)通过工作流提交 `6bba1d5` 构建该 tag，源码质量门禁已通过；后续仅有文档／工作流变化。
- 现有附件：`Milo_0.3.0_universal.dmg`，**7,545,711 字节**；SHA-256：`784ee2e694ae4943c8d5d367985d02c87b2cfa3bb463657d89bc6865d26230a9`；匹配校验文件 91 字节。文档更新不移动 tag、不替换附件、不重新构建。
- 映像、版本、identifier、最低 macOS、双架构及严格 ad-hoc 签名完整性已通过。Gatekeeper 信任评估明确拒绝（退出码 3）；无 Developer ID 或 Apple 公证。
- 浏览器下载保留隔离属性，已安装应用与附件一致。手动安装、系统允许和首次打开由维护者确认，不依据截图声称通过。按 README 的 Apple“隐私与安全性／仍要打开”说明操作，提示可能因系统版本而异。
- 偏好设置、编辑保存及文档关闭重开冒烟检查通过。真实中文输入法自动保存、立即 Command-S、保存并关闭均通过磁盘／重开核对，使用原生拼音，无粘贴或合成 composition。真实文档、设置及原会话均保留。

## 接受的测试版限制与性能例外

维护者明确接受以下缺口，批准公开分发 0.3.0 Pre-release。这些状态仍是未验证或未完整覆盖，不代表测试通过，也不要求在本次发布前重做：

- 实际立即切换应用、最小化恢复的输入法窗口转换未完整观测；两个样本的中文磁盘／重开核对已通过。
- 冷启动与约 1 MB 文件打开耗时尚未可靠测定。
- 内存观察来自不同运行场景。Milo 及相关 WebKit 总空闲占用在双标签状态为 186.52 MB，此前额外保留预编辑测试标签的状态为 250.32 MB。按进程 physical footprint 求和，未对全局共享内存去重；这不是独立基线或整体性能预算通过。
- 实机仅覆盖 arm64 / macOS 27.0.1（26A434）；Intel 与 macOS 13–26 未实机覆盖。

原性能目标为 16 GB Apple Silicon Mac 上五次冷启动至可编辑文档中位数 ≤1.5 秒、五次约 1 MB 打开中位数 ≤1 秒、闲置 30 秒后总占用 ≤200 MB。维护者**仅对本次 0.3.0 预发布明确豁免这些发布硬门槛**；后续继续按原目标验证，不虚构数据、不推断兼容性，也不作普遍放宽。已有观察不构成性能签核。

参见[已知问题](KNOWN_ISSUES.md)与[中英文发布正文](RELEASE_NOTES_0.3.0.md)。本次文档及公开发布收尾无需再运行应用测试或构建。

## 公开发布操作

工作流生成草稿时保持 `draft: true`、`prerelease: true`、`make_latest: 'false'`，仅附 Universal DMG 和校验文件。公开发布将 `draft` 改为 `false`，保留 `prerelease: true`、`make_latest: false`，依据维护者明确授权执行。0.3.0 的授权包含上述验证缺口。

公开前核对现有远端 tag 及两个附件与已记录候选身份；发现差异即停止。仅更新发布正文，不替换附件。公开后检查匿名页面访问并下载公开附件核对 SHA-256。文档提交不改变已打 tag 的应用；按维护者本次要求仅运行文档检查。
