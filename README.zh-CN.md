# Milo

[English](README.md) | [简体中文](README.zh-CN.md)

Milo 是一款免费的、Local-first 的 macOS Markdown 编辑器。它让你直接打开 Markdown 文件并以专注的所见即所得方式写作，不需要账号、云服务、后端或内容数据库。

Markdown 文件始终是你的数据源，可以继续被 VS Code、Vim、Obsidian、Typora、Git 和其他 Markdown 工具读取。

Milo 当前仍处于积极开发和测试阶段。

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

## 环境要求

- macOS 13 或更高版本
- Node.js 24
- 带 macOS toolchain 的稳定版 Rust

已验证的发布目标是同时支持 Apple Silicon 与 Intel 的 universal macOS 构建。

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

产物位于 `src-tauri/target/universal-apple-darwin/release/bundle/dmg/`。该命令生成本地未签名产物；Apple 签名、公证、Gatekeeper 验证和公开发布会在未来正式发布时处理。

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
docs/             UI 约束、已知问题与未来发布运行手册
```

## 文档

- [UI 设计与编辑器不变量](docs/UI_DESIGN.md)
- [已知问题](docs/KNOWN_ISSUES.md)
- [Release runbook](docs/RELEASE.md)
- [发布说明（简体中文）](docs/RELEASE.zh-CN.md)

## 开源协议

Milo 使用 [GPL-3.0](LICENSE) 协议。重新分发的修改版本必须继续以 GPL 提供对应源代码。
