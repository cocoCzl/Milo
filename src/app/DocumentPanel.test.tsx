import type { ComponentProps } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { DocumentPanel } from './DocumentPanel'
import { interfaceCopy } from './interfaceCopy'
import { documentStatus } from './documentPresentation'
import { emptyDocumentTab, type DocumentTab } from '../hooks/documentSessionModel'

vi.mock('./EditorLoader', () => ({ EditorLoader: () => <div>保留的正文</div> }))
afterEach(cleanup)
const copy = interfaceCopy('zh-CN')
function setup(
  overrides: Partial<DocumentTab>,
  props: Partial<ComponentProps<typeof DocumentPanel>> = {},
) {
  const tab = { ...emptyDocumentTab, ...overrides }
  const actions = {
    updateSource: vi.fn(),
    markContentChanged: vi.fn(),
    retryWatch: vi.fn(),
    updateMarkdown: vi.fn(),
    updateComposition: vi.fn(),
    registerFlush: vi.fn(),
    pasteImage: vi.fn(),
    reloadExternalChange: vi.fn(),
    retainLocalChanges: vi.fn(),
    overwriteExternalChange: vi.fn(),
    saveAsDocument: vi.fn(),
    retrySave: vi.fn(),
  } satisfies ComponentProps<typeof DocumentPanel>['actions']
  render(
    <DocumentPanel
      active
      tab={tab}
      title="测试"
      copy={copy}
      actions={actions}
      onNavigateLink={vi.fn()}
      onCloseOutline={vi.fn()}
      outlineDrawerMount={null}
      outlineInlineMount={null}
      contextualOverlayMount={null}
      outlineLayout="drawer"
      outlineOpen={false}
      presentationMode="edit"
      {...props}
    />,
  )
  return { tab, actions }
}
it('offers repaste for a lost image without routing it to disk save', () => {
  const { tab, actions } = setup({ error: 'image write failed', errorSource: 'image' })
  expect(screen.getByRole('alert')).toHaveTextContent(copy.pasteImageAgain)
  expect(screen.queryByRole('button', { name: copy.tryAgain })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: copy.saveAs })).not.toBeInTheDocument()
  expect(documentStatus(tab, copy)).toBe(copy.operationFailed)
  expect(actions.retrySave).not.toHaveBeenCalled()
  expect(screen.getByText('保留的正文')).toBeVisible()
})
it('keeps save recovery actions on the original tab and preserves the body', () => {
  const { tab, actions } = setup({ saveError: 'disk denied', errorSource: 'save' })
  fireEvent.click(screen.getByRole('button', { name: copy.tryAgain }))
  fireEvent.click(screen.getByRole('button', { name: copy.saveAs }))
  expect(actions.retrySave).toHaveBeenCalledWith(tab.id)
  expect(actions.saveAsDocument).toHaveBeenCalledWith(tab.id)
  expect(screen.getByText('保留的正文')).toBeVisible()
  expect(documentStatus(tab, copy)).toBe(copy.saveFailed)
})
it('retries a failed reload by reading the file, never by saving over it', () => {
  const { tab, actions } = setup({ error: 'read failed', errorSource: 'reload' })
  fireEvent.click(screen.getByRole('button', { name: copy.reloadFile }))
  expect(actions.reloadExternalChange).toHaveBeenCalledWith(tab.id)
  expect(actions.retrySave).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: copy.saveAs })).not.toBeInTheDocument()
})
it('explains known permission failures in Chinese while preserving original diagnostics and recovery actions', () => {
  const original = 'Failed to create temp file: Permission denied (os error 13)'
  const { tab, actions } = setup({ saveError: original, errorSource: 'save' })
  expect(screen.getByRole('alert')).toHaveTextContent(copy.writePermissionDenied)
  expect(screen.getByRole('alert')).toHaveTextContent(copy.saveChangesRetained)
  const details = screen.getByText(copy.originalError).closest('details')!
  expect(details).not.toHaveAttribute('open')
  fireEvent.click(screen.getByText(copy.originalError))
  expect(screen.getByText(original)).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: copy.tryAgain }))
  fireEvent.click(screen.getByRole('button', { name: copy.saveAs }))
  expect(actions.retrySave).toHaveBeenCalledWith(tab.id)
  expect(actions.saveAsDocument).toHaveBeenCalledWith(tab.id)
  expect(screen.getByText('保留的正文')).toBeVisible()
})

it('docks recovery outside the scrolling editor while preserving original-tab actions', () => {
  const footer = document.createElement('div')
  document.body.append(footer)
  const { tab, actions } = setup(
    { saveError: 'Permission denied (os error 13)' },
    { feedbackMount: footer },
  )
  const alert = screen.getByRole('alert')
  expect(alert.parentElement).toBe(footer)
  expect(screen.getByText('保留的正文')).toBeVisible()
  const details = alert.querySelector<HTMLDetailsElement>('.save-recovery')!
  details.open = false
  expect(screen.getByRole('button', { name: copy.tryAgain })).toBeVisible()
  expect(screen.getByRole('button', { name: copy.saveAs })).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: copy.tryAgain }))
  expect(actions.retrySave).toHaveBeenCalledWith(tab.id)
  footer.remove()
})
it('does not leak a background tab recovery into the shared footer', () => {
  const footer = document.createElement('div')
  document.body.append(footer)
  setup({ saveError: 'Permission denied (os error 13)' }, { feedbackMount: footer, active: false })
  expect(footer).toBeEmptyDOMElement()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  footer.remove()
})

it('keeps pointer disclosures from taking the writing focus, without intercepting buttons or keyboard', () => {
  setup({ saveError: 'Permission denied (os error 13)' })
  const editor = document.createElement('textarea')
  const host = document.createElement('div')
  host.className = 'source-editor'
  host.append(editor)
  document.body.append(host)
  editor.focus()
  const summary = screen.getByText(copy.saveFailed, { selector: 'summary' })
  expect(fireEvent.mouseDown(summary, { button: 0 })).toBe(false)
  expect(fireEvent.mouseDown(screen.getByText(copy.originalError), { button: 0 })).toBe(false)
  expect(fireEvent.mouseDown(screen.getByRole('button', { name: copy.tryAgain }))).toBe(true)
  expect(fireEvent.keyDown(summary, { key: 'Enter' })).toBe(true)
  summary.focus()
  expect(summary).toHaveFocus()
  expect(fireEvent.mouseDown(summary, { button: 0 })).toBe(true)
  host.remove()
})
