import type { MarkdownTreeNode } from '../file-system/nativeMarkdownFile'

export type RememberedListing = {
  page: MarkdownTreeNode
  error: string | null
  failedOffset: number | null
}
export type FolderViewState = {
  showExcluded: boolean
  expanded: Map<string, boolean>
  scrollTop: number
  recentOpen: boolean
  listings: Map<string, RememberedListing>
}

// Session-only plain data, never DOM/editor instances or application settings.
// Discard oldest page payloads before navigation preferences. A miss reloads a
// first page; it must never continue a new native snapshot at an old offset.
export class SidebarStateStore {
  private folders = new Map<string, FolderViewState>()
  constructor(
    private readonly folderLimit = 8,
    private readonly entryLimit = 4000,
  ) {}

  folder(path: string | null) {
    const key = path ?? ''
    let state = this.folders.get(key)
    if (!state) {
      state = {
        showExcluded: false,
        expanded: new Map(),
        scrollTop: 0,
        recentOpen: !path,
        listings: new Map(),
      }
    }
    this.folders.delete(key)
    this.folders.set(key, state)
    while (this.folders.size > this.folderLimit)
      this.folders.delete(this.folders.keys().next().value!)
    return state
  }

  listing(state: FolderViewState, path: string, excluded: boolean) {
    return state.listings.get(`${Number(excluded)}:${path}`)
  }

  remember(state: FolderViewState, path: string, excluded: boolean, listing: RememberedListing) {
    const key = `${Number(excluded)}:${path}`
    state.listings.delete(key)
    state.listings.set(key, listing)
    let count = 0
    let bytes = 0
    for (const folder of this.folders.values())
      for (const cached of folder.listings.values()) {
        count += entryCount(cached.page)
        bytes += byteCount(cached.page)
      }
    for (const folder of this.folders.values()) {
      for (const [path, cached] of folder.listings) {
        if (count <= this.entryLimit && bytes <= 4 * 1024 * 1024) return
        folder.listings.delete(path)
        count -= entryCount(cached.page)
        bytes -= byteCount(cached.page)
      }
    }
  }

  expand(state: FolderViewState, path: string, expanded: boolean) {
    state.expanded.delete(path)
    state.expanded.set(path, expanded)
    if (state.expanded.size > 512) state.expanded.delete(state.expanded.keys().next().value!)
  }
}

function entryCount(node: MarkdownTreeNode): number {
  return node.children.reduce((count, child) => count + 1 + entryCount(child), 0)
}

function byteCount(node: MarkdownTreeNode): number {
  return (
    128 +
    (node.path.length + node.name.length) * 2 +
    node.children.reduce((bytes, child) => bytes + byteCount(child), 0)
  )
}

// App keeps only a first-page anchor outside this bounded cache. Retaining a
// whole merged listing there would defeat eviction after the sidebar unmounts.
export function directoryRootPreview(page: MarkdownTreeNode): MarkdownTreeNode {
  return {
    ...page,
    children: page.children.slice(0, 200),
    nextOffset: page.children.length > 200 ? 200 : page.nextOffset,
  }
}
