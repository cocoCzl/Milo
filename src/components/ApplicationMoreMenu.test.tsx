import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApplicationMoreMenu } from './ApplicationMoreMenu'

afterEach(cleanup)

const labels = {
  more: 'More actions',
  open: 'Open…',
  openFolder: 'Open Folder…',
  saveAs: 'Save As…',
  settings: 'Settings…',
}

const shortcuts = { open: '⌘O', openFolder: '⇧⌘O', saveAs: '⇧⌘S' }

function renderMenu(options: { dismissed?: boolean; saveAsDisabled?: boolean } = {}) {
  const actions = {
    onOpen: vi.fn(),
    onOpenFolder: vi.fn(),
    onOpenSettings: vi.fn(),
    onSaveAs: vi.fn(),
  }
  const rendered = render(
    <ApplicationMoreMenu
      {...actions}
      dismissed={options.dismissed}
      labels={labels}
      saveAsDisabled={options.saveAsDisabled}
      shortcuts={shortcuts}
    />,
  )
  return { ...rendered, actions }
}

describe('ApplicationMoreMenu', () => {
  it('runs each supplied application action and keeps shortcut text presentational', () => {
    const { actions } = renderMenu()
    const trigger = screen.getByRole('button', { name: 'More actions' })

    for (const [label, action] of [
      ['Open…', actions.onOpen],
      ['Open Folder…', actions.onOpenFolder],
      ['Save As…', actions.onSaveAs],
      ['Settings…', actions.onOpenSettings],
    ] as const) {
      fireEvent.click(trigger)
      const item = screen.getByRole('menuitem', { name: label })
      fireEvent.click(item)
      expect(action).toHaveBeenCalledTimes(1)
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    }

    fireEvent.click(trigger)
    expect(screen.getByText('⌘O')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByRole('menuitem', { name: 'Open…' })).toHaveAccessibleName('Open…')
  })

  it('supports trigger and menu keyboard navigation while skipping disabled actions', async () => {
    renderMenu({ saveAsDisabled: true })
    const trigger = screen.getByRole('button', { name: 'More actions' })
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Open…' })).toHaveFocus())
    expect(screen.getByRole('menuitem', { name: 'Save As…' })).toBeDisabled()

    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' })
    expect(screen.getByRole('menuitem', { name: 'Open Folder…' })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'End' })
    expect(screen.getByRole('menuitem', { name: 'Settings…' })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Home' })
    expect(screen.getByRole('menuitem', { name: 'Open…' })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowUp' })
    expect(screen.getByRole('menuitem', { name: 'Settings…' })).toHaveFocus()
  })

  it('closes on Escape or outside press and restores trigger focus only for Escape', async () => {
    renderMenu()
    const trigger = screen.getByRole('button', { name: 'More actions' })
    fireEvent.click(trigger)
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    await waitFor(() => expect(trigger).toHaveFocus())
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    fireEvent.click(trigger)
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('dismisses an open menu when the application enters focus mode', () => {
    const { rerender } = renderMenu()
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    expect(screen.getByRole('menu')).toBeVisible()

    rerender(
      <ApplicationMoreMenu
        dismissed
        labels={labels}
        onOpen={vi.fn()}
        onOpenFolder={vi.fn()}
        onOpenSettings={vi.fn()}
        onSaveAs={vi.fn()}
        shortcuts={shortcuts}
      />,
    )
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
