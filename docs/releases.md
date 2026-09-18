# Release workflow

Version history lives in [CHANGELOG.md](../CHANGELOG.md) / [CHANGELOG.zh-CN.md](../CHANGELOG.zh-CN.md).

1. Land your feature commits on `main` (Conventional Commits help: `feat:`, `fix:`, …). Before releasing, add a curated Chinese summary under `## [Unreleased]` in `CHANGELOG.zh-CN.md`; the release command stops if it is missing.
2. One-time baseline (if no `v*` tags exist yet):

```bash
git tag -a v0.2.0 -m v0.2.0 620c6a8
git push origin v0.2.0
```

3. Cut the next release locally (writes changelogs + `package.json`, commits, annotated tag — **does not push**):

```bash
npm run release:patch   # or release:minor / release:major
# preview only: npm run release -- patch --dry-run
# files only:   npm run release -- patch --no-git
git push origin HEAD && git push origin vX.Y.Z
```

4. Pushing `v*` runs [`.github/workflows/release.yml`](../.github/workflows/release.yml), which opens a bilingual GitHub Release from the matching sections in both changelogs.

**What gets auto-generated**

| Artifact | Source |
|----------|--------|
| `CHANGELOG.md` section | Commit subjects since previous `v*` tag (`feat`→Added, `fix`→Fixed, else Changed) **plus** any `Unreleased` bullets |
| `CHANGELOG.zh-CN.md` section | Curated Chinese bullets promoted from its required `Unreleased` section; never falls back to English |
| `package.json` `version` | Semver bump |
| git tag `vX.Y.Z` | Annotated tag on the release commit |
| GitHub Release | Workflow combines that version’s English and Chinese changelog sections |

