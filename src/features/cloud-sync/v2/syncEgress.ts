export type SyncV2EgressKind = 'snapshot' | 'pull' | 'apply' | 'broadcast'

export type SyncV2EgressCounters = {
  snapshotLoads: number
  snapshotBytes: number
  pullCalls: number
  pullBytes: number
  applyCalls: number
  applyBytes: number
  broadcastMessages: number
  broadcastBytes: number
}

const emptyCounters = (): SyncV2EgressCounters => ({
  snapshotLoads: 0,
  snapshotBytes: 0,
  pullCalls: 0,
  pullBytes: 0,
  applyCalls: 0,
  applyBytes: 0,
  broadcastMessages: 0,
  broadcastBytes: 0,
})

let counters = emptyCounters()

export function estimateJsonBytes(value: unknown): number {
  if (value == null) return 0
  if (typeof value === 'string') return value.length
  try {
    return JSON.stringify(value).length
  } catch {
    return 0
  }
}

export function recordSyncV2Egress(kind: SyncV2EgressKind, payload: unknown): void {
  const bytes = estimateJsonBytes(payload)
  switch (kind) {
    case 'snapshot':
      counters.snapshotLoads += 1
      counters.snapshotBytes += bytes
      break
    case 'pull':
      counters.pullCalls += 1
      counters.pullBytes += bytes
      break
    case 'apply':
      counters.applyCalls += 1
      counters.applyBytes += bytes
      break
    case 'broadcast':
      counters.broadcastMessages += 1
      counters.broadcastBytes += bytes
      break
  }
}

export function getSyncV2Egress(): SyncV2EgressCounters {
  return { ...counters }
}

export function resetSyncV2Egress(): void {
  counters = emptyCounters()
}
