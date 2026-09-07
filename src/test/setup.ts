import '@testing-library/jest-dom/vitest'

const emptyRect = () => new DOMRect(0, 0, 0, 0)

Object.defineProperty(Range.prototype, 'getClientRects', {
  configurable: true,
  value: () => [],
})

Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
  configurable: true,
  value: emptyRect,
})
