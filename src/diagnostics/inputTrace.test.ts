import { afterEach, expect, it, vi } from 'vitest'

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@tauri-apps/api/core', () => ({ invoke }))
let stop: (() => void) | undefined
afterEach(() => {
  stop?.()
  stop = undefined
  document.body.replaceChildren()
  vi.unstubAllEnvs()
  vi.clearAllMocks()
  vi.resetModules()
})

it('does not install input observers in ordinary builds', async () => {
  vi.stubEnv('VITE_MILO_INPUT_TRACE', '')
  const add = vi.spyOn(window, 'addEventListener')
  const { installInputTrace } = await import('./inputTrace')
  stop = installInputTrace()
  expect(stop).toBeUndefined()
  expect(add).not.toHaveBeenCalled()
  add.mockRestore()
})

it('distinguishes unavailable composition flags and command codes without recording typed text', async () => {
  vi.stubEnv('VITE_MILO_INPUT_TRACE', '1')
  const { installInputTrace } = await import('./inputTrace')
  stop = installInputTrace()
  const field = document.body.appendChild(document.createElement('textarea'))
  field.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '私密正文' }))
  field.dispatchEvent(
    new KeyboardEvent('keydown', { bubbles: true, key: '秘', code: 'KeyM', isComposing: true }),
  )
  field.dispatchEvent(
    new KeyboardEvent('keydown', {
      bubbles: true,
      key: 's',
      code: 'KeyS',
      metaKey: true,
      isComposing: true,
    }),
  )
  window.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'I',
      code: 'KeyI',
      metaKey: true,
      altKey: true,
      shiftKey: true,
    }),
  )
  const record = invoke.mock.calls[0][1].record
  expect(record.events[0]).toMatchObject({ event: 'dom:compositionstart', composing: null })
  expect(record.events[1]).toMatchObject({ key: 'printable', commandCode: '', composing: true })
  expect(record.events[2]).toMatchObject({
    key: 's',
    commandCode: 'KeyS',
    meta: true,
    composing: true,
    defaultPrevented: false,
  })
  expect(JSON.stringify(record)).not.toContain('私密正文')
  expect(JSON.stringify(record)).not.toContain('秘')
  expect(JSON.stringify(record)).not.toContain('KeyM')
})
