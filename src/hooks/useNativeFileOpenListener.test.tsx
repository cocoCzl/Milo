import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ isTauri: vi.fn(), invoke: vi.fn(), listen: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ isTauri: mocks.isTauri, invoke: mocks.invoke }))
vi.mock('@tauri-apps/api/event', () => ({ listen: mocks.listen }))
import { useNativeFileOpenListener } from './useNativeFileOpenListener'

type Request = { id: number; path: string }
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('retained native file-open queue', () => {
  let queue: Request[]
  let wake: () => void
  let stop: ReturnType<typeof vi.fn>
  beforeEach(() => {
    vi.resetAllMocks()
    queue = []
    stop = vi.fn()
    mocks.isTauri.mockReturnValue(true)
    mocks.listen.mockImplementation(async (_event, callback) => {
      wake = callback
      return stop
    })
    mocks.invoke.mockImplementation(async (command, args) => {
      if (command === 'pending_markdown_open_requests') return [...queue]
      if (command === 'acknowledge_markdown_open_request')
        queue = queue.filter((r) => r.id !== args.id)
    })
  })
  afterEach(cleanup)

  it('retains early opens until settings and session recovery are ready, then subscribes before reading', async () => {
    queue = [
      { id: 1, path: '/early.md' },
      { id: 2, path: '/second.md' },
    ]
    const open = vi.fn()
    const hook = renderHook(({ ready }) => useNativeFileOpenListener(open, ready), {
      initialProps: { ready: false },
    })
    expect(mocks.listen).not.toHaveBeenCalled()
    expect(mocks.invoke).not.toHaveBeenCalled()
    hook.rerender({ ready: true })
    await waitFor(() => expect(queue).toEqual([]))
    expect(open.mock.calls).toEqual([['/early.md'], ['/second.md']])
    expect(mocks.listen.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.invoke.mock.invocationCallOrder[0],
    )
  })

  it('drains in order, acknowledges after consumption and picks up requests arriving during a slow open', async () => {
    const first = deferred<void>()
    queue = [{ id: 1, path: '/first.md' }]
    const open = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValue(true)
    renderHook(() => useNativeFileOpenListener(open))
    await waitFor(() => expect(open).toHaveBeenCalledOnce())
    expect(queue).toHaveLength(1)
    queue.push({ id: 2, path: '/second.md' })
    act(() => {
      wake()
      wake()
    })
    expect(open).toHaveBeenCalledOnce()
    await act(async () => {
      first.resolve()
    })
    await waitFor(() => expect(queue).toEqual([]))
    expect(open.mock.calls).toEqual([['/first.md'], ['/second.md']])
    expect(
      mocks.invoke.mock.calls.filter(([cmd]) => cmd === 'acknowledge_markdown_open_request'),
    ).toEqual([
      ['acknowledge_markdown_open_request', { id: 1 }],
      ['acknowledge_markdown_open_request', { id: 2 }],
    ])
  })

  it('consumes a visible read failure and continues with other files; reopening after acknowledgement is allowed', async () => {
    queue = [
      { id: 1, path: '/missing.md' },
      { id: 2, path: '/good.md' },
    ]
    const open = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true)
    renderHook(() => useNativeFileOpenListener(open))
    await waitFor(() => expect(queue).toEqual([]))
    queue.push({ id: 3, path: '/good.md' })
    act(() => wake())
    await waitFor(() => expect(open).toHaveBeenCalledTimes(3))
    expect(open.mock.calls.map(([path]) => path)).toEqual(['/missing.md', '/good.md', '/good.md'])
  })

  it('uses the current callback, releases the listener and ignores retired wake-ups', async () => {
    const previous = vi.fn(),
      current = vi.fn()
    const hook = renderHook(({ callback }) => useNativeFileOpenListener(callback), {
      initialProps: { callback: previous },
    })
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalled())
    hook.rerender({ callback: current })
    queue.push({ id: 1, path: '/current.md' })
    act(() => wake())
    await waitFor(() => expect(queue).toEqual([]))
    expect(current).toHaveBeenCalledExactlyOnceWith('/current.md')
    expect(previous).not.toHaveBeenCalled()
    expect(mocks.listen).toHaveBeenCalledOnce()
    hook.unmount()
    queue.push({ id: 2, path: '/retired.md' })
    act(() => wake())
    expect(stop).toHaveBeenCalledOnce()
    expect(current).toHaveBeenCalledOnce()
  })

  it('does not acknowledge an open that outlives cleanup; remount can retry it', async () => {
    const pending = deferred<void>()
    queue = [{ id: 1, path: '/pending.md' }]
    const open = vi.fn(() => pending.promise)
    const hook = renderHook(() => useNativeFileOpenListener(open))
    await waitFor(() => expect(open).toHaveBeenCalledOnce())
    hook.unmount()
    await act(async () => {
      pending.resolve()
    })
    expect(queue).toHaveLength(1)
    const retry = vi.fn()
    renderHook(() => useNativeFileOpenListener(retry))
    await waitFor(() => expect(queue).toEqual([]))
    expect(retry).toHaveBeenCalledExactlyOnceWith('/pending.md')
  })

  it('cleans delayed StrictMode registrations without delivering obsolete callbacks', async () => {
    const pending = [deferred<() => void>(), deferred<() => void>()]
    const stops = [vi.fn(), vi.fn()]
    mocks.listen.mockReturnValueOnce(pending[0].promise).mockReturnValueOnce(pending[1].promise)
    queue = [{ id: 1, path: '/current.md' }]
    const open = vi.fn()
    const hook = renderHook(() => useNativeFileOpenListener(open), { wrapper: StrictMode })
    await act(async () => {
      pending[1].resolve(stops[1])
    })
    await waitFor(() => expect(queue).toEqual([]))
    hook.unmount()
    await act(async () => {
      pending[0].resolve(stops[0])
    })
    expect(open).toHaveBeenCalledExactlyOnceWith('/current.md')
    expect(stops[0]).toHaveBeenCalledOnce()
    expect(stops[1]).toHaveBeenCalledOnce()
  })

  it('reports bridge failures while leaving requests available for a later attempt', async () => {
    queue = [{ id: 1, path: '/kept.md' }]
    mocks.invoke.mockRejectedValueOnce(new Error('IPC unavailable'))
    const open = vi.fn()
    const hook = renderHook(() => useNativeFileOpenListener(open))
    await waitFor(() => expect(hook.result.current).toContain('IPC unavailable'))
    expect(open).not.toHaveBeenCalled()
    expect(queue).toHaveLength(1)
    act(() => wake())
    await waitFor(() => expect(queue).toEqual([]))
    expect(hook.result.current).toBeNull()
  })

  it('does not register outside Tauri', () => {
    mocks.isTauri.mockReturnValue(false)
    renderHook(() => useNativeFileOpenListener(vi.fn()))
    expect(mocks.listen).not.toHaveBeenCalled()
  })
})
