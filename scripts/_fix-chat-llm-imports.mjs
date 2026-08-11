// One-shot: rewrite LLM + chat + tripChat + tripChatPanel + LlmModelPicker + InlineMarkdown
// + translate import paths after stage 2.10.
//
// Run with: node scripts/_fix-chat-llm-imports.mjs
import fs from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve('src')

// Map `'./llm'` / `'./llmMemo'` / `'./llmArtifactStore'` / `'./llm/prompts'` (relative inside services/)
// to the new shared path. Only meaningful in files that used to be in src/services/.
const subs = [
  // From `src/services/anything.ts` (now moved into features/) that referenced ./llm*:
  // `./llm` -> `../../shared/services/llm/llm` (one level up to features/<x>/, then up to src/, down to shared/...)
  // We are conservative: only rewrite from files under features/* that previously
  // imported from services/llm, llmMemo, llmArtifactStore. The source file
  // location drives the depth.
]

// Simple strategy: walk every file under features/* and shared/*; for every
// import string that ends in a moved module name, rewrite the relative path
// using the file's actual location.

const moved = {
  llm: 'shared/services/llm/llm',
  llmMemo: 'shared/services/llm/llmMemo',
  llmArtifactStore: 'shared/services/llm/llmArtifactStore',
  prompts: 'shared/services/llm/prompts',
  tripChat: '../../chat/services/tripChat',
  translate: '../../chat/services/translate',
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
  // file is absolute, return path relative to src/
  return path.relative(root, file).split(path.sep).join('/')
}

function computeNewPath(importer, oldImport) {
  // importer: relative to src/ (e.g. 'features/chat/services/tripChat.ts')
  // oldImport: e.g. '../../../services/llm'
  // We resolve the old import to absolute, get the resolved file basename
  // without extension, then map via `moved` to the new path relative to src/.
  const importerAbs = path.resolve(root, importer)
  const oldAbs = path.resolve(path.dirname(importerAbs), oldImport)
  // oldAbs may point to a .ts file or a directory
  const base = path.basename(oldAbs, path.extname(oldAbs))
  const target = moved[base]
  if (!target) return null
  // Compute relative path from importer to target
  const targetAbs = path.resolve(root, target)
  let rel = path.relative(path.dirname(importerAbs), targetAbs)
  if (!rel.startsWith('.')) rel = './' + rel
  return rel.split(path.sep).join('/')
}

const importRe = /from\s+(['"])([^'"]+)\1/g

for await (const file of walk(root)) {
  const rel = relToSrc(file)
  if (rel.startsWith('shared/') && rel.includes('/llm/')) {
    // skip the moved llm files themselves
    if (rel === 'shared/services/llm/llm.ts' || rel === 'shared/services/llm/llmMemo.ts' || rel === 'shared/services/llm/llmArtifactStore.ts' || rel === 'shared/services/llm/prompts.ts') {
      continue
    }
  }
  const original = await fs.readFile(file, 'utf8')
  let updated = original
  let mutated = false

  updated = updated.replace(importRe, (match, quote, imp) => {
    // Only handle relative paths starting with .
    if (!imp.startsWith('.')) return match
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
