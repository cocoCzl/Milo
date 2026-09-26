import '@testing-library/jest-dom/vitest'

const emptyRect = () => new DOMRect(0, 0, 0, 0)

if (typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = () => undefined
}

if (typeof Element.prototype.hasPointerCapture !== 'function') {
  Element.prototype.hasPointerCapture = () => false
}
if (typeof Element.prototype.releasePointerCapture !== 'function') {
  Element.prototype.releasePointerCapture = () => undefined
}
if (typeof Element.prototype.setPointerCapture !== 'function') {
  Element.prototype.setPointerCapture = () => undefined
}

Object.defineProperty(Range.prototype, 'getClientRects', {
  configurable: true,
  value: () => [],
})

Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
  configurable: true,
  value: emptyRect,
})
