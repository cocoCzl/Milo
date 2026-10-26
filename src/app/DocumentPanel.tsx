import { MilkdownEditor } from '../editor/milkdown/MilkdownEditor'
import type { DocumentTab } from '../hooks/documentSessionModel'
import type { InterfaceCopy } from './interfaceCopy'
import type { PresentationMode } from './presentationMode'
import type { EditorComposition } from '../editor/milkdown/compositionSaveBoundary'

type DocumentPanelProps = {
  active: boolean
  copy: InterfaceCopy
  onCompositionChange: (state: EditorComposition) => void
  onMarkdownChange: (markdown: string) => void
  onPasteImage: (
    image: import('../file-system/nativeMarkdownFile').PastedImage,
  ) => Promise<string | null>
  onOverwrite: () => void
  onReload: () => void
  onRetain: () => void
  onRetry: () => void
  onSaveAs: () => void
  onCloseOutline: () => void
  outlineDrawerMount: HTMLElement | null
  outlineInlineMount: HTMLElement | null
  contextualOverlayMount: HTMLElement | null
  outlineLayout: 'inline' | 'drawer'
  outlineOpen: boolean
  presentationMode: PresentationMode
  tab: DocumentTab
  title: string
}

export function DocumentPanel({
  active,
  copy,
  onMarkdownChange,
  onCompositionChange,
  onPasteImage,
  onOverwrite,
  onReload,
  onRetain,
  onRetry,
  onSaveAs,
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
      {isProtected ? (
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
          onCloseOutline={onCloseOutline}
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
            <button type="button" onClick={onReload}>
              {copy.reloadFile}
            </button>
            {externalChange === 'pending' ? (
              <button type="button" onClick={onRetain}>
                {copy.retainLocal}
              </button>
            ) : (
              <button type="button" onClick={onOverwrite}>
                {copy.overwriteExternal}
              </button>
            )}
            <button type="button" onClick={onSaveAs}>
              {copy.saveAs}
            </button>
          </div>
        </div>
      ) : null}
      {actionableError ? (
        <div className="document-error" role="alert">
          <span>{actionableError}</span>
          <button type="button" onClick={onRetry}>
            {copy.tryAgain}
          </button>
          <button type="button" onClick={onSaveAs}>
            {copy.saveAs}
          </button>
        </div>
      ) : null}
    </section>
  )
}

type DocumentEditorWorkspaceProps = {
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
