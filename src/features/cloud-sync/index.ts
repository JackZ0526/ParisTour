/** Public API of the cloud-sync feature. */
export { CloudSaveIndicator } from './components/CloudSaveIndicator'
export { BackupDialog } from './components/BackupDialog'
export { ShareDialog } from './components/ShareDialog'
export { TripSelectorCapsule } from './components/TripSelectorCapsule'
export {
  applyAccessibleTripLocally,
  applyRemoteTripSnapshot,
  flushTripCloudSave,
  getCloudSaveError,
  getCloudSaveStatus,
  getCloudSyncStatus,
  isRemoteQuietPeriodActive,
  scheduleTripCloudSave,
  holdTripCloudSaves,
  releaseTripCloudSaves,
  subscribeCloudSaveStatus,
  subscribeCloudSyncStatus,
  subscribeTripRealtime,
  type AccessibleTrip,
  type CloudSaveStatus,
  type CloudSyncStatus,
  type TripRole,
} from './services/tripCloud'
export {
  applyTripSnapshot,
  clearLocalTripStorage,
  collectTripSnapshot,
  emptyTripSnapshot,
  type TripSnapshot,
  TRIP_SNAPSHOT_VERSION,
} from './services/tripSnapshot'
