# Milo

[English](README.md) | [简体中文](README.zh-CN.md)

Milo 是一款免费的、Local-first 的 macOS Markdown 编辑器。它让你直接打开 Markdown 文件并以专注的所见即所得方式写作，不需要账号、云服务、后端或内容数据库。

Markdown 文件始终是你的数据源，可以继续被 VS Code、Vim、Obsidian、Typora、Git 和其他 Markdown 工具读取。

Milo 0.3.0 是首个公开测试版，将通过 GitHub Pre-release 分发。目前正在准备候选包，公开发布后即可下载。

## Milo 的定位

- 类似 Typora 的 Markdown 写作体验，而不是长期的源码 + 预览分栏。
- 直接打开、编辑、保存普通 `.md` 和 `.markdown` 本地文件。
- 克制的桌面界面，支持跟随系统、浅色/深色模式、文档缩放、固定文档大纲、隐藏侧栏和专注模式。
- 尊重隐私：没有登录、遥测、自动云同步，核心写作功能不依赖网络。

## MVP 能力

- 所见即所得 CommonMark 与 GFM 编辑：标题、强调、引用、列表、任务列表、表格、链接、图片、支持语言选择与复制的代码块，以及撤销/重做。
- 原生打开、保存、另存为、最近文件、当前文件夹浏览与更换、标签页、启动会话恢复和外部修改保护。
- 保留 YAML Front Matter、UTF-8/BOM 和 LF/CRLF；不支持安全往返的文档会以只读方式保护；macOS 保存采用保留 inode 并支持崩溃恢复的安全写入流程。
- 将粘贴的图片保存到文档同级的 `assets/` 文件夹，并插入相对 Markdown 路径。
- 远程图片必须由用户明确加载；外部链接仅在 Command-click 时交给系统浏览器。
- macOS 菜单、快捷键、无障碍标签、减少动态效果支持，以及专注的写作界面。

## 隐私与数据

Milo 只把文档内容保存到本地 Markdown 文件。应用偏好、最近路径和会话元数据以小型 JSON 设置保存在文档文件夹之外；Markdown 正文不会被复制到数据库或云端。

远程图片不会在打开文档时自动请求。Milo 不包含内置浏览器、账号系统、分析服务或后端 API。

## 技术栈

- 桌面端：Tauri 2 与 Rust
- 界面：React、TypeScript、Vite、CSS Variables 与 Lucide Icons
- 编辑器：Milkdown、ProseMirror、Remark 与 GFM
- 原生服务：Tauri 对话框、文件监听、JSON 应用设置与系统菜单

Mermaid、KaTeX、Shiki、源码模式、导出和搜索会在后续阶段再引入，避免影响 MVP 的启动速度。

## 下载与安装

普通用户只需 **macOS 13 或更高版本**，无需安装 Node.js、Rust 或源码构建工具。Universal DMG 同时包含 Apple Silicon（arm64）与 Intel（x86_64）架构。

1. 公开发布后，在 [GitHub Releases](https://github.com/cocoCzl/Milo/releases) 中选择 **v0.3.0 / Pre-release**，下载 `Milo_0.3.0_universal.dmg` 和同名 `.sha256` 文件。在下载目录运行 `shasum -a 256 -c Milo_0.3.0_universal.dmg.sha256` 可核对完整性。
2. 打开 DMG，将 Milo 拖到“应用程序”，推出磁盘映像后从“应用程序”打开。
3. 应用采用 **ad-hoc 签名**，没有 Developer ID 身份签名，也未经 Apple 公证。首次打开可能被 macOS 拦截；确认下载来源及校验值后，先尝试打开一次，再前往“系统设置 → 隐私与安全性”，找到 Milo 的“仍要打开”，并按系统提示确认。不同 macOS 版本的提示可能不同；参见 [Apple 官方说明](https://support.apple.com/zh-cn/102445)。

ad-hoc 签名完整性检查通过不代表 Apple 认证或 Gatekeeper 信任通过。请勿全局关闭 Gatekeeper 或批量移除下载目录的隔离属性。实际浏览器下载及隔离后的首次打开体验仍待公开附件可用后验证。

已实机验证范围：Apple Silicon（arm64）、macOS 27.0.1（26A434）；Intel、macOS 13–26 未实机覆盖。真实中文输入法候选确认与保存时序待人工确认；详见[已知问题](docs/KNOWN_ISSUES.md)。测试版建议先使用可丢弃文件或已备份文档。

请通过 [GitHub Issues](https://github.com/cocoCzl/Milo/issues) 反馈，提供版本、macOS 版本、芯片类型、复现步骤及必要截图；避免上传私密文档。

## 开发环境

仅源码开发需要 Node.js 24、稳定版 Rust、Xcode Command Line Tools 和两个 macOS Rust target。

## 本地开发

```sh
npm ci
npm run tauri -- dev
```

该命令会启动 Vite 和原生 Milo 窗口。依赖安装完成后，核心开发与使用不需要账号、服务端或网络连接。

## 质量检查

```sh
npm run test
npm run lint
npm run build
```

## 构建 universal macOS 产物

```sh
./scripts/build-macos-universal.sh
```

产物位于 `src-tauri/target/universal-apple-darwin/release/bundle/dmg/`。该命令明确生成 ad-hoc 签名、未公证的测试版，并验证签名完整性、架构、版本、最低系统版本和包体积，再生成 `.sha256` 文件。不需要 Apple 账号、证书或 Secrets。

## 项目结构

```text
src/
  app/            应用组合
  components/     小型展示组件
  editor/         Milkdown 编辑器和 Markdown 边界
  file-system/    原生文件、图片、链接与启动边界
  hooks/          文档会话和原生事件协调
  settings/       JSON 应用设置
  styles/         以排版为中心的视觉系统
src-tauri/        Rust 命令、macOS 菜单、打包与原生服务
docs/             UI 约束、已知问题与发布运行手册
```

## 文档

- [UI 设计与编辑器不变量](docs/UI_DESIGN.md)
- [已知问题](docs/KNOWN_ISSUES.md)
- [Release runbook](docs/RELEASE.md)
- [发布说明（简体中文）](docs/RELEASE.zh-CN.md)

## 开源协议

Milo 使用 [GPL-3.0](LICENSE) 协议。重新分发的修改版本必须继续以 GPL 提供对应源代码。
