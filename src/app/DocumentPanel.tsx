import { SourceLoader } from './SourceLoader'
import type { NavigationTarget } from '../file-system/documentLink'
import { useCallback, useEffect, useRef, useMemo, memo } from 'react'
import { EditorLoader } from './EditorLoader'
import type { DocumentTab } from '../hooks/documentSessionModel'
import type { InterfaceCopy } from './interfaceCopy'
import type { PresentationMode } from './presentationMode'
import type { DocumentOrigin } from '../hooks/documentSessionModel'
import type { useDocumentSession } from '../hooks/useDocumentSession'
import type { EditorComposition } from '../editor/milkdown/compositionSaveBoundary'

type DocumentPanelProps = {
  onNavigateLink: (id: number, href: string) => void
  navigationTarget?: NavigationTarget
  active: boolean
  copy: InterfaceCopy
  actions: Pick<
    ReturnType<typeof useDocumentSession>,
    | 'updateSource'
    | 'markContentChanged'
    | 'retryWatch'
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
  onNavigateLink,
  navigationTarget,
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
  const tabRef = useRef(tab)
  tabRef.current = tab
  const wysFlush = useRef<(() => boolean) | null>(null)
  const sourceFlush = useRef<(() => boolean) | null>(null)
  const sourceVisited = useRef(false)
  const wysVisited = useRef(false)
  if (active && documentIsSource(tab)) sourceVisited.current = true
  if (active && !documentIsSource(tab) && !tab.document.protectionReason) wysVisited.current = true
  const registerFlush = useCallback((flush: (() => boolean) | null) => {
    wysFlush.current = flush
  }, [])
  const registerSourceFlush = useCallback((flush: (() => boolean) | null) => {
    sourceFlush.current = flush
  }, [])
  useEffect(() => {
    actions.registerFlush(tab.id, () => {
      const current = tabRef.current
      if (current.document.sourceMode) return sourceFlush.current?.() ?? false
      if (current.document.protectionReason) return true
      return wysFlush.current?.() ?? !current.document.isDirty
    })
    return () => actions.registerFlush(tab.id, null)
  }, [actions, tab.id])
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
        <div role="status">{copy.loadingDocument}</div>
      ) : !visitedRef.current ? null : (
        <>
          {sourceVisited.current ? (
            <SourceLoader
              key={`${document.id}:${document.editorVersion}`}
              active={active && Boolean(document.sourceMode)}
              text={`${document.frontMatter}${document.markdown}`}
              label={copy.sourceDocument(title)}
              findLabel={copy.editor.find}
              loadingLabel={copy.loadingDocument}
              retryLabel={`${copy.editor.editorLoadFailed} ${copy.tryAgain}`}
              onChange={(source) => actions.updateSource(origin, source)}
              onComposition={onCompositionChange}
              onRegisterFlush={registerSourceFlush}
            />
          ) : null}
          {isProtected && !document.sourceMode ? (
            <section className="protected-document" aria-label={copy.protectedDocument}>
              <div className="protected-document__notice" role="alert">
                <strong>{copy.protectedDocumentDescription}</strong>
                <span>{copy.protectionReason(document.protectionReason ?? '')}</span>
              </div>
              <pre className="protected-document__source">{`${document.frontMatter}${document.markdown}`}</pre>
            </section>
          ) : null}
          {wysVisited.current && !isProtected ? (
            <div className="document-view-host" hidden={Boolean(document.sourceMode)}>
              <DocumentEditorWorkspace
                onNavigateLink={(href) => onNavigateLink(tab.id, href)}
                navigationTarget={navigationTarget}
                active={active && !document.sourceMode}
                ariaLabel={copy.editorLabel(title)}
                copy={copy.editor}
                editorId={String(tab.id)}
                document={document}
                documentPath={document.path}
                onCloseOutline={() => onCloseOutline(tab.id)}
                onRegisterFlush={registerFlush}
                onContentChange={() => actions.markContentChanged(origin)}
                onMarkdownChange={onMarkdownChange}
                onCompositionChange={onCompositionChange}
                onPasteImage={onPasteImage}
                outlineDrawerMount={outlineDrawerMount}
                outlineInlineMount={outlineInlineMount}
                contextualOverlayMount={contextualOverlayMount}
                outlineLayout={outlineLayout}
                outlineOpen={active && outlineOpen}
                placeholder={copy.editor.startWriting}
                presentationMode={document.sourceMode ? 'read' : presentationMode}
              />
            </div>
          ) : null}
        </>
      )}
      {tab.watchError ? (
        <div className="document-monitor-warning" role="alert">
          <strong>{copy.monitoringUnavailable}</strong>
          <span>{tab.watchError}</span>
          <button type="button" onClick={() => void actions.retryWatch(tab.id)}>
            {copy.retryMonitoring}
          </button>
        </div>
      ) : null}
      {notice ? (
        <div className="document-notice" role="status">
          {notice === 'source-required' ? copy.sourceRequired : notice}
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
  onNavigateLink: (href: string) => void
  navigationTarget?: NavigationTarget
  onRegisterFlush?: (flush: (() => boolean) | null) => void
  active: boolean
  ariaLabel: string
  copy: InterfaceCopy['editor']
  document: DocumentTab['document']
  documentPath: string | null
  editorId: string
  onCloseOutline: () => void
  onCompositionChange: (state: EditorComposition) => void
  onContentChange: () => void
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
  onNavigateLink,
  navigationTarget,
  onRegisterFlush,
  active,
  ariaLabel,
  copy,
  document,
  documentPath,
  editorId,
  onCloseOutline,
  onContentChange,
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
      <EditorLoader
        onNavigateLink={onNavigateLink}
        navigationTarget={navigationTarget}
        loadingLabel={copy.startWriting}
        retryLabel={`${copy.editorLoadFailed} ${copy.retry}`}
        key={`${document.id}:${document.editorVersion}`}
        active={active}
        ariaLabel={ariaLabel}
        copy={copy}
        documentPath={documentPath}
        editorId={editorId}
        initialMarkdown={document.markdown}
        onCloseOutline={onCloseOutline}
        onRegisterFlush={onRegisterFlush}
        onContentChange={onContentChange}
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

function documentIsSource(tab: DocumentTab) {
  return Boolean(tab.document.sourceMode)
}
