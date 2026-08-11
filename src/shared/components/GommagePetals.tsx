import type { CSSProperties } from 'react'

/** Soft crimson petal burst for timeline stop 「抹煞」 delete. */
const PETAL_COUNT = 32

/** Deterministic scatter so SSR/hydration and re-renders stay stable. */
function petalStyle(i: number): CSSProperties {
  const t = (i + 1) * 0.6180339887
  const frac = t % 1
  // Bias to upper-diagonal: mostly upward with left/right fan (斜上方).
  const side = i % 2 === 0 ? 1 : -1
  const spread = 0.35 + (i % 7) * 0.09
  const dist = 56 + (i % 6) * 16 + frac * 48
  const dx = side * dist * spread * (0.55 + ((i * 3) % 5) * 0.12)
  const dy = -dist * (0.72 + (i % 4) * 0.08) - 36 - (i % 5) * 10
  const rot = -55 + frac * 160 + side * 18
  const w = 6 + (i % 5)
  const h = 12 + (i % 6) * 2
  const delay = (i % 8) * 22 + Math.floor(i / 8) * 10
  const dur = 640 + (i % 6) * 45
  const tones = [
    'linear-gradient(160deg, #c23a3a 0%, #8b1e2d 55%, #5c1520 100%)',
    'linear-gradient(145deg, #d4524a 0%, #a82832 50%, #6e1a24 100%)',
    'linear-gradient(170deg, #b83248 0%, #7a1f2e 60%, #4a121c 100%)',
    'linear-gradient(155deg, #e06a5c 0%, #b33a3a 45%, #7a2228 100%)',
    'linear-gradient(150deg, #c94a52 0%, #9a2834 50%, #5a1820 100%)',
  ]
  return {
    ['--gommage-dx' as string]: `${dx.toFixed(1)}px`,
    ['--gommage-dy' as string]: `${dy.toFixed(1)}px`,
    ['--gommage-rot' as string]: `${rot.toFixed(1)}deg`,
    ['--gommage-delay' as string]: `${delay}ms`,
    ['--gommage-dur' as string]: `${dur}ms`,
    width: w,
    height: h,
    background: tones[i % tones.length],
    left: `${12 + ((i * 19) % 72)}%`,
    top: `${22 + ((i * 11) % 48)}%`,
  }
}

export function GommagePetals() {
  return (
    <div className="gommage-petals" aria-hidden>
      {Array.from({ length: PETAL_COUNT }, (_, i) => (
        <span key={i} className="gommage-petal" style={petalStyle(i)} />
      ))}
    </div>
  )
}
