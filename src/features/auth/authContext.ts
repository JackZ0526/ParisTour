import { createContext, useContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import type {
  AccessibleTrip,
  TripRole,
} from '../cloud-sync/services/tripCloud'

export type AuthStatus =
  | 'loading'
  | 'unconfigured'
  | 'signed_out'
  | 'not_allowlisted'
  | 'ready'

export type AuthContextValue = {
  status: AuthStatus
  session: Session | null
  user: User | null
  email: string
  allowlisted: boolean
  trips: AccessibleTrip[]
  activeTrip: AccessibleTrip | null
  role: TripRole | null
  canEdit: boolean
  tripReady: boolean
  error: string | null
  signIn: (email: string, password: string) => Promise<void>
  /** Resolves with whether the user must confirm email before signing in. */
  signUp: (
    email: string,
    password: string,
  ) => Promise<{ needsEmailConfirm: boolean }>
  signOut: () => Promise<void>
  switchTrip: (tripId: string) => Promise<void>
  refreshTrips: () => Promise<void>
  notifyTripChanged: (opts?: {
    force?: boolean
    artifactsOnly?: boolean
    allowEmptyTrip?: boolean
  }) => void
  /**
   * Increments on live remote apply. App soft-reloads trip data without remounting
   * (so the user keeps the day / selection they were viewing).
   */
  tripSyncEpoch: number
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
