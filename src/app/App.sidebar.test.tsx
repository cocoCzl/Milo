import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
  pick: vi.fn(),
  browse: vi.fn(),
  read: vi.fn(),
}))

import { App } from './App'
import type { MarkdownTreeNode } from '../file-system/nativeMarkdownFile'

vi.mock('../settings/applicationSettings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../settings/applicationSettings')>()),
  loadApplicationSettings: mocks.load,
  saveApplicationSettings: mocks.save,
}))
vi.mock('../file-system/nativeMarkdownFile', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../file-system/nativeMarkdownFile')>()),
  pickMarkdownFolder: mocks.pick,
  browseMarkdownFolder: mocks.browse,
  recoverAndReadMarkdownFile: mocks.read,
}))
vi.mock('../editor/milkdown/MilkdownEditor', () => ({
  MilkdownEditor: ({
    ariaLabel,
    initialMarkdown,
  }: {
    ariaLabel: string
    initialMarkdown: string
  }) => (
    <div role="textbox" aria-label={ariaLabel}>
      {initialMarkdown}
    </div>
  ),
}))

const tree: MarkdownTreeNode = {
  path: '/test/notes',
  name: 'notes',
  isDirectory: true,
  children: [{ path: '/test/notes/one.md', name: 'one.md', isDirectory: false, children: [] }],
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.load.mockResolvedValue({
    locale: 'en',
    appearance: 'light',
    currentFolder: null,
    recentFiles: [],
    recentFolders: [],
    startupSession: { openDocumentPaths: [], activeDocumentPath: null },
  })
  mocks.save.mockImplementation(async (settings) => settings)
  mocks.pick.mockResolvedValue(null)
  mocks.browse.mockImplementation(async (path: string) => ({ ...tree, path }))
  mocks.read.mockImplementation(async (path: string) => ({
    path,
    markdown: '# Test document',
    hasBom: false,
    lineEnding: 'lf',
  }))
})
afterEach(cleanup)

describe('sidebar folder and recent integration', () => {
  it('chooses and replaces a folder, and preserves it when the picker is cancelled', async () => {
    render(<App />)
    const choose = await screen.findByRole('button', { name: 'Choose folder…' })
    fireEvent.click(choose)
    await waitFor(() => expect(mocks.pick).toHaveBeenCalledOnce())
    expect(mocks.save).not.toHaveBeenCalled()
    expect(choose).toBeVisible()

    mocks.pick.mockResolvedValueOnce('/test/notes')
    fireEvent.click(choose)
    await waitFor(() =>
      expect(
        within(screen.getByRole('region', { name: 'Folder' })).getByRole('button', {
          name: 'one.md',
        }),
      ).toBeVisible(),
    )
    expect(mocks.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ currentFolder: '/test/notes', recentFolders: ['/test/notes'] }),
    )
    mocks.save.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Change' }))
    await waitFor(() => expect(mocks.pick).toHaveBeenCalledTimes(3))
    expect(mocks.save).not.toHaveBeenCalled()
    expect(screen.getByRole('region', { name: 'Folder' })).toHaveTextContent('notes')

    mocks.pick.mockResolvedValueOnce('/test/archive')
    fireEvent.click(screen.getByRole('button', { name: 'Change' }))
    await waitFor(() => expect(mocks.browse).toHaveBeenLastCalledWith('/test/archive'))
    expect(mocks.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        currentFolder: '/test/archive',
        recentFolders: ['/test/archive', '/test/notes'],
      }),
    )
  })

  it('shows loading and an empty selected folder rather than the choose prompt', async () => {
    let resolveTree!: (value: MarkdownTreeNode) => void
    mocks.browse.mockReturnValueOnce(
      new Promise<MarkdownTreeNode>((resolve) => {
        resolveTree = resolve
      }),
    )
    mocks.load.mockResolvedValue({ locale: 'en', currentFolder: '/test/notes' })
    render(<App />)
    expect(await screen.findByText('Loading folder…')).toBeVisible()
    expect(screen.queryByText('Browse documents in a folder.')).not.toBeInTheDocument()
    await act(async () => resolveTree({ ...tree, children: [] }))
    expect(await screen.findByText('No Markdown files in this folder.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Change' })).toBeVisible()
  })

  it('keeps a read failure distinct from an unselected folder', async () => {
    mocks.load.mockResolvedValue({ locale: 'en', currentFolder: '/test/notes' })
    mocks.browse.mockRejectedValueOnce(new Error('Cannot read this folder.'))
    render(<App />)
    expect(await screen.findByText('Cannot read this folder.')).toBeVisible()
    expect(screen.getByRole('region', { name: 'Folder' })).toHaveTextContent(
      'Cannot read this folder.',
    )
    expect(screen.queryByText('Browse documents in a folder.')).not.toBeInTheDocument()
  })

  it('opens recent items, retains duplicates, and clearing records preserves folder, document and tabs', async () => {
    mocks.load.mockResolvedValue({
      locale: 'en',
      currentFolder: '/test/notes',
      recentFiles: ['/test/notes/one.md'],
      recentFolders: ['/test/notes', '/test/archive'],
    })
    render(<App />)
    const recent = await screen.findByRole('region', { name: 'Recent files and folders' })
    await waitFor(() =>
      expect(
        within(screen.getByRole('region', { name: 'Folder' })).getByRole('button', {
          name: 'one.md',
        }),
      ).toBeVisible(),
    )
    fireEvent.click(within(recent).getByRole('button', { name: 'one.md' }))
    expect(await screen.findByRole('tab', { name: 'one.md' })).toBeVisible()
    expect(screen.getByRole('textbox', { name: 'one.md Markdown document' })).toHaveTextContent(
      '# Test document',
    )
    fireEvent.click(within(recent).getByRole('button', { name: 'archive' }))
    await waitFor(() => expect(mocks.browse).toHaveBeenLastCalledWith('/test/archive'))
    fireEvent.click(screen.getByRole('button', { name: 'Remove notes from recent' }))
    await waitFor(() =>
      expect(mocks.save).toHaveBeenLastCalledWith(
        expect.objectContaining({
          currentFolder: '/test/archive',
          recentFiles: ['/test/notes/one.md'],
          recentFolders: ['/test/archive'],
        }),
      ),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    await waitFor(() =>
      expect(mocks.save).toHaveBeenLastCalledWith(
        expect.objectContaining({
          currentFolder: '/test/archive',
          recentFiles: [],
          recentFolders: [],
          startupSession: {
            activeDocumentPath: '/test/notes/one.md',
            openDocumentPaths: ['/test/notes/one.md'],
          },
        }),
      ),
    )
    expect(screen.getByRole('tab', { name: 'one.md' })).toBeVisible()
    expect(screen.getByRole('textbox', { name: 'one.md Markdown document' })).toHaveTextContent(
      '# Test document',
    )
    expect(mocks.read).toHaveBeenCalledOnce()
  })
})
