import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const preferenceMocks = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
}))

import { App } from './App'

vi.mock('../editor/milkdown/MilkdownEditor', () => ({
  MilkdownEditor: ({ ariaLabel = 'Untitled Markdown document' }: { ariaLabel?: string }) => <div aria-label={ariaLabel} role="textbox" />,
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

  it('updates and persists global preferences without touching the document', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Preferences' }))
    fireEvent.change(screen.getByLabelText('Appearance'), { target: { value: 'dark' } })
    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'zh-CN' } })
    fireEvent.click(screen.getByRole('button', { name: '放大界面字体' }))
    fireEvent.click(screen.getByRole('button', { name: '放大正文字体' }))

    const app = screen.getByRole('main', { name: 'Milo Markdown 编辑器' })
    expect(app).toHaveAttribute('data-appearance', 'dark')
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
