import { FileText, Save } from 'lucide-react'
import { IconButton } from '../components/IconButton'
import type { DocumentTab } from '../hooks/documentSessionModel'
import type { InterfaceCopy } from './interfaceCopy'
import { displayDocumentTitle, documentStatus, fileName, statusTone } from './documentPresentation'

export function DocumentContext({
  copy,
  document,
  folder,
  onSave,
  saveDisabled,
  tab,
}: {
  copy: InterfaceCopy
  document: DocumentTab['document']
  folder: string | null
  onSave: () => void
  saveDisabled: boolean
  tab: DocumentTab
}) {
  const title = displayDocumentTitle({ document }, copy)
  const workspace = folder ? fileName(folder) : null
  const tone = statusTone(tab)
  const status =
    tab.saveFeedback === 'pending'
      ? copy.savingSoon
      : tab.saveFeedback === 'saving'
        ? copy.saving
        : tab.saveFeedback === 'saved'
          ? copy.saved
          : documentStatus(tab, copy)

  return (
    <div
      className={`document-context document-context--${tone}`}
      title={document.path ?? title}
      aria-live="polite"
    >
      <div className="document-context__identity">
        <span className="document-context__icon" aria-hidden="true">
          <FileText size={15} strokeWidth={1.7} />
        </span>
        <span className="document-context__path">
          {workspace ? (
            <>
              <span className="document-context__workspace">{workspace}</span>
              <span className="document-context__separator" aria-hidden="true">
                /
              </span>
            </>
          ) : null}
          <strong title={title}>{title}</strong>
        </span>
      </div>
      <div className="document-context__actions">
        <div className="document-context__status">
          <span
            className={`document-context__status-dot document-context__status-dot--${tone}`}
            aria-hidden="true"
          />
          <span>{status}</span>
        </div>
        <IconButton
          className="document-context__save"
          disabled={saveDisabled}
          label={copy.saveDocument}
          title={document.protectionReason ? copy.protectedSave : undefined}
          onClick={onSave}
        >
          <Save aria-hidden="true" size={15} strokeWidth={1.7} />
        </IconButton>
      </div>
    </div>
  )
}
