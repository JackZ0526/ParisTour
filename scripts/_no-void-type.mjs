import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const SRC_DIRS = ['src', 'api', 'scripts']

// Intentionally narrow: forbid `void <Identifier>` in *type* positions.
// Heuristic: only flag when `void` is preceded by a likely type delimiter.
//
// We intentionally *exclude* `)` so normal `void <expression>` statements
// (e.g. `) void foo()`) don't get flagged.
const VOID_TYPE_REGEX =
  /(?:[:<,|&\[\{])\s*void\s+[A-Za-z_][A-Za-z0-9_]*/m

function walk(dir) {
  /** @type {string[]} */
  const out = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const ent of entries) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === 'dist' || ent.name === 'coverage' || ent.name.startsWith('.')) continue
      out.push(...walk(p))
    } else {
      out.push(p)
    }
  }
  return out
}

function fileMatches(filePath) {
  const text = fs.readFileSync(filePath, 'utf8')
  const lines = text.split(/\r?\n/)
  const hits = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // We run regex per-line to report accurate line numbers.
    if (VOID_TYPE_REGEX.test(line)) {
      const m = line.match(VOID_TYPE_REGEX)
      hits.push({ line: i + 1, match: m ? m[0] : 'void <T>' })
    }
  }
  return hits
}

let totalHits = 0
/** @type {Array<{file:string, hits:Array<{line:number, match:string}>}>} */
const reports = []

for (const d of SRC_DIRS) {
  const abs = path.join(ROOT, d)
  if (!fs.existsSync(abs)) continue
  const files = walk(abs)
  for (const f of files) {
    if (!/\.(ts|tsx|mts|cts)$/.test(f)) continue
    const hits = fileMatches(f)
    if (hits.length) {
      totalHits += hits.length
      reports.push({ file: path.relative(ROOT, f), hits })
    }
  }
}

if (totalHits > 0) {
  console.error(`Found ${totalHits} forbidden “void <Identifier>” type usages:`)
  for (const r of reports) {
    console.error(`\n${r.file}`)
    for (const h of r.hits) {
      console.error(`  L${h.line}: ${h.match}`)
    }
  }
  process.exit(1)
}

console.log('OK: no forbidden void-type patterns found.')

