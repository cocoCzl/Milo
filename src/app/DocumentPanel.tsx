import { useCallback, useRef, useMemo, memo } from 'react'
import { MilkdownEditor } from '../editor/milkdown/MilkdownEditor'
import type { DocumentTab } from '../hooks/documentSessionModel'
import type { InterfaceCopy } from './interfaceCopy'
import type { PresentationMode } from './presentationMode'
import type { DocumentOrigin } from '../hooks/documentSessionModel'
import type { useDocumentSession } from '../hooks/useDocumentSession'
import type { EditorComposition } from '../editor/milkdown/compositionSaveBoundary'

type DocumentPanelProps = {
  active: boolean
  copy: InterfaceCopy
  actions: Pick<
    ReturnType<typeof useDocumentSession>,
    | 'updateMarkdown'
    | 'updateComposition'
    | 'registerFlush'
    | 'pasteImage'
    | 'reloadExternalChange'
    | 'retainLocalChanges'
    | 'overwriteExternalChange'
    | 'saveAsDocument'
    | 'retrySave'
  >
  onCloseOutline: (id: number) => void
  outlineDrawerMount: HTMLElement | null
  outlineInlineMount: HTMLElement | null
  contextualOverlayMount: HTMLElement | null
  outlineLayout: 'inline' | 'drawer'
  outlineOpen: boolean
  presentationMode: PresentationMode
  tab: DocumentTab
  title: string
}

export const DocumentPanel = memo(function DocumentPanel({
  active,
  copy,
  actions,
  onCloseOutline,
  outlineDrawerMount,
  outlineInlineMount,
  contextualOverlayMount,
  outlineLayout,
  outlineOpen,
  presentationMode,
  tab,
  title,
}: DocumentPanelProps) {
  const visitedRef = useRef(active)
  if (active) visitedRef.current = true
  const origin = useMemo<DocumentOrigin>(
    () => ({ tabId: tab.id, documentId: tab.document.id, path: tab.document.path }),
    [tab.id, tab.document.id, tab.document.path],
  )
  const registerFlush = useCallback(
    (flush: (() => boolean) | null) => actions.registerFlush(tab.id, flush),
    [actions, tab.id],
  )
  const onMarkdownChange = useCallback(
    (markdown: string) => actions.updateMarkdown(origin, markdown),
    [actions, origin],
  )
  const onCompositionChange = useCallback(
    (state: EditorComposition) => actions.updateComposition(origin, state),
    [actions, origin],
  )
  const onPasteImage = useCallback(
    (image: import('../file-system/nativeMarkdownFile').PastedImage) =>
      actions.pasteImage(image, origin),
    [actions, origin],
  )
  const { document, error, saveError, externalChange, notice } = tab
  const actionableError = saveError ?? error
  const isProtected = document.protectionReason !== null

  return (
    <section
      id={`document-panel-${tab.id}`}
      className="document-panel"
      role="tabpanel"
      aria-label={title}
      hidden={!active}
    >
      {tab.activity === 'opening' ? (
        <div role="status">{copy.sidebar.loadingFolder}</div>
      ) : !visitedRef.current ? null : isProtected ? (
        <section className="protected-document" aria-label={copy.protectedDocument}>
          <div className="protected-document__notice" role="alert">
            <strong>{copy.protectedDocumentDescription}</strong>
            <span>{copy.protectionReason(document.protectionReason ?? '')}</span>
          </div>
          <pre className="protected-document__source">{`${document.frontMatter}${document.markdown}`}</pre>
        </section>
      ) : (
        <DocumentEditorWorkspace
          active={active}
          ariaLabel={copy.editorLabel(title)}
          copy={copy.editor}
          editorId={String(tab.id)}
          document={document}
          documentPath={document.path}
          onCloseOutline={() => onCloseOutline(tab.id)}
          onRegisterFlush={registerFlush}
          onMarkdownChange={onMarkdownChange}
          onCompositionChange={onCompositionChange}
          onPasteImage={onPasteImage}
          outlineDrawerMount={outlineDrawerMount}
          outlineInlineMount={outlineInlineMount}
          contextualOverlayMount={contextualOverlayMount}
          outlineLayout={outlineLayout}
          outlineOpen={active && outlineOpen}
          placeholder={copy.editor.startWriting}
          presentationMode={presentationMode}
        />
      )}
      {notice ? (
        <div className="document-notice" role="status">
          {notice}
        </div>
      ) : null}
      {externalChange ? (
        <div className="document-conflict" role="alert">
          <strong>{copy.externalChangesDetected}</strong>
          <span>{externalChange === 'pending' ? copy.pausedSaving : copy.retainedSaving}</span>
          <div className="document-conflict__actions">
            <button type="button" onClick={() => void actions.reloadExternalChange(tab.id)}>
              {copy.reloadFile}
            </button>
            {externalChange === 'pending' ? (
              <button type="button" onClick={() => void actions.retainLocalChanges(tab.id)}>
                {copy.retainLocal}
              </button>
            ) : (
              <button type="button" onClick={() => void actions.overwriteExternalChange(tab.id)}>
                {copy.overwriteExternal}
              </button>
            )}
            <button type="button" onClick={() => void actions.saveAsDocument(tab.id)}>
              {copy.saveAs}
            </button>
          </div>
        </div>
      ) : null}
      {actionableError ? (
        <div className="document-error" role="alert">
          <span>{actionableError}</span>
          <button type="button" onClick={() => void actions.retrySave(tab.id)}>
            {copy.tryAgain}
          </button>
          <button type="button" onClick={() => void actions.saveAsDocument(tab.id)}>
            {copy.saveAs}
          </button>
        </div>
      ) : null}
    </section>
  )
})

