import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

// Product / provider names and address examples intentionally keep their spelling.
const invariantText = new Set([
  'Paris Tour', 'Paris Tour v', 'Booking', '.com', '· Google',
  'MapLibre · OpenStreetMap', 'Wikimedia Commons', 'API', 'CET',
  'your-name@example.com', 'partner@example.com',
])
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
  entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)])
const failures = []
const hasWords = (text) => /\p{Script=Han}|[A-Za-z]{2}/u.test(text)
for (const file of walk('src').filter((f) => f.endsWith('.tsx') && !f.includes('/__tests__/'))) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  const report = (node, text) => {
    const value = text.trim()
    if (hasWords(value) && !invariantText.has(value)) {
      failures.push(`${file}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}: ${value.slice(0, 100)}`)
    }
  }
  const visit = (node) => {
    if (ts.isJsxText(node)) report(node, node.text)
    if (ts.isJsxAttribute(node) && ['aria-label', 'title', 'placeholder', 'alt'].includes(node.name.getText(source))) {
      if (node.initializer && ts.isStringLiteral(node.initializer)) report(node, node.initializer.text)
      if (node.initializer && ts.isJsxExpression(node.initializer) && node.initializer.expression && ts.isStringLiteralLike(node.initializer.expression)) report(node, node.initializer.expression.text)
    }
    if (ts.isJsxExpression(node) && node.parent && !ts.isJsxAttribute(node.parent) && node.expression && ts.isStringLiteralLike(node.expression)) report(node, node.expression.text)
    ts.forEachChild(node, visit)
  }
  visit(source)
}
if (failures.length) {
  console.error(`Move UI text to i18n resources:\n${failures.join('\n')}`)
  process.exit(1)
}
console.log('UI text isolation passed (brand names and address examples excluded).')
