import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const preferenceMocks = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
}))

import { App } from './App'

vi.mock('../editor/milkdown/MilkdownEditor', () => ({
  MilkdownEditor: ({ active = true, ariaLabel = 'Untitled Markdown document', onCloseOutline, outlineLayout, outlineOpen, presentationMode = 'edit' }: { active?: boolean; ariaLabel?: string; onCloseOutline?: () => void; outlineLayout?: 'inline' | 'drawer'; outlineOpen?: boolean; presentationMode?: string }) => (
    <div aria-label={ariaLabel} data-presentation-mode={presentationMode} role="textbox">
      {(outlineLayout === 'inline' || outlineOpen) && active ? (
        <nav aria-label="Outline" id={outlineLayout === 'inline' ? undefined : 'outline-drawer'}>
          <button type="button" onClick={onCloseOutline}>Example heading</button>
        </nav>
      ) : null}
    </div>
  ),
}))

vi.mock('../settings/applicationSettings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../settings/applicationSettings')>()
  return {
    ...actual,
    loadApplicationSettings: preferenceMocks.load,
    saveApplicationSettings: preferenceMocks.save,
  }
})

beforeEach(() => {
  preferenceMocks.load.mockClear()
  preferenceMocks.save.mockClear()
  preferenceMocks.load.mockResolvedValue({ settingsVersion: 3, appearance: 'system', locale: 'system', documentZoom: 100, interfaceZoom: 120 })
  preferenceMocks.save.mockImplementation(async (settings) => settings)
})

afterEach(cleanup)

