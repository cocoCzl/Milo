# Milo

[English](README.md) | [简体中文](README.zh-CN.md)

Milo 是一款面向 macOS 的 Local-first Markdown 编辑器。它直接打开普通 Markdown 文件，在专注的所见即所得编辑器中写作，同时保持文件可移植并让文件本身作为权威来源。

当前仓库跟踪 0.3.0 代码线。GitHub 上的 v0.3.0 预发布版是历史构建，当前 `master` 可能包含后续的编辑器和可靠性改进。

## 功能

- 支持标题、强调、引用、列表、任务列表、表格、链接、图片和代码块的 CommonMark/GFM 编辑。
- 编辑、阅读和整文件源码模式，编辑器按需加载。
- 原生打开、保存、另存为、最近文件、目录浏览、标签页和会话恢复。
- 安全保存、冲突检查、恢复副本，以及 Front Matter、UTF-8 BOM、LF/CRLF 处理。
- 相对 Markdown 链接、页内锚点、返回导航、文内查找替换和当前文件夹范围的快速打开。
- 大纲导航、主题、独立的正文/界面缩放、专注模式和可访问的键盘操作。
- 将图片粘贴到文档同级 `assets/` 目录，并使用相对 Markdown 路径。
- 远程图片只有在用户明确操作后加载；核心写作不依赖账号、遥测或云服务。

## 文件与隐私

Markdown 文件始终是数据源。偏好、最近路径、会话元数据和恢复副本保存在文档目录之外。Milo 不使用数据库、账号系统、遥测服务或自动云同步。测试预发布版本时请使用可丢弃或已备份的文件。

所见即所得编辑可能规范化部分 Markdown 格式。源码模式保留完整文件（包括 Front Matter），用于不能安全转换的内容。跨模式撤销尚未统一，详见[已知问题](docs/KNOWN_ISSUES.md)。

## 平台与下载

Milo 支持 macOS 13 或更高版本。v0.3.0 公开预发布版提供同时支持 Apple Silicon 和 Intel 的 Universal DMG，使用 ad-hoc 签名且未经过公证。

从 [GitHub Releases](https://github.com/cocoCzl/Milo/releases) 下载 DMG 和校验文件，用 `shasum -a 256 -c` 核对后将 Milo 拖入“应用程序”。如果 macOS 阻止首次打开，在确认来源和校验值后前往“系统设置 → 隐私与安全性 → 仍要打开”。不要全局关闭 Gatekeeper。

当前原生覆盖以 Apple Silicon 为主。性能预算尚未签收，部分输入法、Dock 和窗口过渡场景仍未归因或测量，详见[已知问题](docs/KNOWN_ISSUES.md)和[编辑器状态](docs/EDITOR_STATUS.md)。

## 开发

要求：Node.js 24、稳定版 Rust、Xcode Command Line Tools 和 macOS Rust targets。

```sh
npm ci
npm run tauri -- dev
```

## 检查

```sh
npm run format:check
npm run typecheck
npm run lint -- --max-warnings=0
npm test
npm run build
npm run test:browser
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --locked -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --locked
```

浏览器检查使用模拟原生 IPC；原生 Release 打包请参阅 [RELEASE.md](docs/RELEASE.md)。

## 文档

- [编辑器状态与测量](docs/EDITOR_STATUS.md)
- [已知问题](docs/KNOWN_ISSUES.md)
- [UI 设计约束](docs/UI_DESIGN.md)
- [Release runbook](docs/RELEASE.md)
- [发布说明](docs/RELEASE.zh-CN.md)

## 许可证

Milo 使用 [GPL-3.0](LICENSE) 协议。
