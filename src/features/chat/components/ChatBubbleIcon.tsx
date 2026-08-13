import { MessageSquareText } from 'lucide-react'

export function ChatBubbleIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return <MessageSquareText aria-hidden className={className} strokeWidth={1.75} />
}
