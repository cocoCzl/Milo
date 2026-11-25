import { browseMarkdownFolder } from './nativeMarkdownFile'

export type FolderMatch = { path: string; relativePath: string; name: string }
export type FolderSearchResult = {
  files: FolderMatch[]
  truncated: boolean
  incomplete: boolean
}
// Each published batch owns only newly discovered files, never a cumulative copy.
export type FolderSearchBatch = { files: FolderMatch[]; incomplete: boolean }
// One IPC at a time, selected folder only; symlink directories are excluded by
// the native browser. Bounds also constrain memory for very large folders.
export async function collectFolderFiles(
  root: string,
  signal: AbortSignal,
  publish?: (batch: FolderSearchBatch) => void,
): Promise<FolderSearchResult> {
  const files: FolderMatch[] = []
  const directories = [root]
  const seenFiles = new Set<string>()
  const seenDirectories = new Set([root])
  let visited = 0
  let incomplete = false
  const snapshot = (): FolderSearchResult => ({
    files,
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
        const batch: FolderMatch[] = []
        for (const entry of page.children) {
          if (entry.isDirectory) {
            if (!seenDirectories.has(entry.path)) {
              seenDirectories.add(entry.path)
              directories.push(entry.path)
            }
          } else if (!seenFiles.has(entry.path)) {
            seenFiles.add(entry.path)
            const file = {
              path: entry.path,
              relativePath: entry.path.slice(root.replace(/\/$/, '').length + 1),
              name: entry.name,
            }
            files.push(file)
            batch.push(file)
          }
          if (files.length === 10000) break
        }
        offset = page.nextOffset ?? 0
        snapshotId = page.snapshotId
        if (batch.length) publish?.({ files: batch, incomplete })
      } catch (reason) {
        signal.throwIfAborted()
        if (path === root && offset === 0) throw reason
        incomplete = true
        publish?.({ files: [], incomplete })
        break
      }
    } while (offset && files.length < 10000)
  }
  return snapshot()
}
const comparisonCache = new WeakMap<FolderMatch, { path: string; name: string; stem: string }>()

export function filterFolderFiles(files: Iterable<FolderMatch>, query: string) {
  const phrase = query.trim().toLowerCase().replace(/\s+/g, ' ')
  const words = phrase.split(' ')
  const matches: { file: FolderMatch; rank: number; path: string }[] = []
  const compare = (a: (typeof matches)[number], b: (typeof matches)[number]) =>
    a.rank - b.rank || lexical(a.path, b.path) || lexical(a.file.path, b.file.path)
  for (const file of files) {
    let comparable = comparisonCache.get(file)
    if (comparable === undefined) {
      const name = file.name.toLowerCase()
      comparable = {
        path: file.relativePath.toLowerCase(),
        name,
        stem: name.replace(/\.(md|markdown)$/, ''),
      }
      comparisonCache.set(file, comparable)
    }
    if (!words.every((word) => comparable.path.includes(word))) continue
    const rank = !phrase
      ? 0
      : comparable.name === phrase || comparable.stem === phrase
        ? 0
        : comparable.name.startsWith(phrase)
          ? 1
          : words.every((word) => comparable.name.includes(word))
            ? 2
            : 3
    const candidate = { file, rank, path: comparable.path }
    // Inspect every scanned candidate, but retain/sort only the best 100.
    if (matches.length === 100 && compare(candidate, matches[99]) >= 0) continue
    let low = 0
    let high = matches.length
    while (low < high) {
      const mid = (low + high) >>> 1
      if (compare(candidate, matches[mid]) < 0) high = mid
      else low = mid + 1
    }
    matches.splice(low, 0, candidate)
    if (matches.length > 100) matches.pop()
  }
  return matches.map(({ file }) => file)
}

function lexical(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0
}

export function* folderCandidates(chunks: readonly FolderMatch[][]) {
  for (const chunk of chunks) yield* chunk
}
