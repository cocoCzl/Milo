import { browseMarkdownFolder } from './nativeMarkdownFile'

export type FolderMatch = { path: string; relativePath: string; name: string }
// One IPC at a time, selected folder only; symlink directories are excluded by
// the native browser. Bounds also constrain memory for very large folders.
export async function collectFolderFiles(root: string, signal: AbortSignal) {
  const files: FolderMatch[] = []
  const directories = [root]
  let visited = 0
  while (directories.length && visited < 500 && files.length < 10000) {
    const path = directories.shift()!
    visited++
    let offset = 0
    do {
      signal.throwIfAborted()
      const page = await browseMarkdownFolder(path, false, offset)
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
    } while (offset && files.length < 10000)
  }
  return { files, truncated: files.length === 10000 || directories.length > 0 }
}
export function filterFolderFiles(files: FolderMatch[], query: string) {
  const words = query.trim().toLocaleLowerCase().split(/\s+/)
  return files
    .filter((file) => words.every((word) => file.relativePath.toLocaleLowerCase().includes(word)))
    .slice(0, 100)
}
