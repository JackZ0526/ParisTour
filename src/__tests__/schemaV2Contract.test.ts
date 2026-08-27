import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ensureStopId } from '../appHelpers'

const schema = readFileSync(resolve(process.cwd(), 'supabase/schema.sql'), 'utf8')
const v2 = schema.slice(schema.indexOf('Sync protocol V2'))

describe('sync V2 schema contract', () => {
  it('defines the apply/pull/snapshot/compact RPCs with safe grants', () => {
    expect(v2).toContain('create or replace function public.apply_trip_mutations_v2(')
    expect(v2).toContain('create or replace function public.pull_trip_changes_v2(')
    expect(v2).toContain('create or replace function public.load_trip_snapshot_v2(')
    expect(v2).toContain('create or replace function public.compact_trip_mutations_v2(')
    expect(v2).toContain('grant execute on function public.apply_trip_mutations_v2')
    expect(v2).toContain('grant execute on function public.pull_trip_changes_v2')
    expect(v2).toContain('grant execute on function public.load_trip_snapshot_v2')
    expect(v2).toContain('revoke execute on function public.compact_trip_mutations_v2(uuid, integer, integer)')
    expect(v2).toMatch(/revoke execute on function public\.compact_trip_mutations_v2\([\s\S]*?from public, anon, authenticated/)
    expect(v2).toContain('security definer')
    expect(v2).toContain('set search_path = public')
  })

  it('keeps bootstrap stop ids aligned with ensureStopId', () => {
    expect(v2).toContain("'d' || day_key || '-' || coalesce(nullif(stop_value ->> 'placeId', ''), 'unknown')")
    expect(v2).toContain("'d' || p_day_number::text || '-'")
    // Without the day stop list, minting still uses the legacy index suffix.
    expect(ensureStopId(2, { placeId: 'louvre', time: '09:00', note: '' }, 4)).toBe('d2-louvre-4')
    const dayStops = [
      { placeId: 'a', time: '09:00', note: '' },
      { placeId: 'louvre', time: '10:00', note: '' },
      { placeId: 'louvre', time: '11:00', note: '' },
    ]
    expect(ensureStopId(2, dayStops[1], 1, dayStops)).toBe('d2-louvre-occ0')
    expect(ensureStopId(2, dayStops[2], 2, dayStops)).toBe('d2-louvre-occ1')
  })

  it('resolves stop.delete by unique placeId when stop ids drifted', () => {
    expect(v2).toContain("elsif v_mutation_type = 'stop.delete' then")
    expect(v2).toContain("v_mutation_payload ->> 'placeId'")
    expect(v2).toContain('v_match_count = 1')
  })

  it('resolves add/move anchors through occ ids instead of rejecting', () => {
    expect(v2).toContain('create or replace function public.resolve_trip_stop_id_v2(')
    expect(v2).toContain("'-.+-occ[0-9]+$'")
    expect(v2).toContain('Inverted peer order: keep the after-anchor so add still lands.')
  })

  it('bootstraps custom places from trips.snapshot.itinerary.customPlaces', () => {
    expect(v2).toContain("select t.snapshot #> '{itinerary,customPlaces}'")
  })

  it('does not silently ack a colliding stop.add from a different entity', () => {
    expect(v2).toContain("'code', 'version_conflict'")
    expect(v2).toContain("coalesce(stop ->> 'placeId', '')")
    expect(v2).toContain("coalesce(v_mutation_payload #>> '{stop,placeId}', '')")
  })

  it('rejects empty delete entity ids and acks duplicate mutation ids without a new revision', () => {
    expect(v2).toContain("elsif v_mutation_type = 'stop.delete' then")
    expect(v2).toContain("coalesce(v_entity_id, '') = ''")
    expect(v2).toContain('where m.trip_id = p_trip_id and m.mutation_id = v_mutation_id')
    expect(v2).toContain('v_acknowledged := v_acknowledged || to_jsonb(v_mutation_id)')
    expect(v2).toContain('v_current_revision := v_current_revision + 1')
  })

  it('supports transactional day.replace and itinerary.replace', () => {
    expect(v2).toContain("elsif v_mutation_type = 'day.replace' then")
    expect(v2).toContain("elsif v_mutation_type = 'itinerary.replace' then")
    expect(v2).toContain('replace_itinerary_day_document_v2')
    expect(v2).toContain('replace_itinerary_document_v2')
    // PL/pgSQL variable must not shadow itinerary_*_v2.day_number columns.
    expect(v2).toContain('v_day_number integer')
    expect(v2).toContain('not (s.day_number = any (keep_days))')
    expect(v2).toContain('not (d.day_number = any (keep_days))')
  })

  it('uses current realtime.send(payload, event, topic, private) and a private broadcast policy', () => {
    expect(v2).toContain('perform realtime.send(')
    expect(v2).toContain("'trip:' || new.trip_id::text || ':mutations'")
    expect(v2).toContain("'tripId', new.trip_id::text")
    expect(v2).toContain('realtime.messages.extension = \'broadcast\'')
    expect(v2).toContain('realtime.topic()')
  })

  it('only compacts mutations at or before snapshot_revision outside the retention window', () => {
    expect(v2).toContain('and revision <= v_snapshot_revision')
    expect(v2).toContain('and committed_at < v_cutoff_time')
    expect(v2).toContain('and revision <= v_cutoff_revision')
    expect(v2).toContain('p_retain_days integer default 14')
    expect(v2).toContain('p_retain_count integer default 4000')
  })

  it('short-circuits artifact pulls when the client already has the revision', () => {
    expect(schema).toContain('p_known_rev integer default null')
    expect(schema).toContain('p_known_rev is not distinct from coalesce(current_rev, 0)')
  })
})
