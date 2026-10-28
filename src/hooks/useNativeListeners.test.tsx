import { act, cleanup, renderHook } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useNativeCommandListener } from './useNativeCommandListener'

type Listener = (event: { payload: string }) => void
const mocks = vi.hoisted(() => ({
  isTauri: vi.fn(),
  listen: vi.fn<(event: string, callback: Listener) => Promise<() => void>>(),
}))
vi.mock('@tauri-apps/api/core', () => ({ isTauri: mocks.isTauri }))
vi.mock('@tauri-apps/api/event', () => ({ listen: mocks.listen }))

function deferred<T>() {
  let resolve: ((value: T) => void) | undefined
  let reject: ((reason: unknown) => void) | undefined
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return {
    promise,
    resolve(value: T) {
      if (!resolve) throw new Error('Missing resolver')
      resolve(value)
    },
    reject(reason: unknown) {
      if (!reject) throw new Error('Missing rejecter')
      reject(reason)
    },
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.isTauri.mockReturnValue(true)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

for (const [name, eventName, useListener] of [
  ['command', 'milo://command', useNativeCommandListener],
] as const) {
  describe(`native ${name} listener lifecycle`, () => {
    it('releases a completed subscription exactly once on unmount', async () => {
      const stop = vi.fn()
      mocks.listen.mockResolvedValue(stop)
      const hook = renderHook(() => useListener(vi.fn()))
      await act(async () => {
        await Promise.resolve()
      })
      expect(mocks.listen).toHaveBeenCalledWith(eventName, expect.any(Function))
      expect(stop).not.toHaveBeenCalled()
      hook.unmount()
      expect(stop).toHaveBeenCalledTimes(1)
    })

    it('releases registration that finishes after cleanup and ignores its callbacks', async () => {
      const pending = deferred<() => void>()
      const stop = vi.fn()
      const callback = vi.fn()
      mocks.listen.mockReturnValue(pending.promise)
      const hook = renderHook(() => useListener(callback))
      const listener = mocks.listen.mock.calls[0][1]
      hook.unmount()
      listener({ payload: 'before registration finishes' })
      expect(callback).not.toHaveBeenCalled()
      expect(stop).not.toHaveBeenCalled()
      await act(async () => {
        pending.resolve(stop)
        await pending.promise
      })
      expect(stop).toHaveBeenCalledTimes(1)
      listener({ payload: 'after registration finishes' })
      expect(callback).not.toHaveBeenCalled()
    })

    it('does not forward callbacks queued after a registered subscription is released', async () => {
      const stop = vi.fn()
      const callback = vi.fn()
      mocks.listen.mockResolvedValue(stop)
      const hook = renderHook(() => useListener(callback))
      await act(async () => {
        await Promise.resolve()
      })
      const listener = mocks.listen.mock.calls[0][1]
      listener({ payload: 'active' })
      expect(callback).toHaveBeenCalledExactlyOnceWith('active')
      hook.unmount()
      listener({ payload: 'stale' })
      expect(stop).toHaveBeenCalledTimes(1)
      expect(callback).toHaveBeenCalledTimes(1)
    })

    it('uses the latest callback without adding another native subscription', async () => {
      const stop = vi.fn()
      mocks.listen.mockResolvedValue(stop)
      const previous = vi.fn()
      const current = vi.fn()
      const hook = renderHook(({ callback }) => useListener(callback), {
        initialProps: { callback: previous },
      })
      await act(async () => {
        await Promise.resolve()
      })
      hook.rerender({ callback: current })
      mocks.listen.mock.calls[0][1]({ payload: 'current' })
      expect(current).toHaveBeenCalledExactlyOnceWith('current')
      expect(previous).not.toHaveBeenCalled()
      expect(mocks.listen).toHaveBeenCalledTimes(1)
      hook.unmount()
      expect(stop).toHaveBeenCalledTimes(1)
    })

    it.each([false, true])(
      'handles registration rejection (already cleaned up: %s)',
      async (disposeFirst) => {
        const pending = deferred<() => void>()
        mocks.listen.mockReturnValue(pending.promise)
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        const hook = renderHook(() => useListener(vi.fn()))
        if (disposeFirst) hook.unmount()
        await act(async () => {
          pending.reject(new Error('registration failed'))
          await pending.promise.catch(() => undefined)
        })
        expect(error).toHaveBeenCalledExactlyOnceWith(
          `Could not register native listener (${eventName}).`,
        )
        if (!disposeFirst) hook.unmount()
        expect(mocks.listen).toHaveBeenCalledTimes(1)
      },
    )

    it('leaves no subscription after StrictMode mount, cleanup and delayed remount registration', async () => {
      const pending = [deferred<() => void>(), deferred<() => void>()]
      const stops = [vi.fn(), vi.fn()]
      const callback = vi.fn()
      mocks.listen.mockReturnValueOnce(pending[0].promise).mockReturnValueOnce(pending[1].promise)
      const hook = renderHook(() => useListener(callback), { wrapper: StrictMode })
      expect(mocks.listen).toHaveBeenCalledTimes(2)
      await act(async () => {
        pending[1].resolve(stops[1])
        await pending[1].promise
      })
      expect(stops[1]).not.toHaveBeenCalled()
      mocks.listen.mock.calls[0][1]({ payload: 'obsolete mount' })
      mocks.listen.mock.calls[1][1]({ payload: 'current mount' })
      expect(callback).toHaveBeenCalledExactlyOnceWith('current mount')
      hook.unmount()
      await act(async () => {
        pending[0].resolve(stops[0])
        await pending[0].promise
      })
      expect(stops[0]).toHaveBeenCalledTimes(1)
      expect(stops[1]).toHaveBeenCalledTimes(1)
      for (const [, listener] of mocks.listen.mock.calls) listener({ payload: 'released' })
      expect(callback).toHaveBeenCalledTimes(1)
    })

    it('does not subscribe outside Tauri', () => {
      mocks.isTauri.mockReturnValue(false)
      renderHook(() => useListener(vi.fn()))
      expect(mocks.listen).not.toHaveBeenCalled()
    })
  })
}
