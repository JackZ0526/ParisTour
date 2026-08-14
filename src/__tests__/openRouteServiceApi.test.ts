import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../api/_lib/auth.js', () => ({
  requireAllowlistedUser: vi.fn(async () => ({
    ok: true,
    user: { id: 'user-1', email: 'test@example.com' },
  })),
}))

vi.mock('../../api/_lib/proxy.js', () => ({
  methodNotAllowed: vi.fn(() => new Response(null, { status: 405 })),
  readEnv: vi.fn(() => 'ors-test-key'),
}))

import { handleOpenRouteService } from '../../api/openrouteservice'

const routeFeature = {
  features: [
    {
      geometry: {
        type: 'LineString',
        coordinates: [
          [2.3, 48.87],
          [2.78, 48.87],
        ],
      },
      properties: { summary: { distance: 42_000, duration: 2_400 } },
    },
  ],
}

describe('openrouteservice proxy', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('snaps campus coordinates and retries when Directions cannot find a road', async () => {
    const upstream = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error:
              'Could not find routable point within a radius of 350.0 meters',
          }),
          { status: 404 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            locations: [
              { location: [2.3, 48.87] },
              { location: [2.779, 48.868] },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(routeFeature), { status: 200 }),
      )
    vi.stubGlobal('fetch', upstream)

    const response = await handleOpenRouteService(
      new Request('http://localhost/api/openrouteservice', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profile: 'driving-car',
          points: [
            { lat: 48.87, lng: 2.3 },
            { lat: 48.8674, lng: 2.7838 },
          ],
        }),
      }),
    )

    expect(response.status).toBe(200)
    expect(upstream).toHaveBeenCalledTimes(3)
    expect(String(upstream.mock.calls[1][0])).toContain('/v2/snap/driving-car/json')
    expect(await response.json()).toMatchObject({
      geometry: { type: 'LineString' },
      distanceMeters: 42_000,
    })
  })
})
