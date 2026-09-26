import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PreferencesDialog } from './PreferencesDialog'

afterEach(cleanup)

const copy = {
  appearance: 'Appearance',
  appearanceSection: 'Appearance',
  close: 'Close preferences',
  dark: 'Dark',
  decreaseDocumentSize: 'Decrease document size',
  decreaseInterfaceSize: 'Decrease interface size',
  displaySection: 'Display',
  documentSize: 'Document size',
  increaseDocumentSize: 'Increase document size',
  increaseInterfaceSize: 'Increase interface size',
  interfaceSize: 'Interface size',
  language: 'Language',
  light: 'Light',
  system: 'System',
  title: 'Preferences',
  warm: 'Warm',
}

function renderDialog(onOpenChange = vi.fn()) {
  const returnFocus = document.createElement('button')
  returnFocus.textContent = 'Settings'
  document.body.append(returnFocus)
  const returnFocusRef = { current: returnFocus }
  const actions = {
    onAppearanceChange: vi.fn(),
    onDocumentZoomChange: vi.fn(),
    onInterfaceZoomChange: vi.fn(),
    onLocaleChange: vi.fn(),
  }
  const rendered = render(
    <PreferencesDialog
      {...actions}
      appearance="system"
      copy={copy}
      documentZoom={100}
      error={null}
      interfaceZoom={120}
      locale="system"
      onOpenChange={onOpenChange}
      open
      portalContainer={null}
      returnFocusRef={returnFocusRef}
      theme="light"
    />,
  )
  return { ...rendered, actions, onOpenChange, returnFocus }
}

describe('PreferencesDialog', () => {
  it('renders one modal preferences surface with grouped real settings', async () => {
    const { actions } = renderDialog()
    const dialog = screen.getByRole('dialog', { name: 'Preferences' })

    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(document.body.querySelector('.dialog-overlay-layer')).toContainElement(dialog)
    expect(screen.getByRole('heading', { level: 3, name: 'Appearance' })).toBeVisible()
    expect(screen.getByRole('heading', { level: 3, name: 'Display' })).toBeVisible()
    expect(screen.getByRole('combobox', { name: 'Appearance' })).toHaveValue('system')
    expect(screen.getByRole('combobox', { name: 'Language' })).toHaveValue('system')
    expect(screen.getByLabelText('Interface size')).toHaveTextContent('120%')
    expect(screen.getByLabelText('Document size')).toHaveTextContent('100%')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Close preferences' })).toHaveFocus())

    fireEvent.change(screen.getByRole('combobox', { name: 'Appearance' }), { target: { value: 'warm' } })
    fireEvent.click(screen.getByRole('button', { name: 'Increase document size' }))
    expect(actions.onAppearanceChange).toHaveBeenCalledWith('warm')
    expect(actions.onDocumentZoomChange).toHaveBeenCalledWith(110)
  })

  it('requests close for Escape and backdrop interaction', async () => {
    const onOpenChange = vi.fn()
    const escapedBelowDialog = vi.fn()
    window.addEventListener('keydown', escapedBelowDialog)
    renderDialog(onOpenChange)

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(escapedBelowDialog).not.toHaveBeenCalled()
    window.removeEventListener('keydown', escapedBelowDialog)
    onOpenChange.mockClear()
    fireEvent.pointerDown(document.querySelector('.preferences-dialog__backdrop')!)
    fireEvent.click(document.querySelector('.preferences-dialog__backdrop')!)
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it('restores focus to the actual opener after close', async () => {
    const { rerender, returnFocus } = renderDialog()
    rerender(
      <PreferencesDialog
        appearance="system"
        copy={copy}
        documentZoom={100}
        error={null}
        interfaceZoom={120}
        locale="system"
        onAppearanceChange={vi.fn()}
        onDocumentZoomChange={vi.fn()}
        onInterfaceZoomChange={vi.fn()}
        onLocaleChange={vi.fn()}
        onOpenChange={vi.fn()}
        open={false}
        portalContainer={null}
        returnFocusRef={{ current: returnFocus }}
        theme="light"
      />,
    )
    await waitFor(() => expect(returnFocus).toHaveFocus())
  })

  it('keeps focus inside the modal while it is open', async () => {
    const { returnFocus } = renderDialog()
    const close = screen.getByRole('button', { name: 'Close preferences' })
    await waitFor(() => expect(close).toHaveFocus())

    returnFocus.focus()
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Preferences' })).toContainElement(document.activeElement as HTMLElement))
  })
})
