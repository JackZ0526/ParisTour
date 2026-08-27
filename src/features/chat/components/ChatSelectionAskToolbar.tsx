import { type PointerEvent, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import {
  ASK_ABOUT_HIGHLIGHT_Z,
  ASK_ABOUT_TOOLBAR_Z,
  type ChatSelectionAskState,
  type SelectionRect,
} from './chatSelectionAsk'

function keepNativeSelection(event: PointerEvent<HTMLElement>) {
  event.preventDefault()
}

function SelectionHighlight({ rects }: { rects: SelectionRect[] }) {
  if (!rects.length || typeof document === 'undefined') return null
  return createPortal(
    <>
      {rects.map((rect, index) => (
        <span
          key={`${rect.left}-${rect.top}-${index}`}
          aria-hidden
          className="pointer-events-none fixed rounded-[2px] bg-[#2563eb]/55 dark:bg-[#3b82f6]/60"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            zIndex: ASK_ABOUT_HIGHLIGHT_Z,
          }}
        />
      ))}
    </>,
    document.body,
  )
}

export function ChatSelectionAskToolbar({
  state,
  disabled,
  label,
  ariaLabel,
  toolbarRef,
  onAsk,
}: {
  state: ChatSelectionAskState | null
  disabled?: boolean
  label: string
  ariaLabel: string
  toolbarRef: RefObject<HTMLDivElement | null>
  onAsk: (text: string) => void
}) {
  if (!state || typeof document === 'undefined') return null

  return (
    <>
      <SelectionHighlight rects={state.highlights} />
      {createPortal(
        <div
          ref={toolbarRef}
          role="toolbar"
          aria-label={ariaLabel}
          style={{
            position: 'fixed',
            top: state.top,
            left: state.left,
            zIndex: ASK_ABOUT_TOOLBAR_Z,
          }}
          className="pointer-events-auto inline-flex items-center rounded-full border border-white/15 bg-[var(--ink)]/94 text-white shadow-[0_8px_24px_rgba(0,0,0,0.32)] backdrop-blur-xl dark:border-white/12 dark:bg-zinc-800/94"
          onPointerDown={keepNativeSelection}
          onMouseDown={(event) => event.preventDefault()}
        >
          <button
            type="button"
            disabled={disabled}
            onPointerDown={keepNativeSelection}
            onClick={() => onAsk(state.text)}
            className="rounded-full px-3 py-1.5 text-[13px] font-medium leading-none whitespace-nowrap text-white transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {label}
          </button>
        </div>,
        document.body,
      )}
    </>
  )
}
