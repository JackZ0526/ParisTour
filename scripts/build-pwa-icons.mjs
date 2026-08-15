/**
 * Build PWA static assets from public/favicon.svg:
 *   public/apple-touch-icon.png   180x180   iOS home-screen icon
 *   public/icons-192.png          192x192   PWA manifest
 *   public/icons-512.png          512x512   PWA manifest (splash/hi-res)
 *   public/splash.png             1290x2796 iOS launch image (iPhone 15 Pro Max)
 *
 * Theme color #1c2420 matches manifest.theme_color.
 */
import sharp from 'sharp'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const SVG_PATH = resolve(ROOT, 'public/favicon.svg')
const THEME = { r: 0x1c, g: 0x24, b: 0x20, alpha: 1 }

async function renderPng(size, outFile) {
  await sharp(SVG_PATH, { density: 384 })
    .resize(size, size, { fit: 'contain', background: THEME })
    .png()
    .toFile(resolve(ROOT, outFile))
  console.log(`  ✓ ${outFile}  (${size}x${size})`)
}

async function renderSplash() {
  const W = 1290
  const H = 2796
  // Apple auto-shrinks the icon ~12% on launch screens; render at 280 to feel right.
  const iconBuf = await sharp(SVG_PATH, { density: 384 })
    .resize(280, 280, { fit: 'contain', background: THEME })
    .png()
    .toBuffer()
  await sharp({
    create: { width: W, height: H, channels: 4, background: THEME },
  })
    .composite([{ input: iconBuf, gravity: 'center' }])
    .png()
    .toFile(resolve(ROOT, 'public/splash.png'))
  console.log(`  ✓ public/splash.png  (${W}x${H})`)
}

const svg = readFileSync(SVG_PATH, 'utf8')
if (!svg.includes('<svg')) {
  throw new Error('public/favicon.svg does not look like SVG; aborting.')
}

console.log('Building PWA assets from public/favicon.svg:')
await renderPng(180, 'public/apple-touch-icon.png')
await renderPng(192, 'public/icons-192.png')
await renderPng(512, 'public/icons-512.png')
await renderSplash()
console.log('Done.')
