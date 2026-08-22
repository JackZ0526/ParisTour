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
import { useTranslation } from '../../../shared/i18n'

interface Props {
  value: TripDateRange | null
  onChange: (range: TripDateRange | null) => void
  readOnly?: boolean
}

export function TripDatesPanel({ value, onChange, readOnly = false }: Props) {
  const { t } = useTranslation()
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
          <h2 className="font-display text-2xl sm:text-3xl">{t('itinerary.datesTitle')}</h2>
          <p className="mt-1 max-w-2xl text-sm text-[var(--stone)]">
            {readOnly
              ? t('itinerary.datesReadOnly')
              : t('itinerary.datesDesc')}
          </p>
        </div>
        {value && !readOnly && (
          <button
            type="button"
            onClick={() => setConfirmClearOpen(true)}
            className={`${glassCapsuleSurfaceClass} ${glassCapsuleToneClass.neutral} px-3.5 py-1.5 text-xs text-[var(--stone)] transition-colors hover:text-red-700 active:scale-95`}
          >
            {t('itinerary.clearDates')}
          </button>
        )}
      </div>

      <div
        className={`rounded-3xl ${glassCardSurfaceClass} p-5 sm:p-6 transition-colors ${
          readOnly ? 'pointer-events-none opacity-80' : ''
        }`}
      >
        <DateRangePicker
          label={t('itinerary.tripDates')}
          value={value}
          onChange={commit}
          placeholder={t('itinerary.placeholderDateRange')}
        />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {value && (
            <p className="text-sm text-[var(--stone)]">
              {formatTripDayLabel(startDate)} → {formatTripDayLabel(endDate)}
              <span className="mx-1.5 text-[var(--mist)]">·</span>
              {t('itinerary.daysCount', { count: dayCount })} / {t('itinerary.nightsCount', { count: nightCount })}
            </p>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmClearOpen}
        onClose={() => setConfirmClearOpen(false)}
        onConfirm={clearDates}
        title={t('itinerary.clearDates')}
        description={t('itinerary.confirmClearDates')}
        confirmText={t('itinerary.clearDates')}
        cancelText={t('common.cancel')}
        tone="danger"
        icon="trash"
      />
    </section>
  )
}
