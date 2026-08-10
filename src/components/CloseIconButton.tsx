type Props = {
  onClick: () => void
  /** Defaults to "关闭". */
  'aria-label'?: string
  /** Defaults to aria-label. */
  title?: string
  className?: string
}

const BASE =
  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--stone)]/30 text-[var(--stone)] transition-colors hover:border-[var(--sage)] hover:text-[var(--sage)]'

export function CloseIconButton({
  onClick,
  'aria-label': ariaLabel = '关闭',
  title,
  className,
}: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      title={title ?? ariaLabel}
      className={className ? `${BASE} ${className}` : BASE}
    >
      <svg
        width="17"
        height="17"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M18 6L6 18M6 6l12 12" />
      </svg>
    </button>
  )
}
