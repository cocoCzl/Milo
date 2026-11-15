import { expect, it, vi } from 'vitest'
import { createInputResponseProbe } from './inputResponseProbe'
it('pairs trusted input with one model update and excludes navigation, composition and stale keys', () => {
  let time = 10
  const record = vi.fn()
  const probe = createInputResponseProbe(() => time, record)
  const key = {
    key: ' ',
    isTrusted: true,
    isComposing: false,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
  }
  probe.keydown(key)
  time = 11
  probe.beforeinput({ isTrusted: true, isComposing: false, inputType: 'insertText' })
  time = 13
  probe.modelChanged()
  probe.modelChanged()
  expect(record.mock.calls).toEqual([
    ['input-keydown-to-model', 3],
    ['input-beforeinput-insertText-to-model', 2],
  ])
  record.mockClear()
  probe.keydown(key)
  probe.reset() // keyup / blur cancels unmatched starts
  probe.modelChanged()
  probe.keydown({ ...key, key: 'ArrowDown' })
  probe.modelChanged()
  probe.keydown(key)
  probe.beforeinput({ isTrusted: true, isComposing: true, inputType: 'insertCompositionText' })
  probe.modelChanged()
  probe.beforeinput({ isTrusted: false, isComposing: false, inputType: 'insertText' })
  probe.modelChanged()
  expect(record).not.toHaveBeenCalled()
})
