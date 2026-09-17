import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { EditorOutline } from './EditorOutline'

describe('EditorOutline', () => {
  it('keeps an active heading visible by scrolling only the outline body', () => {
    const scrollTo = vi.fn()
    const { container, rerender } = render(
      <EditorOutline
        activePosition={1}
        closeLabel="Close outline"
        drawer={false}
        emptyLabel="Empty"
        headings={[{ id: 'first', key: 'first', level: 1, pos: 1, text: 'First' }, { id: 'second', key: 'second', level: 2, pos: 8, text: 'Second' }]}
        label="Outline"
        onSelect={() => undefined}
      />,
    )
    const outline = container.querySelector<HTMLElement>('.editor-outline__body')!
    const second = container.querySelectorAll<HTMLElement>('.editor-outline__item')[1]
    Object.defineProperty(outline, 'getBoundingClientRect', { configurable: true, value: () => new DOMRect(0, 0, 240, 120) })
    Object.defineProperty(outline, 'scrollTop', { configurable: true, value: 0 })
    Object.defineProperty(outline, 'scrollTo', { configurable: true, value: scrollTo })
    Object.defineProperty(second, 'getBoundingClientRect', { configurable: true, value: () => new DOMRect(0, 150, 200, 32) })

    rerender(
      <EditorOutline
        activePosition={8}
        closeLabel="Close outline"
        drawer={false}
        emptyLabel="Empty"
        headings={[{ id: 'first', key: 'first', level: 1, pos: 1, text: 'First' }, { id: 'second', key: 'second', level: 2, pos: 8, text: 'Second' }]}
        label="Outline"
        onSelect={() => undefined}
      />,
    )

    expect(scrollTo).toHaveBeenCalledWith({ behavior: 'auto', top: 62 })
  })

  it('uses a fixed header and a separate scroll body in drawer mode', () => {
    const { container, getByRole } = render(
      <EditorOutline
        activePosition={1}
        closeLabel="Close outline"
        drawer
        emptyLabel="Empty"
        headings={[{ id: 'first', key: 'first', level: 1, pos: 1, text: 'First' }]}
        label="Outline"
        onClose={() => undefined}
        onSelect={() => undefined}
      />,
    )

    expect(container.querySelector('.editor-outline--drawer > .editor-outline__header')).toBeInTheDocument()
    expect(container.querySelector('.editor-outline--drawer > .editor-outline__body')).toBeInTheDocument()
    expect(getByRole('button', { name: 'Close outline' })).toBeVisible()
  })

  it('returns the selected heading identity instead of a visible array index', () => {
    const onSelect = vi.fn()
    const heading = { id: 'heading-418', key: 'heading-418', level: 2, pos: 418, text: '20. Final chapter' }
    const { getByRole } = render(
      <EditorOutline
        activePosition={null}
        closeLabel="Close outline"
        drawer={false}
        emptyLabel="Empty"
        headings={[{ id: 'heading-0', key: 'heading-0', level: 2, pos: 0, text: '1. First chapter' }, heading]}
        label="Outline"
        onSelect={onSelect}
      />,
    )

    const target = getByRole('button', { name: '20. Final chapter' })
    expect(target).toHaveAttribute('data-heading-id', 'heading-418')
    expect(target).toHaveAttribute('data-heading-pos', '418')
    expect(target).toHaveAttribute('data-heading-key', 'heading-418')
    target.click()
    expect(onSelect).toHaveBeenCalledWith(heading)
  })
})
