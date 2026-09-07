# Milo macOS 发布说明

[English](RELEASE.md) | [简体中文](RELEASE.zh-CN.md)

Milo 只发布 GPL-3.0 源代码与已签名、已公证的 macOS 安装产物。未来维护者推送如 `v0.1.0` 的版本 tag 时，发布工作流才会开始；Pull Request 与 `main` 分支仍由常规 CI 覆盖。

目前不执行 GitHub 正式发布。本文档保留未来签名、公证与发布所需的步骤。

## 一次性 GitHub 配置

在推送发布 tag 之前，配置以下 GitHub Actions Secrets。不要将它们提交到仓库，也不要放进本地 `.env` 文件。

| Secret | 内容 |
| --- | --- |
| `APPLE_CERTIFICATE` | 经 Base64 编码的 Developer ID Application `.p12` 证书 |
| `APPLE_CERTIFICATE_PASSWORD` | 该 `.p12` 文件的密码 |
| `APPLE_SIGNING_IDENTITY` | Developer ID Application 签名身份 |
| `APPLE_ID` | 用于公证的 Apple ID |
| `APPLE_APP_SPECIFIC_PASSWORD` | 该 Apple ID 的 App 专用密码 |
| `APPLE_TEAM_ID` | Apple Developer Team ID |
| `KEYCHAIN_PASSWORD` | 仅供 CI 临时钥匙串使用的新随机密码 |

工作流会构建 `universal-apple-darwin`、将 Developer ID 证书导入临时钥匙串、使用 `notarytool` 公证生成的 DMG、附加公证票据、检查 Gatekeeper 与 100 MB 包体积上限，最后将 DMG 附加到 GitHub Release。

## 本地发布前检查

在创建发布 tag 前执行：

```sh
npm ci
npm run test
npm run lint
npm run build
./scripts/build-macos-universal.sh
```

universal 构建需要两个 Rust target。若缺少 Intel target，执行：

```sh
rustup target add x86_64-apple-darwin
```

不要将未签名的本地 DMG 作为公开正式版发布。Apple 签名和公证必须是维护者明确执行的步骤。

## 性能验证记录

每次公开发布前，在 16 GB Apple Silicon Mac 上使用最终的已签名构建、正常 macOS 桌面会话且不附加 profiler，记录以下结果：

| 测量项 | 方法 | 预算 | 结果 |
| --- | --- | --- | --- |
| 冷启动 | 完全退出 Milo 后从 Finder 启动五次，测量到出现可聚焦、可编辑文档的时间并取中位数。 | ≤1.5 秒 | |
| 1 MB 文档打开 | 在 Milo 中打开测试文档五次，测量从触发命令到文档可编辑的时间并取中位数。 | ≤1 秒 | |
| 闲置内存 | 打开一个空的已保存文档，等待 30 秒，在 Activity Monitor 中记录 Milo 内存。 | ≤200 MB | |
| 安装包体积 | 对已公证的 universal DMG 运行 `stat -f '%z' <dmg>`。 | ≤104857600 bytes | |

发布前需从生产构建报告确认 Mermaid、KaTeX 与 Shiki 没有进入初始模块图。
