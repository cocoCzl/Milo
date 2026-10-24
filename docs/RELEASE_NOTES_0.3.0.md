# Milo 0.3.0 — First public beta / 首个公开测试版

Milo is a free, local-first Markdown editor. This first public beta includes visual Markdown editing, local open/save, tabs, folder browsing, outline, appearance preferences and the preferences visibility fix.

- **macOS 13+**, Universal DMG for Apple Silicon (arm64) and Intel (x86_64). No Node.js, Rust or build tools needed.
- **Ad-hoc signed; no Developer ID identity signature; not Apple-notarized.** Gatekeeper may block first opening. Verify the SHA-256 file, drag Milo to Applications, open once, then use **System Settings → Privacy & Security → Open Anyway** if blocked. Follow [Apple's instructions](https://support.apple.com/en-us/102445).
- Hardware coverage: arm64 on macOS 27.0.1 (26A434). Intel and macOS 13–26 are untested on hardware. A native pinyin/Auto Save smoke check passed; the full IME timing matrix and browser-download/quarantine installation remain pending before public publication.
- Use backed-up or disposable files. See [known issues](https://github.com/cocoCzl/Milo/blob/v0.3.0/docs/KNOWN_ISSUES.md). Report version, macOS, chip and reproduction steps via [Issues](https://github.com/cocoCzl/Milo/issues), without private documents.

Download `Milo_0.3.0_universal.dmg` and `Milo_0.3.0_universal.dmg.sha256` from this Pre-release. In their directory, run:

```sh
shasum -a 256 -c Milo_0.3.0_universal.dmg.sha256
```

Milo 是免费、Local-first 的 Markdown 编辑器。首个公开测试版提供可视化 Markdown 编辑、本地打开与保存、标签页、文件夹浏览、大纲和外观偏好，并包含偏好设置可见性修复。

- **macOS 13+**，Universal DMG 包含 Apple Silicon 与 Intel；普通用户无需 Node.js、Rust 或构建工具。
- **采用 ad-hoc 签名，没有 Developer ID 身份签名，未经 Apple 公证。** 核对 SHA-256 后，将 Milo 拖入“应用程序”并尝试打开；若被拦截，在“系统设置 → 隐私与安全性 → 仍要打开”中按提示确认。参见 [Apple 官方说明](https://support.apple.com/zh-cn/102445)。
- 实机覆盖仅 arm64 / macOS 27.0.1（26A434）；Intel 与 macOS 13–26 未实机覆盖。原生拼音确认与自动保存冒烟检查已通过；完整输入法时序、浏览器下载隔离后的安装体验仍待公开发布前确认。
- 请使用备份或可丢弃文件，通过 [Issues](https://github.com/cocoCzl/Milo/issues) 提供版本、系统、芯片和复现步骤，避免上传私密文档。

此版本标记为 Pre-release，不作为稳定版 Latest。不要全局关闭 Gatekeeper 或批量清除下载目录隔离属性。
