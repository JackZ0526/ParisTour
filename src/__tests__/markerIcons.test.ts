import { describe, expect, it } from 'vitest'
import {
  airportIconUrl,
  homeIconUrl,
} from '../features/map/services/markerIconUrls'

function decodeSvg(url: string): string {
  return decodeURIComponent(url.slice(url.indexOf(',') + 1))
}

describe('special map marker icons', () => {
  it('uses an explicit SVG circle instead of CSS on the root SVG', () => {
    for (const url of [homeIconUrl(), airportIconUrl()]) {
      const svg = decodeSvg(url)
      expect(svg).toContain('<circle cx="16" cy="16" r="15"')
      expect(svg).not.toContain('style=')
    }
  })

  it('keeps the Lucide house and plane glyphs inside the marker canvas', () => {
    expect(decodeSvg(homeIconUrl())).toContain('lucide-house')
    expect(decodeSvg(airportIconUrl())).toContain('lucide-plane')
    expect(decodeSvg(homeIconUrl())).toContain('width="18" height="18"')
  })
})
