import { describe, expect, it, vi } from 'vitest'
import { activeHeadingFromScroll } from './headingNavigation'

it('uses logarithmic live geometry reads and accounts for changed layout', () => {
  const headings = Array.from({ length: 4096 }, (_, i) => ({
    id: String(i),
    key: String(i),
    level: 2,
    text: String(i),
    pos: i,
  }))
  const stage = document.createElement('section')
  Object.defineProperties(stage, { scrollHeight: { value: 500_000 }, clientHeight: { value: 800 } })
  stage.getBoundingClientRect = () => ({ top: 0, bottom: 800 }) as DOMRect
  let offset = 100_000
  const measure = vi.fn(
    (pos: number) =>
      ({
        getBoundingClientRect: () => ({ top: pos * 100 - offset, bottom: pos * 100 - offset + 20 }),
      }) as HTMLElement,
  )
  expect(activeHeadingFromScroll(headings, measure, stage)).toBe(1000)
  expect(measure.mock.calls.length).toBeLessThanOrEqual(13)
  offset = 200_000 // Simulate changed zoom/layout with no stale position cache.
  expect(activeHeadingFromScroll(headings, measure, stage)).toBe(2000)
})

describe('scroll navigation', () => {
  it('retains bottom tolerance and handles no headings', () => {
    const stage = document.createElement('section')
    stage.getBoundingClientRect = () => ({ top: 0, bottom: 800 }) as DOMRect
    const headings = [{ id: 'last', key: 'last', level: 2, text: '最后', pos: 10 }]
    expect(activeHeadingFromScroll([], () => null, stage)).toBeNull()
    expect(
      activeHeadingFromScroll(
        headings,
        () => ({ getBoundingClientRect: () => ({ top: 700, bottom: 740 }) }) as HTMLElement,
        stage,
      ),
    ).toBe(10)
  })
})
