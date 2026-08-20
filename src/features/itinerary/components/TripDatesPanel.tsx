import { useMemo, useState } from 'react'
import {
  daysBetween,
  formatTripDayLabel,
  saveTripDates,
  type TripDateRange,
} from '../services/tripDates'
import { DateRangePicker } from './DateRangePicker'
import {
  glassCapsuleSurfaceClass,
  glassCapsuleToneClass,
  glassCardSurfaceClass,
} from '../../../shared/styles/glassCapsule'
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog'

interface Props {
  value: TripDateRange | null
  onChange: (range: TripDateRange | null) => void
  readOnly?: boolean
}

export function TripDatesPanel({ value, onChange, readOnly = false }: Props) {
  const [confirmClearOpen, setConfirmClearOpen] = useState(false)
  const startDate = value?.startDate || ''
  const endDate = value?.endDate || ''

  const nightCount = useMemo(() => {
    if (!startDate || !endDate) return 0
    const days = daysBetween(startDate, endDate)
    return Math.max(0, days - 1)
  }, [startDate, endDate])

  const dayCount = useMemo(() => {
    if (!startDate || !endDate) return 0
    return daysBetween(startDate, endDate)
  }, [startDate, endDate])

  function commit(range: TripDateRange | null) {
    if (readOnly) return
    onChange(range)
    saveTripDates(range)
  }

  function clearDates() {
    commit(null)
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl sm:text-3xl">日期</h2>
          <p className="mt-1 max-w-2xl text-sm text-[var(--stone)]">
            {readOnly
              ? '当前为只读共享，无法修改日期。'
              : '选择出发与返程日期。若航班次日抵达，行程开始日会按实际到达日调整。'}
          </p>
        </div>
        {value && !readOnly && (
          <button
            type="button"
            onClick={() => setConfirmClearOpen(true)}
            className={`${glassCapsuleSurfaceClass} ${glassCapsuleToneClass.neutral} px-3.5 py-1.5 text-xs text-[var(--stone)] transition-colors hover:text-red-700 active:scale-95`}
          >
            清空日期
          </button>
        )}
      </div>

      <div
        className={`rounded-3xl ${glassCardSurfaceClass} p-5 sm:p-6 transition-colors ${
          readOnly ? 'pointer-events-none opacity-80' : ''
        }`}
      >
        <DateRangePicker
          label="行程日期"
          value={value}
          onChange={commit}
          placeholder="出发 – 返程"
        />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {value && (
            <p className="text-sm text-[var(--stone)]">
              {formatTripDayLabel(startDate)} → {formatTripDayLabel(endDate)}
              <span className="mx-1.5 text-[var(--mist)]">·</span>
              共 {dayCount} 天 / {nightCount} 晚
            </p>
          )}
          {!value && (
            <p className="text-sm text-[var(--stone)]">
              建议秋季出行；打开日历后先点出发日，再点返程日。
            </p>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmClearOpen}
        onClose={() => setConfirmClearOpen(false)}
        onConfirm={clearDates}
        title="清空旅行日期"
        description="确定清空旅行起止日期吗？相关的行程天数与航班时间对齐将恢复默认。"
        confirmText="清空日期"
        tone="danger"
        icon="trash"
      />
    </section>
  )
}
