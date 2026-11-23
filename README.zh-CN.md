# Milo

[English](README.md) | [简体中文](README.zh-CN.md)

Milo 是面向 macOS 的本地 Markdown 编辑器。可以可视化写作，也可以直接编辑源码，文档始终是可在其他编辑器中使用的普通 Markdown 文件。

当前本地开发版本为 **0.3.3（未发布）**；可下载的公开版本为 **v0.3.0 预发布版**。本地改动不代表已经发布。

## 主要功能

- 可视化编辑、阅读和源码模式，支持表格、任务列表、图片与代码块。
- 标签页、文件夹浏览、最近文件与快速打开；文内查找替换和大纲导航。
- 已有文件自动保存、另存为、外部修改检查及未保存文档恢复。
- 浅色、深色与暖色主题，专注模式、键盘操作及独立的正文和界面缩放。

## 下载与开始使用

Milo 面向 **macOS 13+**。公开 Universal DMG 包含 Apple Silicon 和 Intel 架构；实际实机覆盖见[已知问题](docs/KNOWN_ISSUES.md)。

1. 从 [v0.3.0 预发布页面](https://github.com/cocoCzl/Milo/releases/tag/v0.3.0)下载 DMG 和对应的 `.sha256` 文件。
2. 在下载目录运行 `shasum -a 256 -c Milo_0.3.0_universal.dmg.sha256`，核对后将 Milo 拖入“应用程序”。
3. 打开 Milo，选择 Markdown 文件，或新建文档并首次保存到指定位置。已有文件会在空闲编辑后自动保存；新文档需要先明确保存一次。

下载包采用 ad-hoc 签名，**未经 Apple 公证**。若 macOS 阻止打开，请先核对来源和校验值，再到“系统设置 → 隐私与安全性 → 仍要打开”中操作。不要全局关闭 Gatekeeper。

**测试版提示：**请使用已备份文件。代码块中候选尚未确认就退出，存在保存为原始拼音的未解决问题。退出前先确认输入并核对保存内容；该问题及其他限制见[已知问题](docs/KNOWN_ISSUES.md)。

## 文件与隐私

Markdown 文件是权威来源。可视化编辑可能规范化 Markdown 格式；源码模式展示包含 Front Matter 的完整文件。不同模式的撤销历史相互独立。

偏好设置、会话信息和恢复副本存放在本地应用数据目录，不写入文档文件夹。恢复副本可能落后于最后编辑，不能代替保存。粘贴图片存放在已保存文档旁的 `assets/` 目录；远程图片仅在明确请求后加载。Milo 没有账号、遥测、自动云同步或后台更新检查。

## 本地开发

在 macOS 上安装 Node.js 24、稳定版 Rust 和 Xcode Command Line Tools，然后运行：

```sh
npm ci
npm run tauri -- dev
```

- [开发指南](docs/DEVELOPMENT.md)：环境、检查和工程约束。
- [已知问题](docs/KNOWN_ISSUES.md)：当前缺陷与验证范围。
- [发布指南](docs/RELEASE.md)：维护者打包与发布流程。

## 许可证

[GPL-3.0](LICENSE)。
