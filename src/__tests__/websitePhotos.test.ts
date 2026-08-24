import { describe, expect, it } from 'vitest'
import {
  extractWebsitePhotos,
  homepageFallbackUrl,
  instagramHandleFromUrl,
  isDirectoryOrSocialUrl,
  isInstagramUrl,
  isPublicHttpsUrl,
  officialWebsiteFromCandidate,
  toPublicHttpsUrl,
} from '../../api/_lib/websitePhotos'

describe('place website photos', () => {
  it('extracts Open Graph and JSON-LD images from a restaurant homepage', () => {
    const html = `
      <meta property="og:image" content="https://cafe.example/hero.jpg" />
      <meta name="twitter:image" content="https://cafe.example/card.jpg" />
      <script type="application/ld+json">
        {"@type":"Restaurant","image":["https://cafe.example/room.jpg","https://instagram.com/p/abc/media"]}
      </script>
    `
    expect(extractWebsitePhotos(html, 'https://cafe.example/')).toEqual([
      'https://cafe.example/hero.jpg',
      'https://cafe.example/card.jpg',
      'https://cafe.example/room.jpg',
    ])
  })

  it('reads an Instagram handle from a profile URL and refuses to treat it as a photo source', () => {
    expect(instagramHandleFromUrl('https://www.instagram.com/cafedeflore/')).toBe(
      'cafedeflore',
    )
    expect(isInstagramUrl('https://www.instagram.com/cafedeflore/')).toBe(true)
    expect(extractWebsitePhotos('', 'https://www.instagram.com/cafedeflore/')).toEqual([])
  })

  it('upgrades http restaurant sites to https', () => {
    expect(toPublicHttpsUrl('http://www.rest-maxan.com/')).toBe(
      'https://www.rest-maxan.com/',
    )
    expect(isPublicHttpsUrl('https://cafedeflore.fr')).toBe(true)
    expect(isPublicHttpsUrl('http://cafedeflore.fr')).toBe(false)
    expect(isPublicHttpsUrl('https://127.0.0.1/admin')).toBe(false)
    expect(isPublicHttpsUrl('https://192.168.1.8/')).toBe(false)
    expect(isPublicHttpsUrl('https://localhost/')).toBe(false)
  })

  it('keeps Le Maxan Open Graph and gallery backgrounds, drops logos', () => {
    const html = `
      <meta property="og:image" content="https://cdn.example/2f50da-1200-627-crop.jpeg?q=1" />
      <div data-desktop-bg="https://cdn.example/f952be-800-400-crop.jpg?q=1"></div>
      <img src="https://cdn.example/9c12c3-148-48-exact.jpeg?q=1" alt="logo" />
      <a href="https://cdn.example/09d1c7-1600-1200-auto.jpg?q=1"></a>
    `
    expect(extractWebsitePhotos(html, 'https://www.rest-maxan.com/')).toEqual([
      'https://cdn.example/2f50da-1200-627-crop.jpeg?q=1',
      'https://cdn.example/09d1c7-1600-1200-auto.jpg?q=1',
      'https://cdn.example/f952be-800-400-crop.jpg?q=1',
    ])
  })

  it('reads GoDaddy lazy gallery URLs and collapses resize variants', () => {
    const html = `
      <meta property="og:image" content="https://img1.wsimg.com/isteam/ip/abc/hero.jpg" />
      <img src="//img1.wsimg.com/isteam/ip/abc/blob-820bf21.png/:/rs=h:93,cg:true,m" />
      <img src="//img1.wsimg.com/isteam/ip/abc/hero.jpg/:/rs=h:1000,cg:true,m" />
      <img data-srclazy="//img1.wsimg.com/isteam/ip/abc/gallery-1.jpg/:/rs=w:370,cg:true" />
      <img data-srcsetlazy="//img1.wsimg.com/isteam/ip/abc/gallery-2.jpg/:/rs=w:370,cg:true, //img1.wsimg.com/isteam/ip/abc/gallery-2.jpg/:/rs=w:740,cg:true 2x" />
    `
    expect(extractWebsitePhotos(html, 'https://parallelcoffee.com/')).toEqual([
      'https://img1.wsimg.com/isteam/ip/abc/hero.jpg',
      'https://img1.wsimg.com/isteam/ip/abc/gallery-2.jpg',
      'https://img1.wsimg.com/isteam/ip/abc/gallery-1.jpg',
    ])
  })

  it('falls back from a stale Google website path to the site homepage', () => {
    expect(homepageFallbackUrl('https://parallelcoffee.com/parallelcoffe')).toBe(
      'https://parallelcoffee.com/',
    )
    expect(homepageFallbackUrl('https://parallelcoffee.com/')).toBeNull()
  })

  it('keeps first-party sites and drops Maps / Instagram / Tripadvisor URLs', () => {
    expect(officialWebsiteFromCandidate('https://www.rest-maxan.com/menu')).toBe(
      'https://www.rest-maxan.com/menu',
    )
    expect(officialWebsiteFromCandidate('http://parallelcoffee.com/')).toBe(
      'https://parallelcoffee.com/',
    )
    expect(
      officialWebsiteFromCandidate('https://www.instagram.com/parallelcoffee/'),
    ).toBeNull()
    expect(
      officialWebsiteFromCandidate('https://www.tripadvisor.com/Restaurant_Review-d123'),
    ).toBeNull()
    expect(isDirectoryOrSocialUrl('https://www.opentable.com/r/sogno-paris')).toBe(true)
    expect(isDirectoryOrSocialUrl('https://maps.google.com/?cid=1')).toBe(true)
  })

  it('drops logos, headshots, and prefers landscape photos', () => {
    const html = `
      <meta property="og:image" content="https://margaux.example/dining-room.jpg" />
      <img src="https://margaux.example/chef-portrait.jpg" alt="Le chef" width="800" height="1200" />
      <img src="https://margaux.example/logo-rga.png" alt="logo RGA" />
      <img src="https://margaux.example/team/owner-headshot.jpg" alt="Owner" />
      <img src="https://margaux.example/terrace-1600-900-crop.jpg" alt="Terrasse" />
      <img src="https://margaux.example/soup-bowl.jpg" alt="Soupe" width="1400" height="900" />
      <img src="https://margaux.example/wordmark-badge.png" alt="Margaux" />
    `
    expect(extractWebsitePhotos(html, 'https://margaux.example/')).toEqual([
      'https://margaux.example/dining-room.jpg',
      'https://margaux.example/terrace-1600-900-crop.jpg',
      'https://margaux.example/soup-bowl.jpg',
    ])
  })

  it('collapses WordPress srcset sizes and drops site-icon / webclip logos', () => {
    const html = `
      <meta property="og:image" content="https://s0.wp.com/_si/?t=logo" />
      <link rel="icon" href="https://s0.wp.com/i/webclip.png" />
      <img src="https://cafemokaparis.com/wp-content/uploads/2025/08/2025-Moka-003-684x1024.jpg" />
      <img srcset="https://i0.wp.com/cafemokaparis.com/wp-content/uploads/2025/08/2025-Moka-003.jpg?resize=200%2C300&amp;ssl=1 200w, https://i0.wp.com/cafemokaparis.com/wp-content/uploads/2025/08/2025-Moka-003.jpg?resize=1367%2C2048&amp;ssl=1 1367w" />
      <img src="https://cafemokaparis.com/wp-content/uploads/2025/08/2025-Moka-025-684x1024.jpeg" />
      <img src="https://i0.wp.com/cafemokaparis.com/wp-content/uploads/2025/08/2025-Moka-025.jpeg?resize=684%2C1024&amp;ssl=1" />
    `
    expect(extractWebsitePhotos(html, 'https://cafemokaparis.com/')).toEqual([
      'https://cafemokaparis.com/wp-content/uploads/2025/08/2025-Moka-003.jpg',
      'https://cafemokaparis.com/wp-content/uploads/2025/08/2025-Moka-025.jpeg',
    ])
  })

  it('collapses WordPress .jpg.webp size variants of the same photo', () => {
    const html = `
      <meta property="og:image" content="https://cdn.example/wp-content/uploads/2025/01/restaurant-margaux-paris-devanture.jpg" />
      <img
        src="https://cdn.example/wp-content/uploads/2025/01/restaurant-margaux-paris-devanture-1024x683.jpg.webp"
        srcset="https://cdn.example/wp-content/uploads/2025/01/restaurant-margaux-paris-devanture-1536x1024.jpg.webp 1536w, https://cdn.example/wp-content/uploads/2025/01/restaurant-margaux-paris-devanture-768x512.jpg.webp 768w, https://cdn.example/wp-content/uploads/2025/01/restaurant-margaux-paris-devanture-2048x1365.jpg.webp 2048w"
      />
      <img src="https://cdn.example/wp-content/uploads/2025/01/restaurant-margaux-photo-4.jpg" />
      <img src="https://cdn.example/wp-content/uploads/2025/01/restaurant-margaux-photo-4-683x1024.jpg.webp" />
      <img src="https://cdn.example/wp-content/uploads/2025/01/restaurant-margaux-photo-4-768x1152.jpg.webp" />
    `
    expect(extractWebsitePhotos(html, 'https://www.restaurantmargaux.com/')).toEqual([
      'https://cdn.example/wp-content/uploads/2025/01/restaurant-margaux-paris-devanture.jpg',
      'https://cdn.example/wp-content/uploads/2025/01/restaurant-margaux-photo-4.jpg',
    ])
  })

  it('keeps one hotel-builder photo when the same file is served at several crop sizes', () => {
    const html = `
      <img src="https://cdn.example/2f50da-800-400-crop.jpg?q=1" />
      <img src="https://cdn.example/2f50da-1200-627-crop.jpeg?q=1" />
      <a href="https://cdn.example/09d1c7-1600-1200-auto.jpg?q=1"></a>
    `
    expect(extractWebsitePhotos(html, 'https://www.rest-maxan.com/')).toEqual([
      'https://cdn.example/09d1c7-1600-1200-auto.jpg?q=1',
      'https://cdn.example/2f50da-1200-627-crop.jpeg?q=1',
    ])
  })

  it('extracts real photos from SPA inline bootstrap states and drops link favicons and splash screens', () => {
    const html = `
      <meta property="og:image" content="https://oats.example/uploads/Oats%20SEO%20Social%201200x630.jpg" />
      <link rel="shortcut icon" href="https://oats.example/uploads/Oats%20Coffee%20House%20logo%20Favicon%2064x64px.png" />
      <link rel="apple-touch-startup-image" href="https://oats.example/uploads/splash_2048x4435_abc.jpg?width=750&height=1334" />
      <script>
        window.__BOOTSTRAP_STATE__ = {
          "store": {
            "hero": "https://oats.example/uploads/store_atmosphere.png",
            "signature": "https://cdn.example/einspanner_coffee_2000x2000.png"
          }
        };
      </script>
    `
    const photos = extractWebsitePhotos(html, 'https://oats.example/')
    expect(photos).toContain('https://oats.example/uploads/Oats%20SEO%20Social%201200x630.jpg')
    expect(photos).toContain('https://oats.example/uploads/store_atmosphere.png')
    expect(photos).toContain('https://cdn.example/einspanner_coffee_2000x2000.png')
    expect(photos).not.toContain('https://oats.example/uploads/Oats%20Coffee%20House%20logo%20Favicon%2064x64px.png')
    expect(photos).not.toContain('https://oats.example/uploads/splash_2048x4435_abc.jpg')
  })
})
