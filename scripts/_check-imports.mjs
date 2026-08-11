// Quick sanity check: find any leftover absolute-looking imports after stage 2.
import fs from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve('src')
let bad = 0
let total = 0

async function* walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) yield* walk(p)
    else if (e.name.endsWith('.ts') || e.name.endsWith('.tsx')) yield p
  }
}

const importRe = /from\s+(?:(['"])([^'"]+)\1)/g

for await (const file of walk(root)) {
  total++
  const c = await fs.readFile(file, 'utf8')
  const matches = [...c.matchAll(importRe)]
  for (const m of matches) {
    const imp = m[2]
    if (!imp.startsWith('.')) continue
    // Suspicious if it goes up too many levels (>5 ../s would mean we escaped src/)
    const ups = (imp.match(/\.\.\//g) || []).length
    if (ups > 4) {
      console.log('TOO DEEP:', path.relative(root, file), '->', imp)
      bad++
    }
  }
}
console.log('total files:', total, 'deep imports:', bad)
