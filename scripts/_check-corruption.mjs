import fs from 'node:fs';
const s = fs.readFileSync('src/hooks/useItineraryGeneration.ts', 'utf8');
const lines = s.split('\n');
// Find lines ending with a Chinese period (。) but no trailing quote/paren
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  if (l.endsWith('。') && !l.match(/['"`)\]]\s*$/)) {
    console.log(`Line ${i + 1}: ${JSON.stringify(l)}`);
  }
}