type DocumentEditorWorkspaceProps = {
  onRegisterFlush?: (flush: (() => boolean) | null) => void
  active: boolean
  ariaLabel: string
  copy: InterfaceCopy['editor']
  document: DocumentTab['document']
  documentPath: string | null
  editorId: string
  onCloseOutline: () => void
  onCompositionChange: (state: EditorComposition) => void
  onMarkdownChange: (markdown: string) => void
  onPasteImage: (
    image: import('../file-system/nativeMarkdownFile').PastedImage,
  ) => Promise<string | null>
  outlineDrawerMount: HTMLElement | null
  outlineInlineMount: HTMLElement | null
  contextualOverlayMount: HTMLElement | null
  outlineLayout: 'inline' | 'drawer'
  outlineOpen: boolean
  placeholder: string
  presentationMode: PresentationMode
}

function DocumentEditorWorkspace({
  onRegisterFlush,
  active,
  ariaLabel,
  copy,
  document,
  documentPath,
  editorId,
  onCloseOutline,
  onMarkdownChange,
  onCompositionChange,
  onPasteImage,
  outlineDrawerMount,
  outlineInlineMount,
  contextualOverlayMount,
  outlineLayout,
  outlineOpen,
  placeholder,
  presentationMode,
}: DocumentEditorWorkspaceProps) {
  const outlineMount = active
    ? outlineLayout === 'inline'
      ? outlineInlineMount
      : outlineDrawerMount
    : null

  return (
    <div className={`document-editor-workspace document-editor-workspace--${outlineLayout}`}>
      <MilkdownEditor
        key={`${document.id}:${document.editorVersion}`}
        active={active}
        ariaLabel={ariaLabel}
        copy={copy}
        documentPath={documentPath}
        editorId={editorId}
        initialMarkdown={document.markdown}
        onCloseOutline={onCloseOutline}
        onRegisterFlush={onRegisterFlush}
        onMarkdownChange={onMarkdownChange}
        onCompositionChange={onCompositionChange}
        onPasteImage={onPasteImage}
        contextualOverlayMount={contextualOverlayMount}
        outlineLayout={outlineLayout}
        outlineMount={outlineMount}
        outlineOpen={outlineOpen}
        placeholder={placeholder}
        presentationMode={presentationMode}
      />
    </div>
  )
}
