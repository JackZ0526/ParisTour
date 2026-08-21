import { motion } from 'framer-motion'
import { Sparkles, KeyRound, Compass, Settings, ShieldCheck } from 'lucide-react'
import { glassModalSurfaceClass } from '../../../shared/styles/glassCapsule'

interface AuthLoadingScreenProps {
  mode?: 'auth' | 'trip' | 'unconfigured'
  title?: string
  subtitle?: string
}

export function AuthLoadingScreen({
  mode = 'auth',
  title,
  subtitle,
}: AuthLoadingScreenProps) {
  const displayTitle =
    title ||
    (mode === 'auth'
      ? '正在验证登录状态'
      : mode === 'trip'
        ? '正在加载行程存档'
        : '需要配置云端服务')

  const displaySubtitle =
    subtitle ||
    (mode === 'auth'
      ? '正在安全连接 Supabase 认证服务，同步用户鉴权状态…'
      : mode === 'trip'
        ? '正在为您提取云端行程数据、路线规划与个性化偏好…'
        : '请在 .env 中正确配置 Supabase 环境变量后重试。')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-[var(--paper)] px-4 py-4 select-none">
      {/* Ambient background glows for glassmorphism reflections */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 -z-10 h-[480px] w-[480px] -translate-x-1/2 rounded-full bg-gradient-to-br from-[#a8bcae]/20 dark:from-[#668b7a]/10 via-[#d4bd91]/15 dark:via-transparent to-transparent blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 right-1/4 -z-10 h-[360px] w-[360px] rounded-full bg-gradient-to-tl from-[#d7a98a]/15 dark:from-[#d48354]/10 via-white/20 dark:via-transparent to-transparent blur-3xl"
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className={`relative mx-auto w-full max-w-md overflow-hidden rounded-3xl ${glassModalSurfaceClass} p-8 sm:p-10 text-center shadow-[0_16px_40px_rgba(0,0,0,0.08),inset_0_1px_2px_rgba(255,255,255,1)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.5),inset_0_1px_2px_rgba(255,255,255,0.08)]`}
      >
        {/* Decorative background watermark */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.035] grayscale"
          style={{
            backgroundImage:
              'url(https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1600&q=60)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />

        <div className="relative z-10 flex flex-col items-center">
          {/* Top Brand Pill Badge */}
          <div className="inline-flex items-center gap-1.5 rounded-full border border-[var(--sage)]/25 bg-[var(--sage)]/10 px-3.5 py-1 text-[10.5px] font-medium tracking-[0.24em] uppercase text-[var(--sage)]">
            <Sparkles size={11} strokeWidth={2} className="shrink-0" />
            <span>Paris Tour · 安全服务</span>
          </div>

          {/* Central 3D Frosted Icon Badge with Aura Rings */}
          <div className="relative my-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/90 dark:border-white/10 bg-gradient-to-br from-white/95 to-[#fcf6f0] dark:from-[#1f2824] dark:to-[#18201c] text-[var(--copper)] shadow-[0_8px_24px_rgba(181,106,60,0.18),inset_0_1px_1.5px_rgba(255,255,255,1)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.4),inset_0_1px_1.5px_rgba(255,255,255,0.08)] backdrop-blur-md">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 10, ease: 'linear' }}
              className="pointer-events-none absolute -inset-2.5 rounded-full border border-dashed border-[var(--copper)]/30 dark:border-[var(--copper)]/40 opacity-70"
            />
            {mode === 'auth' ? (
              <KeyRound size={28} strokeWidth={1.8} className="text-[var(--copper)] animate-pulse" />
            ) : mode === 'trip' ? (
              <Compass size={28} strokeWidth={1.8} className="text-[var(--sage)] animate-spin [animation-duration:8s]" />
            ) : (
              <Settings size={28} strokeWidth={1.8} className="text-[var(--copper)]" />
            )}
          </div>

          {/* French Editorial Heading */}
          <h2 className="font-display text-2xl font-normal tracking-tight text-[var(--ink)] sm:text-3xl">
            {displayTitle}
          </h2>

          {/* Subtitle */}
          <p className="mt-2.5 max-w-xs text-xs sm:text-sm leading-relaxed text-[var(--stone)]">
            {displaySubtitle}
          </p>

          {/* Optical Fiber Stream Loading Bar */}
          {mode !== 'unconfigured' ? (
            <div className="mt-6 w-full max-w-[200px] overflow-hidden rounded-full bg-black/5 dark:bg-white/10 p-[1.5px] border border-black/5 dark:border-white/10 shadow-inner">
              <motion.div
                animate={{ x: ['-100%', '100%'] }}
                transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
                className="h-1 w-2/3 rounded-full bg-gradient-to-r from-transparent via-[var(--copper)] to-transparent"
              />
            </div>
          ) : (
            <div className="mt-6 w-full rounded-2xl border border-[var(--copper)]/20 bg-white/60 p-4 text-left text-xs text-[var(--stone)]">
              <p className="font-mono text-[11px] leading-normal text-[var(--ink)]">
                1. 配置 <code className="font-bold">VITE_SUPABASE_URL</code><br />
                2. 配置 <code className="font-bold">VITE_SUPABASE_ANON_KEY</code><br />
                3. 执行 <code className="font-bold">supabase/schema.sql</code>
              </p>
            </div>
          )}

          {/* Bottom Security Assurance Footnote */}
          <div className="mt-6 flex items-center gap-1.5 text-[11px] text-[var(--stone)]/70">
            <ShieldCheck size={13} strokeWidth={2} className="text-[var(--sage)]" />
            <span>端到端加密传输与实时安全就绪</span>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
