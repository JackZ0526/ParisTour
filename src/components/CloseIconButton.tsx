type Props = {
  onClick: () => void
  /** Defaults to "关闭". */
  'aria-label'?: string
  /** Defaults to aria-label. */
  title?: string
  className?: string
}

const BASE =
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--mist)] bg-white/70 text-[var(--ink)] transition hover:border-[var(--sage)] hover:bg-white'

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
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden
      >
        <path d="M18 6L6 18M6 6l12 12" />
      </svg>
    </button>
  )
}
