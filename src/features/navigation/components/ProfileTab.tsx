import { motion } from 'framer-motion'
import {
  Archive,
  ChevronRight,
  LogOut,
  MapPin,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  User,
} from 'lucide-react'
import type { RecommendationPreferences } from '../../place/services/recommendationPreferences'
import {
  glassCapsuleSurfaceClass,
  glassCapsuleToneClass,
} from '../../../shared/styles/glassCapsule'

export interface ProfileTabProps {
  onAnimationStart?: () => void
  email: string
  role?: 'owner' | 'editor' | 'viewer' | null
  onSignOut: () => void
  onOpenShare?: () => void
  onOpenBackup?: () => void
  onOpenPreferences: () => void
  onClearAll?: () => void
  trips?: Array<{ id: string; label: string }>
  activeTripId?: string
  onSwitchTrip?: (tripId: string) => void
  readOnly?: boolean
  recommendationPreferences?: RecommendationPreferences
}

export function ProfileTab({
  onAnimationStart,
  email,
  role,
  onSignOut,
  onOpenShare,
  onOpenBackup,
  onOpenPreferences,
  onClearAll,
  trips = [],
  activeTripId,
  onSwitchTrip,
  readOnly = false,
  recommendationPreferences,
}: ProfileTabProps) {
  const roleLabel =
    role === 'owner' ? '拥有者' : role === 'editor' ? '可编辑共享' : role === 'viewer' ? '只读成员' : '个人'

  return (
    <motion.div
      key="tab-profile"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      onAnimationStart={onAnimationStart}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="mx-auto max-w-2xl space-y-5 pb-10"
    >
      {/* 1. Account Profile Card */}
      <div className="rounded-3xl border border-white/60 bg-[var(--card)]/90 p-5 shadow-sm backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[var(--copper)]/15 text-[var(--copper)] shadow-inner">
            <User size={28} strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-base sm:text-lg font-semibold text-[var(--ink)]">
                {email}
              </h2>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span
                className={`${glassCapsuleSurfaceClass} inline-flex items-center px-2.5 py-0.5 text-xs font-medium ${
                  role === 'owner'
                    ? `${glassCapsuleToneClass.copper} text-[var(--copper)]`
                    : role === 'editor'
                      ? `${glassCapsuleToneClass.sage} text-[var(--sage)]`
                      : `${glassCapsuleToneClass.neutral} text-[var(--stone)]`
                }`}
              >
                {roleLabel}
              </span>
              <span className="text-xs text-[var(--stone)]">当前登录账号</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-red-200/80 bg-red-50/60 px-3.5 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-100/80 active:scale-95 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-400"
          >
            <LogOut size={13} strokeWidth={2} />
            <span>退出</span>
          </button>
        </div>
      </div>

      {/* 2. Trip Management Card */}
      <div className="rounded-3xl border border-white/60 bg-[var(--card)]/90 p-5 shadow-sm backdrop-blur-md space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--mist)] pb-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
            <MapPin size={16} className="text-[var(--copper)]" />
            <span>行程管理与多行程切换</span>
          </div>
          {trips.length > 1 && (
            <span className="text-xs text-[var(--stone)]">共 {trips.length} 个行程</span>
          )}
        </div>

        {/* Multi-trip selector */}
        {trips.length > 1 && (
          <div className="space-y-1.5">
            <label className="text-xs text-[var(--stone)]">当前选中的行程</label>
            <select
              className="w-full rounded-2xl border border-[var(--stone)]/25 bg-[var(--paper)] px-3.5 py-2.5 text-sm text-[var(--ink)] outline-none transition-colors focus:border-[var(--copper)]"
              value={activeTripId || ''}
              onChange={(e) => onSwitchTrip?.(e.target.value)}
            >
              {trips.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Trip Action Buttons */}
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {onOpenShare && role === 'owner' && (
            <button
              type="button"
              onClick={onOpenShare}
              className="flex items-center justify-between rounded-2xl border border-[var(--stone)]/20 bg-[var(--paper)] p-3.5 text-left transition-colors hover:border-[var(--copper)] hover:bg-[var(--mist)]/40"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--copper)]/10 text-[var(--copper)]">
                  <Share2 size={17} strokeWidth={2} />
                </div>
                <div>
                  <div className="text-sm font-medium text-[var(--ink)]">分享与协作</div>
                  <div className="text-xs text-[var(--stone)]">邀请同伴共同规划</div>
                </div>
              </div>
              <ChevronRight size={16} className="text-[var(--stone)]" />
            </button>
          )}

          {onOpenBackup && (
            <button
              type="button"
              onClick={onOpenBackup}
              className="flex items-center justify-between rounded-2xl border border-[var(--stone)]/20 bg-[var(--paper)] p-3.5 text-left transition-colors hover:border-[var(--sage)] hover:bg-[var(--mist)]/40"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--sage)]/15 text-[var(--sage)]">
                  <Archive size={17} strokeWidth={2} />
                </div>
                <div>
                  <div className="text-sm font-medium text-[var(--ink)]">备份与存档</div>
                  <div className="text-xs text-[var(--stone)]">导出或恢复行程快照</div>
                </div>
              </div>
              <ChevronRight size={16} className="text-[var(--stone)]" />
            </button>
          )}
        </div>
      </div>

      {/* 3. AI Recommendation Preferences Card */}
      <div className="rounded-3xl border border-white/60 bg-[var(--card)]/90 p-5 shadow-sm backdrop-blur-md space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--mist)] pb-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
            <Sparkles size={16} className="text-[var(--copper)]" />
            <span>智能推荐偏好设置</span>
          </div>
          <button
            type="button"
            onClick={onOpenPreferences}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--copper)] hover:underline"
          >
            <SlidersHorizontal size={13} />
            <span>修改偏好</span>
          </button>
        </div>

        <div className="rounded-2xl border border-[var(--stone)]/15 bg-[var(--paper)] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--stone)]">每日出发时间</span>
            <span className="text-xs font-medium text-[var(--ink)]">
              {recommendationPreferences?.dayStartTime || '10:00'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--stone)]">早晨咖啡馆出发</span>
            <span className="text-xs font-medium text-[var(--ink)]">
              {recommendationPreferences?.preferCafeStart ? '开启' : '关闭'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--stone)]">游玩强度</span>
            <span className="text-xs font-medium text-[var(--ink)]">
              {recommendationPreferences?.preferLowWalking ? '低步行 / 轻松舒适' : '常规探索'}
            </span>
          </div>
          <button
            type="button"
            onClick={onOpenPreferences}
            className="w-full mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--ink)] py-2.5 text-xs font-medium text-[var(--paper)] transition-all hover:opacity-90 active:scale-98"
          >
            <SlidersHorizontal size={14} />
            <span>打开偏好设置详细面板</span>
          </button>
        </div>
      </div>

      {/* 4. Danger Zone Card */}
      {!readOnly && onClearAll && (
        <div className="rounded-3xl border border-red-200/60 bg-[var(--card)]/90 p-5 shadow-sm backdrop-blur-md space-y-3 dark:border-red-900/30">
          <div className="flex items-center gap-2 text-sm font-semibold text-red-600 dark:text-red-400">
            <Trash2 size={16} />
            <span>重置与清空</span>
          </div>
          <p className="text-xs text-[var(--stone)]">
            清空当前行程的所有日期、酒店及自定义景点排期并重置为初始状态。请谨慎操作。
          </p>
          <button
            type="button"
            onClick={onClearAll}
            className="inline-flex items-center gap-2 rounded-xl border border-red-300 bg-red-50 px-4 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-100 active:scale-95 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400"
          >
            <Trash2 size={14} />
            <span>清空当前行程全部数据</span>
          </button>
        </div>
      )}
    </motion.div>
  )
}
