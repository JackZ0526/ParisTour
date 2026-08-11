// One-shot: rewrite shared component / lib / util paths after stage 2.11.
import fs from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve('src')

const moved = {
  CloseIconButton: 'shared/components/CloseIconButton',
  LoadingIndicator: 'shared/components/LoadingIndicator',
  GommagePetals: 'shared/components/GommagePetals',
  supabase: 'shared/lib/supabase',
  priceLevel: 'shared/utils/priceLevel',
  placeTitle: 'shared/utils/placeTitle',
}

async function* walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) yield* walk(full)
    else if (e.name.endsWith('.ts') || e.name.endsWith('.tsx')) yield full
  }
}

function relToSrc(file) {
  return path.relative(root, file).split(path.sep).join('/')
}

function computeNewPath(importer, oldImport) {
  if (!oldImport.startsWith('.')) return null
  const importerAbs = path.resolve(root, importer)
  const oldAbs = path.resolve(path.dirname(importerAbs), oldImport)
  const base = path.basename(oldAbs, path.extname(oldAbs))
  const target = moved[base]
  if (!target) return null
  const targetAbs = path.resolve(root, target)
  let rel = path.relative(path.dirname(importerAbs), targetAbs)
  if (!rel.startsWith('.')) rel = './' + rel
  return rel.split(path.sep).join('/')
}

const importRe = /from\s+(['"])([^'"]+)\1/g

for await (const file of walk(root)) {
  const rel = relToSrc(file)
  if (rel.startsWith('shared/')) continue
  const original = await fs.readFile(file, 'utf8')
  let updated = original
  let mutated = false

  updated = updated.replace(importRe, (match, quote, imp) => {
    const newPath = computeNewPath(rel, imp)
    if (!newPath || newPath === imp) return match
    mutated = true
    return `from ${quote}${newPath}${quote}`
  })

  if (mutated && updated !== original) {
    await fs.writeFile(file, updated, 'utf8')
    console.log('updated:', rel)
  }
}
