import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }))

beforeEach(() => {
  vi.resetModules()
  mocks.invoke.mockReset().mockResolvedValue(undefined)
})
afterEach(() => vi.unstubAllEnvs())

describe('explicit input diagnostics', () => {
  it('does not observe or persist input in a normal build', async () => {
    vi.stubEnv('VITE_MILO_INPUT_TRACE', '0')
    const trace = await import('./inputTrace')
    expect(trace.installInputTrace()).toBeUndefined()
    trace.traceInput('test')
    await trace.flushInputTrace('test')
    expect(mocks.invoke).not.toHaveBeenCalled()
  })

  it('records input length without its text and persists the batch before quitting', async () => {
    vi.stubEnv('VITE_MILO_INPUT_TRACE', '1')
    const trace = await import('./inputTrace')
    const stop = trace.installInputTrace()
    try {
      window.dispatchEvent(new CompositionEvent('compositionend', { data: 'PRIVATE_MARKER' }))
      const { completeNativeClose } = await import('../hooks/nativeClose')
      await completeNativeClose('quit')
      expect(mocks.invoke.mock.calls.map(([name]) => name)).toEqual([
        'record_open_profile',
        'complete_close',
      ])
      const batch = mocks.invoke.mock.calls[0][1].record
      expect(batch.reason).toBe('before-close')
      expect(batch.events).toContainEqual(
        expect.objectContaining({
          event: 'dom:compositionend',
          dataLength: 14,
        }),
      )
      expect(JSON.stringify(batch)).not.toContain('PRIVATE_MARKER')
    } finally {
      stop?.()
    }
  })

  it('correlates ordered records and exposes text only for the configured disposable fixture', async () => {
    vi.stubEnv('VITE_MILO_INPUT_TRACE', '1')
    vi.stubEnv('VITE_MILO_INPUT_TRACE_PATH', '/private/tmp/milo-ime-test/代码块.md')
    const trace = await import('./inputTrace')
    expect(trace.isInputTraceDocument('/private/tmp/milo-ime-test/代码块.md')).toBe(true)
    expect(trace.isInputTraceDocument('/Users/someone/private.md')).toBe(false)
    expect(trace.scopedInputText(false, 'PRIVATE_TEXT')).toBeNull()
    const root = document.createElement('div')
    root.className = 'ProseMirror'
    let currentPath = '/private/tmp/milo-ime-test/代码块.md'
    const unregister = trace.registerInputTraceTarget(root, () => currentPath)
    expect(trace.isScopedInputTarget(root)).toBe(true)
    currentPath = '/Users/someone/private.md'
    expect(trace.isScopedInputTarget(root)).toBe(false)
    unregister()
    expect(trace.isScopedInputTarget(root)).toBe(false)
    expect(trace.scopedInputText(true, '中文')).toBe('中文')
    expect(trace.scopedInputText(true, 'x'.repeat(300))).toHaveLength(256)
    const doc = {}
    expect(trace.inputTraceVersion(doc)).toBe(trace.inputTraceVersion(doc))
    expect(trace.inputTraceVersion({})).not.toBe(trace.inputTraceVersion(doc))
    trace.setInputTraceClose('native-test-1')
    trace.traceInput('first', { documentId: 7, revision: 3, saveId: 1 })
    trace.traceInput('second', { documentId: 7, revision: 3, saveId: 1 })
    await trace.flushInputTrace('test')
    const { events } = mocks.invoke.mock.calls[0][1].record
    expect(events.map((event: { closeId: string }) => event.closeId)).toEqual([
      'native-test-1',
      'native-test-1',
    ])
    expect(events[1].sequence).toBe(events[0].sequence + 1)
    expect(events[1].unixMs).toBeGreaterThanOrEqual(events[0].unixMs)
  })

  it('does not approve or unlock a newer quit after cancellation during diagnostic flush', async () => {
    vi.stubEnv('VITE_MILO_INPUT_TRACE', '1')
    let release!: () => void
    mocks.invoke.mockImplementation((command) =>
      command === 'record_open_profile'
        ? new Promise<void>((resolve) => {
            release = resolve
          })
        : Promise.resolve(),
    )
    const { createNativeCloseHandler } = await import('../hooks/nativeClose')
    const requestAll = vi.fn().mockReturnValue(true)
    const coordinator = createNativeCloseHandler(requestAll, async () => undefined)
    coordinator.request('quit', 'native-test-1')
    const old = requestAll.mock.calls[0][0]()
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    await coordinator.cancel()
    coordinator.request('quit', 'native-test-2')
    release()
    await old
    expect(mocks.invoke).not.toHaveBeenCalledWith('complete_close', expect.anything())
    coordinator.request('quit', 'native-test-2')
    expect(requestAll).toHaveBeenCalledTimes(2)
  })
})
