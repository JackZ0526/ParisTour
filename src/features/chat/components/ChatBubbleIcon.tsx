export function ChatBubbleIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7.5 8.5h9M7.5 12h5.5" />
      <path d="M6 18.5 7.5 15H18a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2Z" />
    </svg>
  )
}
