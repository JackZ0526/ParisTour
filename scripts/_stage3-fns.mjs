// helper: print line ranges for the 10 business functions
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.resolve(__dirname, '..', 'src', 'shared', 'services', 'llm', 'llm.ts')
const src = readFileSync(file, 'utf8')
const lines = src.split(/\r?\n/)

const fns = [
  'generatePlaceDescription',
  'generateHotelDetailCopy',
  'generatePlaceDetailCopy',
  'generateDayCopy',
  'resolveItineraryStart',
  'recommendPlacesForDay',
  'recommendHotelsForTrip',
  'suggestPopularDestinations',
  'generateFullItinerary',
  'generateSingleDayItinerary',
]

// locate every "export (async) function NAME" line
const matches = fns.map(name => {
  const re = new RegExp(`^export (async )?function ${name}\\b`)
  const idx = lines.findIndex(l => re.test(l))
  return { name, line: idx + 1 }
})
console.log('function starts:')
for (const m of matches) console.log(' ', m.name.padEnd(36), m.line)

// last line of file
console.log('total lines:', lines.length)

// also find any "export" lines that bracket the body range of the LAST function
// (so we know where the file ends vs the start of a next export)
const allExports = []
for (let i = 0; i < lines.length; i++) {
  if (/^export (async )?(function|class|interface|type|const|enum) /.test(lines[i])) {
    allExports.push({ i: i + 1, text: lines[i] })
  }
}
console.log('\nALL exports in llm.ts:')
for (const e of allExports) console.log(' ', e.i.toString().padStart(5), e.text.slice(0, 100))
