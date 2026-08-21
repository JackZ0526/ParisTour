/**
 * Cut a Paris Tour release: bump package.json, prepend Keep-a-Changelog
 * sections (EN + ZH), optionally commit + tag vX.Y.Z (no push).
 *
 * Usage:
 *   node scripts/release.mjs patch|minor|major [X.Y.Z]
 *   npm run release:patch
 *   npm run release:minor
 *   npm run release:major
 *   npm run release -- 0.3.0
 *
 * Flags:
 *   --dry-run   Print planned changes; do not write files or run git
 *   --no-git    Update files only (no commit / tag)
 *
 * Changelog sources: git subjects since previous v* tag (or since last
 * changelog version / root). Conventional Commits preferred; otherwise
 * subjects are bucketed by simple heuristics.
 *
 * ZH file: curated Chinese bullets from CHANGELOG.zh-CN.md's Unreleased block.
 * A release with commits is rejected when those Chinese notes are missing, so
 * the localized changelog can never silently fall back to English.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = process.cwd()
const PKG_PATH = resolve(ROOT, 'package.json')
const CHANGELOG_EN = resolve(ROOT, 'CHANGELOG.md')
const CHANGELOG_ZH = resolve(ROOT, 'CHANGELOG.zh-CN.md')
const REPO_URL = 'https://github.com/JackZ0526/ParisTour'

const SKIP_SUBJECT =
  /^(chore\(release\)|release:|merge (branch|pull request)|wip\b)/i

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const noGit = args.includes('--no-git')
const positional = args.filter((a) => !a.startsWith('--'))

function usage(msg) {
  if (msg) console.error(msg)
  console.error(`
Usage: node scripts/release.mjs <patch|minor|major|X.Y.Z> [--dry-run] [--no-git]
`)
  process.exit(msg ? 1 : 0)
}

function run(cmd, cmdArgs, opts = {}) {
  const out = execFileSync(cmd, cmdArgs, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: opts.stdio ?? ['ignore', 'pipe', 'pipe'],
    ...opts,
  })
  return typeof out === 'string' ? out.trim() : ''
}

function todayUTC() {
  return new Date().toISOString().slice(0, 10)
}

function parseSemver(v) {
  const m = String(v).trim().match(/^v?(\d+)\.(\d+)\.(\d+)$/)
  if (!m) return null
  return { major: +m[1], minor: +m[2], patch: +m[3], raw: `${m[1]}.${m[2]}.${m[3]}` }
}

function bump(ver, kind) {
  if (kind === 'major') return `${ver.major + 1}.0.0`
  if (kind === 'minor') return `${ver.major}.${ver.minor + 1}.0`
  if (kind === 'patch') return `${ver.major}.${ver.minor}.${ver.patch + 1}`
  throw new Error(`Unknown bump kind: ${kind}`)
}

function listTags() {
  try {
    const out = run('git', ['tag', '-l', 'v*', '--sort=-v:refname'])
    return out ? out.split(/\r?\n/).filter(Boolean) : []
  } catch {
    return []
  }
}

function previousTag(tags, nextVersion) {
  const next = `v${nextVersion}`
  for (const t of tags) {
    if (t === next) continue
    if (parseSemver(t)) return t
  }
  return null
}

function commitsSince(ref) {
  const range = ref ? `${ref}..HEAD` : 'HEAD'
  let out
  try {
    out = run('git', ['log', range, '--pretty=format:%s', '--no-merges'])
  } catch {
    out = ''
  }
  if (!out) return []
  return out
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !SKIP_SUBJECT.test(s))
}

function classifySubject(subject) {
  const conv = subject.match(
    /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([^)]+\))?(!)?:\s*(.+)$/i,
  )
  if (conv) {
    const type = conv[1].toLowerCase()
    const breaking = Boolean(conv[3]) || /BREAKING CHANGE/i.test(subject)
    const desc = conv[4].trim()
    if (breaking) return { bucket: 'Changed', text: `**Breaking:** ${desc}` }
    if (type === 'feat') return { bucket: 'Added', text: desc }
    if (type === 'fix') return { bucket: 'Fixed', text: desc }
    if (type === 'perf') return { bucket: 'Changed', text: desc }
    return { bucket: 'Changed', text: desc }
  }

  if (/^(add|added|support|introduce|create)\b/i.test(subject)) {
    return { bucket: 'Added', text: subject }
  }
  if (/^(fix|fixed|bugfix|hotfix|resolve)\b/i.test(subject)) {
    return { bucket: 'Fixed', text: subject }
  }
  if (/^(remove|removed|delete|drop)\b/i.test(subject)) {
    return { bucket: 'Changed', text: subject }
  }
  return { bucket: 'Changed', text: subject }
}

function groupCommits(subjects) {
  const buckets = { Added: [], Changed: [], Fixed: [] }
  const seen = new Set()
  for (const s of subjects) {
    const { bucket, text } = classifySubject(s)
    const key = `${bucket}:${text.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    buckets[bucket].push(text)
  }
  return buckets
}

function mergeBuckets(into, from) {
  const seen = new Set(
    [...into.Added, ...into.Changed, ...into.Fixed].map((t) => t.toLowerCase()),
  )
  for (const name of ['Added', 'Changed', 'Fixed']) {
    for (const text of from[name]) {
      const key = text.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      into[name].push(text)
    }
  }
  return into
}

/** Pull bullet lines out of the current Unreleased block (EN or ZH headers). */
function parseUnreleasedBuckets(content) {
  const buckets = { Added: [], Changed: [], Fixed: [] }
  const blockMatch = content.match(
    /## \[Unreleased\]([\s\S]*?)(?=\n## \[|\n## Links|\n## 链接|$)/,
  )
  if (!blockMatch) return buckets
  const block = blockMatch[1]
  const sectionRe =
    /### (Added|Changed|Fixed|新增|变更|修复)\s*\n([\s\S]*?)(?=\n### |\n## |$)/g
  const map = {
    Added: 'Added',
    Changed: 'Changed',
    Fixed: 'Fixed',
    新增: 'Added',
    变更: 'Changed',
    修复: 'Fixed',
  }
  let m
  while ((m = sectionRe.exec(block))) {
    const bucket = map[m[1]]
    const bullets = m[2]
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.startsWith('- '))
      .map((l) => l.slice(2).trim())
      .filter(Boolean)
    buckets[bucket].push(...bullets)
  }
  return buckets
}

