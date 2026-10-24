# Milo 0.3.0 — First public beta / 首个公开测试版

Milo is a free, local-first Markdown editor with visual editing, local open/save, tabs, folder browsing, outline and appearance preferences. This release includes the preferences visibility fix.

- **macOS 13+; Universal DMG** for Apple Silicon (arm64) and Intel (x86_64). No Node.js, Rust or build tools needed.
- **Ad-hoc signed; no Developer ID identity signature; not Apple-notarized.** Verify the checksum, drag Milo to Applications, eject the image and open Milo. If blocked, use **System Settings → Privacy & Security → Open Anyway** and follow [Apple's instructions](https://support.apple.com/en-us/102445). System prompts may vary.
- Preferences, editing/save and document reopening passed smoke checks. Real Chinese IME Auto Save, immediate Command-S and Save and Close passed disk/reopen comparison.
- **Accepted beta limitations:** immediate app-switch and minimize/restore IME timing is not fully covered; cold-start and approximately 1 MB file-open latency is not reliably measured; memory observations vary by running scenario and the overall performance budget has not fully passed. Hardware coverage is arm64 / macOS 27.0.1 only; Intel and macOS 13–26 are untested on hardware. The maintainer explicitly accepts these gaps and grants a performance-gate exception for this 0.3.0 Pre-release only; this is not a test pass or compatibility guarantee.
- Manual installation, system permission and first opening are maintainer-confirmed. Use backed-up or disposable files; see [known issues](https://github.com/cocoCzl/Milo/blob/master/docs/KNOWN_ISSUES.md). Report version, macOS, chip and reproduction steps via [Issues](https://github.com/cocoCzl/Milo/issues), without private documents.

Download `Milo_0.3.0_universal.dmg` and `Milo_0.3.0_universal.dmg.sha256` from this Pre-release. In their directory, run:

```sh
shasum -a 256 -c Milo_0.3.0_universal.dmg.sha256
```

Milo 是免费、Local-first 的 Markdown 编辑器，提供可视化编辑、本地打开与保存、标签页、文件夹浏览、大纲和外观偏好，本次包含偏好设置可见性修复。

- **macOS 13+；Universal DMG** 包含 Apple Silicon（arm64）与 Intel（x86_64）；普通用户无需 Node.js、Rust 或构建工具。
- **采用 ad-hoc 签名，没有 Developer ID 身份签名，未经 Apple 公证。** 核对校验文件后，将 Milo 拖入“应用程序”、推出映像并打开；若被拦截，在“系统设置 → 隐私与安全性 → 仍要打开”中按提示确认。参见 [Apple 官方说明](https://support.apple.com/zh-cn/102445)，系统提示可能因版本而异。
- 偏好设置、编辑保存及文档重开冒烟检查通过。真实中文输入法自动保存、立即 Command-S、保存并关闭均通过磁盘／重开核对。
- **本次接受的测试版限制：**立即切换应用和最小化恢复的输入法时序未完整覆盖；冷启动及约 1 MB 文件打开耗时尚未可靠测定；内存观察来自不同运行场景，整体性能预算未完整通过。实机仅覆盖 arm64 / macOS 27.0.1，Intel 与 macOS 13–26 未实机覆盖。维护者明确接受这些缺口，并仅对本次 0.3.0 预发布豁免性能发布硬门槛；这不代表测试通过或兼容性保证。
- 手动安装、系统允许及首次打开由维护者确认。请使用备份或可丢弃文件，通过 [Issues](https://github.com/cocoCzl/Milo/issues) 提供版本、系统、芯片和复现步骤，避免上传私密文档。

此版本为 Pre-release，不作为稳定版 Latest。不要全局关闭 Gatekeeper 或批量清除下载目录隔离属性。
