import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { SourceEditor } from './SourceEditor'
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})
it('leaves unchanged CRLF/front matter text untouched and publishes exact edited source', () => {
  const change = vi.fn()
  let flush: (() => boolean) | null = null
  const source = '---\r\nname: 中文\r\n---\r\n\r\n- original\r\n'
  const view = render(
    <SourceEditor
      active
      text={source}
      label="Source"
      findLabel="Find"
      onChange={change}
      onComposition={vi.fn()}
      onRegisterFlush={(fn) => {
        flush = fn
      }}
    />,
  )
  expect(flush!()).toBe(true)
  expect(change).not.toHaveBeenCalled()
  fireEvent.change(view.getByRole('textbox', { name: 'Source' }), {
    target: { value: '---\nname: edited\n---\n\n- original\n' },
  })
  expect(change).toHaveBeenLastCalledWith('---\nname: edited\n---\n\n- original\n')
})
it('withholds preedit from saves and settles only after stable final input', async () => {
  vi.useFakeTimers()
  const change = vi.fn(),
    composition = vi.fn()
  let flush: (() => boolean) | null = null
  const view = render(
    <SourceEditor
      active
      text=""
      label="Source"
      findLabel="Find"
      onChange={change}
      onComposition={composition}
      onRegisterFlush={(fn) => {
        flush = fn
      }}
    />,
  )
  const field = view.getByRole('textbox')
  fireEvent.compositionStart(field)
  fireEvent.change(field, { target: { value: 'zhong' } })
  expect(flush!()).toBe(false)
  expect(change).not.toHaveBeenCalled()
  fireEvent.compositionEnd(field)
  await act(async () => {
    vi.advanceTimersByTime(20)
  })
  fireEvent.change(field, { target: { value: '中文' } })
  expect(flush!()).toBe(false)
  await act(async () => {
    vi.advanceTimersByTime(80)
  })
  expect(change).toHaveBeenCalledExactlyOnceWith('中文')
  expect(composition).toHaveBeenLastCalledWith({ phase: 'settled', markdown: '中文' })
  expect(flush!()).toBe(true)
})