describe('App', () => {
  it('starts with an unsaved document surface', () => {
    render(<App />)

    expect(screen.getByRole('main', { name: 'Milo Markdown editor' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Untitled Markdown document' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'New document' })).toBeVisible()
  })

  it('adds and switches document tabs from the application surface', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'New document' }))

    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(2)
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true')

    fireEvent.click(tabs[0])
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
  })

  it('keeps each tab\'s document scroll position separate and clamps a restored position', () => {
    const { container } = render(<App />)
    const stage = container.querySelector<HTMLElement>('.document-stage')!
    let scrollTop = 0
    let scrollHeight = 2200
    Object.defineProperties(stage, {
      clientHeight: { configurable: true, get: () => 500 },
      scrollHeight: { configurable: true, get: () => scrollHeight },
      scrollTop: { configurable: true, get: () => scrollTop, set: (next: number) => { scrollTop = next } },
    })

    // Tab A is left near its chapter 13 region.
    stage.scrollTop = 1300
    fireEvent.scroll(stage)
    fireEvent.click(screen.getByRole('button', { name: 'New document' }))
    expect(stage.scrollTop).toBe(0)

    // Tab B records a different position.  Returning to A restores A rather
    // than interpreting B's shared-scroll offset in A's document.
    stage.scrollTop = 900
    fireEvent.scroll(stage)
    const [firstTab, secondTab] = screen.getAllByRole('tab')
    fireEvent.click(firstTab)
    expect(stage.scrollTop).toBe(1300)
    fireEvent.click(secondTab)
    expect(stage.scrollTop).toBe(900)

    // A changed/shorter document cannot restore beyond its available range.
    scrollHeight = 600
    fireEvent.click(firstTab)
    expect(stage.scrollTop).toBe(100)
  })

  it('updates and persists global preferences without touching the document', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Preferences' }))
    fireEvent.change(screen.getByLabelText('Appearance'), { target: { value: 'dark' } })
    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'zh-CN' } })
    fireEvent.click(screen.getByRole('button', { name: '放大界面字体' }))
    fireEvent.click(screen.getByRole('button', { name: '放大正文字体' }))

    const app = screen.getByRole('main', { name: 'Milo Markdown 编辑器' })
    expect(app).toHaveAttribute('data-appearance', 'dark')
    expect(app).toHaveAttribute('data-theme', 'dark')
    expect(app).toHaveAttribute('data-color-scheme', 'dark')
    expect(app).toHaveStyle({ '--editor-font-size': '17.6px' })
    expect(app).toHaveStyle({ '--ui-font-lg': '16.9px' })

    await waitFor(() => {
      expect(preferenceMocks.save).toHaveBeenLastCalledWith(expect.objectContaining({
        appearance: 'dark',
        locale: 'zh-CN',
        documentZoom: 110,
        interfaceZoom: 130,
      }))
    })
    expect(screen.getByRole('button', { name: '偏好设置' })).toBeVisible()
  })

  it('handles document zoom shortcuts without changing editor content', async () => {
    render(<App />)

    fireEvent.keyDown(window, { key: '+', metaKey: true })
    await waitFor(() => expect(preferenceMocks.save).toHaveBeenLastCalledWith(expect.objectContaining({ documentZoom: 110 })))
    fireEvent.keyDown(window, { key: '0', metaKey: true })
    await waitFor(() => expect(preferenceMocks.save).toHaveBeenLastCalledWith(expect.objectContaining({ documentZoom: 100 })))
    expect(screen.getByRole('textbox', { name: 'Untitled Markdown document' })).toBeEmptyDOMElement()
  })

  it('enters a distraction-free focus mode and exits with Escape', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Enter focus mode' }))
    expect(screen.getByRole('main', { name: 'Milo Markdown editor' })).toHaveClass('app-shell--focus-mode')

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.getByRole('main', { name: 'Milo Markdown editor' })).not.toHaveClass('app-shell--focus-mode')
  })

  it('defaults each document tab to edit and keeps presentation mode per tab', () => {
    render(<App />)

    const firstEditor = screen.getByRole('textbox', { name: 'Untitled Markdown document' })
    expect(firstEditor).toHaveAttribute('data-presentation-mode', 'edit')

    fireEvent.click(screen.getByRole('button', { name: 'Read' }))
    expect(firstEditor).toHaveAttribute('data-presentation-mode', 'read')

    fireEvent.click(screen.getByRole('button', { name: 'New document' }))
    const editors = screen.getAllByRole('textbox', { hidden: true })
    expect(editors[1]).toHaveAttribute('data-presentation-mode', 'edit')

    fireEvent.click(screen.getAllByRole('tab')[0])
    expect(firstEditor).toHaveAttribute('data-presentation-mode', 'read')
  })

  it('keeps read mode independent from focus mode', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Read' }))
    fireEvent.click(screen.getByRole('button', { name: 'Enter focus mode' }))

    expect(screen.getByRole('main', { name: 'Milo Markdown editor' })).toHaveClass('app-shell--focus-mode')
    expect(screen.getByRole('textbox', { name: 'Untitled Markdown document' })).toHaveAttribute('data-presentation-mode', 'read')
  })

  it('keeps the compact outline available, closes its drawer from every expected action, and hides it in focus mode', async () => {
    render(<App />)

    const outlineToggle = screen.getByRole('button', { name: 'Outline' })
    fireEvent.click(outlineToggle)
    expect(screen.getByRole('navigation', { name: 'Outline' })).toHaveAttribute('id', 'outline-drawer')

    fireEvent.click(screen.getByRole('button', { name: 'Example heading' }))
    expect(screen.queryByRole('navigation', { name: 'Outline' })).not.toBeInTheDocument()

    fireEvent.click(outlineToggle)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('navigation', { name: 'Outline' })).not.toBeInTheDocument()
    await waitFor(() => expect(outlineToggle).toHaveFocus())

    fireEvent.click(screen.getByRole('button', { name: 'Enter focus mode' }))
    expect(screen.queryByRole('button', { name: 'Outline' })).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Outline' })).not.toBeInTheDocument()
  })

  it('switches between inline and drawer navigation from the actual document workspace width', async () => {
    let notify: (() => void) | undefined
    const OriginalResizeObserver = window.ResizeObserver
    class ResizeObserverMock {
      constructor(callback: () => void) { notify = callback }
      disconnect() {}
      observe() {}
      unobserve() {}
    }
    Object.defineProperty(window, 'ResizeObserver', { configurable: true, value: ResizeObserverMock })

    try {
      const { container } = render(<App />)
      const stage = container.querySelector<HTMLElement>('.document-stage')!
      Object.defineProperty(stage, 'clientWidth', { configurable: true, value: 1200 })
      notify?.()
      await waitFor(() => {
        expect(screen.getByRole('main', { name: 'Milo Markdown editor' })).toHaveClass('app-shell--inline-outline')
        expect(screen.queryByRole('button', { name: 'Outline' })).not.toBeInTheDocument()
      })

      Object.defineProperty(stage, 'clientWidth', { configurable: true, value: 1000 })
      notify?.()
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Outline' })).toBeVisible()
        expect(screen.getByRole('main', { name: 'Milo Markdown editor' })).not.toHaveClass('app-shell--inline-outline')
      })
    } finally {
      Object.defineProperty(window, 'ResizeObserver', { configurable: true, value: OriginalResizeObserver })
    }
  })

  it('closes preferences when pressing outside or Escape', () => {
    render(<App />)

    const preferences = screen.getByRole('button', { name: 'Preferences' })
    fireEvent.click(preferences)
    expect(screen.getByRole('dialog', { name: 'Preferences' })).toBeVisible()

    fireEvent.pointerDown(screen.getByRole('region', { name: 'Current document' }))
    expect(screen.queryByRole('dialog', { name: 'Preferences' })).not.toBeInTheDocument()

    fireEvent.click(preferences)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Preferences' })).not.toBeInTheDocument()
  })

  it('uses Chinese copy throughout the empty document surface', async () => {
    preferenceMocks.load.mockResolvedValue({ appearance: 'system', locale: 'zh-CN', documentZoom: 100 })
    render(<App />)

    expect(await screen.findByRole('main', { name: 'Milo Markdown 编辑器' })).toHaveAttribute('lang', 'zh-CN')
    expect(screen.getByRole('complementary', { name: '当前文件夹' })).toHaveTextContent('打开一个文件夹，在这里浏览 Markdown 文件。')
    expect(screen.getByRole('button', { name: '选择文件夹' })).toBeVisible()
    expect(screen.getByRole('tab', { name: '未命名' })).toBeVisible()
    expect(screen.getByRole('textbox', { name: '未命名 Markdown 文档' })).toBeVisible()
    expect(screen.getByRole('button', { name: '打开文件夹' }).parentElement).toHaveTextContent('打开文件夹')
  })
})
