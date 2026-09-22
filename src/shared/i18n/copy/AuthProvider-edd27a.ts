// Localized copy extracted from src/features/auth/AuthProvider.tsx. Keep both dictionaries in sync.
import { createCopy } from '../copyFactory'

export const en = {
  "ma4b983fb0a": "Email not confirmed yet. Please click the link in your confirmation email before signing in.",
  "m75bf2b583d": "Incorrect email or password. If you just registered, please confirm your email first.",
  "mb7db4024e1": "Email sending limit reached. Please try again in about an hour."
} as const

export const zhCN: Record<keyof typeof en, string> = {
  "ma4b983fb0a": "邮箱尚未确认。请打开注册时收到的确认邮件，点击链接后再登录。",
  "m75bf2b583d": "邮箱或密码不正确。若刚注册，请先确认邮箱后再试。",
  "mb7db4024e1": "邮件发送过于频繁（Supabase 免费邮箱约每小时 2 封）。请约 1 小时后再试，或在 Dashboard 关闭「Confirm email」。"
}

export const localizedCopy = createCopy(en, zhCN)
