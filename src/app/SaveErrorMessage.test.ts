import { expect, it } from 'vitest'
import { isWritePermissionError } from '../lib/writePermissionError'
it.each([
  'Permission denied (os error 13)',
  'Operation not permitted (os error 1)',
  'Read-only file system (os error 30)',
  'NSCocoaErrorDomain Code=513',
  'NSPOSIXErrorDomain Code=13',
])('recognizes a known write permission failure: %s', (error) => {
  expect(isWritePermissionError(error)).toBe(true)
})
it.each([
  'No space left on device (os error 28)',
  'Cannot allocate memory (os error 12)',
  'Unknown write failure',
])('does not misclassify a different write failure: %s', (error) => {
  expect(isWritePermissionError(error)).toBe(false)
})
