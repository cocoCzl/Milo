import type { LineEnding } from '../file-system/nativeMarkdownFile'

type DocumentActivity = 'idle' | 'opening' | 'saving'

type SaveFeedback = 'idle' | 'pending' | 'saving' | 'saved'

type ExternalChange = 'pending' | 'retained'

type WatchState = 'inactive' | 'active' | 'unavailable'

export const emptyDocumentTab: DocumentTab = {
  id: 0,
  document: {
    id: 0,
    path: null,
    title: '',
    markdown: '',
    lineEnding: 'lf',
    hasBom: false,
    frontMatter: '',
    isDirty: false,
    protectionReason: null,
    persistedMarkdown: null,
    editorVersion: 0,
    revision: 0,
  },
  activity: 'idle',
  isComposing: false,
  error: null,
  saveError: null,
  watchError: null,
  watchState: 'inactive',
  externalChange: null,
  notice: null,
  saveFeedback: 'idle',
}

export type DocumentSession = {
  id: number
  path: string | null
  title: string
  markdown: string
  lineEnding: LineEnding
  hasBom: boolean
  frontMatter: string
  isDirty: boolean
  protectionReason: string | null
  persistedMarkdown: string | null
  editorVersion: number
  revision: number
}

export type DocumentTab = {
  id: number
  document: DocumentSession
  activity: DocumentActivity
  isComposing: boolean
  error: string | null
  saveError: string | null
  watchError: string | null
  watchState: WatchState
  externalChange: ExternalChange | null
  notice: string | null
  saveFeedback: SaveFeedback
}

// This identity is created at the event source and travels with every
// asynchronous operation.  Nothing that originates in an editor may select
// its destination from the currently visible tab later.
export type DocumentOrigin = {
  tabId: number
  documentId: number
  path: string | null
}

export function createTab(document: DocumentSession): DocumentTab {
  return {
    id: document.id,
    document,
    activity: 'idle',
    isComposing: false,
    error: null,
    saveError: null,
    watchError: null,
    watchState: 'inactive',
    externalChange: null,
    notice: null,
    saveFeedback: 'idle',
  }
}

export function titleFromPath(path: string): string {
  return path.split(/[\\/]/).at(-1) ?? path
}
export function createDocumentState(id: number): DocumentSession {
  return {
    id,
    path: null,
    title: 'Untitled',
    markdown: '',
    lineEnding: 'lf',
    hasBom: false,
    frontMatter: '',
    isDirty: false,
    protectionReason: null,
    persistedMarkdown: null,
    editorVersion: 0,
    revision: 0,
  }
}
