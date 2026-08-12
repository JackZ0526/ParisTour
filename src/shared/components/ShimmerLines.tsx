const SHIMMER_WIDTHS = ['w-full', 'w-[92%]', 'w-[78%]', 'w-[64%]']

export function ShimmerLines({
  lines = 3,
  className,
}: {
  lines?: number
  className?: string
}) {
  return (
    <div className={`space-y-2${className ? ` ${className}` : ''}`} aria-hidden>
      {Array.from({ length: lines }, (_, index) => (
        <span
          key={index}
          className={`block h-3.5 rounded-full day-tab-shimmer ${SHIMMER_WIDTHS[index % SHIMMER_WIDTHS.length]}`}
        />
      ))}
    </div>
  )
}
