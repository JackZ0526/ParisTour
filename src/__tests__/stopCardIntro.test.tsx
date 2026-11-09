import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { normalizeStopCardIntro, stopCardIntro } from '../features/itinerary/utils/stopCardIntro'
import { StopCardIntro } from '../features/itinerary/components/StopCardIntro'
import { pickTravelerStopNote } from '../features/chat/components/chatHelpers'
import type { Place } from '../types'

vi.mock('../features/place/services/placeDetailMemo', () => ({ peekPlaceDetailCopy: () => undefined, placeDetailKeysFromPlace: () => [] }))
const merci = 'Merci 是博马舍大道上一家三层楼的概念店，门口停着一辆红色小货车，是玛黑区很容易认出的标志。整栋楼把家居织物、服装配饰、文具小物和咖啡角放进同一个空间，与其说是商店，不如说是一场关于日常美学的挑选与陈列。逛店的方式是逐层慢走：每一层的选品气质略有不同，从布艺、餐具到衣物和包装，陈列带着一点温暖明亮的旧仓库感，随手看细节比直奔货架更有意思。门口的小货车和店内的布景，常吸引不少人专程来拍照，因此店里通常比较热闹。'
const address = '49 Av. Franklin Delano Roosevelt, 75008 Paris'
const place: Place = { id: 'merci', name: 'Merci', type: 'attraction', description: merci, location: { lat: 48.86, lng: 2.36 }, image: '', ratingHint: '', googleMapsUrl: '' }

describe('itinerary card introduction contract', () => {
  it('turns the reported long Merci paragraph into at most two sentences and 80 characters', () => {
    const intro = normalizeStopCardIntro(merci, { locale: 'zh-CN', placeName: 'Merci' })
    expect(intro).toContain('概念店')
    expect([...intro].length).toBeLessThanOrEqual(80)
    expect([...new Intl.Segmenter('zh-CN', { granularity: 'sentence' }).segment(intro)].length).toBeLessThanOrEqual(2)
    expect(intro).not.toContain('逛店的方式')
    expect(merci.length).toBeGreaterThan(200)
  })
  it.each([address, '地址：北京市东城区东直门大街49号', 'Rue de Rivoli, 75001 Paris', '+33 1 23 45 67 89', 'https://example.com/place', 'Google ★ 4.8', '09:00–18:00', '€30–50', '48.8677, 2.3604'])('rejects metadata instead of presenting it as an introduction: %s', text => {
    expect(normalizeStopCardIntro(text, { locale: 'zh-CN' })).toBe('')
  })
  it('also rejects exact known addresses without street keywords, bare names and action copy', () => {
    expect(normalizeStopCardIntro('West End, London', { address: 'West End, London' })).toBe('')
    expect(normalizeStopCardIntro('Merci', { placeName: 'Merci' })).toBe('')
    for (const text of ['已加入第3天，按最顺路插入。', '作为第1天晚餐，安排在咖啡馆之后。', 'Added to Day 3 as requested.', 'Insert this into the itinerary.']) expect(normalizeStopCardIntro(text)).toBe('')
  })
  it('limits English to two sentences, 40 words and 220 characters, even in Chinese UI', () => {
    const text = 'A converted workshop filled with independent design, homewares and books. Browse the changing displays and pause in its cafe. ' + 'There is much more to say about every floor. '.repeat(20)
    const intro = normalizeStopCardIntro(text, { locale: 'zh-CN' })
    expect(intro).toBe('A converted workshop filled with independent design, homewares and books. Browse the changing displays and pause in its cafe.')
    expect(intro.split(/\s+/).length).toBeLessThanOrEqual(40)
    expect(intro.length).toBeLessThanOrEqual(220)
  })
  it('bounds a single overlong sentence and never restores a rejected long candidate', () => {
    for (const text of ['一座提供不同体验的城市文化空间'.repeat(20), 'A local cultural venue '.repeat(60)]) {
      const intro = normalizeStopCardIntro(text)
      expect([...intro].length).toBeLessThanOrEqual(/\p{Script=Han}/u.test(text) ? 80 : 220)
      expect(intro).not.toBe(text)
    }
  })
  it('strips formatting and address rows while preserving descriptive facts', () => {
    expect(normalizeStopCardIntro(`地址：${address}\n**亮点：**这家餐厅以法式小馆氛围为特色。适合坐下来慢慢用餐。`, { locale: 'zh-CN' })).toBe('这家餐厅以法式小馆氛围为特色。适合坐下来慢慢用餐。')
  })
  it('keeps descriptive sentences while excluding embedded ratings, hours and price lists', () => {
    expect(normalizeStopCardIntro('一家以当代设计选品为特色的概念店。评分4.8，热度很高。营业时间：09:00至18:00。人均€30。适合慢慢浏览家居陈列。', { locale: 'zh-CN' })).toBe('一家以当代设计选品为特色的概念店。适合慢慢浏览家居陈列。')
  })
  it('falls back to cached descriptive copy, then an honest placeholder, without inventing features', () => {
    const addressPlace = { ...place, name: 'Le Carré Élysée', description: address, googleAddress: address }
    expect(stopCardIntro(address, addressPlace, 'zh-CN', '以餐饮为主的街角店面。')).toBe('以餐饮为主的街角店面。')
    const fallback = stopCardIntro(address, addressPlace, 'zh-CN')
    expect(fallback).toContain('待补充')
    expect(fallback).not.toContain('Franklin')
    expect(fallback).not.toContain('法式')
  })
  it('prefers an existing short place blurb over the full advisor narrative when confirming a recommendation', () => {
    expect(pickTravelerStopNote({ placeDescription: '供应可丽饼和苹果酒的小店。', storyIntro: merci })).toBe('供应可丽饼和苹果酒的小店。')
    expect(pickTravelerStopNote({ placeDescription: address, actionNote: '按最顺路插入行程。' })).toBe('')
  })
  it('renders the constrained intro rather than raw notes and keeps full detail text intact', () => {
    const html = renderToStaticMarkup(<StopCardIntro note={merci} place={place} />)
    expect(html).toContain('概念店')
    expect(html).not.toContain('每一层的选品')
    expect(html).toContain('line-clamp-3')
    expect(place.description).toBe(merci)
    const noIntro = renderToStaticMarkup(<StopCardIntro note={address} place={{ ...place, description: address, googleAddress: address }} />)
    expect(noIntro).not.toContain('Franklin')
  })
})
