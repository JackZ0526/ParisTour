import { runtimeCopy4 } from '../../../shared/i18n/copy/flights-runtime4-4b4b69'
import { runtimeCopy } from '../../../shared/i18n/copy/flights-runtime-4b4b69'
import type { FlightLegTemplate } from '../../../types'

/**
 * Recommended autumn routing (mid-Sep to early Oct):
 * Air France nonstop AF375 YVR→CDG and return AF374 CDG→YVR (live API).
 */
export const recommendedFlights: FlightLegTemplate[] = [
  {
    id: 'outbound-af375',
    get label() { return runtimeCopy4('m09696609ca', undefined) },
    direction: 'outbound',
    airline: 'Air France',
    flightNumber: 'AF375',
    from: { code: 'YVR', get city() { return runtimeCopy4('m841fc16c97', undefined) } },
    to: { code: 'CDG', get city() { return runtimeCopy('m4d45f90234', undefined) } },
    get departLocal() { return runtimeCopy('m300ee3dee4', undefined) },
    get arriveLocal() { return runtimeCopy('m300ee3dee4', undefined) },
    get duration() { return runtimeCopy4('m80715448b2', undefined) },
    aircraft: 'Airbus A350',
    get notes() { return runtimeCopy4('ma9df2fd523', undefined) },
  },
  {
    id: 'return-af374',
    get label() { return runtimeCopy4('m0a749a7368', undefined) },
    direction: 'return',
    airline: 'Air France',
    flightNumber: 'AF374',
    from: { code: 'CDG', get city() { return runtimeCopy('m4d45f90234', undefined) } },
    to: { code: 'YVR', get city() { return runtimeCopy4('m841fc16c97', undefined) } },
    get departLocal() { return runtimeCopy('m300ee3dee4', undefined) },
    get arriveLocal() { return runtimeCopy('m300ee3dee4', undefined) },
    get duration() { return runtimeCopy4('m395a2c3bbd', undefined) },
    aircraft: 'Airbus A350',
    get notes() { return runtimeCopy4('m79d2d4c1d4', undefined) },
  },
]
