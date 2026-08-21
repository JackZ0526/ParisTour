/** Shared liquid-glass surface used by compact metadata capsules. */
export const glassCapsuleSurfaceClass =
  "relative overflow-hidden rounded-full border shadow-[0_3px_12px_rgba(0,0,0,0.06),inset_0_1px_1.5px_rgba(255,255,255,1),inset_0_-1px_1px_rgba(255,255,255,0.65)] backdrop-blur-md backdrop-saturate-[180%] before:pointer-events-none before:absolute before:inset-x-2 before:top-0 before:h-px before:rounded-full before:bg-gradient-to-r before:from-transparent before:via-white before:to-transparent before:content-['']"

export const glassCapsuleToneClass = {
  copper: 'border-[#d7a98a]/70 bg-[#f6e8de]/75',
  sage: 'border-[#a8bcae]/70 bg-[#e7efe9]/75',
  blue: 'border-[#aabcca]/70 bg-[#e8eff3]/75',
  gold: 'border-[#d4bd91]/75 bg-[#f3ead8]/80',
  violet: 'border-[#b6accd]/70 bg-[#ede9f5]/75',
  neutral: 'border-white/80 bg-white/55',
} as const

/** Shared liquid frosted-glass card surface used by timeline cards & panels. */
export const glassCardSurfaceClass =
  "relative overflow-hidden rounded-2xl border border-white/80 bg-white/65 shadow-[0_4px_24px_rgba(0,0,0,0.04),inset_0_1px_1.5px_rgba(255,255,255,1),inset_0_-1px_1px_rgba(255,255,255,0.6)] backdrop-blur-xl backdrop-saturate-[180%] before:pointer-events-none before:absolute before:inset-x-3 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white before:to-transparent before:content-['']"

/** Shared liquid frosted-glass card surface with gentle sage-green tint. */
export const glassSageCardSurfaceClass =
  "relative overflow-hidden rounded-2xl border border-[#b5c7ba]/45 bg-[#f4f8f5]/65 shadow-[0_4px_24px_rgba(0,0,0,0.03),inset_0_1px_1.5px_rgba(255,255,255,1),inset_0_-1px_1px_rgba(255,255,255,0.6)] backdrop-blur-xl backdrop-saturate-[180%] before:pointer-events-none before:absolute before:inset-x-3 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white before:to-transparent before:content-['']"

/** Shared liquid frosted-glass card surface with gentle violet/purple tint. */
export const glassVioletCardSurfaceClass =
  "relative overflow-hidden rounded-2xl border border-[#c4bcd8]/45 bg-[#f8f5fa]/65 shadow-[0_4px_24px_rgba(0,0,0,0.03),inset_0_1px_1.5px_rgba(255,255,255,1),inset_0_-1px_1px_rgba(255,255,255,0.6)] backdrop-blur-xl backdrop-saturate-[180%] before:pointer-events-none before:absolute before:inset-x-3 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white before:to-transparent before:content-['']"

/** Shared liquid frosted-glass card surface with a warm hotel / booking tint. */
export const glassGoldCardSurfaceClass =
  "relative overflow-hidden rounded-2xl border border-[#d4bd91]/55 bg-[#fbf8f0]/72 shadow-[0_4px_24px_rgba(109,82,39,0.04),inset_0_1px_1.5px_rgba(255,255,255,1),inset_0_-1px_1px_rgba(255,255,255,0.65)] backdrop-blur-xl backdrop-saturate-[180%] before:pointer-events-none before:absolute before:inset-x-3 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white before:to-transparent before:content-['']"

/** Active / selected state for glass cards with warm copper-amber glow. */
export const glassCardActiveSurfaceClass =
  "relative overflow-hidden rounded-2xl border border-[var(--copper)]/80 bg-white/90 shadow-[0_8px_32px_rgba(181,106,60,0.14),inset_0_1px_2px_rgba(255,255,255,1)] ring-2 ring-[var(--copper)]/35 backdrop-blur-2xl before:pointer-events-none before:absolute before:inset-x-3 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white before:to-transparent before:content-[''] timeline-card-selected-highlight"

/** Small handle / icon pill surface for drag handles and action buttons. */
export const glassHandleSurfaceClass =
  "border border-white/80 bg-white/70 shadow-[0_1px_4px_rgba(0,0,0,0.04),inset_0_1px_1px_rgba(255,255,255,1)] backdrop-blur-md"

/** Shared frosted-glass modal / sheet surface used by bottom sheets & dialogs. */
export const glassModalSurfaceClass =
  "relative overflow-hidden border border-white/90 bg-white/85 shadow-[0_20px_60px_rgba(0,0,0,0.12),inset_0_1px_2px_rgba(255,255,255,1),inset_0_-1px_1px_rgba(255,255,255,0.6)] backdrop-blur-2xl backdrop-saturate-[180%] before:pointer-events-none before:absolute before:inset-x-6 before:top-0 before:h-[1.5px] before:bg-gradient-to-r before:from-transparent before:via-white before:to-transparent before:content-['']"

/** Shared floating dropdown / popover glass surface. */
export const glassPopoverSurfaceClass =
  "overflow-hidden rounded-2xl border border-white/90 bg-white/90 shadow-[0_16px_40px_rgba(0,0,0,0.14),inset_0_1px_1.5px_rgba(255,255,255,1)] backdrop-blur-2xl backdrop-saturate-[180%] before:pointer-events-none before:absolute before:inset-x-3 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white before:to-transparent before:content-['']"
