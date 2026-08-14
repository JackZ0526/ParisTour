import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const sourceRoot = path.resolve('src')

async function collectTsxFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map((entry) => {
      const target = path.join(directory, entry.name)
      if (entry.isDirectory()) return collectTsxFiles(target)
      return entry.isFile() && entry.name.endsWith('.tsx') ? [target] : []
    }),
  )
  return nested.flat()
}

const violations = []
const iconGlyphPattern = /[‹›⋮✕×]/u
for (const file of await collectTsxFiles(sourceRoot)) {
  const source = await readFile(file, 'utf8')
  const lines = source.split(/\r?\n/u)
  for (let index = 0; index < lines.length; index += 1) {
    // Numbered Leaflet markers are data visualization labels, not reusable UI icons.
    const isNumberedMapMarker =
      file.endsWith(path.join('map', 'components', 'markerIcons.tsx')) &&
      lines[index].includes('const svg = `<svg')
    // The route overlay is geospatial data visualization, not a UI icon.
    const isMapRouteOverlay =
      file.endsWith(path.join('map', 'components', 'TripMap.tsx')) &&
      lines[index].includes('<svg')
    if (
      lines[index].includes('<svg') &&
      !isNumberedMapMarker &&
      !isMapRouteOverlay
    ) {
      violations.push(`${path.relative(process.cwd(), file)}:${index + 1}`)
    }
    if (iconGlyphPattern.test(lines[index])) {
      violations.push(`${path.relative(process.cwd(), file)}:${index + 1} (icon-like glyph)`)
    }
  }
}

if (violations.length) {
  console.error('UI icons must use lucide-react; handwritten <svg> found:')
  for (const violation of violations) console.error(`  - ${violation}`)
  console.error('Brand marks belong in public/brand and should be rendered as image assets.')
  process.exitCode = 1
} else {
  console.log('Lucide icon policy passed.')
}
