import { useEffect, useRef, useState } from 'react'
import { Check, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react'
import {
  encodeAvatarCrop,
  loadImageElement,
  type AvatarCrop,
} from '../../auth/services/avatarStore'

interface AvatarCropperProps {
  dataUrl: string
  shape?: 'circle' | 'squircle'
  onConfirm: (dataUrl: string) => void
  onCancel: () => void
  onRepick?: () => void
}

const VIEWPORT_SIZE = 280
const FRAME_RADIUS = 24 // matches Tailwind `rounded-3xl` (1.5rem) used by xl avatar
const MIN_SCALE = 1 // 1 = "cover" baseline; the image's smaller dim exactly fills the viewport
const MAX_SCALE = 3
const ZOOM_STEP = 1.2

interface PointerDrag {
  pointerId: number
  startClientX: number
  startClientY: number
  baseOffsetX: number
  baseOffsetY: number
}

function clampOffsetToViewport(offset: number, displayDim: number, viewportDim: number): number {
  if (displayDim <= viewportDim) return 0
  const halfOvershoot = (displayDim - viewportDim) / 2
  return Math.max(-halfOvershoot, Math.min(halfOvershoot, offset))
}

export function AvatarCropper({
  dataUrl,
  shape = 'squircle',
  onConfirm,
  onCancel,
  onRepick,
}: AvatarCropperProps) {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [baseScale, setBaseScale] = useState(1) // "cover" scale: smaller dim = VIEWPORT_SIZE
  const [scale, setScale] = useState(1) // user-controlled multiplier on top of baseScale
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const dragRef = useRef<PointerDrag | null>(null)
  const viewportRef = useRef<HTMLDivElement>(null)

  // Load the image whenever the source changes
  useEffect(() => {
    let cancelled = false
    setImg(null)
    setLoadError(null)
    setScale(1)
    setOffset({ x: 0, y: 0 })

    loadImageElement(dataUrl)
      .then((el) => {
        if (cancelled) return
        const w = el.naturalWidth || el.width
        const h = el.naturalHeight || el.height
        if (!w || !h) {
          setLoadError('图片尺寸异常')
          return
        }
        setImg(el)
        // baseScale makes the smaller source dimension exactly equal to VIEWPORT_SIZE
        setBaseScale(Math.max(VIEWPORT_SIZE / w, VIEWPORT_SIZE / h))
      })
      .catch((e) => {
        if (cancelled) return
        setLoadError(e instanceof Error ? e.message : '加载图片失败')
      })

    return () => {
      cancelled = true
    }
  }, [dataUrl])

  const effectiveScale = baseScale * scale
  const displayW = img ? img.naturalWidth * effectiveScale : 0
  const displayH = img ? img.naturalHeight * effectiveScale : 0
  const imageLeft = (VIEWPORT_SIZE - displayW) / 2 + offset.x
  const imageTop = (VIEWPORT_SIZE - displayH) / 2 + offset.y

  function clampOffset(o: { x: number; y: number }): { x: number; y: number } {
    return {
      x: clampOffsetToViewport(o.x, displayW, VIEWPORT_SIZE),
      y: clampOffsetToViewport(o.y, displayH, VIEWPORT_SIZE),
    }
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!img) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      baseOffsetX: offset.x,
      baseOffsetY: offset.y,
    }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    const dx = e.clientX - drag.startClientX
    const dy = e.clientY - drag.startClientY
    setOffset(clampOffset({ x: drag.baseOffsetX + dx, y: drag.baseOffsetY + dy }))
  }

  function endDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === e.pointerId) {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId)
      }
      dragRef.current = null
    }
  }

  /**
   * Zoom by `factor` keeping the image point under the viewport's (localX, localY)
   * fixed. After clamping the new scale and offset, the visible region under
   * (localX, localY) remains unchanged.
   */
  function zoomAt(localX: number, localY: number, factor: number) {
    if (!img) return
    setScale((prev) => {
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, prev * factor))
      if (newScale === prev) return prev
      const prevEff = baseScale * prev
      const newEff = baseScale * newScale
      const oldLeft = (VIEWPORT_SIZE - img.naturalWidth * prevEff) / 2 + offset.x
      const oldTop = (VIEWPORT_SIZE - img.naturalHeight * prevEff) / 2 + offset.y
      const newLeft = localX - (localX - oldLeft) * (newEff / prevEff)
      const newTop = localY - (localY - oldTop) * (newEff / prevEff)
      const newDisplayW = img.naturalWidth * newEff
      const newDisplayH = img.naturalHeight * newEff
      const nextOffset = {
        x: newLeft - (VIEWPORT_SIZE - newDisplayW) / 2,
        y: newTop - (VIEWPORT_SIZE - newDisplayH) / 2,
      }
      setOffset(clampOffset(nextOffset))
      return newScale
    })
  }

  function handleWheel(e: React.WheelEvent<HTMLDivElement>) {
    if (!img) return
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP
    zoomAt(e.clientX - rect.left, e.clientY - rect.top, factor)
  }

  function zoomByButton(factor: number) {
    if (!img) return
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect) return
    zoomAt(VIEWPORT_SIZE / 2, VIEWPORT_SIZE / 2, factor)
  }

  function handleReset() {
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }

  function handleConfirm() {
    if (!img) return
    // Map the visible viewport rectangle back into source-image coordinates.
    // The image is rendered at (imageLeft, imageTop) with size (displayW, displayH).
    // The viewport's top-left in image-display coords is (-imageLeft, -imageTop).
    // In source coords: divide by effectiveScale. encodeAvatarCrop clamps to image bounds.
    const cropSize = VIEWPORT_SIZE / effectiveScale
    const crop: AvatarCrop = {
      sx: Math.max(0, -imageLeft / effectiveScale),
      sy: Math.max(0, -imageTop / effectiveScale),
      size: cropSize,
    }
    onConfirm(encodeAvatarCrop(img, crop))
  }

  const isReady = !!img && !loadError
  const cropFrameRadius = shape === 'circle' ? '50%' : `${FRAME_RADIUS}px`

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        ref={viewportRef}
        className="relative overflow-hidden rounded-3xl border border-white/80 shadow-[0_12px_36px_rgba(0,0,0,0.12),inset_0_1.5px_2px_rgba(255,255,255,1)] select-none touch-none"
        style={{
          width: VIEWPORT_SIZE,
          height: VIEWPORT_SIZE,
          background: '#0f1115',
          cursor: img ? (dragRef.current ? 'grabbing' : 'grab') : 'default',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onWheel={handleWheel}
      >
        {/* Image layer — sized in pixels, positioned via left/top + offset */}
        {img && (
          <img
            src={dataUrl}
            alt=""
            className="absolute pointer-events-none"
            style={{
              width: displayW,
              height: displayH,
              left: imageLeft,
              top: imageTop,
              maxWidth: 'none',
            }}
            draggable={false}
          />
        )}

        {/* Crop frame: dim everything outside the visible region using a halo */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            borderRadius: cropFrameRadius,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)',
          }}
        />

        {/* Crop frame border (no fill, just a thin ring) */}
        <div
          className="absolute inset-0 pointer-events-none ring-1 ring-white/70"
          style={{ borderRadius: cropFrameRadius }}
        />

        {/* Loading / error states */}
        {!img && !loadError && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-white/80">
            加载中…
          </div>
        )}
        {loadError && (
          <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-xs text-red-200">
            {loadError}
          </div>
        )}
      </div>

      {/* Hint */}
      <p className="text-[11px] text-[var(--stone)]">
        {isReady ? '拖动图片调整位置，滚轮或点击按钮缩放' : ' '}
      </p>

      {/* Zoom controls */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => zoomByButton(1 / ZOOM_STEP)}
          disabled={!isReady || scale <= MIN_SCALE}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-black/10 dark:border-white/10 bg-white/70 dark:bg-white/5 text-[var(--stone)] hover:bg-white dark:hover:bg-white/10 active:scale-95 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="缩小"
        >
          <ZoomOut size={15} />
        </button>
        <button
          type="button"
          onClick={() => zoomByButton(ZOOM_STEP)}
          disabled={!isReady || scale >= MAX_SCALE}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-black/10 dark:border-white/10 bg-white/70 dark:bg-white/5 text-[var(--stone)] hover:bg-white dark:hover:bg-white/10 active:scale-95 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="放大"
        >
          <ZoomIn size={15} />
        </button>
        <button
          type="button"
          onClick={handleReset}
          disabled={!isReady}
          className="inline-flex h-9 items-center gap-1 rounded-full border border-black/10 dark:border-white/10 bg-white/70 dark:bg-white/5 px-3 text-[11px] font-medium text-[var(--stone)] hover:bg-white dark:hover:bg-white/10 active:scale-95 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="重置"
        >
          <RotateCcw size={12} />
          <span>重置</span>
        </button>
      </div>

      {/* Action row */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 rounded-full border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 px-4 py-2.5 text-xs font-medium text-[var(--stone)] hover:bg-black/10 dark:hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
        >
          <X size={13} />
          <span>取消</span>
        </button>
        {onRepick && (
          <button
            type="button"
            onClick={onRepick}
            className="inline-flex items-center gap-1.5 rounded-full border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 px-4 py-2.5 text-xs font-medium text-[var(--stone)] hover:bg-black/10 dark:hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
          >
            <span>重新选择</span>
          </button>
        )}
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!isReady}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-[var(--ink)] dark:bg-[var(--copper)] px-5 py-2.5 text-xs font-semibold text-white shadow-[0_4px_16px_rgba(35,42,38,0.2),inset_0_1px_1.5px_rgba(255,255,255,0.3)] transition-all hover:bg-black dark:hover:bg-[var(--copper)]/90 hover:scale-[1.02] active:scale-95 cursor-pointer disabled:opacity-50"
        >
          <Check size={14} />
          <span>确认裁切</span>
        </button>
      </div>
    </div>
  )
}
