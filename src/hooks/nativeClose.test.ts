import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ listen: vi.fn(), invoke: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }))
vi.mock('@tauri-apps/api/event', () => ({ listen: mocks.listen }))
import {
  cancelNativeClose,
  completeNativeClose,
  createNativeCloseHandler,
  listenForNativeClose,
} from './nativeClose'
beforeEach(() => vi.resetAllMocks())
describe('native close event bridge', () => {
  it('registers before announcing readiness and routes window and quit separately', async () => {
    const stop = vi.fn()
    mocks.listen.mockResolvedValue(stop)
    mocks.invoke.mockImplementation(async () => {
      expect(mocks.listen).toHaveBeenCalledWith('milo://request-close', expect.any(Function))
    })
    const handler = vi.fn()
    expect(await listenForNativeClose(handler)).toBe(stop)
    const receive = mocks.listen.mock.calls[0][1]
    receive({ payload: 'window' })
    receive({ payload: 'quit' })
    expect(handler.mock.calls).toEqual([['window'], ['quit']])
    await cancelNativeClose()
    await completeNativeClose('quit')
    expect(mocks.invoke.mock.calls).toEqual([
      ['close_coordinator_ready'],
      ['cancel_close'],
      ['complete_close', { kind: 'quit' }],
    ])
  })
  it('removes the event listener when readiness fails', async () => {
    const stop = vi.fn()
    mocks.listen.mockResolvedValue(stop)
    mocks.invoke.mockRejectedValue(new Error('bridge unavailable'))
    await expect(listenForNativeClose(vi.fn())).rejects.toThrow('bridge unavailable')
    expect(stop).toHaveBeenCalledOnce()
  })
})

describe('replayed native close requests', () => {
  it('coalesces replayed events without cancelling the accepted close, then permits a fresh request', async () => {
    const requestAll = vi.fn().mockReturnValue(true)
    const flush = vi.fn().mockResolvedValue(undefined)
    const coordinator = createNativeCloseHandler(requestAll, flush)
    coordinator.request('quit')
    coordinator.request('quit')
    expect(requestAll).toHaveBeenCalledOnce()
    expect(mocks.invoke).not.toHaveBeenCalled()
    await requestAll.mock.calls[0][0]()
    expect(flush).toHaveBeenCalledOnce()
    expect(mocks.invoke).toHaveBeenCalledWith('complete_close', { kind: 'quit' })
    coordinator.request('window')
    expect(requestAll).toHaveBeenCalledTimes(2)
    await coordinator.cancel()
    coordinator.request('quit')
    expect(requestAll).toHaveBeenCalledTimes(3)
  })
})
