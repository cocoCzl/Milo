import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BlockMenu, type BlockMenuCopy } from './BlockMenu'
import type { BlockTarget } from './blockControls'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

const copy: BlockMenuCopy = {
  addBlock: 'Add block', paragraph: 'Body text', heading1: 'Heading 1', heading2: 'Heading 2', heading3: 'Heading 3',
  heading4: 'Heading 4', heading5: 'Heading 5', heading6: 'Heading 6', moreHeadings: 'More Headings',
  blockquote: 'Quote', bulletList: 'Bulleted list', orderedList: 'Numbered list', codeBlock: 'Code block',
  table: 'Table', divider: 'Divider', deleteBlock: 'Delete block',
}
const target = { blockType: 'heading-5', rect: { left: 100, top: 100, right: 600, bottom: 128 } } as BlockTarget

describe('BlockMenu heading submenu', () => {
  it('keeps H1–H3 direct, identifies H5, and owns the pointer corridor without changing its target', () => {
    const onCommand = vi.fn()
    const onClose = vi.fn()
    const ui = render(<BlockMenu copy={copy} target={target} onCommand={onCommand} onClose={onClose} />)
    expect(ui.getByRole('menuitemradio', { name: 'Heading 1' })).toBeVisible()
    expect(ui.queryByRole('menuitemradio', { name: 'Heading 4' })).toBeNull()
    expect(ui.getByRole('menuitemradio', { name: 'Body text' })).toHaveAttribute('aria-checked', 'false')
    const trigger = ui.getByRole('menuitem', { name: 'More Headings' })
    expect(trigger).toHaveClass('block-menu__more--active')
    fireEvent.pointerEnter(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    const submenu = ui.getByRole('menu', { name: 'More Headings' })
    expect(ui.getByRole('menu', { name: 'Add block' }).contains(submenu)).toBe(true)
    expect(ui.getByRole('menuitemradio', { name: 'Heading 5' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.pointerLeave(trigger, { relatedTarget: submenu.parentElement })
    fireEvent.pointerMove(submenu.parentElement!)
    fireEvent.pointerDown(submenu.parentElement!)
    fireEvent.pointerEnter(submenu)
    fireEvent.pointerEnter(trigger)
    fireEvent.pointerMove(document.body)
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(ui.getByRole('menuitemradio', { name: 'Heading 6' }))
    expect(onCommand).toHaveBeenCalledWith('heading-6', target)
    fireEvent.pointerDown(document.body)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('navigates both levels with arrows/Enter and closes one level at a time with Escape', () => {
    const onCommand = vi.fn()
    const onClose = vi.fn()
    const ui = render(<BlockMenu copy={copy} target={target} onCommand={onCommand} onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(ui.getByRole('menuitemradio', { name: 'Body text' })).toHaveFocus()
    for (let i = 0; i < 4; i += 1) fireEvent.keyDown(window, { key: 'ArrowDown' })
    const trigger = ui.getByRole('menuitem', { name: 'More Headings' })
    expect(trigger).toHaveFocus()
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(ui.getByRole('menuitemradio', { name: 'Heading 4' })).toHaveFocus()
    fireEvent.keyDown(window, { key: 'ArrowUp' })
    expect(ui.getByRole('menuitemradio', { name: 'Heading 6' })).toHaveFocus()
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(onCommand).toHaveBeenCalledWith('heading-6', target)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(trigger).toHaveFocus()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(ui.getByRole('menuitemradio', { name: 'Heading 4' })).toHaveFocus()
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(trigger).toHaveFocus()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it.each([
    [120, 240, 800, 'right', '340px', '240px'],
    [570, 450, 800, 'left', '358px', '390px'],
    [110, 20, 340, 'left', '100px', '80px'],
  ])('places the submenu within the stage (%s, %s)', (mainLeft, triggerTop, right, side, left, top) => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains('document-stage')) return new DOMRect(92, 72, Number(right) - 84, 436)
      if (this.classList.contains('block-menu')) return new DOMRect(Number(mainLeft), 100, 220, 390)
      if (this.classList.contains('block-menu__submenu-corridor')) return new DOMRect(0, 0, 212, 110)
      if (this.getAttribute('aria-haspopup') === 'menu') return new DOMRect(Number(mainLeft), Number(triggerTop), 220, 32)
      return new DOMRect()
    })
    const ui = render(<div className="app-shell"><section className="document-stage" /><BlockMenu copy={copy} target={target} onCommand={vi.fn()} onClose={vi.fn()} /></div>)
    fireEvent.click(ui.getByRole('menuitem', { name: 'More Headings' }))
    const corridor = ui.container.querySelector('.block-menu__submenu-corridor')!
    expect(corridor).toHaveAttribute('data-side', side)
    expect(corridor).toHaveStyle({ left, top })
  })
})
