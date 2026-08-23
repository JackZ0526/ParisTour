/**
 * Tests that the Google Maps directions travel-mode label is locale-aware.
 *
 * The label is used in the "walking · Google Maps" / "公共交通 · Google Maps"
 * pill shown beneath each stop's timeline entry. It MUST follow the active
 * locale, otherwise the pill stays English even when the rest of the UI has
 * been switched back to Chinese.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { setLocale } from '../shared/i18n/i18nStore'
import { googleMapsTravelModeLabel } from '../features/map/services/googleMapsDirectionsUrl'

describe('googleMapsTravelModeLabel', () => {
  beforeEach(() => setLocale('en'))

  it('returns "Walking" in en mode for walking', () => {
    setLocale('en')
    expect(googleMapsTravelModeLabel('walking')).toBe('Walking')
  })

  it('returns "Transit" in en mode for transit', () => {
    setLocale('en')
    expect(googleMapsTravelModeLabel('transit')).toBe('Transit')
  })

  it('returns "步行" in zh-CN mode for walking', () => {
    setLocale('zh-CN')
    expect(googleMapsTravelModeLabel('walking')).toBe('步行')
  })

  it('returns "公共交通" in zh-CN mode for transit', () => {
    setLocale('zh-CN')
    expect(googleMapsTravelModeLabel('transit')).toBe('公共交通')
  })

  it('respects an explicit locale override', () => {
    setLocale('en')
    expect(googleMapsTravelModeLabel('walking', 'zh-CN')).toBe('步行')
    expect(googleMapsTravelModeLabel('transit', 'zh-CN')).toBe('公共交通')
    setLocale('zh-CN')
    expect(googleMapsTravelModeLabel('walking', 'en')).toBe('Walking')
    expect(googleMapsTravelModeLabel('transit', 'en')).toBe('Transit')
  })

  it('switches back to Chinese when locale is toggled back', () => {
    // Simulate the exact failure case: switch EN → zh-CN and confirm the
    // pill text follows the new locale, not the old one.
    setLocale('en')
    expect(googleMapsTravelModeLabel('walking')).toBe('Walking')
    setLocale('zh-CN')
    expect(googleMapsTravelModeLabel('walking')).toBe('步行')
  })
})
