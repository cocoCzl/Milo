# 发布指南

本指南供维护者在真正准备发布时使用。当前开发版本为 **0.3.2（未发布）**；编辑版本号或本地构建都不代表发布。

## 发布前检查

- 取得维护者对创建版本标签、触发发布工作流及公开发布的明确授权；历史发布授权或性能豁免不适用于未来版本。
- 按[开发指南](DEVELOPMENT.md#检查)完成项目 CI 门禁及本次改动所需的原生验收。保存、恢复、冲突、组合输入、退出及隐私契约不可因打包而放宽；确认[已知问题](KNOWN_ISSUES.md)准确披露，未通过项目如需豁免必须明确记录，不能写成通过。
- 确认打包源码干净、对应已批准提交，记录完整提交号。检查提交内容，排除真实文档、用户设置、诊断应用和内部验收产物；不要在版本准备中顺带升级依赖。
- 真正准备发布时创建该版本的 `docs/RELEASE_NOTES_<版本>.md`。工作流要求它存在；单纯的未发布开发版本无需正文。`RELEASE_NOTES_0.3.0.md` 保留是因为它仍是现有发布工作流的有效输入，不是当前状态说明。历史公开版见 [v0.3.0 Release](https://github.com/cocoCzl/Milo/releases/tag/v0.3.0)。

## 版本与构建

在仓库根目录执行轻量一致性检查：

```sh
node scripts/check-release-version.mjs "v$(node -p 'require("./package.json").version')"
```

检查覆盖 npm/Cargo/Tauri 元数据及对应锁文件，同时校验应用标识 `io.github.milo.editor`、最低 macOS 13.0 和当前 ad-hoc 签名配置。关于菜单使用应用元数据，打包脚本读取 `package.json`；不另加硬编码版本或修改第三方依赖版本。

获准构建后使用：

```sh
./scripts/build-macos-universal.sh
```

脚本清理旧打包输出，按锁文件安装依赖、安装 arm64/x86_64 Rust target，构建 Universal DMG 并自动调用验证脚本。需要单独核验已有产物时使用：

```sh
./scripts/verify-macos-release.sh
```

产物位于 `src-tauri/target/universal-apple-darwin/release/bundle/dmg/`：DMG 及其同名 `.sha256` 校验文件。校验文件使用相对文件名，可在产物目录运行 `shasum -a 256 -c 'Milo_<version>_universal.dmg.sha256'`。

## 验证与支持边界

- 验证脚本检查磁盘映像、包内版本与应用标识、最低 macOS、arm64/x86_64 两个架构、ad-hoc 签名完整性及 100 MiB 包体上限；全部成功后生成 SHA-256。生成 DMG/校验文件后不再修改或重签包内应用。
- 当前采用 `signingIdentity: "-"`，没有 Developer ID 身份签名或 Apple 公证。构建脚本清除继承的 Apple 签名凭据，不需要 Apple 账号；不能将正式签名失败悄悄降级成此模式。签名完整性通过不代表发布者身份或 Gatekeeper 信任通过。
- 当前未公证包的 Gatekeeper 策略拒绝是预期结果，应如实披露；其他工具错误仍阻止验证。不要指导用户关闭 Gatekeeper。未来更换签名方式时须同步验证脚本和安装说明。
- macOS 13+ 与 Universal 是分发目标，实机支持证据以已知问题为准，不能从架构存在推断完整兼容。浏览器样本、单架构隔离应用或诊断构建不能代替发行包和原生验收。原性能目标保留在 [CONTEXT.md](../CONTEXT.md)，不继承历史版本豁免。

## 发布步骤

1. 获准后，从批准提交创建匹配版本的 `v<版本>` 标签，再推送该标签；不要移动历史标签。也可经 `workflow_dispatch` 指定已存在标签，工作流会核对提交与标签一致。
2. [.github/workflows/release.yml](../.github/workflows/release.yml)先执行复用 CI，再构建和验证，只附 DMG 与 SHA-256，创建 `draft: true`、`prerelease: true`、`make_latest: false` 的草稿。
3. 核对草稿源码身份、版本正文、附件、校验值和未验证范围。只有在获得公开发布授权后才公开草稿；保持预发布状态，不自动设为稳定版 Latest。
4. 公开后检查匿名访问和下载，保留下载隔离属性，重新核对 SHA-256 与安装行为。修改文档不移动标签、不替换历史附件，也不修改既有 Release；如需这些操作须另有明确授权。
