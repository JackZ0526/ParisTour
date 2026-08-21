import { motion } from 'framer-motion'
import {
  Archive,
  Check,
  ChevronRight,
  Compass,
  LogOut,
  MapPin,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  User,
  Users,
} from 'lucide-react'
import type { RecommendationPreferences } from '../../place/services/recommendationPreferences'
import type { AccessibleTrip } from '../../cloud-sync'
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
  trips?: AccessibleTrip[]
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
      <div className="rounded-3xl border border-white/80 bg-white/70 p-5 shadow-[0_8px_30px_rgba(0,0,0,0.04),inset_0_1px_1.5px_rgba(255,255,255,1)] backdrop-blur-xl transition-colors">
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
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-red-200/80 bg-red-50/70 px-3.5 py-1.5 text-xs font-medium text-red-600 shadow-sm backdrop-blur-sm transition-colors hover:bg-red-100 active:scale-95 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-400"
          >
            <LogOut size={13} strokeWidth={2} />
            <span>退出</span>
          </button>
        </div>
      </div>

      {/* 2. Trip Management Card */}
      <div className="rounded-3xl border border-white/80 bg-white/70 p-5 shadow-[0_8px_30px_rgba(0,0,0,0.04),inset_0_1px_1.5px_rgba(255,255,255,1)] backdrop-blur-xl space-y-4 transition-colors">
        <div className="flex items-center justify-between border-b border-[var(--mist)]/60 pb-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
            <MapPin size={16} className="text-[var(--copper)]" />
            <span>行程管理与多行程切换</span>
          </div>
          {trips.length > 1 && (
            <span className="text-xs text-[var(--stone)]">共 {trips.length} 个行程</span>
          )}
        </div>

        {/* Multi-trip selector cards */}
        {trips.length > 1 && (
          <div className="space-y-2">
            <label className="text-xs font-medium text-[var(--stone)]">当前可访问的行程（点击快速切换）</label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {trips.map((t) => {
                const isActive = t.id === activeTripId
                const isItemShared = t.role !== 'owner'
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onSwitchTrip?.(t.id)}
                    className={`flex items-center justify-between gap-3 rounded-2xl p-3 text-left transition-all duration-150 cursor-pointer ${
                      isActive
                        ? 'border-2 border-[var(--copper)] bg-[var(--copper)]/10 shadow-sm'
                        : 'border border-white/80 bg-white/60 hover:bg-white/90 hover:border-white active:scale-[0.99]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-semibold ${
                          isActive
                            ? 'bg-[var(--copper)] text-white shadow-sm'
                            : isItemShared
                              ? 'bg-[var(--sage)]/15 text-[var(--sage)]'
                              : 'bg-[var(--copper)]/15 text-[var(--copper)]'
                        }`}
                      >
                        {isItemShared ? (
                          <Users size={14} strokeWidth={2} />
                        ) : (
                          <Compass size={14} strokeWidth={2} />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <div className="truncate text-xs font-semibold text-[var(--ink)]">
                            {t.isPrimary ? '我的主行程' : t.title || '行程规划'}
                          </div>
                          {t.isPrimary && (
                            <span className="shrink-0 rounded bg-[var(--copper)]/15 px-1 py-0.2 text-[9px] font-bold text-[var(--copper)]">
                              默认
                            </span>
                          )}
                        </div>
                        <div className="truncate text-[11px] text-[var(--stone)]">
                          {isItemShared ? `来自 ${t.ownerName || '他人'}` : '自己创建'}
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          t.role === 'owner'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200/50'
                            : t.role === 'editor'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/50'
                              : 'bg-zinc-100 text-zinc-600 border border-zinc-200/50'
                        }`}
                      >
                        {t.role === 'owner' ? '拥有者' : t.role === 'editor' ? '协作' : '只读'}
                      </span>
                      {isActive && (
                        <Check size={14} strokeWidth={2.5} className="text-[var(--copper)]" />
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Trip Action Buttons */}
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {onOpenShare && role === 'owner' && (
            <button
              type="button"
              onClick={onOpenShare}
              className="flex items-center justify-between rounded-2xl border border-white/80 bg-white/60 p-3.5 text-left shadow-sm backdrop-blur-md transition-all hover:bg-white/90 hover:shadow hover:border-white active:scale-[0.99]"
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
              className="flex items-center justify-between rounded-2xl border border-white/80 bg-white/60 p-3.5 text-left shadow-sm backdrop-blur-md transition-all hover:bg-white/90 hover:shadow hover:border-white active:scale-[0.99]"
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
      <div className="rounded-3xl border border-white/80 bg-white/70 p-5 shadow-[0_8px_30px_rgba(0,0,0,0.04),inset_0_1px_1.5px_rgba(255,255,255,1)] backdrop-blur-xl space-y-4 transition-colors">
        <div className="flex items-center justify-between border-b border-[var(--mist)]/60 pb-3">
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

        <div className="rounded-2xl border border-white/80 bg-white/50 p-4 space-y-3 shadow-inner backdrop-blur-md">
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
            className="w-full mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--ink)] py-2.5 text-xs font-medium text-[var(--paper)] shadow-sm transition-all hover:opacity-90 active:scale-98"
          >
            <SlidersHorizontal size={14} />
            <span>打开偏好设置详细面板</span>
          </button>
        </div>
      </div>

      {/* 4. Danger Zone Card */}
      {!readOnly && onClearAll && (
        <div className="rounded-3xl border border-red-200/80 bg-red-50/40 p-5 shadow-[0_8px_30px_rgba(239,68,68,0.04),inset_0_1px_1.5px_rgba(255,255,255,1)] backdrop-blur-xl space-y-3">
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
            className="inline-flex items-center gap-2 rounded-xl border border-red-300 bg-red-50/80 px-4 py-2 text-xs font-medium text-red-600 shadow-sm transition-colors hover:bg-red-100 active:scale-95 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400"
          >
            <Trash2 size={14} />
            <span>清空当前行程全部数据</span>
          </button>
        </div>
      )}
    </motion.div>
  )
}
