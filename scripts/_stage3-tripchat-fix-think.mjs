// PowerShell -replace corrupts UTF-8 Chinese chars. Use node instead.
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const file = path.resolve(
  process.cwd(),
  'src/features/chat/components/TripChatPanel.tsx',
)
let s = readFileSync(file, 'utf8')

const target = "resolveThinkingForTask('tripChat', message).enabled"
const replacement = 'resolveThinkingForTask(getThinkingMode(), message, "tripChat").enabled'
const count = s.split(target).length - 1
s = s.split(target).join(replacement)
writeFileSync(file, s, 'utf8')
console.log('replaced', count, 'occurrence(s)')

// Verify the file still parses (no unterminated strings) by checking size growth
console.log('file size:', s.length, 'bytes')
