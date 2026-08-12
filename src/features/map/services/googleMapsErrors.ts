/** Human-readable guidance for Google Maps JS loader failures. */
export function googleMapsLoadErrorHelp(error: unknown): {
  title: string
  detail: string
  refererHint?: string
} {
  const msg = error instanceof Error ? error.message : String(error || '')
  const lower = msg.toLowerCase()

  if (
    /referernotallowedmaperror/i.test(msg) ||
    /referer not allowed/i.test(lower) ||
    /not authorized/i.test(lower)
  ) {
    const origin =
      typeof window !== 'undefined' ? `${window.location.origin}/*` : 'http://127.0.0.1:5173/*'
    return {
      title: 'Google Maps 被拒：当前网址不在 API Key 的 HTTP 引荐来源白名单中',
      detail:
        '请在 Google Cloud → API 与服务 → 凭据 → 你的浏览器密钥 → 应用限制 → HTTP 引荐来源，加入本地与生产地址。',
      refererHint: origin,
    }
  }

  if (/apinotactivatedmaperror|apinotactivated/i.test(msg) || /not activated/i.test(lower)) {
    return {
      title: 'Google Maps 加载失败：尚未启用所需 API',
      detail: '请启用 Maps JavaScript API。',
    }
  }

  if (!msg.trim()) {
    return {
      title: 'Google Maps 加载失败',
      detail: '请检查 VITE_GOOGLE_MAPS_API_KEY，并确认密钥限制与已启用的 API。',
    }
  }

  return {
    title: 'Google Maps 加载失败',
    detail: msg,
  }
}
