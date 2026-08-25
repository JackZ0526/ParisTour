import { describe, expect, it } from 'vitest'
import {
  isLiquidPillChainSettled,
  isNewLiquidPillInteractionToken,
  resolveLiquidPillChainGeometry,
  resolveLiquidPillOrigin,
} from '../shared/animations/liquidPillMotion'

describe('bounded liquid pill motion', () => {
  it('keeps the material at rest when all three nodes coincide', () => {
    expect(resolveLiquidPillChainGeometry(100, 100, 100, 120, 1)).toEqual({
      scaleX: 1,
      strain: 0,
    })
  })

  it('stretches more when the head moves farther ahead of the body and tail', () => {
    const slow = resolveLiquidPillChainGeometry(110, 106, 103, 120, 1)
    const fast = resolveLiquidPillChainGeometry(130, 112, 104, 120, 1)

    expect(slow.scaleX).toBeGreaterThan(1)
    expect(fast.scaleX).toBeGreaterThan(slow.scaleX)
  })

  it('compresses when the inertial tail passes a stopped head', () => {
    const compressed = resolveLiquidPillChainGeometry(100, 103, 108, 120, 1)

    expect(compressed.strain).toBeLessThan(0)
    expect(compressed.scaleX).toBeLessThan(1)
  })

  it('mirrors the same soft-body response when moving left', () => {
    const movingRight = resolveLiquidPillChainGeometry(120, 110, 100, 120, 1)
    const movingLeft = resolveLiquidPillChainGeometry(80, 90, 100, 120, -1)

    expect(movingLeft.scaleX).toBeCloseTo(movingRight.scaleX)
  })

  it('caps extreme strain without inventing vertical deformation', () => {
    const stretched = resolveLiquidPillChainGeometry(500, 0, 0, 100, 1)
    const compressed = resolveLiquidPillChainGeometry(0, 500, 500, 100, 1)

    expect(stretched.scaleX).toBeCloseTo(1.16)
    expect(compressed.scaleX).toBeCloseTo(0.84)
  })

  it('anchors the physical leading side and preserves hard outer boundaries', () => {
    expect(resolveLiquidPillOrigin('left', 1)).toBe(0)
    expect(resolveLiquidPillOrigin('right', -1)).toBe(1)
    expect(resolveLiquidPillOrigin(null, 1)).toBe(1)
    expect(resolveLiquidPillOrigin(null, -1)).toBe(0)
    expect(resolveLiquidPillOrigin(null, 0)).toBe(0.5)
  })

  it('consumes a one-shot interaction only after position and spring velocity settle', () => {
    expect(
      isLiquidPillChainSettled({
        frameDelta: 0.01,
        head: 100,
        body: 100.04,
        tail: 100.07,
        bodyVelocity: 1.5,
        tailVelocity: -2,
      }),
    ).toBe(true)

    expect(
      isLiquidPillChainSettled({
        frameDelta: 0,
        head: 100,
        body: 100,
        tail: 100,
        bodyVelocity: 0,
        tailVelocity: 7,
      }),
    ).toBe(false)
  })

  it('does not reactivate physics without a fresh user-interaction token', () => {
    expect(isNewLiquidPillInteractionToken(0, 0)).toBe(false)
    expect(isNewLiquidPillInteractionToken(4, 4)).toBe(false)
    expect(isNewLiquidPillInteractionToken(5, 4)).toBe(true)
  })
})
