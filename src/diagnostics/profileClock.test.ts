import { expect, it } from 'vitest'
import { selectClockSample } from './profileClock'

it('maps page monotonic marks to native entry time using the least uncertain IPC bracket', () => {
  const result = selectClockSample([
    { frontendStart: 10, frontendEnd: 20, nativeMs: 115 },
    { frontendStart: 30, frontendEnd: 32, nativeMs: 131 },
    { frontendStart: 40, frontendEnd: 46, nativeMs: 143 },
  ])
  expect(result).toEqual({
    frontendToNativeOffsetMs: 100,
    roundTripMs: 2,
    uncertaintyMs: 1,
    samples: 3,
  })
  expect(55 + result.frontendToNativeOffsetMs).toBe(155)
})
