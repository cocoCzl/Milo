import type { DocumentTab } from '../hooks/documentSessionModel'
import type { InterfaceCopy } from './interfaceCopy'

export function displayDocumentTitle(
  tab: Pick<DocumentTab, 'document'>,
  copy: InterfaceCopy,
): string {
  return tab.document.path ? tab.document.title : copy.untitled
}

export function statusTone(tab: DocumentTab): 'saved' | 'dirty' | 'error' {
  if (tab.saveError || tab.error || tab.externalChange || tab.document.protectionReason)
    return 'error'
  if (tab.document.isDirty || tab.activity === 'saving' || tab.activity === 'opening')
    return 'dirty'
  return 'saved'
}

export function fileName(path: string): string {
  return path.split(/[\\/]/).at(-1) ?? path
}

export function documentStatus(tab: DocumentTab, copy: InterfaceCopy): string {
  if (tab.externalChange) return copy.externalChange
  if (tab.document.protectionReason) return copy.protectedDocument
  if (tab.saveError || tab.error) return copy.saveFailed
  if (tab.activity === 'opening') return `${copy.openDocument}…`
  if (tab.activity === 'saving') return `${copy.saving}…`
  if (tab.document.isDirty) return copy.unsavedStatus
  return tab.document.path ? copy.saved : copy.notSaved
}
