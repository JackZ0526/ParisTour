/** Shared liquid-glass surface used by compact metadata capsules. */
export const glassCapsuleSurfaceClass =
  "glass-surface-capsule relative overflow-hidden rounded-full border shadow-[0_3px_12px_rgba(0,0,0,0.06),inset_0_1px_1.5px_rgba(255,255,255,1),inset_0_-1px_1px_rgba(255,255,255,0.65)] backdrop-blur-md backdrop-saturate-[180%] before:pointer-events-none before:absolute before:inset-x-2 before:top-0 before:h-px before:rounded-full before:bg-gradient-to-r before:from-transparent before:via-white dark:before:via-white/30 before:to-transparent before:content-['']"

export const glassCapsuleToneClass = {
  copper: 'border-[#d7a98a]/70 bg-[#f6e8de]/75 dark:border-[#d48354]/25 dark:bg-[#d48354]/10',
  sage: 'border-[#a8bcae]/70 bg-[#e7efe9]/75 dark:border-[#668b7a]/25 dark:bg-[#668b7a]/10',
  blue: 'border-[#aabcca]/70 bg-[#e8eff3]/75 dark:border-[#7b9e9c]/25 dark:bg-[#7b9e9c]/10',
  gold: 'border-[#d4bd91]/75 bg-[#f3ead8]/80 dark:border-[#deb881]/25 dark:bg-[#deb881]/10',
  violet: 'border-[#b6accd]/70 bg-[#ede9f5]/75 dark:border-[#a89bc5]/25 dark:bg-[#a89bc5]/10',
  rose: 'border-[#f2bebe]/75 bg-[#fdf2f2]/80 dark:border-[#e57373]/25 dark:bg-[#e57373]/10',
  neutral: 'border-white/80 bg-white/55 dark:border-white/14 dark:bg-white/[0.08]',
} as const

/** Shared liquid frosted-glass card surface used by timeline cards & panels. */
export const glassCardSurfaceClass =
  "glass-surface-card relative overflow-hidden rounded-2xl border border-white/80 bg-white/65 shadow-[0_4px_24px_rgba(0,0,0,0.04),inset_0_1px_1.5px_rgba(255,255,255,1),inset_0_-1px_1px_rgba(255,255,255,0.6)] backdrop-blur-xl backdrop-saturate-[180%] before:pointer-events-none before:absolute before:inset-x-3 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white dark:before:via-white/30 before:to-transparent before:content-['']"

/** Shared liquid frosted-glass card surface with gentle sage-green tint. */
export const glassSageCardSurfaceClass =
  "glass-surface-sage relative overflow-hidden rounded-2xl border border-[#b5c7ba]/45 bg-[#f4f8f5]/65 shadow-[0_4px_24px_rgba(0,0,0,0.03),inset_0_1px_1.5px_rgba(255,255,255,1),inset_0_-1px_1px_rgba(255,255,255,0.6)] backdrop-blur-xl backdrop-saturate-[180%] before:pointer-events-none before:absolute before:inset-x-3 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white dark:before:via-white/32 before:to-transparent before:content-['']"

/** Shared liquid frosted-glass card surface with gentle violet/purple tint. */
export const glassVioletCardSurfaceClass =
  "glass-surface-violet relative overflow-hidden rounded-2xl border border-[#c4bcd8]/45 bg-[#f8f5fa]/65 shadow-[0_4px_24px_rgba(0,0,0,0.03),inset_0_1px_1.5px_rgba(255,255,255,1),inset_0_-1px_1px_rgba(255,255,255,0.6)] backdrop-blur-xl backdrop-saturate-[180%] before:pointer-events-none before:absolute before:inset-x-3 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white dark:before:via-white/32 before:to-transparent before:content-['']"

/** Shared liquid frosted-glass card surface with a warm hotel / booking tint. */
export const glassGoldCardSurfaceClass =
  "glass-surface-gold relative overflow-hidden rounded-2xl border border-[#d4bd91]/55 bg-[#fbf8f0]/72 shadow-[0_4px_24px_rgba(109,82,39,0.04),inset_0_1px_1.5px_rgba(255,255,255,1),inset_0_-1px_1px_rgba(255,255,255,0.65)] backdrop-blur-xl backdrop-saturate-[180%] before:pointer-events-none before:absolute before:inset-x-3 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white dark:before:via-white/32 before:to-transparent before:content-['']"

/** Active / selected state for glass cards with warm copper-amber glow. */
export const glassCardActiveSurfaceClass =
  "glass-surface-raised relative overflow-hidden rounded-2xl border border-[var(--copper)]/80 dark:!border-[var(--copper)]/90 bg-white/90 shadow-[0_8px_32px_rgba(181,106,60,0.14),inset_0_1px_2px_rgba(255,255,255,1)] ring-2 ring-[var(--copper)]/35 dark:ring-[var(--copper)]/45 backdrop-blur-2xl before:pointer-events-none before:absolute before:inset-x-3 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white dark:before:via-white/35 before:to-transparent before:content-[''] timeline-card-selected-highlight"

/** Small handle / icon pill surface for drag handles and action buttons. */
export const glassHandleSurfaceClass =
  "glass-surface-handle border border-white/80 bg-white/70 shadow-[0_1px_4px_rgba(0,0,0,0.04),inset_0_1px_1px_rgba(255,255,255,1)] backdrop-blur-md"

/** Shared frosted-glass modal / sheet surface used by bottom sheets & dialogs. */
export const glassModalSurfaceClass =
  "glass-surface-modal relative overflow-hidden border border-white/90 max-sm:border-b-0 bg-white/85 shadow-[0_20px_60px_rgba(0,0,0,0.12),inset_0_1px_2px_rgba(255,255,255,1)] backdrop-blur-2xl backdrop-saturate-[180%] before:pointer-events-none before:absolute before:inset-x-6 before:top-0 before:h-[1.5px] before:bg-gradient-to-r before:from-transparent before:via-white dark:before:via-white/38 before:to-transparent before:content-['']"

/** Shared floating dropdown / popover glass surface. */
export const glassPopoverSurfaceClass =
  "glass-surface-popover overflow-hidden rounded-2xl border border-white/90 bg-white/90 shadow-[0_16px_40px_rgba(0,0,0,0.14),inset_0_1px_1.5px_rgba(255,255,255,1)] backdrop-blur-2xl backdrop-saturate-[180%] before:pointer-events-none before:absolute before:inset-x-3 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white dark:before:via-white/35 before:to-transparent before:content-['']"

/** Shared lightweight micro-blur backdrop overlay class for dialogs, bottom sheets, and drawers. */
export const glassBackdropSurfaceClass =
  'bg-black/16 dark:bg-black/45 backdrop-blur-[2px] transform-gpu will-change-[opacity]'

