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
