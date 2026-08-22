import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertCircle,
  Camera,
  Check,
  ImageIcon,
  LoaderCircle,
  RotateCcw,
  Sparkles,
} from 'lucide-react'
import { BottomSheet } from '../../../shared/components/BottomSheet'
import { CloseIconButton } from '../../../shared/components/CloseIconButton'
import { UserAvatarView } from '../../../shared/components/UserAvatarView'
import { AvatarCropper } from './AvatarCropper'
import {
  useUserAvatar,
} from '../../auth/services/avatarStore'
import {
  glassCardSurfaceClass,
  glassModalSurfaceClass,
  glassCapsuleSurfaceClass,
  glassCapsuleToneClass,
} from '../../../shared/styles/glassCapsule'

interface AvatarPickerDialogProps {
  open: boolean
  onClose: () => void
  email?: string
}

export function AvatarPickerDialog({
  open,
  onClose,
  email,
}: AvatarPickerDialogProps) {
  const { avatar, setAvatar, resetAvatar } = useUserAvatar(email)
  const [isReading, setIsReading] = useState(false)
  const [pendingDataUrl, setPendingDataUrl] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [successToast, setSuccessToast] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isCustomPhoto = avatar.type === 'image' && Boolean(avatar.value)
  const isCropping = pendingDataUrl !== null

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadError(null)
    if (!file.type.startsWith('image/')) {
      setUploadError('请选择有效的图片文件 (JPG / PNG / WebP)')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    setIsReading(true)
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = () => reject(new Error('读取图片文件失败'))
        reader.onload = (ev) => {
          const result = ev.target?.result
          if (typeof result !== 'string' || !result) {
            reject(new Error('图片数据为空'))
            return
          }
          resolve(result)
        }
        reader.readAsDataURL(file)
      })
      setPendingDataUrl(dataUrl)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : '处理图片失败，请重试')
    } finally {
      setIsReading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleCropConfirm = (dataUrl: string) => {
    setAvatar({ type: 'image', value: dataUrl })
    setPendingDataUrl(null)
    setUploadError(null)
    setSuccessToast(true)
    setTimeout(() => setSuccessToast(false), 2000)
  }

  const handleCropCancel = () => {
    setPendingDataUrl(null)
    setUploadError(null)
  }

  const handleCropRepick = () => {
    setPendingDataUrl(null)
    fileInputRef.current?.click()
  }

  const handleResetDefault = () => {
    resetAvatar()
    setUploadError(null)
    setSuccessToast(false)
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      overlayZIndex={2050}
      className={`flex max-h-[min(88vh,100dvh)] max-w-lg flex-col overflow-hidden rounded-t-3xl ${glassModalSurfaceClass} sm:rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.12),inset_0_1px_2px_rgba(255,255,255,1)]`}
    >
      {/* Header Section */}
      <header className="relative shrink-0 border-b border-[var(--mist)]/60 px-5 pb-4 pt-3 sm:pt-5 sm:px-6">
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl sm:text-3xl font-semibold text-[var(--ink)] tracking-tight">
              个性头像设置
            </h2>
            <p className="mt-1 text-xs sm:text-sm text-[var(--stone)] leading-relaxed">
              上传本地照片作为您的专属头像，全局即时生效。
            </p>
          </div>
          <CloseIconButton onClick={onClose} className="hidden sm:flex" aria-label="关闭" />
        </div>
      </header>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png, image/jpeg, image/webp, image/gif, image/heic"
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* Main Body */}
      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6 pb-6 sm:pb-8">
        {/* Error Alert */}
        {uploadError && (
          <div className="flex items-start gap-2.5 rounded-2xl border border-red-200/80 bg-red-50/70 p-3 text-xs text-red-900 shadow-sm backdrop-blur-md">
            <AlertCircle size={15} strokeWidth={1.8} className="mt-0.5 shrink-0 text-red-600" />
            <span>{uploadError}</span>
          </div>
        )}

        {/* Success Alert */}
        {successToast && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 rounded-2xl border border-emerald-200/80 bg-emerald-50/80 p-3 text-xs font-medium text-emerald-800 shadow-sm backdrop-blur-md"
          >
            <Check size={14} className="text-emerald-600 shrink-0" />
            <span>头像已成功更新并保存！</span>
          </motion.div>
        )}

        {/* 1. Avatar stage: preview (default) or cropper (after pick) */}
        {isCropping && pendingDataUrl ? (
          <motion.div
            key="crop-stage"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className={`relative overflow-hidden rounded-3xl ${glassCardSurfaceClass} p-6 sm:p-7`}
          >
            <div className="mb-4 text-center">
              <h3 className="font-display text-base sm:text-lg font-semibold text-[var(--ink)]">
                调整裁切位置
              </h3>
              <p className="mt-1 text-[11px] sm:text-xs text-[var(--stone)] leading-relaxed">
                拖动图片或缩放，框内区域将作为头像。系统会在浏览器本地完成裁剪，无需上传。
              </p>
            </div>
            <AvatarCropper
              dataUrl={pendingDataUrl}
              shape="squircle"
              onConfirm={handleCropConfirm}
              onCancel={handleCropCancel}
              onRepick={handleCropRepick}
            />
          </motion.div>
        ) : (
          <div className={`relative overflow-hidden rounded-3xl ${glassCardSurfaceClass} p-6 sm:p-7 text-center`}>
            {/* Paris subtle background watermark */}
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.025] grayscale"
              style={{
                backgroundImage:
                  'url(https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1600&q=60)',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            />

            <div className="relative z-10 flex flex-col items-center justify-center">
              {/* Avatar container with live animation */}
              <motion.div
                key={isCustomPhoto ? 'custom-photo' : 'default-initial'}
                initial={{ scale: 0.92, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="relative p-1.5 rounded-[2rem] border border-white/95 dark:border-white/10 bg-gradient-to-b from-white/90 via-white/60 to-white/30 dark:from-white/10 dark:via-white/5 dark:to-transparent shadow-[0_12px_36px_rgba(0,0,0,0.08),inset_0_1.5px_2px_rgba(255,255,255,1)] dark:shadow-[0_12px_36px_rgba(0,0,0,0.4),inset_0_1.5px_2px_rgba(255,255,255,0.1)] backdrop-blur-xl"
              >
                <UserAvatarView
                  avatar={avatar}
                  email={email}
                  size="xl"
                  shape="squircle"
                />

                {isReading && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center rounded-[2rem] bg-black/40 backdrop-blur-xs text-white">
                    <LoaderCircle size={28} className="animate-spin text-white" />
                    <span className="mt-1 text-[11px] font-medium">读取中…</span>
                  </div>
                )}
              </motion.div>

              {/* Status Capsule */}
              <div className="mt-3.5 flex items-center justify-center">
                <span
                  className={`${glassCapsuleSurfaceClass} inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium ${
                    isCustomPhoto
                      ? `${glassCapsuleToneClass.sage} text-emerald-700`
                      : `${glassCapsuleToneClass.neutral} text-[var(--stone)]`
                  }`}
                >
                  {isCustomPhoto ? (
                    <>
                      <Check size={12} className="text-emerald-600" />
                      <span>已启用自定义照片头像</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={12} className="text-[var(--copper)]" />
                      <span>当前使用默认首字母徽标</span>
                    </>
                  )}
                </span>
              </div>

              {/* Action Buttons for Avatar */}
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
                <button
                  type="button"
                  disabled={isReading}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-[var(--ink)] dark:bg-[var(--copper)] px-5 py-2.5 text-xs font-semibold text-white shadow-[0_4px_16px_rgba(35,42,38,0.2),inset_0_1px_1.5px_rgba(255,255,255,0.3)] transition-all hover:bg-black dark:hover:bg-[var(--copper)]/90 hover:scale-[1.02] active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  <Camera size={14} />
                  <span>{isCustomPhoto ? '更换新照片' : '上传本地照片'}</span>
                </button>

                {isCustomPhoto && (
                  <button
                    type="button"
                    disabled={isReading}
                    onClick={handleResetDefault}
                    className="inline-flex items-center gap-1.5 rounded-full border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 px-4 py-2.5 text-xs font-medium text-[var(--stone)] hover:bg-red-50 dark:hover:bg-red-950/40 hover:border-red-200 dark:hover:border-red-800 hover:text-red-600 dark:hover:text-red-400 transition-all active:scale-95 cursor-pointer"
                    title="恢复为默认邮箱首字母"
                  >
                    <RotateCcw size={13} />
                    <span>恢复默认</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 2. Format & Security Note Card */}
        <div className="rounded-2xl border border-[var(--mist)]/80 dark:border-white/10 bg-white/40 dark:bg-white/5 p-4 backdrop-blur-md space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-[var(--ink)]">
            <ImageIcon size={14} className="text-[var(--copper)]" />
            <span>图片格式与隐私说明</span>
          </div>
          <p className="text-[11px] text-[var(--stone)] leading-relaxed">
            支持 JPG、PNG、WebP、HEIC 等格式。上传后可拖动、缩放自由选择裁切位置，系统会在浏览器本地裁剪为高清视网膜微晶规格（约 20KB），无需消耗额外上传流量，刷新或离线均可稳定展示。
          </p>
        </div>
      </div>
    </BottomSheet>
  )
}
