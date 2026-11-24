import { browseMarkdownFolder } from './nativeMarkdownFile'

export type FolderMatch = { path: string; relativePath: string; name: string }
export type FolderSearchResult = {
  files: FolderMatch[]
  truncated: boolean
  incomplete: boolean
}
// One IPC at a time, selected folder only; symlink directories are excluded by
// the native browser. Bounds also constrain memory for very large folders.
export async function collectFolderFiles(
  root: string,
  signal: AbortSignal,
  publish?: (result: FolderSearchResult) => void,
): Promise<FolderSearchResult> {
  const files: FolderMatch[] = []
  const directories = [root]
  let visited = 0
  let incomplete = false
  const snapshot = (): FolderSearchResult => ({
    files: [...files],
    truncated: files.length === 10000 || directories.length > 0,
    incomplete,
  })
  while (directories.length && visited < 500 && files.length < 10000) {
    const path = directories.shift()!
    visited++
    let offset = 0
    let snapshotId: string | null | undefined
    do {
      signal.throwIfAborted()
      try {
        const page = await browseMarkdownFolder(
          path,
          false,
          offset,
          ...(snapshotId ? [snapshotId] : []),
        )
        signal.throwIfAborted()
        for (const entry of page.children) {
          if (entry.isDirectory) directories.push(entry.path)
          else
            files.push({
              path: entry.path,
              relativePath: entry.path.slice(root.replace(/\/$/, '').length + 1),
              name: entry.name,
            })
          if (files.length === 10000) break
        }
        offset = page.nextOffset ?? 0
        snapshotId = page.snapshotId
        publish?.(snapshot())
      } catch (reason) {
        signal.throwIfAborted()
        if (path === root && offset === 0) throw reason
        incomplete = true
        publish?.(snapshot())
        break
      }
    } while (offset && files.length < 10000)
  }
  return snapshot()
}
const comparisonCache = new WeakMap<FolderMatch, string>()

export function filterFolderFiles(files: FolderMatch[], query: string) {
  const words = query.trim().toLocaleLowerCase().split(/\s+/)
  const matches: FolderMatch[] = []
  for (const file of files) {
    let comparable = comparisonCache.get(file)
    if (comparable === undefined) {
      comparable = file.relativePath.toLocaleLowerCase()
      comparisonCache.set(file, comparable)
    }
    if (words.every((word) => comparable.includes(word))) matches.push(file)
    if (matches.length === 100) break
  }
  return matches
}
