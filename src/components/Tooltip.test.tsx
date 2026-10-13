import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { StrictMode, createRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Tooltip } from './Tooltip'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function tooltipFixture(disabled = false, buttonDisabled = false) {
  return (
    <main className="app-shell">
      <Tooltip content="Open outline" disabled={disabled}>
        <button type="button" disabled={buttonDisabled}>
          Outline
        </button>
      </Tooltip>
      <div contentEditable role="textbox" aria-label="Document" />
      <button type="button">Other action</button>
    </main>
  )
}

function renderTooltip() {
  return render(tooltipFixture())
}

describe('Tooltip', async () => {
  it('does not show for a disabled trigger', async () => {
    render(
      <Tooltip content="Unavailable">
        <button disabled>Disabled</button>
      </Tooltip>,
    )
    fireEvent.mouseEnter(screen.getByRole('button'))
    await act(() => vi.advanceTimersByTime(700))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })
  it('dismisses on an outside pointerdown even when the trigger does not blur', async () => {
    renderTooltip()
    const trigger = screen.getByRole('button', { name: 'Outline' })
    act(() => trigger.focus())
    await act(() => vi.advanceTimersByTime(350))
    expect(screen.getByRole('tooltip')).toBeVisible()

    fireEvent.pointerDown(screen.getByRole('main'))
    expect(trigger).toHaveFocus()
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    expect(trigger).not.toHaveAttribute('aria-describedby')
    await act(() => vi.advanceTimersByTime(700))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('shows after the shared delay for hover and removes itself on leave', async () => {
    renderTooltip()
    const trigger = screen.getByRole('button', { name: 'Outline' })

    fireEvent.mouseEnter(trigger)
    await act(() => {
      vi.advanceTimersByTime(349)
    })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    await act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.getByRole('tooltip')).toHaveTextContent('Open outline')
    expect(trigger).toHaveAttribute('aria-describedby', screen.getByRole('tooltip').id)

    fireEvent.mouseLeave(trigger)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('supports keyboard focus and cleans up on blur or unmount', async () => {
    const rendered = renderTooltip()
    const trigger = screen.getByRole('button', { name: 'Outline' })

    fireEvent.focus(trigger)
    await act(() => {
      vi.advanceTimersByTime(350)
    })
    expect(screen.getByRole('tooltip')).toBeVisible()
    fireEvent.blur(trigger)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    fireEvent.focus(trigger)
    rendered.unmount()
    await act(() => {
      vi.runAllTimers()
    })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('keeps the floating surface inside viewport edges', async () => {
    renderTooltip()
    const trigger = screen.getByRole('button', { name: 'Outline' })
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(new DOMRect(1010, 740, 24, 24))

    fireEvent.mouseEnter(trigger)
    await act(() => {
      vi.advanceTimersByTime(350)
    })
    const tooltip = screen.getByRole('tooltip')
    vi.spyOn(tooltip, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 120, 28))
    fireEvent(window, new Event('resize'))

    expect(tooltip).toHaveStyle({ left: '896px', top: '705px' })
  })

  it('allows reading the tooltip across the trigger gap, then closes outside both surfaces', async () => {
    renderTooltip()
    const trigger = screen.getByRole('button', { name: 'Outline' })
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 100, 30, 30))
    fireEvent.mouseEnter(trigger)
    await act(() => vi.advanceTimersByTime(350))
    const tooltip = screen.getByRole('tooltip')
    vi.spyOn(tooltip, 'getBoundingClientRect').mockReturnValue(new DOMRect(80, 137, 90, 25))

    fireEvent.mouseLeave(trigger, { clientX: 115, clientY: 134 })
    await act(() => vi.advanceTimersByTime(700))
    expect(tooltip).toBeInTheDocument()
    fireEvent.mouseMove(document.body, { clientX: 115, clientY: 145 })
    expect(tooltip).toBeInTheDocument()
    fireEvent.mouseMove(document.body, { clientX: 180, clientY: 170 })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('ignores pointer focus after a trigger click but allows a fresh hover and Tab focus', async () => {
    renderTooltip()
    const trigger = screen.getByRole('button', { name: 'Outline' })
    fireEvent.mouseEnter(trigger)
    await act(() => vi.advanceTimersByTime(350))
    expect(screen.getByRole('tooltip')).toBeVisible()
    fireEvent.pointerDown(trigger)
    act(() => trigger.focus())
    fireEvent.click(trigger)
    fireEvent.mouseLeave(trigger)
    expect(trigger).toHaveFocus()
    await act(() => vi.advanceTimersByTime(700))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    fireEvent.mouseEnter(trigger)
    await act(() => vi.advanceTimersByTime(350))
    expect(screen.getByRole('tooltip')).toBeVisible()
    fireEvent.mouseLeave(trigger)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    act(() => trigger.blur())
    fireEvent.keyDown(document.body, { key: 'Tab' })
    act(() => trigger.focus())
    await act(() => vi.advanceTimersByTime(350))
    expect(screen.getByRole('tooltip')).toBeVisible()
  })

  it.each(['blank', 'document', 'button'])('closes on a click in the %s area', async (area) => {
    renderTooltip()
    const trigger = screen.getByRole('button', { name: 'Outline' })
    fireEvent.mouseEnter(trigger)
    await act(() => vi.advanceTimersByTime(350))
    const outside =
      area === 'blank'
        ? screen.getByRole('main')
        : area === 'document'
          ? screen.getByRole('textbox')
          : screen.getByRole('button', { name: 'Other action' })
    fireEvent.pointerDown(outside)
    fireEvent.click(outside)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    await act(() => vi.advanceTimersByTime(700))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it.each(['leave', 'trigger', 'outside', 'escape', 'window blur'])(
    'cancels a pending show on %s without a stale timer reopening it',
    async (action) => {
      renderTooltip()
      const trigger = screen.getByRole('button', { name: 'Outline' })
      fireEvent.mouseEnter(trigger)
      await act(() => vi.advanceTimersByTime(100))
      if (action === 'leave') fireEvent.mouseLeave(trigger)
      if (action === 'trigger') {
        fireEvent.pointerDown(trigger)
        act(() => trigger.focus())
        fireEvent.click(trigger)
      }
      if (action === 'outside') fireEvent.pointerDown(document.body)
      if (action === 'escape') fireEvent.keyDown(trigger, { key: 'Escape' })
      if (action === 'window blur') fireEvent(window, new Event('blur'))
      await act(() => vi.advanceTimersByTime(0))
      expect(vi.getTimerCount()).toBe(0)
      await act(() => vi.advanceTimersByTime(700))
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    },
  )

  it('does not reopen after Escape while focus remains, and restores on a new keyboard focus', async () => {
    renderTooltip()
    const trigger = screen.getByRole('button', { name: 'Outline' })
    act(() => trigger.focus())
    await act(() => vi.advanceTimersByTime(350))
    fireEvent.keyDown(trigger, { key: 'Escape' })
    expect(trigger).toHaveFocus()
    await act(() => vi.advanceTimersByTime(700))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    act(() => trigger.blur())
    fireEvent.keyDown(document.body, { key: 'Tab' })
    act(() => trigger.focus())
    await act(() => vi.advanceTimersByTime(350))
    expect(screen.getByRole('tooltip')).toBeVisible()
    fireEvent(window, new Event('blur'))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it.each([100, 350])('clears pending or visible state when disabled at %ims', async (elapsed) => {
    const rendered = renderTooltip()
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Outline' }))
    await act(() => vi.advanceTimersByTime(elapsed))
    rendered.rerender(tooltipFixture(true))
    expect(vi.getTimerCount()).toBe(0)
    await act(() => vi.advanceTimersByTime(700))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it.each([100, 350])(
    'clears state when the button itself becomes disabled at %ims',
    async (elapsed) => {
      const rendered = renderTooltip()
      fireEvent.mouseEnter(screen.getByRole('button', { name: 'Outline' }))
      await act(() => vi.advanceTimersByTime(elapsed))
      rendered.rerender(tooltipFixture(false, true))
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
      await act(() => vi.advanceTimersByTime(700))
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
      expect(vi.getTimerCount()).toBe(0)
    },
  )

  it('preserves trigger handlers, refs and existing aria descriptions', async () => {
    const ref = createRef<HTMLButtonElement>()
    const onClick = vi.fn()
    const onFocus = vi.fn()
    const onKeyDown = vi.fn()
    const rendered = render(
      <Tooltip content="Open outline">
        <button
          ref={ref}
          aria-describedby="existing"
          onClick={onClick}
          onFocus={onFocus}
          onKeyDown={onKeyDown}
        >
          Outline
        </button>
      </Tooltip>,
    )
    const trigger = screen.getByRole('button')
    expect(ref.current).toBe(trigger)
    expect(trigger).toHaveAttribute('aria-describedby', 'existing')
    act(() => trigger.focus())
    await act(() => vi.advanceTimersByTime(350))
    expect(trigger.getAttribute('aria-describedby')?.split(' ')).toEqual([
      'existing',
      screen.getByRole('tooltip').id,
    ])
    fireEvent.keyDown(trigger, { key: 'Escape' })
    fireEvent.click(trigger)
    expect(onFocus).toHaveBeenCalledTimes(1)
    expect(onKeyDown).toHaveBeenCalledTimes(1)
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(trigger).toHaveAttribute('aria-describedby', 'existing')
    fireEvent.mouseEnter(trigger)
    await act(() => vi.advanceTimersByTime(350))
    fireEvent.mouseLeave(trigger)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    rendered.unmount()
    expect(ref.current).toBeNull()
  })

  it('releases listeners and timers across repeated StrictMode mounting and unmounting', async () => {
    const addDocument = vi.spyOn(document, 'addEventListener')
    const removeDocument = vi.spyOn(document, 'removeEventListener')
    const addWindow = vi.spyOn(window, 'addEventListener')
    const removeWindow = vi.spyOn(window, 'removeEventListener')
    for (const elapsed of [100, 350]) {
      const rendered = render(
        <StrictMode>
          <Tooltip content="Open outline">
            <button>Outline</button>
          </Tooltip>
        </StrictMode>,
      )
      fireEvent.mouseEnter(screen.getByRole('button'))
      await act(() => vi.advanceTimersByTime(elapsed))
      rendered.unmount()
      expect(vi.getTimerCount()).toBe(0)
    }
    for (const args of addDocument.mock.calls) {
      const [type] = args
      if (['pointerdown', 'keydown', 'mousemove'].includes(type)) {
        expect(removeDocument).toHaveBeenCalledWith(...args)
      }
    }
    for (const args of addWindow.mock.calls) {
      const [type] = args
      if (['blur', 'resize', 'scroll'].includes(type)) {
        expect(removeWindow).toHaveBeenCalledWith(...args)
      }
    }
  })
})
