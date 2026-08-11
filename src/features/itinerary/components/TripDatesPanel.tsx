import { useMemo } from 'react'
import {
  daysBetween,
  formatTripDayLabel,
  saveTripDates,
  type TripDateRange,
} from '../services/tripDates'
import { DateRangePicker } from './DateRangePicker'

interface Props {
  value: TripDateRange | null
  onChange: (range: TripDateRange | null) => void
  readOnly?: boolean
}

export function TripDatesPanel({ value, onChange, readOnly = false }: Props) {
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
            onClick={clearDates}
            className="rounded-full border border-[var(--stone)]/30 px-3 py-1.5 text-sm hover:border-[var(--sage)]"
          >
            清空日期
          </button>
        )}
      </div>

      <div
        className={`rounded-2xl border border-white/70 bg-[var(--card)] p-4 shadow-[var(--shadow)] ${
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
    </section>
  )
}
