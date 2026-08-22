import { useState, useSyncExternalStore } from 'react'
import { motion } from 'framer-motion'
import {
  Archive,
  CalendarDays,
  Camera,
  Check,
  ChevronRight,
  Compass,
  Edit3,
  Hotel,
  Laptop,
  LogOut,
  MapPin,
  MessageSquare,
  Moon,
  Palette,
  Plane,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Tag,
  Timer,
  Trash2,
  Users,
} from 'lucide-react'
import { UserAvatarView } from '../../../shared/components/UserAvatarView'
import { useUserAvatar } from '../../auth/services/avatarStore'
import { AvatarPickerDialog } from './AvatarPickerDialog'
import { useUserNickname } from '../../auth/services/nicknameStore'
import { NicknamePickerDialog } from './NicknamePickerDialog'
import { useTheme } from '../../../shared/services/themeStore'
import {
  BASE_TAG_PILL,
  DEFAULT_RECOMMENDATION_PREFERENCES,
  cleanTagText,
  getTagTheme,
  type RecommendationPreferences,
} from '../../place/services/recommendationPreferences'
import type { AccessibleTrip } from '../../cloud-sync'
import {
  getCloudSaveStatus,
  getCloudSyncStatus,
  subscribeCloudSaveStatus,
  subscribeCloudSyncStatus,
} from '../../cloud-sync/services/tripCloud'
import { isCloudSyncEnabled } from '../../../shared/lib/supabase'
import {
  glassCardSurfaceClass,
  glassCapsuleSurfaceClass,
  glassCapsuleToneClass,
} from '../../../shared/styles/glassCapsule'

export interface ProfileTripStats {
  daysCount: number
  placesCount: number
  hotelReady: boolean
  flightsReady: boolean
  datesReady: boolean
}

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
  tripStats?: ProfileTripStats
}

