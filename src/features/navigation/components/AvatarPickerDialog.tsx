import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Camera,
  Check,
  LoaderCircle,
  RotateCcw,
  Sparkles,
  Type,
  Upload,
} from 'lucide-react'
import { BottomSheet } from '../../../shared/components/BottomSheet'
import { CloseIconButton } from '../../../shared/components/CloseIconButton'
import { UserAvatarView } from '../../../shared/components/UserAvatarView'
import {
  AVATAR_GRADIENTS,
  PARIS_EMOJI_PRESETS,
  processAvatarImage,
  useUserAvatar,
} from '../../auth/services/avatarStore'
import { glassModalSurfaceClass } from '../../../shared/styles/glassCapsule'

interface AvatarPickerDialogProps {
  open: boolean
  onClose: () => void
  email?: string
}

type TabType = 'upload' | 'emoji' | 'monogram'

const TABS: { id: TabType; label: string; icon: typeof Camera }[] = [
  { id: 'upload', label: '照片上传', icon: Camera },
  { id: 'emoji', label: '巴黎 Emoji', icon: Sparkles },
  { id: 'monogram', label: '专属字母', icon: Type },
]

export function AvatarPickerDialog({
  open,
  onClose,
  email,
}: AvatarPickerDialogProps) {
  const { avatar, setAvatar, resetAvatar } = useUserAvatar(email)
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    if (avatar.type === 'image') return 'upload'
    if (avatar.type === 'emoji') return 'emoji'
    if (avatar.type === 'monogram') return 'monogram'
    return 'upload'
  })

  const [monogramText, setMonogramText] = useState(
    avatar.type === 'monogram' ? avatar.value : email ? email.charAt(0).toUpperCase() : 'P',
  )
  const [selectedGradient, setSelectedGradient] = useState<number>(
    typeof avatar.gradientIndex === 'number' ? avatar.gradientIndex : 0,
  )
  const [isProcessing, setIsProcessing] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const defaultInitial = email ? email.charAt(0).toUpperCase() : 'P'

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadError(null)
    setIsProcessing(true)

    try {
      const dataUrl = await processAvatarImage(file)
      setAvatar({
        type: 'image',
        value: dataUrl,
      })
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : '处理图片失败，请重试')
    } finally {
      setIsProcessing(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleSelectEmoji = (emoji: string) => {
    setAvatar({
      type: 'emoji',
      value: emoji,
      gradientIndex: selectedGradient,
    })
  }

  const handleGradientChange = (index: number) => {
    setSelectedGradient(index)
    if (avatar.type === 'emoji' || avatar.type === 'monogram') {
      setAvatar({
        ...avatar,
        gradientIndex: index,
      })
    }
  }

  const handleMonogramChange = (val: string) => {
    const cleaned = val.trim().slice(0, 2)
    setMonogramText(cleaned)
    if (cleaned) {
      setAvatar({
        type: 'monogram',
        value: cleaned,
        gradientIndex: selectedGradient,
      })
    } else {
      setAvatar({
        type: 'initial',
        value: defaultInitial,
        gradientIndex: selectedGradient,
      })
    }
  }

  const handleResetDefault = () => {
    resetAvatar()
    setMonogramText(defaultInitial)
    setSelectedGradient(0)
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      className={`overflow-hidden rounded-t-3xl sm:rounded-3xl border border-white/80 p-0 shadow-[0_24px_80px_rgba(0,0,0,0.18),inset_0_1px_1.5px_rgba(255,255,255,1)] backdrop-blur-2xl ${glassModalSurfaceClass}`}
    >
      <div className="flex max-h-[88vh] sm:max-h-[82vh] flex-col">
        {/* Modal Header */}
        <div className="relative flex items-center justify-between border-b border-white/80 bg-white/40 px-5 py-4 backdrop-blur-md">
          <div>
            <h2 className="font-display text-lg font-semibold text-[var(--ink)]">
              个性头像定制
            </h2>
            <p className="mt-0.5 text-xs text-[var(--stone)]">
              为您的巴黎行程定制专属头像与风尚微标
            </p>
          </div>
          <CloseIconButton onClick={onClose} aria-label="关闭" />
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {/* 1. Live Interactive Avatar Preview */}
          <div className="flex flex-col items-center justify-center py-2">
            <div className="relative group">
              <motion.div
                key={`${avatar.type}-${avatar.value}-${avatar.gradientIndex}`}
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="relative p-1 rounded-[1.75rem] border border-white/90 bg-gradient-to-b from-white/90 via-white/50 to-white/20 shadow-[0_12px_32px_rgba(0,0,0,0.08),inset_0_1px_1.5px_rgba(255,255,255,1)] backdrop-blur-xl"
              >
                <UserAvatarView
                  avatar={avatar}
                  email={email}
                  size="xl"
                  shape="squircle"
                  className="shadow-inner"
                />
              </motion.div>
            </div>
            <span className="mt-2.5 text-xs font-medium text-[var(--stone)]">
              实时效果预览
            </span>
          </div>

          {/* 2. Mode Selector Segmented Slider */}
          <div className="flex rounded-2xl border border-white/80 bg-black/5 p-1 backdrop-blur-md">
            {TABS.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors cursor-pointer ${
                    isActive ? 'text-[var(--ink)] font-semibold' : 'text-[var(--stone)] hover:text-[var(--ink)]'
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="active-avatar-tab-indicator"
                      className="absolute inset-0 rounded-xl border border-white/90 bg-white/90 shadow-[0_2px_8px_rgba(0,0,0,0.06),inset_0_1px_1px_rgba(255,255,255,1)] backdrop-blur-md"
                      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-1.5">
                    <Icon size={14} className={isActive ? 'text-[var(--copper)]' : ''} />
                    {tab.label}
                  </span>
                </button>
              )
            })}
          </div>

          {/* 3. Tab Content Panels */}
          <div className="min-h-[160px]">
            {/* 3.1 Upload Photo Tab */}
            {activeTab === 'upload' && (
              <div className="space-y-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />

                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={() => fileInputRef.current?.click()}
                  className={`w-full group flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-white/90 bg-white/40 p-6 sm:p-8 text-center transition-all hover:bg-white/70 hover:border-[var(--copper)]/60 cursor-pointer ${
                    isProcessing ? 'opacity-60 cursor-wait' : ''
                  }`}
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/90 bg-gradient-to-br from-white via-white/80 to-[#fdf6f0] text-[var(--copper)] shadow-[0_4px_16px_rgba(181,106,60,0.15)] group-hover:scale-105 transition-transform">
                    {isProcessing ? (
                      <LoaderCircle size={22} className="animate-spin text-[var(--copper)]" />
                    ) : (
                      <Upload size={20} />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[var(--ink)]">
                      {isProcessing ? '正在智能裁剪压缩…' : '点击选择本地图片 / 相册'}
                    </p>
                    <p className="mt-1 text-xs text-[var(--stone)]">
                      支持 JPG、PNG、WebP，系统将自动裁剪为高清视网膜微晶头像
                    </p>
                  </div>
                </button>

                {uploadError && (
                  <p className="text-center text-xs font-medium text-red-500">
                    {uploadError}
                  </p>
                )}
              </div>
            )}

            {/* 3.2 Paris Emojis Tab */}
            {activeTab === 'emoji' && (
              <div className="space-y-4">
                {/* French Theme Gradient Selector for Emojis */}
                <div>
                  <label className="block text-xs font-medium text-[var(--stone)] mb-2">
                    选择背景法式渐变
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {AVATAR_GRADIENTS.map((g, idx) => (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => handleGradientChange(idx)}
                        className={`group relative flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-all cursor-pointer ${
                          g.className
                        } ${
                          selectedGradient === idx
                            ? 'ring-2 ring-[var(--copper)] shadow-xs scale-105 font-semibold'
                            : 'opacity-85 hover:opacity-100 hover:scale-[1.02]'
                        }`}
                      >
                        {selectedGradient === idx && <Check size={11} className="shrink-0" />}
                        <span>{g.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Emoji Grid */}
                <div>
                  <label className="block text-xs font-medium text-[var(--stone)] mb-2">
                    选择巴黎风尚图标
                  </label>
                  <div className="grid grid-cols-6 gap-2.5 sm:gap-3">
                    {PARIS_EMOJI_PRESETS.map((emoji) => {
                      const isSelected = avatar.type === 'emoji' && avatar.value === emoji
                      return (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => handleSelectEmoji(emoji)}
                          className={`flex aspect-square items-center justify-center rounded-2xl border text-xl sm:text-2xl transition-all cursor-pointer ${
                            isSelected
                              ? 'border-[var(--copper)] bg-white shadow-[0_4px_16px_rgba(181,106,60,0.2)] scale-110'
                              : 'border-white/80 bg-white/60 hover:bg-white hover:scale-105 hover:shadow-sm'
                          }`}
                        >
                          <span className="leading-none">{emoji}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* 3.3 Custom Monogram Tab */}
            {activeTab === 'monogram' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[var(--stone)] mb-1.5">
                    输入专属字母缩写 (1~2 个字符)
                  </label>
                  <input
                    type="text"
                    maxLength={2}
                    value={monogramText}
                    onChange={(e) => handleMonogramChange(e.target.value)}
                    placeholder="如：JZ / P"
                    className="w-full rounded-2xl border border-white/90 bg-white/80 px-4 py-2.5 text-center font-display text-lg font-semibold tracking-wider text-[var(--ink)] placeholder:text-[var(--stone)]/40 shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.04)] outline-none focus:border-[var(--copper)]/80 focus:bg-white focus:shadow-[0_0_0_2px_rgba(181,106,60,0.15)] transition-all"
                  />
                </div>

                {/* French Theme Gradient Selector for Monograms */}
                <div>
                  <label className="block text-xs font-medium text-[var(--stone)] mb-2">
                    选择专属法式渐变
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {AVATAR_GRADIENTS.map((g, idx) => (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => handleGradientChange(idx)}
                        className={`flex items-center justify-between rounded-xl border p-2.5 text-xs font-medium transition-all cursor-pointer ${
                          g.className
                        } ${
                          selectedGradient === idx
                            ? 'ring-2 ring-[var(--copper)] shadow-xs scale-[1.02] font-semibold'
                            : 'opacity-85 hover:opacity-100'
                        }`}
                      >
                        <span>{g.name}</span>
                        {selectedGradient === idx && <Check size={13} className="shrink-0" />}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="flex items-center justify-between border-t border-white/80 bg-white/50 p-4 sm:px-6 backdrop-blur-md">
          <button
            type="button"
            onClick={handleResetDefault}
            className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-black/5 px-3.5 py-2 text-xs font-medium text-[var(--stone)] hover:bg-black/10 hover:text-[var(--ink)] transition-all active:scale-95 cursor-pointer"
          >
            <RotateCcw size={13} />
            <span>恢复默认</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-full border border-white/20 bg-[var(--ink)] px-6 py-2 text-xs font-semibold text-white shadow-[0_4px_14px_rgba(35,42,38,0.25),inset_0_1px_1.5px_rgba(255,255,255,0.3)] hover:bg-black hover:scale-[1.02] active:scale-95 transition-all cursor-pointer"
          >
            完成
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}
