# 发版流程

版本历史见 [CHANGELOG.zh-CN.md](../CHANGELOG.zh-CN.md) / [CHANGELOG.md](../CHANGELOG.md)。

1. 功能提交先合入 `main`（推荐 Conventional Commits：`feat:`、`fix:` 等）。发版前必须在 `CHANGELOG.zh-CN.md` 的 `## [Unreleased]` 下整理中文摘要；缺失时发版命令会主动中止。
2. 若还没有 `v*` 标签，先打一次基线：

```bash
git tag -a v0.2.0 -m v0.2.0 620c6a8
git push origin v0.2.0
```

3. 本地切下一版（写更新日志与 `package.json`、提交、附注标签 — **不推送**）：

```bash
npm run release:patch   # 或 release:minor / release:major
# 仅预览：npm run release -- patch --dry-run
# 只改文件：npm run release -- patch --no-git
git push origin HEAD && git push origin vX.Y.Z
```

4. 推送 `v*` 后，[`.github/workflows/release.yml`](../.github/workflows/release.yml) 会合并两份更新日志的对应版本小节，创建中英双语 GitHub Release。

**自动生成内容**

| 产物 | 来源 |
|------|------|
| `CHANGELOG.md` 版本节 | 上一 `v*` 标签以来的提交说明（`feat`→Added，`fix`→Fixed，其余→Changed）**加上** `Unreleased` 条目 |
| `CHANGELOG.zh-CN.md` 版本节 | 从必填的中文 `Unreleased` 摘要生成，绝不再回退为英文条目 |
| `package.json` `version` | 语义化版本递增 |
| git 标签 `vX.Y.Z` | 打在发版提交上的附注标签 |
| GitHub Release | Workflow 合并该版本的英文与中文更新日志小节 |

