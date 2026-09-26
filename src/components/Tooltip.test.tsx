import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Tooltip } from './Tooltip'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function renderTooltip() {
  return render(
    <main className="app-shell">
      <Tooltip content="Open outline">
        <button type="button">Outline</button>
      </Tooltip>
    </main>,
  )
}

describe('Tooltip', () => {
  it('shows after the shared delay for hover and removes itself on leave', () => {
    renderTooltip()
    const trigger = screen.getByRole('button', { name: 'Outline' })

    fireEvent.mouseEnter(trigger)
    act(() => vi.advanceTimersByTime(349))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    act(() => vi.advanceTimersByTime(1))
    expect(screen.getByRole('tooltip')).toHaveTextContent('Open outline')
    expect(trigger).toHaveAttribute('aria-describedby', screen.getByRole('tooltip').id)

    fireEvent.mouseLeave(trigger)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('supports keyboard focus and cleans up on blur or unmount', () => {
    const rendered = renderTooltip()
    const trigger = screen.getByRole('button', { name: 'Outline' })

    fireEvent.focus(trigger)
    act(() => vi.advanceTimersByTime(350))
    expect(screen.getByRole('tooltip')).toBeVisible()
    fireEvent.blur(trigger)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    fireEvent.focus(trigger)
    rendered.unmount()
    act(() => vi.runAllTimers())
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('keeps the floating surface inside viewport edges', () => {
    renderTooltip()
    const trigger = screen.getByRole('button', { name: 'Outline' })
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(new DOMRect(1010, 740, 24, 24))

    fireEvent.mouseEnter(trigger)
    act(() => vi.advanceTimersByTime(350))
    const tooltip = screen.getByRole('tooltip')
    vi.spyOn(tooltip, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 120, 28))
    fireEvent(window, new Event('resize'))

    expect(tooltip).toHaveStyle({ left: '896px', top: '705px' })
  })
})
