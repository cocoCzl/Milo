import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const preferenceMocks = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
}))

const editorMocks = vi.hoisted(() => ({
  hasHeadings: true,
  markdownChanges: new Map<string, (markdown: string) => void>(),
}))

import { App } from './App'

vi.mock('../editor/milkdown/MilkdownEditor', () => ({
  MilkdownEditor: ({ active = true, ariaLabel = 'Untitled Markdown document', editorId = 'standalone', initialMarkdown, onCloseOutline, onMarkdownChange, outlineLayout, outlineOpen, presentationMode = 'edit' }: { active?: boolean; ariaLabel?: string; editorId?: string; initialMarkdown: string; onCloseOutline?: () => void; onMarkdownChange?: (markdown: string) => void; outlineLayout?: 'inline' | 'drawer'; outlineOpen?: boolean; presentationMode?: string }) => {
    if (onMarkdownChange) editorMocks.markdownChanges.set(editorId, onMarkdownChange)
    return <div aria-label={ariaLabel} data-markdown={initialMarkdown} data-presentation-mode={presentationMode} role="textbox">
      {(outlineLayout === 'inline' || outlineOpen) && active ? (
        <>
          {outlineOpen && outlineLayout === 'drawer' ? <div aria-hidden="true" className="outline-backdrop" onMouseDown={onCloseOutline} /> : null}
          <nav aria-label="Outline" className={outlineLayout === 'drawer' ? 'editor-outline--drawer' : undefined} id={outlineLayout === 'inline' ? undefined : 'outline-drawer'}>
            {outlineLayout === 'drawer' ? <button type="button" aria-label="Close outline" onClick={onCloseOutline}>Close</button> : null}
            {editorMocks.hasHeadings ? <button type="button" onClick={onCloseOutline}>Example heading</button> : <p>Headings will appear here.</p>}
          </nav>
        </>
      ) : null}
    </div>
  },
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
  editorMocks.hasHeadings = true
  editorMocks.markdownChanges.clear()
  preferenceMocks.load.mockResolvedValue({ settingsVersion: 3, appearance: 'system', locale: 'system', documentZoom: 100, interfaceZoom: 120 })
  preferenceMocks.save.mockImplementation(async (settings) => settings)
})

afterEach(cleanup)

describe('App', () => {
  it('does not flash the no-document call to action while startup state is unresolved', async () => {
    let resolveSettings!: (settings: Record<string, unknown>) => void
    preferenceMocks.load.mockReturnValue(new Promise((resolve) => { resolveSettings = resolve }))
    const { container } = render(<App />)

    expect(container.querySelector('.document-area')).toHaveAttribute('aria-busy', 'true')
    expect(container.querySelector('.document-area')).toHaveClass('document-area--restoring')
    expect(container.querySelector('.document-area')).not.toHaveClass('document-area--empty')
    expect(screen.queryByRole('button', { name: 'Open document' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open folder' })).not.toBeInTheDocument()

    await act(async () => resolveSettings({
      settingsVersion: 5,
      appearance: 'system',
      locale: 'en',
      documentZoom: 100,
      interfaceZoom: 120,
      startupSession: { activeDocumentPath: null, openDocumentPaths: [] },
    }))

    await waitFor(() => expect(container.querySelector('.document-area')).toHaveAttribute('aria-busy', 'false'))
    expect(container.querySelector('.document-area')).toHaveClass('document-area--empty')
    expect(screen.getByRole('button', { name: 'Open document' })).toBeVisible()
  })

  it('starts with a true no-document surface and creates an untitled editor only on request', async () => {
    const { container } = render(<App />)

    expect(screen.getByRole('main', { name: 'Milo Markdown editor' })).toHaveStyle({ '--editor-font-size': '16.5px' })
    expect(container.querySelector('.application-bar')).toBeVisible()
    await waitFor(() => expect(container.querySelector('.document-area')).toHaveClass('document-area--empty'))
    expect(container.querySelector('.document-area')).toHaveClass('document-area--empty')
    expect(container.querySelector('.document-context')).not.toBeInTheDocument()
    expect(container.querySelector('.document-stage')).toBeVisible()
    expect(screen.queryByRole('tab', { name: 'Untitled' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Untitled Markdown document' })).not.toBeInTheDocument()
    expect(editorMocks.markdownChanges.size).toBe(0)
    expect(screen.queryByRole('button', { name: 'Save document' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Read' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'More actions' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Open outline' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open document' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Open folder' })).toBeVisible()
    const newDocument = screen.getByRole('button', { name: 'New document' })
    expect(newDocument).toBeVisible()
    expect(newDocument.closest('.application-bar__tabs')?.querySelector('.tab-strip')).toBeInTheDocument()

    fireEvent.click(newDocument)
    expect(screen.getByRole('tab', { name: 'Untitled' })).toBeVisible()
    expect(screen.getByRole('tab', { name: 'Untitled' }).querySelector('.document-tab__icon')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByRole('textbox', { name: 'Untitled Markdown document' })).toBeVisible()
    expect(container.querySelector('.document-context')).toHaveTextContent('UntitledNot saved')
    expect(container.querySelector('.document-context')).toContainElement(screen.getByRole('button', { name: 'Save document' }))
    expect(container.querySelector('.document-area > .document-stage')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Close Untitled' }))
    expect(screen.queryByRole('tab', { name: 'Untitled' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Untitled Markdown document' })).not.toBeInTheDocument()
  })

  it('moves active document identity and save state into a context row outside the scroll stage', async () => {
    preferenceMocks.load.mockResolvedValue({
      settingsVersion: 4,
      appearance: 'system',
      locale: 'en',
      documentZoom: 100,
      interfaceZoom: 120,
      currentFolder: '/notes/ajdbc',
      recentFiles: [],
      recentFolders: [],
      sidebarVisible: true,
      sidebarWidth: 240,
      startupSession: { activeDocumentPath: null, openDocumentPaths: [] },
    })
    const { container } = render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'New document' }))

    const context = container.querySelector<HTMLElement>('.document-context')!
    const stage = container.querySelector<HTMLElement>('.document-stage')!
    await waitFor(() => expect(context).toHaveTextContent('ajdbc/Untitled'))
    expect(context).toHaveTextContent('Not saved')
    expect(stage).not.toContainElement(context)
    expect(container.querySelector('.document-meta')).not.toBeInTheDocument()

    act(() => editorMocks.markdownChanges.values().next().value?.('Changed'))
    expect(context).toHaveTextContent('Unsaved changes')
    expect(context).toHaveClass('document-context--dirty')
    expect(screen.getByRole('button', { name: 'Save document' })).toBeEnabled()
  })

  it('keeps document context synchronized with the active tab', () => {
    const { container } = render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'New document' }))
    act(() => editorMocks.markdownChanges.values().next().value?.('First tab change'))
    expect(container.querySelector('.document-context')).toHaveTextContent('Unsaved changes')

    fireEvent.click(screen.getByRole('button', { name: 'New document' }))
    expect(container.querySelector('.document-context')).toHaveTextContent('Not saved')

    fireEvent.click(screen.getAllByRole('tab')[0])
    expect(container.querySelector('.document-context')).toHaveTextContent('Unsaved changes')
  })

  it('adds and switches document tabs from the application surface', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'New document' }))
    fireEvent.click(screen.getByRole('button', { name: 'New document' }))

    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(2)
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true')

    fireEvent.click(tabs[0])
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
  })

  it('binds each mounted editor callback to its own document session after a tab switch', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'New document' }))
    fireEvent.click(screen.getByRole('button', { name: 'New document' }))

    // Tab B is active.  Invoke Tab A's retained editor callback to model a
    // delayed Milkdown markdownUpdated event from the hidden editor.
    act(() => editorMocks.markdownChanges.values().next().value?.('A1'))

    const editors = screen.getAllByRole('textbox', { hidden: true })
    expect(editors[0]).toHaveAttribute('data-markdown', 'A1')
    expect(editors[1]).toHaveAttribute('data-markdown', '')
  })

  it('keeps each tab\'s document scroll position separate and clamps a restored position', () => {
    const { container } = render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'New document' }))
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
    const { container } = render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'New document' }))
    const editor = screen.getByRole('textbox', { name: 'Untitled Markdown document' })
    const originalMarkdown = editor.getAttribute('data-markdown')

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Settings…' }))
    fireEvent.click(screen.getByRole('button', { name: 'Increase interface size' }))
    fireEvent.click(screen.getByRole('button', { name: 'Increase document size' }))

    const app = container.querySelector<HTMLElement>('.app-shell')!
    expect(app).toHaveAttribute('data-appearance', 'system')
    expect(app).toHaveAttribute('data-theme', 'light')
    expect(app).toHaveAttribute('data-color-scheme', 'light')
    expect(app).toHaveAttribute('data-document-font-style', 'sans')
    expect(app).toHaveAttribute('data-reading-width', 'standard')
    expect(app).toHaveAttribute('data-line-height', 'standard')
    expect(app).toHaveStyle({ '--editor-font-size': '18.15px' })
    expect(app).toHaveStyle({ '--ui-font-lg': '16.9px' })
    expect(editor).toHaveAttribute('data-markdown', originalMarkdown)
    expect(editorMocks.markdownChanges.size).toBe(1)
    expect(container.querySelector('.document-context')).toHaveTextContent('Not saved')

    await waitFor(() => {
      expect(preferenceMocks.save).toHaveBeenLastCalledWith(expect.objectContaining({
        appearance: 'system',
        locale: 'system',
        documentZoom: 110,
        interfaceZoom: 130,
      }))
    })
    fireEvent.click(screen.getByRole('button', { name: 'Close preferences' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '偏好设置' })).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'More actions' })).toBeVisible()
  })

  it('applies persisted reading preferences as presentation-only shell attributes', async () => {
    preferenceMocks.load.mockResolvedValue({
      settingsVersion: 5,
      appearance: 'dark',
      locale: 'en',
      documentZoom: 100,
      interfaceZoom: 120,
      documentFontStyle: 'serif',
      readingWidth: 'narrow',
      lineHeight: 'relaxed',
    })
    const { container } = render(<App />)
    const app = screen.getByRole('main', { name: 'Milo Markdown editor' })
    await waitFor(() => expect(app).toHaveAttribute('data-document-font-style', 'serif'))
    fireEvent.click(screen.getByRole('button', { name: 'New document' }))

    expect(app).toHaveAttribute('data-reading-width', 'narrow')
    expect(app).toHaveAttribute('data-line-height', 'relaxed')
    expect(app).toHaveStyle({ '--editor-font-size': '16.5px' })
    expect(screen.getByRole('textbox', { name: 'Untitled Markdown document' })).toHaveAttribute('data-markdown', '')
    expect(container.querySelector('.document-context')).toHaveTextContent('Not saved')

    fireEvent.click(screen.getByRole('button', { name: 'Read' }))
    expect(screen.getByRole('textbox', { name: 'Untitled Markdown document' })).toHaveAttribute('data-presentation-mode', 'read')
    expect(app).toHaveAttribute('data-document-font-style', 'serif')
    expect(app).toHaveAttribute('data-reading-width', 'narrow')
    expect(app).toHaveAttribute('data-line-height', 'relaxed')
    expect(screen.getByRole('textbox', { name: 'Untitled Markdown document' })).toHaveAttribute('data-markdown', '')
  })

  it('persists individual removal and clearing of recent records', async () => {
    preferenceMocks.load.mockResolvedValue({
      settingsVersion: 3,
      appearance: 'system',
      locale: 'en',
      documentZoom: 100,
      interfaceZoom: 120,
      recentFiles: ['/notes/one.md'],
      recentFolders: ['/notes/archive'],
    })
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Remove one.md from recent' }))
    await waitFor(() => expect(preferenceMocks.save).toHaveBeenLastCalledWith(expect.objectContaining({
      recentFiles: [],
      recentFolders: ['/notes/archive'],
    })))
    expect(screen.queryByRole('button', { name: 'Remove one.md from recent' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    await waitFor(() => expect(preferenceMocks.save).toHaveBeenLastCalledWith(expect.objectContaining({
      recentFiles: [],
      recentFolders: [],
    })))
    expect(screen.getByRole('region', { name: 'Recent files and folders' })).toHaveTextContent('No recent items yet.')
  })

  it('handles document zoom shortcuts without changing editor content', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'New document' }))

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
    fireEvent.click(screen.getByRole('button', { name: 'New document' }))

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
    fireEvent.click(screen.getByRole('button', { name: 'New document' }))

    fireEvent.click(screen.getByRole('button', { name: 'Read' }))
    fireEvent.click(screen.getByRole('button', { name: 'Enter focus mode' }))

    expect(screen.getByRole('main', { name: 'Milo Markdown editor' })).toHaveClass('app-shell--focus-mode')
    expect(screen.getByRole('textbox', { name: 'Untitled Markdown document' })).toHaveAttribute('data-presentation-mode', 'read')
    expect(screen.getByRole('button', { name: 'Open outline' })).toBeVisible()
  })

  it('keeps the compact outline available on demand while the persistent shell is hidden in focus mode', async () => {
    const { container } = render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'New document' }))

    const outlineToggle = screen.getByRole('button', { name: 'Open outline' })
    fireEvent.click(outlineToggle)
    expect(screen.getByRole('navigation', { name: 'Outline' })).toHaveAttribute('id', 'outline-drawer')

    fireEvent.click(screen.getByRole('button', { name: 'Example heading' }))
    expect(screen.queryByRole('navigation', { name: 'Outline' })).not.toBeInTheDocument()

    fireEvent.click(outlineToggle)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('navigation', { name: 'Outline' })).not.toBeInTheDocument()
    await waitFor(() => expect(outlineToggle).toHaveFocus())

    fireEvent.click(screen.getByRole('button', { name: 'Enter focus mode' }))
    expect(container.querySelector('.outline-toggle')).not.toBeInTheDocument()
    expect(container.querySelector('.application-bar')).toBeInTheDocument()
    const focusOutlineTrigger = screen.getByRole('button', { name: 'Open outline' })
    expect(focusOutlineTrigger).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(focusOutlineTrigger)
    expect(screen.getByRole('navigation', { name: 'Outline' })).toHaveAttribute('id', 'outline-drawer')
    expect(focusOutlineTrigger).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'Example heading' }))
    expect(screen.queryByRole('navigation', { name: 'Outline' })).not.toBeInTheDocument()
    expect(screen.getByRole('main', { name: 'Milo Markdown editor' })).toHaveClass('app-shell--focus-mode')
    await waitFor(() => expect(focusOutlineTrigger).toHaveFocus())
  })

  it('keeps drawer close actions inside focus mode and gives the drawer first Escape priority', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'New document' }))
    fireEvent.click(screen.getByRole('button', { name: 'Enter focus mode' }))
    const focusOutlineTrigger = screen.getByRole('button', { name: 'Open outline' })

    fireEvent.click(focusOutlineTrigger)
    fireEvent.mouseDown(document.querySelector('.outline-backdrop')!)
    expect(screen.queryByRole('navigation', { name: 'Outline' })).not.toBeInTheDocument()
    expect(screen.getByRole('main', { name: 'Milo Markdown editor' })).toHaveClass('app-shell--focus-mode')
    await waitFor(() => expect(focusOutlineTrigger).toHaveFocus())

    fireEvent.click(focusOutlineTrigger)
    fireEvent.click(screen.getByRole('button', { name: 'Close outline' }))
    expect(screen.queryByRole('navigation', { name: 'Outline' })).not.toBeInTheDocument()
    expect(screen.getByRole('main', { name: 'Milo Markdown editor' })).toHaveClass('app-shell--focus-mode')

    fireEvent.click(focusOutlineTrigger)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.getByRole('main', { name: 'Milo Markdown editor' })).toHaveClass('app-shell--focus-mode')
    expect(screen.getByRole('button', { name: 'Open outline' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('navigation', { name: 'Outline' })).not.toBeInTheDocument()
    await waitFor(() => expect(focusOutlineTrigger).toHaveFocus())

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.getByRole('main', { name: 'Milo Markdown editor' })).not.toHaveClass('app-shell--focus-mode')
    expect(screen.queryByRole('navigation', { name: 'Outline' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open outline' })).toBeVisible()
  })

  it('opens the existing drawer from focus mode even when the normal workspace uses an inline outline', async () => {
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
      fireEvent.click(screen.getByRole('button', { name: 'New document' }))
      const stage = container.querySelector<HTMLElement>('.document-stage')!
      Object.defineProperty(stage, 'clientWidth', { configurable: true, value: 1200 })
      notify?.()
      await waitFor(() => expect(screen.getByRole('navigation', { name: 'Outline' })).not.toHaveAttribute('id'))

      fireEvent.click(screen.getByRole('button', { name: 'Enter focus mode' }))
      expect(screen.queryByRole('navigation', { name: 'Outline' })).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Open outline' }))
      expect(screen.getByRole('navigation', { name: 'Outline' })).toHaveAttribute('id', 'outline-drawer')
    } finally {
      Object.defineProperty(window, 'ResizeObserver', { configurable: true, value: OriginalResizeObserver })
    }
  })

  it('keeps the focus outline entry stable when the active document has no headings', () => {
    editorMocks.hasHeadings = false
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'New document' }))
    fireEvent.click(screen.getByRole('button', { name: 'Enter focus mode' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open outline' }))

    expect(screen.getByRole('navigation', { name: 'Outline' })).toHaveTextContent('Headings will appear here.')
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
      fireEvent.click(screen.getByRole('button', { name: 'New document' }))
      const stage = container.querySelector<HTMLElement>('.document-stage')!
      Object.defineProperty(stage, 'clientWidth', { configurable: true, value: 1200 })
      notify?.()
      await waitFor(() => {
        expect(screen.getByRole('main', { name: 'Milo Markdown editor' })).toHaveClass('app-shell--inline-outline')
        expect(container.querySelector('.outline-toggle')).not.toBeInTheDocument()
      })

      Object.defineProperty(stage, 'clientWidth', { configurable: true, value: 1000 })
      notify?.()
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Open outline' })).toBeVisible()
        expect(screen.getByRole('main', { name: 'Milo Markdown editor' })).not.toHaveClass('app-shell--inline-outline')
      })
    } finally {
      Object.defineProperty(window, 'ResizeObserver', { configurable: true, value: OriginalResizeObserver })
    }
  })

  it('closes modal preferences from its backdrop or Escape', async () => {
    render(<App />)

    const openPreferences = () => {
      fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Settings…' }))
    }
    openPreferences()
    expect(screen.getByRole('dialog', { name: 'Preferences' })).toBeVisible()

    const backdrop = document.querySelector('.preferences-dialog__backdrop')!
    fireEvent.pointerDown(backdrop, { button: 0, pointerType: 'mouse' })
    fireEvent.click(backdrop)
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Preferences' })).not.toBeInTheDocument())

    openPreferences()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Preferences' })).not.toBeInTheDocument())
  })

  it('opens the same modal preferences from the pinned sidebar footer and restores that trigger', async () => {
    render(<App />)

    const settingsTrigger = screen.getByRole('button', { name: 'Settings' })
    fireEvent.click(settingsTrigger)
    expect(screen.getByRole('dialog', { name: 'Preferences' })).toBeVisible()
    expect(screen.getByRole('dialog', { name: 'Preferences' })).toHaveAttribute('aria-modal', 'true')
    expect(screen.queryByRole('button', { name: 'Preferences' })).not.toBeInTheDocument()
    expect(document.querySelector('.application-more-menu__trigger')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close preferences' }))
    await waitFor(() => expect(settingsTrigger).toHaveFocus())
  })

  it('opens sidebar preferences above an open outline drawer without changing drawer state', async () => {
    const { container } = render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'New document' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open outline' }))
    expect(screen.getByRole('navigation', { name: 'Outline' })).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    expect(screen.getByRole('dialog', { name: 'Preferences' })).toBeVisible()
    expect(container.querySelector('.editor-outline--drawer')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Preferences' })).not.toBeInTheDocument())
    expect(screen.getByRole('navigation', { name: 'Outline' })).toBeVisible()
  })

  it('keeps an open outline drawer isolated below preferences and restores More focus without changing drawer state', async () => {
    const { container } = render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'New document' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open outline' }))
    expect(screen.getByRole('navigation', { name: 'Outline' })).toBeVisible()

    const moreTrigger = screen.getByRole('button', { name: 'More actions' })
    fireEvent.click(moreTrigger)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Settings…' }))

    expect(screen.getByRole('dialog', { name: 'Preferences' })).toBeVisible()
    expect(container.querySelector('.outline-drawer-layer')).toBeInTheDocument()
    expect(container.querySelector('.preferences-dialog-layer .dialog-overlay-layer')).toContainElement(screen.getByRole('dialog', { name: 'Preferences' }))
    expect(container.querySelector('.editor-outline--drawer')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Preferences' })).not.toBeInTheDocument())
    expect(screen.getByRole('navigation', { name: 'Outline' })).toBeVisible()
    await waitFor(() => expect(moreTrigger).toHaveFocus())

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('navigation', { name: 'Outline' })).not.toBeInTheDocument()
  })

  it('gives normal and focus-only outline controls the shared keyboard tooltip', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'New document' }))
    const outlineToggle = screen.getByRole('button', { name: 'Open outline' })

    fireEvent.focus(outlineToggle)
    await waitFor(() => expect(screen.getByRole('tooltip')).toHaveTextContent('Open outline'), { timeout: 700 })
    fireEvent.blur(outlineToggle)
    fireEvent.click(screen.getByRole('button', { name: 'Enter focus mode' }))

    const focusOutlineTrigger = screen.getByRole('button', { name: 'Open outline' })
    expect(focusOutlineTrigger).not.toHaveAttribute('title')
    fireEvent.focus(focusOutlineTrigger)
    await waitFor(() => expect(screen.getByRole('tooltip')).toHaveTextContent('Open outline'), { timeout: 700 })
  })

  it('keeps low-frequency file actions in More and enables Save As only for a document', () => {
    const { container } = render(<App />)

    expect(container.querySelector('.window-bar__actions')).not.toHaveTextContent('Open document')
    expect(container.querySelector('.window-bar__actions')).not.toHaveTextContent('Open folder')
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    expect(screen.getByRole('menuitem', { name: 'Open document…' })).toBeEnabled()
    expect(screen.getByRole('menuitem', { name: 'Open folder…' })).toBeEnabled()
    expect(screen.getByRole('menuitem', { name: 'Save As…' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    fireEvent.click(screen.getByRole('button', { name: 'New document' }))
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    expect(screen.getByRole('menuitem', { name: 'Save As…' })).toBeEnabled()
  })

  it('temporarily hides sidebar affordances at narrow widths without changing the persisted preference', async () => {
    const originalMatchMedia = window.matchMedia
    let narrow = true
    let sidebarListener: (() => void) | undefined
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn((query: string) => ({
        addEventListener: (_type: string, listener: () => void) => { if (query === '(max-width: 900px)') sidebarListener = listener },
        addListener: vi.fn(),
        dispatchEvent: vi.fn(),
        get matches() { return query === '(max-width: 900px)' ? narrow : false },
        media: query,
        onchange: null,
        removeEventListener: vi.fn(),
        removeListener: vi.fn(),
      })),
    })

    try {
      const rendered = render(<App />)
      const toggle = screen.getByRole('button', { name: 'Sidebar unavailable at this window width' })
      expect(toggle).toBeDisabled()
      expect(toggle).toHaveAttribute('aria-pressed', 'false')
      expect(screen.queryByRole('complementary', { name: 'Current folder' })).not.toBeInTheDocument()
      expect(preferenceMocks.save).not.toHaveBeenCalled()

      narrow = false
      act(() => sidebarListener?.())
      await waitFor(() => expect(screen.getByRole('complementary', { name: 'Current folder' })).toBeVisible())
      expect(screen.getByRole('button', { name: 'Hide sidebar' })).toHaveAttribute('aria-pressed', 'true')
      expect(preferenceMocks.save).not.toHaveBeenCalled()
      rendered.unmount()
    } finally {
      Object.defineProperty(window, 'matchMedia', { configurable: true, value: originalMatchMedia })
    }
  })

  it('uses Chinese copy for both the no-document surface and a real untitled document', async () => {
    preferenceMocks.load.mockResolvedValue({ appearance: 'system', locale: 'zh-CN', documentZoom: 100 })
    render(<App />)

    expect(await screen.findByRole('main', { name: 'Milo Markdown 编辑器' })).toHaveAttribute('lang', 'zh-CN')
    expect(screen.getByRole('complementary', { name: '当前文件夹' })).toHaveTextContent('打开一个文件夹，在这里浏览 Markdown 文件。')
    expect(screen.getByRole('button', { name: '选择文件夹' })).toBeVisible()
    expect(screen.queryByRole('tab', { name: '未命名' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: '未命名 Markdown 文档' })).not.toBeInTheDocument()
    expect((await screen.findByRole('button', { name: '打开文件夹' })).parentElement).toHaveTextContent('打开文件夹')

    fireEvent.click(screen.getByRole('button', { name: '新建文档' }))
    expect(screen.getByRole('tab', { name: '未命名' })).toBeVisible()
    expect(screen.getByRole('textbox', { name: '未命名 Markdown 文档' })).toBeVisible()
  })
})