function latestChangelogVersion(content) {
  const versions = [...content.matchAll(/^## \[(\d+\.\d+\.\d+)\]/gm)].map((m) =>
    parseSemver(m[1]),
  )
  const sorted = versions.filter(Boolean).sort((a, b) => {
    if (a.major !== b.major) return b.major - a.major
    if (a.minor !== b.minor) return b.minor - a.minor
    return b.patch - a.patch
  })
  return sorted[0] || null
}

function renderEnSection(version, date, buckets, blurb) {
  const lines = [`## [${version}] - ${date}`, '']
  if (blurb) {
    lines.push(blurb, '')
  }
  for (const name of ['Added', 'Changed', 'Fixed']) {
    const items = buckets[name]
    if (!items.length) continue
    lines.push(`### ${name}`, '')
    for (const item of items) lines.push(`- ${item}`)
    lines.push('')
  }
  if (!buckets.Added.length && !buckets.Changed.length && !buckets.Fixed.length) {
    lines.push('### Changed', '', '- Maintenance release (no categorized commit subjects).', '')
  }
  return lines.join('\n').trimEnd() + '\n'
}

function renderZhSection(version, date, buckets) {
  const headerMap = { Added: '新增', Changed: '变更', Fixed: '修复' }
  const lines = [`## [${version}] - ${date}`, '']
  for (const name of ['Added', 'Changed', 'Fixed']) {
    const items = buckets[name]
    if (!items.length) continue
    lines.push(`### ${headerMap[name]}`, '')
    for (const item of items) lines.push(`- ${item}`)
    lines.push('')
  }
  if (!buckets.Added.length && !buckets.Changed.length && !buckets.Fixed.length) {
    lines.push('### 变更', '', '- 维护版本（没有可分类的提交记录）。', '')
  }
  return lines.join('\n').trimEnd() + '\n'
}

/** Keep Unreleased heading; drop its body so the next cycle starts clean. */
function resetUnreleased(content, lang) {
  const unreleasedRe =
    lang === 'zh'
      ? /## \[Unreleased\][\s\S]*?(?=\n## \[|\n## 链接|\n## Links|$)/
      : /## \[Unreleased\][\s\S]*?(?=\n## \[|\n## Links|\n## 链接|$)/
  const stub =
    lang === 'zh'
      ? `## [Unreleased]\n\n### 新增\n\n### 变更\n\n### 修复\n\n`
      : `## [Unreleased]\n\n### Added\n\n### Changed\n\n### Fixed\n\n`
  if (!unreleasedRe.test(content)) {
    // Insert after intro (before first versioned ## [)
    const firstVersion = content.search(/\n## \[\d/)
    if (firstVersion === -1) return `${content.trimEnd()}\n\n${stub}`
    return content.slice(0, firstVersion + 1) + stub + content.slice(firstVersion + 1)
  }
  return content.replace(unreleasedRe, stub)
}

function insertVersionAfterUnreleased(content, section, lang) {
  let next = resetUnreleased(content, lang)
  const marker = '## [Unreleased]'
  const idx = next.indexOf(marker)
  if (idx === -1) {
    return `${next.trimEnd()}\n\n${section}\n`
  }
  // Find end of Unreleased block (after stub)
  const afterMarker = next.indexOf('\n## [', idx + marker.length)
  const insertAt = afterMarker === -1 ? next.length : afterMarker
  return `${next.slice(0, insertAt).trimEnd()}\n\n${section}\n${next.slice(insertAt).replace(/^\n+/, '\n')}`
}

function updateLinks(content, version, prevTag) {
  const unreleasedCompare = prevTag
    ? `${REPO_URL}/compare/v${version}...HEAD`
    : `${REPO_URL}/compare/v${version}...HEAD`
  const thisCompare = prevTag
    ? `${REPO_URL}/compare/${prevTag}...v${version}`
    : `${REPO_URL}/releases/tag/v${version}`

  const linkLineUnreleased = `- [Unreleased]: ${unreleasedCompare}`
  const linkLineThis = `- [${version}]: ${thisCompare}`

  if (/## (Links|链接)/.test(content)) {
    let next = content.replace(
      /- \[Unreleased\]: .+/m,
      linkLineUnreleased,
    )
    if (new RegExp(`^- \\[${version.replace(/\./g, '\\.')}\\]:`, 'm').test(next)) {
      next = next.replace(
        new RegExp(`^- \\[${version.replace(/\./g, '\\.')}\\]: .+`, 'm'),
        linkLineThis,
      )
    } else {
      next = next.replace(linkLineUnreleased, `${linkLineUnreleased}\n${linkLineThis}`)
    }
    return next
  }

  const linksHeader = content.includes('更新日志') ? '## 链接' : '## Links'
  return `${content.trimEnd()}\n\n${linksHeader}\n\n${linkLineUnreleased}\n${linkLineThis}\n`
}

function extractSection(changelog, version) {
  const re = new RegExp(
    `## \\[${version.replace(/\./g, '\\.')}\\][\\s\\S]*?(?=\\n## \\[|\\n## Links|\\n## 链接|$)`,
  )
  const m = changelog.match(re)
  return m ? m[0].trim() + '\n' : ''
}

function main() {
  if (!positional.length) usage('Missing version bump argument.')

  const kindOrVer = positional[0]
  const pkg = JSON.parse(readFileSync(PKG_PATH, 'utf8'))
  const current = parseSemver(pkg.version) || parseSemver('0.0.0')
  if (!current) usage(`Invalid package.json version: ${pkg.version}`)

  const enExisting = readFileSync(CHANGELOG_EN, 'utf8')
  const zhExisting = readFileSync(CHANGELOG_ZH, 'utf8')

  let nextVersion
  if (/^\d+\.\d+\.\d+$/.test(kindOrVer)) {
    nextVersion = kindOrVer
  } else if (['patch', 'minor', 'major'].includes(kindOrVer)) {
    // If package is still 0.0.0 but changelogs document a baseline, bump from that.
    let base = current
    if (current.raw === '0.0.0') {
      const latest = latestChangelogVersion(enExisting)
      if (latest) base = latest
    }
    nextVersion = bump(base, kindOrVer)
  } else {
    usage(`Unknown argument: ${kindOrVer}`)
  }

  if (!parseSemver(nextVersion)) usage(`Invalid version: ${nextVersion}`)

  const tags = listTags()
  const prev = previousTag(tags, nextVersion)
  let subjects = []
  if (prev) {
    subjects = commitsSince(prev)
  } else {
    // Avoid dumping the entire repo history into the first automated cut.
    console.warn(
      'No previous v* tag — skipping git-log dump (prevents duplicating seeded history).',
    )
    console.warn(
      'Tip: tag the current baseline once, e.g. git tag -a v0.2.0 -m v0.2.0 620c6a8',
    )
    console.warn('Unreleased bullets (if any) are still promoted into this version.')
  }

  const bucketsEn = mergeBuckets(
    groupCommits(subjects),
    parseUnreleasedBuckets(enExisting),
  )
  const bucketsZh = parseUnreleasedBuckets(zhExisting)
  const hasZhNotes =
    bucketsZh.Added.length || bucketsZh.Changed.length || bucketsZh.Fixed.length

  if (subjects.length && !hasZhNotes) {
    console.error(
      'CHANGELOG.zh-CN.md 的 Unreleased 区域缺少中文条目，已中止发版。',
    )
    console.error(
      '请先在“新增 / 变更 / 修复”下整理中文发布摘要，再重新执行 release 命令。',
    )
    process.exit(1)
  }

  const date = todayUTC()

  console.log(`Current package version: ${pkg.version}`)
  console.log(`Next version:            ${nextVersion}`)
  console.log(`Previous tag:            ${prev || '(none)'}`)
  console.log(`Commits included:        ${subjects.length}`)
  for (const s of subjects) console.log(`  - ${s}`)
  console.log(
    `EN bullets: A=${bucketsEn.Added.length} C=${bucketsEn.Changed.length} F=${bucketsEn.Fixed.length}`,
  )

  if (dryRun) {
    console.log('\n--- EN section preview ---\n')
    console.log(renderEnSection(nextVersion, date, bucketsEn))
    console.log('--- ZH section preview ---\n')
    console.log(renderZhSection(nextVersion, date, bucketsZh))
    console.log('(dry-run: no files written, no git)')
    return
  }

  let en = enExisting
  let zh = zhExisting

  if (new RegExp(`## \\[${nextVersion.replace(/\./g, '\\.')}\\]`).test(en)) {
    console.error(
      `CHANGELOG.md already has [${nextVersion}]. Bump further or edit manually.`,
    )
    process.exit(1)
  }

  const enSection = renderEnSection(nextVersion, date, bucketsEn)
  const zhSection = renderZhSection(nextVersion, date, bucketsZh)

  en = insertVersionAfterUnreleased(en, enSection, 'en')
  zh = insertVersionAfterUnreleased(zh, zhSection, 'zh')
  en = updateLinks(en, nextVersion, prev)
  zh = updateLinks(zh, nextVersion, prev)

  pkg.version = nextVersion
  writeFileSync(PKG_PATH, `${JSON.stringify(pkg, null, 2)}\n`)
  writeFileSync(CHANGELOG_EN, en.endsWith('\n') ? en : `${en}\n`)
  writeFileSync(CHANGELOG_ZH, zh.endsWith('\n') ? zh : `${zh}\n`)

  console.log(`Updated package.json → ${nextVersion}`)
  console.log('Updated CHANGELOG.md and CHANGELOG.zh-CN.md')

  if (noGit) {
    console.log('Skipped git commit/tag (--no-git).')
    console.log(`When ready: git tag v${nextVersion} && git push origin v${nextVersion}`)
    return
  }

  try {
    run('git', ['add', 'package.json', 'CHANGELOG.md', 'CHANGELOG.zh-CN.md'], {
      stdio: 'inherit',
    })
    run(
      'git',
      ['commit', '-m', `chore(release): ${nextVersion}`],
      { stdio: 'inherit' },
    )
    run('git', ['tag', '-a', `v${nextVersion}`, '-m', `v${nextVersion}`], {
      stdio: 'inherit',
    })
  } catch (err) {
    console.error(
      'File updates succeeded, but git commit/tag failed. Fix git state, then tag manually.',
    )
    console.error(String(err?.stderr || err?.message || err))
    process.exit(1)
  }

  console.log(`
Tagged v${nextVersion} locally (not pushed).

Publish:
  git push origin HEAD
  git push origin v${nextVersion}

Pushing the tag runs .github/workflows/release.yml, which creates a GitHub Release
from the CHANGELOG.md section for ${nextVersion}.
`)

  // Help CI / humans: print extracted body path hint
  const body = extractSection(en, nextVersion)
  if (body) {
    console.log('Release notes preview:\n')
    console.log(body)
  }
}

main()