function useLiveCloudSync() {
  const saveStatus = useSyncExternalStore(
    subscribeCloudSaveStatus,
    getCloudSaveStatus,
    getCloudSaveStatus,
  )
  const syncStatus = useSyncExternalStore(
    subscribeCloudSyncStatus,
    getCloudSyncStatus,
    getCloudSyncStatus,
  )

  const isSaving = saveStatus === 'saving' || saveStatus === 'pending'
  const isSyncing = syncStatus === 'syncing'
  const isBusy = isSaving || isSyncing

  return {
    enabled: isCloudSyncEnabled(),
    isBusy,
    label: isSaving
      ? '云端正在保存…'
      : isSyncing
        ? '正在同步最新更改…'
        : '云端已实时加密同步',
  }
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
  recommendationPreferences = DEFAULT_RECOMMENDATION_PREFERENCES,
  tripStats,
}: ProfileTabProps) {
  const cloudSync = useLiveCloudSync()
  const { avatar } = useUserAvatar(email)
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false)
  const { nickname } = useUserNickname(email)
  const [nicknamePickerOpen, setNicknamePickerOpen] = useState(false)
  const { themePreference, setThemePreference } = useTheme()
  const [hasThemeInteracted, setHasThemeInteracted] = useState(false)

  const roleLabel =
    role === 'owner'
      ? '拥有者'
      : role === 'editor'
        ? '协作成员'
        : role === 'viewer'
          ? '只读成员'
          : '个人账户'

  return (
    <motion.div
      key="tab-profile"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      onAnimationStart={onAnimationStart}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="mx-auto max-w-2xl lg:max-w-5xl space-y-4 lg:space-y-6"
    >
      {/* ========================================================================= */}
      {/* Row 1: Side-by-Side on Desktop (2:1 Ratio - Left 8 Cols / Right 4 Cols)   */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 items-stretch">
        {/* Left Column (2/3 width on Desktop): Account Profile & Trip Health Stats */}
        <div className={`lg:col-span-8 relative flex flex-col justify-between overflow-hidden rounded-3xl ${glassCardSurfaceClass} p-5 sm:p-6 shadow-[0_8px_32px_rgba(0,0,0,0.04),inset_0_1px_1.5px_rgba(255,255,255,1)]`}>
          {/* Subtle Paris background watermark */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.03] grayscale"
            style={{
              backgroundImage:
                'url(https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1600&q=60)',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />

          <div className="relative z-10 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
                {/* Luxury Frosted Avatar with Live Cloud Sync Green Dot and Edit Trigger */}
                <div className="relative shrink-0 group">
                  <button
                    type="button"
                    onClick={() => setAvatarPickerOpen(true)}
                    className="relative block rounded-2xl transition-transform active:scale-95 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--copper)]"
                    title="点击定制个性头像"
                    aria-label="点击定制个性头像"
                  >
                    <UserAvatarView
                      avatar={avatar}
                      email={email}
                      name={nickname}
                      size="lg"
                      shape="squircle"
                      className="group-hover:shadow-[0_10px_25px_rgba(181,106,60,0.25)] transition-shadow duration-200"
                    />

                    {/* Floating Camera Edit Badge */}
                    <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-white/90 dark:border-white/15 bg-white/95 dark:bg-[#1f2824] text-[var(--copper)] shadow-xs transition-transform duration-200 group-hover:scale-110">
                      <Camera size={11} strokeWidth={2.2} />
                    </span>
                  </button>

                  {/* Cloud Real-Time Live Sync Status Dot */}
                  {cloudSync.enabled && (
                    <span
                      title={cloudSync.label}
                      className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center cursor-help pointer-events-none"
                    >
                      {cloudSync.isBusy ? (
                        <span className="relative flex h-3.5 w-3.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 ring-2 ring-white dark:ring-[#18201c]" />
                        </span>
                      ) : (
                        <span className="relative flex h-3.5 w-3.5">
                          <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 ring-2 ring-white dark:ring-[#18201c] shadow-xs" />
                        </span>
                      )}
                    </span>
                  )}
                </div>

                {/* User Account Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <h2 className="truncate font-display text-base sm:text-lg font-semibold text-[var(--ink)] tracking-tight">
                      {nickname || email}
                    </h2>
                    <button
                      type="button"
                      onClick={() => setNicknamePickerOpen(true)}
                      className="inline-flex items-center justify-center rounded-full p-1 text-[var(--stone)] hover:text-[var(--copper)] transition-colors active:scale-95 cursor-pointer"
                      title="修改个性昵称"
                      aria-label="修改个性昵称"
                    >
                      <Edit3 size={13} strokeWidth={2} />
                    </button>
                  </div>
                  {nickname && (
                    <p className="truncate text-xs text-[var(--stone)] dark:text-zinc-400">
                      {email}
                    </p>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 sm:gap-2">
                    <span
                      className={`${glassCapsuleSurfaceClass} inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-medium ${
                        role === 'owner'
                          ? `${glassCapsuleToneClass.copper} text-[var(--copper)]`
                          : role === 'editor'
                            ? `${glassCapsuleToneClass.sage} text-[var(--sage)]`
                            : `${glassCapsuleToneClass.neutral} text-[var(--stone)]`
                      }`}
                    >
                      <span>{role === 'owner' ? '👑' : role === 'editor' ? '🤝' : '👁️'}</span>
                      <span>{roleLabel}</span>
                    </span>

                    {cloudSync.enabled && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-[var(--stone)] dark:text-zinc-400 truncate">
                        <ShieldCheck size={12} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span>{cloudSync.isBusy ? '云端同步中' : '云端已加密同步'}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Logout Button */}
              <button
                type="button"
                onClick={onSignOut}
                className={`${glassCapsuleSurfaceClass} ${glassCapsuleToneClass.rose} inline-flex shrink-0 items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-red-600/90 dark:text-red-300 transition-all hover:bg-[#fde8e8]/95 dark:hover:bg-red-500/20 hover:border-red-300/90 dark:hover:border-red-400/40 hover:text-red-700 dark:hover:text-red-200 active:scale-95 cursor-pointer`}
              >
                <LogOut size={13} strokeWidth={2.2} />
                <span>退出</span>
              </button>
            </div>

            {/* Trip Summary Metric Cards (2x2 Grid) */}
            {tripStats && (
              <div className="grid grid-cols-2 gap-2.5 pt-3 border-t border-black/5 dark:border-white/10">
                <div className="flex items-center gap-2 rounded-2xl border border-white/80 dark:border-white/10 bg-white/60 dark:bg-white/5 p-2.5 shadow-2xs backdrop-blur-sm">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-[var(--copper)]/10 text-[var(--copper)]">
                    <CalendarDays size={14} strokeWidth={2.2} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-[var(--stone)] dark:text-zinc-400 truncate">规划天数</p>
                    <p className="text-xs font-semibold text-[var(--ink)] truncate">
                      {tripStats.daysCount > 0 ? `${tripStats.daysCount} 天行程` : '未生成'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 rounded-2xl border border-white/80 dark:border-white/10 bg-white/60 dark:bg-white/5 p-2.5 shadow-2xs backdrop-blur-sm">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-[var(--sage)]/15 text-[var(--sage)]">
                    <MapPin size={14} strokeWidth={2.2} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-[var(--stone)] dark:text-zinc-400 truncate">游玩地点</p>
                    <p className="text-xs font-semibold text-[var(--ink)] truncate">
                      {tripStats.placesCount} 处景点
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 rounded-2xl border border-white/80 dark:border-white/10 bg-white/60 dark:bg-white/5 p-2.5 shadow-2xs backdrop-blur-sm">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-400">
                    <Hotel size={14} strokeWidth={2.2} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-[var(--stone)] dark:text-zinc-400 truncate">入住酒店</p>
                    <p className="text-xs font-semibold text-[var(--ink)] truncate">
                      {tripStats.hotelReady ? '已安排' : '待配置'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 rounded-2xl border border-white/80 dark:border-white/10 bg-white/60 dark:bg-white/5 p-2.5 shadow-2xs backdrop-blur-sm">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-700 dark:text-sky-400">
                    <Plane size={14} strokeWidth={2.2} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-[var(--stone)] dark:text-zinc-400 truncate">往返航班</p>
                    <p className="text-xs font-semibold text-[var(--ink)] truncate">
                      {tripStats.flightsReady ? '已录入' : '待确认'}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column (1/3 width on Desktop): Trip Management & Collaboration Card */}
        <div className={`lg:col-span-4 flex flex-col justify-between rounded-3xl ${glassCardSurfaceClass} p-5 sm:p-6 shadow-[0_8px_30px_rgba(0,0,0,0.04),inset_0_1px_1.5px_rgba(255,255,255,1)] space-y-4`}>
          <div className="flex items-center justify-between border-b border-[var(--mist)]/60 pb-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
              <Compass size={16} className="text-[var(--copper)]" />
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
              <div className="grid grid-cols-1 gap-2">
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
                          ? 'border-2 border-[var(--copper)] bg-[var(--copper)]/10 dark:bg-[var(--copper)]/15 shadow-sm'
                          : 'border border-white/80 dark:border-white/10 bg-white/60 dark:bg-white/5 hover:bg-white/90 dark:hover:bg-white/10 hover:border-white dark:hover:border-white/20 active:scale-[0.99]'
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
                          <div className="truncate text-[11px] text-[var(--stone)] dark:text-zinc-400">
                            {isItemShared ? `来自 ${t.ownerName || '他人'}` : '自己创建'}
                          </div>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            t.role === 'owner'
                              ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300 border border-amber-200/50 dark:border-amber-400/30'
                              : t.role === 'editor'
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 border border-emerald-200/50 dark:border-emerald-400/30'
                                : 'bg-zinc-100 text-zinc-600 dark:bg-white/10 dark:text-zinc-300 border border-zinc-200/50 dark:border-white/15'
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

          {/* Trip Action Buttons (Vertically Stacked) */}
          <div className="grid grid-cols-1 gap-2.5">
            {onOpenShare && role === 'owner' && (
              <button
                type="button"
                onClick={onOpenShare}
                className="group flex items-center justify-between rounded-2xl border border-white/80 dark:border-white/10 bg-white/60 dark:bg-white/5 p-3.5 text-left shadow-sm backdrop-blur-md transition-all hover:bg-white/95 dark:hover:bg-white/10 hover:shadow-md hover:border-white dark:hover:border-white/20 active:scale-[0.99] cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--copper)]/10 text-[var(--copper)] transition-transform group-hover:scale-105">
                    <Share2 size={17} strokeWidth={2} />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-[var(--ink)]">分享与协作</div>
                    <div className="text-xs text-[var(--stone)] dark:text-zinc-400">邀请同伴共同规划</div>
                  </div>
                </div>
                <ChevronRight size={16} className="text-[var(--stone)] dark:text-zinc-400 transition-transform group-hover:translate-x-0.5" />
              </button>
            )}

            {onOpenBackup && (
              <button
                type="button"
                onClick={onOpenBackup}
                className="group flex items-center justify-between rounded-2xl border border-white/80 dark:border-white/10 bg-white/60 dark:bg-white/5 p-3.5 text-left shadow-sm backdrop-blur-md transition-all hover:bg-white/95 dark:hover:bg-white/10 hover:shadow-md hover:border-white dark:hover:border-white/20 active:scale-[0.99] cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--sage)]/15 text-[var(--sage)] transition-transform group-hover:scale-105">
                    <Archive size={17} strokeWidth={2} />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-[var(--ink)]">备份与存档</div>
                    <div className="text-xs text-[var(--stone)] dark:text-zinc-400">导出或恢复行程快照</div>
                  </div>
                </div>
                <ChevronRight size={16} className="text-[var(--stone)] dark:text-zinc-400 transition-transform group-hover:translate-x-0.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* Row 2: AI Recommendation Preferences Summary Card (Opens Popup Modal)    */}
      {/* ========================================================================= */}
      <div className={`rounded-3xl ${glassCardSurfaceClass} p-5 sm:p-6 shadow-[0_8px_30px_rgba(0,0,0,0.04),inset_0_1px_1.5px_rgba(255,255,255,1)] space-y-4 transition-colors`}>
        <div className="flex items-center justify-between border-b border-[var(--mist)]/60 dark:border-white/10 pb-3.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm sm:text-base font-semibold text-[var(--ink)]">
              <Sparkles size={16} className="text-[var(--copper)] shrink-0" />
              <span>AI 智能偏好配置</span>
            </div>
            <p className="mt-0.5 text-xs text-[var(--stone)] dark:text-zinc-400 leading-relaxed">
              个性化行程偏好体系；这些倾向将直接引导 AI 生成专属巴黎路线与地点推荐。
            </p>
          </div>
        </div>

        {/* 2 Symmetrical Metrics: Departure Time & Active Preference Pool */}
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
          {/* Metric 1: Departure Time */}
          <div className="flex items-center gap-2.5 rounded-2xl border border-white/80 dark:border-white/10 bg-white/60 dark:bg-white/5 p-3 shadow-2xs backdrop-blur-sm">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--copper)]/10 text-[var(--copper)]">
              <Timer size={16} strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <p className="text-[10.5px] text-[var(--stone)] dark:text-zinc-400">每日出发</p>
              <p className="text-xs font-semibold text-[var(--ink)] truncate">
                {recommendationPreferences?.dayStartTime || '10:00'}
              </p>
            </div>
          </div>

          {/* Metric 2: Active Tag Pool Count */}
          <div className="flex items-center gap-2.5 rounded-2xl border border-white/80 dark:border-white/10 bg-white/60 dark:bg-white/5 p-3 shadow-2xs backdrop-blur-sm">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-400">
              <Tag size={16} strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <p className="text-[10.5px] text-[var(--stone)] dark:text-zinc-400">生效偏好</p>
              <p className="text-xs font-semibold text-[var(--ink)] truncate">
                {recommendationPreferences?.tags?.length
                  ? `${recommendationPreferences.tags.length} 项标签生效`
                  : '未设置标签'}
              </p>
            </div>
          </div>
        </div>

        {/* Active Preference Tags Roll Preview */}
        {recommendationPreferences?.tags && recommendationPreferences.tags.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            {recommendationPreferences.tags.slice(0, 10).map((tag) => {
              const clean = cleanTagText(tag)
              const theme = getTagTheme(clean)
              return (
                <span
                  key={clean}
                  className={`${BASE_TAG_PILL} cursor-default ${theme.activePill}`}
                >
                  <span className="relative z-10">{clean}</span>
                </span>
              )
            })}
            {recommendationPreferences.tags.length > 10 && (
              <span className="inline-flex h-7.5 items-center rounded-full border border-black/8 dark:border-white/10 bg-white/60 dark:bg-white/10 px-2.5 text-[11px] font-semibold text-[var(--stone)] dark:text-zinc-300 shadow-2xs">
                +{recommendationPreferences.tags.length - 10} 项
              </span>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-black/10 dark:border-white/10 bg-white/40 dark:bg-white/5 p-3 text-center text-xs text-[var(--stone)] dark:text-zinc-400">
            暂未设置偏好标签，点击下方按钮定制专属巴黎路线偏好
          </div>
        )}

        {/* Custom Requirements Note (If Present) */}
        {recommendationPreferences?.extraNotes && (
          <div className="flex items-start gap-2 rounded-2xl border border-white/80 dark:border-white/10 bg-white/50 dark:bg-white/5 p-2.5 shadow-2xs backdrop-blur-md">
            <MessageSquare size={13} className="mt-0.5 shrink-0 text-[var(--copper)]/80" />
            <p className="text-xs text-[var(--stone)] dark:text-zinc-300 leading-relaxed line-clamp-2">
              <span className="font-medium text-[var(--ink)]">补充要求：</span>
              {recommendationPreferences.extraNotes}
            </p>
          </div>
        )}

        {/* Primary Modal Trigger Button */}
        <button
          type="button"
          onClick={onOpenPreferences}
          className="group relative isolate flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#2c2621] to-[#1f1b18] dark:from-white/12 dark:to-white/[0.07] dark:border dark:border-white/18 py-2.5 sm:py-3 text-xs sm:text-sm font-semibold text-white dark:text-zinc-100 shadow-[0_4px_16px_rgba(0,0,0,0.12),inset_0_1px_1px_rgba(255,255,255,0.2)] dark:shadow-[0_8px_22px_rgba(0,0,0,0.4),inset_0_1px_1px_rgba(255,255,255,0.15),inset_0_-1px_1px_rgba(0,0,0,0.4)] transition-all hover:-translate-y-px hover:brightness-110 dark:hover:border-white/25 active:translate-y-0 active:scale-[0.99] cursor-pointer"
        >
          <SlidersHorizontal size={14} />
          <span>打开偏好设置详细面板</span>
          <ChevronRight size={14} className="transition-transform group-hover:translate-x-0.5 text-white/70" />
        </button>
      </div>

      {/* ========================================================================= */}
      {/* Row 3: Appearance Theme Selector (外观与色彩模式)                          */}
      {/* ========================================================================= */}
      <div className={`appearance-theme-card rounded-3xl ${glassCardSurfaceClass} p-5 sm:p-6 space-y-3.5 transition-colors`}>
        <div className="flex items-center justify-between border-b border-[var(--mist)]/60 dark:border-white/10 pb-3">
          <div className="flex items-center gap-2 text-sm sm:text-base font-semibold text-[var(--ink)]">
            <Palette size={16} className="text-[var(--copper)]" />
            <span>外观主题 · 色彩模式</span>
          </div>
          <span className="text-xs text-[var(--stone)] dark:text-zinc-400">
            {themePreference === 'system' ? '跟随系统' : themePreference === 'dark' ? '午夜深色' : '日间浅色'}
          </span>
        </div>

        <div className="relative grid grid-cols-3 gap-1 sm:gap-2 p-1.5 rounded-2xl bg-black/[0.04] dark:bg-white/5 border border-black/5 dark:border-white/10 shadow-[inset_0_1px_3px_rgba(0,0,0,0.06)] dark:shadow-[inset_0_1px_3px_rgba(0,0,0,0.4)]">
          {(
            [
              { id: 'light', label: '浅色日间', Icon: Sun, activeColor: 'text-amber-600 dark:text-amber-300' },
              { id: 'dark', label: '深色午夜', Icon: Moon, activeColor: 'text-indigo-500 dark:text-amber-200' },
              { id: 'system', label: '跟随系统', Icon: Laptop, activeColor: 'text-[var(--copper)] dark:text-amber-200' },
            ] as const
          ).map(({ id, label, Icon, activeColor }) => {
            const isActive = themePreference === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setHasThemeInteracted(true)
                  setThemePreference(id)
                }}
                className="relative isolate flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2 py-2.5 px-3 rounded-xl text-xs font-semibold transition-colors outline-none cursor-pointer"
              >
                {isActive && (
                  <motion.div
                    layoutId="theme-preference-pill"
                    className="absolute inset-0 overflow-hidden rounded-xl bg-white/85 dark:bg-[var(--copper)] shadow-[0_3px_12px_rgba(0,0,0,0.06),inset_0_1px_1.5px_rgba(255,255,255,1),inset_0_-1px_1px_rgba(255,255,255,0.7)] dark:shadow-[0_4px_16px_rgba(212,131,84,0.35),inset_0_1px_1.5px_rgba(255,255,255,0.25),inset_0_-1px_1px_rgba(0,0,0,0.3)] ring-1 ring-black/5 dark:ring-white/15 backdrop-blur-md"
                    animate={
                      hasThemeInteracted
                        ? {
                            scaleX: [1, 1.12, 0.96, 1],
                            scaleY: [1, 0.9, 1.03, 1],
                          }
                        : undefined
                    }
                    transition={{
                      layout: { type: 'spring', stiffness: 420, damping: 28, mass: 0.8 },
                      scaleX: { duration: 0.3, ease: [0.22, 1, 0.36, 1] },
                      scaleY: { duration: 0.3, ease: [0.22, 1, 0.36, 1] },
                    }}
                  >
                    {/* Top specular light reflection highlight */}
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-x-2 top-0 h-[1px] rounded-full bg-gradient-to-r from-transparent via-white dark:via-white/30 to-transparent"
                    />
                  </motion.div>
                )}
                <Icon
                  size={15}
                  strokeWidth={2.2}
                  className={`relative z-10 transition-colors ${
                    isActive
                      ? activeColor
                      : 'text-[var(--stone)] dark:text-zinc-400'
                  }`}
                />
                <span
                  className={`relative z-10 transition-colors ${
                    isActive
                      ? 'text-[var(--ink)] dark:text-white font-bold'
                      : 'text-[var(--stone)] hover:text-[var(--ink)] dark:text-zinc-400 dark:hover:text-zinc-100'
                  }`}
                >
                  {label}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* Row 4: Danger Zone Card (Placed at Bottom)                                */}
      {/* ========================================================================= */}
      {!readOnly && onClearAll && (
        <div className="rounded-3xl border border-red-200/80 dark:border-red-900/40 bg-red-50/40 dark:bg-red-950/20 p-5 shadow-[0_8px_30px_rgba(239,68,68,0.04),inset_0_1px_1.5px_rgba(255,255,255,1)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.4)] backdrop-blur-xl space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-red-600 dark:text-red-400">
            <Trash2 size={16} />
            <span>重置与数据清空</span>
          </div>
          <p className="text-xs text-[var(--stone)] dark:text-zinc-400">
            清空当前行程的所有日期、酒店及自定义景点排期并重置为初始状态。请谨慎操作。
          </p>
          <button
            type="button"
            onClick={onClearAll}
            className="inline-flex items-center gap-2 rounded-xl border border-red-300 bg-red-50/80 px-4 py-2 text-xs font-medium text-red-600 shadow-sm transition-colors hover:bg-red-100 active:scale-95 cursor-pointer dark:border-red-800/60 dark:bg-red-950/50 dark:text-red-300 dark:hover:bg-red-900/60"
          >
            <Trash2 size={14} />
            <span>清空当前行程全部数据</span>
          </button>
        </div>
      )}

      {/* System Footer Info Note */}
      <div className="text-center pt-1 text-[11px] text-[var(--stone)]/60 space-y-0.5 -mb-2">
        <p>Paris Tour v0.7.0 · Supabase 端到端加密安全同步</p>
        <p>Made with ❤️ for Paris Explorers</p>
      </div>

      {/* Avatar Customization Modal */}
      <AvatarPickerDialog
        open={avatarPickerOpen}
        onClose={() => setAvatarPickerOpen(false)}
        email={email}
      />

      {/* Nickname Customization Modal */}
      <NicknamePickerDialog
        open={nicknamePickerOpen}
        onClose={() => setNicknamePickerOpen(false)}
        email={email}
      />
    </motion.div>
  )
}
