import { expect, it } from 'vitest'
import { directoryBrowseError } from './directoryBrowseError'
import { interfaceCopy } from '../app/interfaceCopy'
it.each(['zh-CN', 'en'] as const)(
  'explains complete rejection rather than showing a truncated/empty list: %s',
  (locale) => {
    const copy = interfaceCopy(locale).sidebar
    expect(directoryBrowseError('DIRECTORY_ENTRY_LIMIT: detail', copy)).toBe(copy.entryLimit)
    expect(directoryBrowseError(new Error('DIRECTORY_BYTE_LIMIT: detail'), copy)).toBe(
      copy.byteLimit,
    )
    expect(directoryBrowseError('DIRECTORY_SNAPSHOT_STALE: detail', copy)).toBe(copy.pageExpired)
  },
)
