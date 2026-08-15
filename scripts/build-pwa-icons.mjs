/**
 * Build PWA static assets from public/favicon.svg:
 *   public/apple-touch-icon.png   180x180   iOS home-screen icon
 *   public/icons-192.png          192x192   PWA manifest
 *   public/icons-512.png          512x512   PWA manifest (splash/hi-res)
 *   public/splash.png             1290x2796 iOS launch image (iPhone 15 Pro Max)
 *
 * All raster icons get an iOS-style squircle mask (corner radius ≈ 22.37% of
 * the side) so the home-screen icon matches Apple conventions. The favicon
 * itself is shipped as SVG with a matching rx so the browser tab reads the
 * same shape.
 *
 * Theme color #1c2420 matches manifest.theme_color.
 */
import sharp from 'sharp'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const SVG_PATH = resolve(ROOT, 'public/favicon.svg')
const THEME = { r: 0x1c, g: 0x24, b: 0x20, alpha: 1 }
// iOS icon corner radius ≈ 22.37% of the side (Apple HIG).
const CORNER_RATIO = 0.2237

/**
 * Build a square alpha mask shaped like an iOS "squircle" — a regular rounded
 * rect with the canonical Apple corner radius. White = visible, transparent
 * = clipped. We use a CSS-style rounded rect; Apple actually uses a
 * continuous-curvature superellipse, but at icon sizes the visual difference
 * is negligible and rx-based masking matches the favicon SVG cleanly.
 */
function squircleMask(size) {
  const r = Math.round(size * CORNER_RATIO)
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
      <rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="#fff"/>
    </svg>`,
  )
}

async function renderPng(size, outFile) {
  const icon = await sharp(SVG_PATH, { density: 384 })
    .resize(size, size, { fit: 'cover' })
    .png()
    .toBuffer()
  await sharp(icon)
    .composite([{ input: squircleMask(size), blend: 'dest-in' }])
    .png()
    .toFile(resolve(ROOT, outFile))
  console.log(`  ✓ ${outFile}  (${size}x${size}, squircle ${(CORNER_RATIO * 100).toFixed(2)}%)`)
}

async function renderSplash() {
  const W = 1290
  const H = 2796
  // Apple auto-shrinks the icon ~12% on launch screens; render at 280 to feel right.
  const iconSize = 280
  const iconBuf = await sharp(SVG_PATH, { density: 384 })
    .resize(iconSize, iconSize, { fit: 'cover' })
    .composite([{ input: squircleMask(iconSize), blend: 'dest-in' }])
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

// Sync the favicon.svg to match the PNG masks so the browser tab and
// home-screen icon read as the same shape. The original SVG fills the entire
// 1024×1024 viewBox with artwork (no transparency), so we wrap the contents
// in a clipPath shaped like an iOS squircle.
const FAVICON_SIZE = 1024
const FAVICON_RX = Math.round(FAVICON_SIZE * CORNER_RATIO)
const faviconPath = resolve(ROOT, 'public/favicon.svg')
let favicon = readFileSync(faviconPath, 'utf8')

if (!favicon.includes('id="favicon-clip"')) {
  const before = favicon
  // Inject <defs><clipPath id="favicon-clip">…</clipPath></defs> after the
  // opening <svg> tag, then wrap the existing <g>…</g> in a clipped <g>.
  favicon = favicon.replace(
    /<svg([^>]*)>/,
    `<svg$1><defs><clipPath id="favicon-clip"><rect width="${FAVICON_SIZE}" height="${FAVICON_SIZE}" rx="${FAVICON_RX}" ry="${FAVICON_RX}"/></clipPath></defs>`,
  )
  favicon = favicon.replace(/<g>/, '<g clip-path="url(#favicon-clip)">')
  if (favicon !== before) {
    writeFileSync(faviconPath, favicon)
    console.log(`  ✓ public/favicon.svg  (iOS squircle rx=${FAVICON_RX})`)
  } else {
    console.log('  · public/favicon.svg  (unexpected structure, left untouched)')
  }
} else {
  console.log('  · public/favicon.svg  (already clipped, left untouched)')
}

console.log('Building PWA assets from public/favicon.svg:')
await renderPng(180, 'public/apple-touch-icon.png')
await renderPng(192, 'public/icons-192.png')
await renderPng(512, 'public/icons-512.png')
await renderSplash()
console.log('Done.')
