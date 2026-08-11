// One-shot helper: rewrite map-related import paths in features/*/components|hooks|services/*.ts(x)
// Run with: node scripts/_fix-map-imports.mjs
import fs from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve('src')

const mapSubstitutions = [
  // `'../../../services/googleNav'` -> `'../../map/services/googleNav'`
  [/'\.\.\/\.\.\/\.\.\/services\/googleNav'/g, "'../../map/services/googleNav'"],
  // `'../../../services/googlePlaceDetails'` -> `'../../map/services/googlePlaceDetails'`
  [/'\.\.\/\.\.\/\.\.\/services\/googlePlaceDetails'/g, "'../../map/services/googlePlaceDetails'"],
  // `'../../../services/googlePlacePhotos'` -> `'../../map/services/googlePlacePhotos'`
  [/'\.\.\/\.\.\/\.\.\/services\/googlePlacePhotos'/g, "'../../map/services/googlePlacePhotos'"],
  // `'../../../services/googleMapsKey'` -> `'../../map/services/googleMapsKey'`
  [/'\.\.\/\.\.\/\.\.\/services\/googleMapsKey'/g, "'../../map/services/googleMapsKey'"],
  // `'../../../services/googleMapsErrors'` -> `'../../map/services/googleMapsErrors'`
  [/'\.\.\/\.\.\/\.\.\/services\/googleMapsErrors'/g, "'../../map/services/googleMapsErrors'"],
  // `'../../../services/geocode'` -> `'../../map/services/geocode'`
  [/'\.\.\/\.\.\/\.\.\/services\/geocode'/g, "'../../map/services/geocode'"],
  // `'../../../components/GoogleMapsProvider'` -> `'../../map/components/GoogleMapsProvider'`
  [/'\.\.\/\.\.\/\.\.\/components\/GoogleMapsProvider'/g, "'../../map/components/GoogleMapsProvider'"],
  // `'../../../components/markerIcons'` -> `'../../map/components/markerIcons'`
  [/'\.\.\/\.\.\/\.\.\/components\/markerIcons'/g, "'../../map/components/markerIcons'"],
  // `'../services/googlePlaceDetails'` (in components/TripChatPanel.tsx) -> `'../features/map/services/googlePlaceDetails'`
  [/'\.\.\/services\/googlePlaceDetails'/g, "'../features/map/services/googlePlaceDetails'"],
  // `'./GoogleMapsProvider'` (in components/TripChatPanel.tsx) -> `'../features/map/components/GoogleMapsProvider'`
  [/'\.\/GoogleMapsProvider'/g, "'../features/map/components/GoogleMapsProvider'"],
]

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      await walk(full)
    } else if (e.name.endsWith('.ts') || e.name.endsWith('.tsx')) {
      const original = await fs.readFile(full, 'utf8')
      let updated = original
      for (const [re, repl] of mapSubstitutions) {
        updated = updated.replace(re, repl)
      }
      if (updated !== original) {
        await fs.writeFile(full, updated, 'utf8')
        console.log('updated:', path.relative(process.cwd(), full))
      }
    }
  }
}

await walk(root)
