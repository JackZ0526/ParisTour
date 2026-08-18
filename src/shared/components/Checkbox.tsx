import { Check } from 'lucide-react'

/**
 * Custom-styled checkbox matching the ParisTour design language:
 * soft rounded box, sage fill when checked, paper card when unchecked,
 * white Check icon that fades in on check. Visually hidden native input
 * keeps keyboard + screen-reader behavior; wrap the whole thing (or a
 * containing `<label>`) to make the row clickable.
 *
 * Size variants:
 *   - `sm` — h-4 w-4 (e.g. nested inside a popover row)
 *   - `md` — h-5 w-5 (e.g. tap-friendly card row on mobile)
 */
type CheckboxSize = 'sm' | 'md'

interface CheckboxProps {
  checked: boolean
  disabled?: boolean
  onCheckedChange: (on: boolean) => void
  /** Optional id so the checkbox can pair with an external `<label htmlFor>`. */
  id?: string
  size?: CheckboxSize
  className?: string
}

const BOX: Record<CheckboxSize, string> = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
}

const ICON: Record<CheckboxSize, string> = {
  sm: 'h-2.5 w-2.5',
  md: 'h-3 w-3',
}

export function Checkbox({
  checked,
  disabled,
  onCheckedChange,
  id,
  size = 'md',
  className = '',
}: CheckboxProps) {
  return (
    <span className={`relative flex shrink-0 ${className}`}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onCheckedChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className={`flex ${BOX[size]} items-center justify-center rounded-md border transition-colors duration-150 peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--sage)]/35 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[var(--paper)] peer-disabled:cursor-default peer-disabled:opacity-50 peer-checked:border-[var(--sage)] peer-checked:bg-[var(--sage)] peer-checked:text-white ${
          checked ? '' : 'border-[var(--ink)]/22 bg-[var(--card)]'
        }`}
      >
        <Check
          strokeWidth={2.5}
          className={`${ICON[size]} transition-opacity duration-100 ${
            checked ? 'opacity-100' : 'opacity-0'
          }`}
        />
      </span>
    </span>
  )
}
