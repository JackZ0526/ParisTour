import { useState } from 'react'
import { getPlace } from '../data/places'
import type { DayNavPlan, ResolvedDayLeg } from '../services/googleNav'
import { PATH_MODE_COLORS } from '../services/googleNav'
import type { DayPlan, Place, SelectedHotel } from '../types'
import {
  getDayOrigin,
  isAirportPlace,
  isHotelPlace,
  numberedStopIndexes,
  SELECTED_HOTEL_PLACE_ID,
} from '../utils/dayOrigin'
import { AddPlaceDialog } from './AddPlaceDialog'
import { GooglePlacePhoto } from './GooglePlacePhoto'
import { LoadingIndicator } from './LoadingIndicator'
import { HouseIcon, PlaneIcon } from './markerIcons'

const typeLabel: Record<string, string> = {
  cafe: '咖啡馆',
  attraction: '景点',
  restaurant: '餐厅',
  transport: '交通',
  hotel: '酒店',
}

function TrashIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  )
}

function PinIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {/* Classic thumbtack / pushpin */}
      <path d="M12 17v5" />
      <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
    </svg>
  )
}

function LegConnector({
  leg,
  fallbackLabel,
  calculating,
}: {
  leg: ResolvedDayLeg | null | undefined
  fallbackLabel?: string
  calculating?: boolean
}) {
  const mode = leg?.displayMode
  const tone =
    mode === 'TRANSIT'
      ? 'border-sky-300/60 bg-sky-50 text-sky-900'
      : mode === 'DRIVING'
        ? 'border-[var(--copper)]/40 bg-[var(--copper)]/10 text-[var(--copper)]'
        : 'border-[var(--stone)]/25 bg-[var(--mist)]/70 text-[var(--stone)]'

  const lines = leg?.transitLines || []

  return (
    <div className="flex items-start gap-3 px-2 py-1.5" aria-busy={calculating || undefined}>
      <div className="ml-3 mt-1 h-8 w-px bg-[var(--stone)]/25" />
      <div className="min-w-0 flex-1 space-y-1.5">
        {calculating && !leg ? (
          <LoadingIndicator
            variant="badge"
            label={fallbackLabel || '正在计算导航…'}
            size="sm"
            showDots
          />
        ) : lines.length > 0 ? (
          <>
            <div className="flex flex-wrap gap-1.5">
              {lines.map((line) => (
                <span
                  key={line.label}
                  className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs"
                  style={{
                    borderColor: `${line.color || PATH_MODE_COLORS[line.mode]}66`,
                    backgroundColor: `${line.color || PATH_MODE_COLORS[line.mode]}18`,
                    color: 'var(--ink)',
                  }}
                >
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: line.color || PATH_MODE_COLORS[line.mode] }}
                  />
                  {line.label}
                </span>
              ))}
            </div>
            <p className={`inline-flex rounded-full border px-2.5 py-1 text-xs ${tone}`}>
              {leg?.durationText}
              {leg?.distanceText ? ` · ${leg.distanceText}` : ''}
              <span className="ml-1 opacity-60">· Google</span>
            </p>
          </>
        ) : (
          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs ${tone}`}>
            {leg?.label || fallbackLabel || '查看地图导航'}
          </span>
        )}
      </div>
    </div>
  )
}

interface Props {
  day: DayPlan
  hotel: SelectedHotel
  customPlaces: Record<string, Place>
  selectedPlaceId: string | null
  navPlan: DayNavPlan
  navLoading: boolean
  copyRefreshing?: boolean
  /** True while this day's stops are being regenerated via LLM. */
  dayRegenerating?: boolean
  dayRegenError?: string | null
  /** True when this day is the trip's return day (hotel origin-only, no overnight pin). */
  isLastDay?: boolean
  onSelectPlace: (id: string) => void
  onReorder: (from: number, to: number) => void
  onDelete: (stopId: string) => void
  onAddCustom: (place: Place, mode: 'best' | 'end') => void
  onResetDay: () => void
  /** Restore this day from the first-generation baseline snapshot. */
  canRestoreDayDefault?: boolean
  onRestoreDayDefault?: () => void
  tripPlaceNames: string[]
  readOnly?: boolean
}

export function DayTimeline({
  day,
  hotel,
  customPlaces,
  selectedPlaceId,
  navPlan,
  navLoading,
  copyRefreshing,
  dayRegenerating = false,
  dayRegenError = null,
  isLastDay = false,
  onSelectPlace,
  onReorder,
  onDelete,
  onAddCustom,
  onResetDay,
  canRestoreDayDefault = false,
  onRestoreDayDefault,
  tripPlaceNames,
  readOnly = false,
}: Props) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  const dayOrigin = getDayOrigin(day.day, hotel)
  const metroHint =
    day.metroHintFromArea[hotel.areaKey] ||
    day.metroHintFromArea.custom ||
    (dayOrigin.kind === 'airport' ? '请根据地图从机场出发。' : '请根据地图从酒店出发。')

  const stopPlaces = day.stops.map((stop) => {
    try {
      return getPlace(stop.placeId, customPlaces)
    } catch {
      return { id: stop.placeId, type: 'attraction' as const, name: stop.placeId }
    }
  })
  const stopNumbers = numberedStopIndexes(stopPlaces)

  return (
    <div className="space-y-4">
      <div className="animate-fade-up rounded-2xl border border-white/70 bg-[var(--card)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[var(--ink)] px-2.5 py-1 text-xs text-[var(--paper)]">
              Day {day.day}
            </span>
            <span className="rounded-full bg-[var(--sage)]/15 px-2.5 py-1 text-xs text-[var(--sage)]">
              {day.pace}
            </span>
            <span className="rounded-full bg-[var(--mist)] px-2.5 py-1 text-xs text-[var(--stone)]">
              {readOnly ? '只读共享' : '可拖拽排序 · 可增删'}
            </span>
            {copyRefreshing && !dayRegenerating && (
              <LoadingIndicator variant="badge" label="标题生成中…" size="sm" showDots />
            )}
            {dayRegenerating && (
              <LoadingIndicator variant="badge" label="正在重新生成今天…" size="sm" showDots />
            )}
          </div>
          {!readOnly && (
          <div className="flex flex-wrap items-center gap-2">
            {canRestoreDayDefault && onRestoreDayDefault && (
              <button
                type="button"
                onClick={onRestoreDayDefault}
                disabled={dayRegenerating}
                className="rounded-full border border-[var(--stone)]/30 px-3 py-1 text-xs hover:border-[var(--sage)] disabled:cursor-wait disabled:opacity-60"
              >
                恢复本日默认
              </button>
            )}
            <button
              type="button"
              onClick={onResetDay}
              disabled={dayRegenerating}
              className="rounded-full border border-[var(--stone)]/30 px-3 py-1 text-xs hover:border-[var(--sage)] disabled:cursor-wait disabled:opacity-60"
            >
              {dayRegenerating ? '生成中…' : '重新生成行程'}
            </button>
          </div>
          )}
        </div>
        <h3 className="font-display mt-2 text-3xl">{day.title}</h3>
        <p className="text-sm text-[var(--copper)]">{day.theme}</p>
        <p className="mt-2 text-sm text-[var(--stone)]">{day.summary}</p>
        {dayRegenError && (
          <p className="mt-2 rounded-xl border border-[var(--copper)]/30 bg-[var(--mist)]/40 px-3 py-2 text-xs text-[var(--copper)]">
            {dayRegenError}
          </p>
        )}
        {dayRegenerating && (
          <div className="mt-3 rounded-xl border border-[var(--sage)]/20 bg-[var(--mist)]/40 px-3 py-3">
            <LoadingIndicator
              variant="inline"
              label="正在重新生成今天的行程…"
              size="sm"
              showDots
            />
          </div>
        )}
        <div className="mt-3">
          <p className="rounded-xl bg-[var(--mist)]/50 px-3 py-2 text-sm" aria-busy={navLoading || undefined}>
            <span className="font-medium">今日步行：</span>
            {navLoading ? (
              <LoadingIndicator
                className="ml-1 align-middle"
                label="正在根据 Google 步行导航计算…"
                size="sm"
                showDots
              />
            ) : (
              navPlan.walkSummaryText
            )}
          </p>
        </div>
      </div>

      {/* Day-1 airport origin chip (not an itinerary stop; matches map plane marker). */}
      {dayOrigin.kind === 'airport' && (
        <div className="flex items-start gap-3 rounded-2xl border border-white/70 bg-[var(--card)] p-3">
          <span
            className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--copper)] text-white"
            title="机场"
            aria-label="机场"
          >
            <PlaneIcon />
          </span>
          <div className="min-w-0 flex-1">
            <span className="text-xs text-[var(--stone)]">出发原点 · 交通</span>
            <p className="mt-1 font-medium">{dayOrigin.label}</p>
          </div>
        </div>
      )}

      {/* Day origin → first stop (airport on day 1, hotel otherwise) */}
      {day.stops.length > 0 && (
        <LegConnector
          leg={navPlan.hotelToFirst}
          calculating={navLoading && !navPlan.hotelToFirst}
          fallbackLabel={
            navLoading
              ? dayOrigin.kind === 'airport'
                ? '计算从机场出发…'
                : '计算从酒店出发…'
              : navPlan.hotelToFirstText || metroHint
          }
        />
      )}

      <ol className="space-y-1">
        {day.stops.map((stop, index) => {
          const place = getPlace(stop.placeId, customPlaces)
          const active = selectedPlaceId === place.id
          const n = stopNumbers[index]
          const stopKey = stop.id || `${day.day}-${place.id}-${index}`
          const isHotelStop = isHotelPlace(place)
          const isAirportStop = isAirportPlace(place)
          const isCheckInHotel =
            day.day === 1 && index === 0 && place.id === SELECTED_HOTEL_PLACE_ID
          const isOvernightHotel =
            !isLastDay &&
            index === day.stops.length - 1 &&
            place.id === SELECTED_HOTEL_PLACE_ID
          const isFixedHotel = isCheckInHotel || isOvernightHotel
          const pinTitle = isCheckInHotel
            ? '酒店入住点固定为首站'
            : '回酒店过夜固定为末站'
          const isOver =
            !isFixedHotel && overIndex === index && dragIndex !== null && dragIndex !== index
          const legToNext = navPlan.betweenStops[index]

          return (
            <li key={stopKey}>
              <div
                draggable={!readOnly && !isFixedHotel}
                onDragStart={(e) => {
                  if (readOnly || isFixedHotel) {
                    e.preventDefault()
                    return
                  }
                  const target = e.target as HTMLElement
                  if (target.closest('button, a')) {
                    e.preventDefault()
                    return
                  }
                  setDragIndex(index)
                  e.dataTransfer.effectAllowed = 'move'
                  e.dataTransfer.setData('text/plain', String(index))
                }}
                onDragEnd={() => {
                  setDragIndex(null)
                  setOverIndex(null)
                }}
                onDragOver={(e) => {
                  if (readOnly || isFixedHotel) return
                  e.preventDefault()
                  setOverIndex(index)
                }}
                onDrop={(e) => {
                  if (readOnly || isFixedHotel) return
                  e.preventDefault()
                  const from = dragIndex ?? Number(e.dataTransfer.getData('text/plain'))
                  if (Number.isFinite(from)) onReorder(from, index)
                  setDragIndex(null)
                  setOverIndex(null)
                }}
                className={`rounded-2xl border transition ${
                  isOver
                    ? 'border-[var(--copper)] ring-2 ring-[var(--copper)]/25'
                    : 'border-transparent'
                } ${dragIndex === index ? 'opacity-60' : ''}`}
              >
                <div
                  className={`flex items-start gap-3 rounded-2xl border p-3 ${
                    active
                      ? 'border-[var(--copper)] bg-white shadow-[var(--shadow)]'
                      : 'border-white/70 bg-[var(--card)]'
                  }`}
                >
                  {isFixedHotel ? (
                    <span
                      className="mt-1 inline-flex h-7 w-7 select-none items-center justify-center rounded-md bg-[var(--mist)] text-[var(--stone)]"
                      title={pinTitle}
                      aria-label={pinTitle}
                    >
                      <PinIcon />
                    </span>
                  ) : (
                    <span
                      className="mt-1 cursor-grab select-none rounded-md bg-[var(--mist)] px-2 py-1 text-xs text-[var(--stone)] active:cursor-grabbing"
                      title="拖动排序"
                      aria-label="拖动排序"
                    >
                      ⋮⋮
                    </span>
                  )}
                  {isHotelStop ? (
                    <span
                      className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--copper)] text-white"
                      title="酒店"
                      aria-label="酒店"
                    >
                      <HouseIcon />
                    </span>
                  ) : isAirportStop ? (
                    <span
                      className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--copper)] text-white"
                      title="机场"
                      aria-label="机场"
                    >
                      <PlaneIcon />
                    </span>
                  ) : (
                    <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--sage)] text-xs font-semibold text-white">
                      {n}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => onSelectPlace(place.id)}
                    className="flex min-w-0 flex-1 items-start gap-3 text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-[var(--mist)] px-2 py-0.5 text-xs text-[var(--stone)]">
                          {stop.time}
                        </span>
                        <span className="text-xs text-[var(--stone)]">
                          {typeLabel[place.type] || place.type}
                        </span>
                      </div>
                      <p className="mt-1 font-medium">{place.name}</p>
                      <p className="mt-1 text-sm text-[var(--stone)]">{stop.note}</p>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--stone)]">
                        {stop.walkLevel && (
                          <span className="rounded-full bg-[var(--mist)] px-2 py-1">
                            {stop.walkLevel}
                          </span>
                        )}
                        {stop.duration && (
                          <span className="rounded-full bg-[var(--mist)] px-2 py-1">
                            {stop.duration}
                          </span>
                        )}
                      </div>
                    </div>
                    <GooglePlacePhoto
                      name={place.name}
                      nameLocal={place.nameLocal}
                      location={place.location}
                      fallback={place.image}
                      alt={place.name}
                      className="h-16 w-16 shrink-0 rounded-xl"
                      showBadge={false}
                    />
                  </button>
                  {isFixedHotel ? (
                    // Keep the same width as the delete button so thumbnails stay aligned.
                    <span className="mt-0.5 inline-flex h-8 w-8 shrink-0" aria-hidden />
                  ) : readOnly ? (
                    <span className="mt-0.5 inline-flex h-8 w-8 shrink-0" aria-hidden />
                  ) : (
                    <button
                      type="button"
                      title="删除地点"
                      aria-label="删除地点"
                      onClick={() => onDelete(stopKey)}
                      className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--stone)] hover:bg-red-50 hover:text-red-700"
                    >
                      <TrashIcon />
                    </button>
                  )}
                </div>
              </div>

              {index < day.stops.length - 1 && (
                <LegConnector
                  leg={legToNext}
                  calculating={navLoading && !legToNext}
                  fallbackLabel={
                    navLoading
                      ? '计算前往方式…'
                      : stop.transport || '查看地图导航'
                  }
                />
              )}
            </li>
          )
        })}
      </ol>

      {!day.stops.length && (
        <p className="rounded-2xl border border-dashed border-[var(--stone)]/30 px-4 py-6 text-center text-sm text-[var(--stone)]">
          {readOnly ? '本日还没有地点。' : '本日还没有地点，点击下方添加。'}
        </p>
      )}

      {!readOnly && (
        <>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="w-full rounded-2xl border border-dashed border-[var(--sage)]/50 bg-[var(--sage)]/5 px-4 py-3 text-sm font-medium text-[var(--sage)] hover:bg-[var(--sage)]/10"
          >
            + 添加地点
          </button>

          <AddPlaceDialog
            open={addOpen}
            dayNumber={day.day}
            dayTitle={day.title}
            dayPace={day.pace}
            dayTheme={day.theme}
            hotelArea={hotel.areaKey}
            currentPlaceNames={day.stops.map((s) => {
              try {
                return getPlace(s.placeId, customPlaces).name
              } catch {
                return s.placeId
              }
            })}
            tripPlaceNames={tripPlaceNames}
            onClose={() => setAddOpen(false)}
            onAddCustom={onAddCustom}
          />
        </>
      )}
    </div>
  )
}
