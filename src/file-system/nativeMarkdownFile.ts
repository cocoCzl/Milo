import { invoke } from '@tauri-apps/api/core'
import { open, save } from '@tauri-apps/plugin-dialog'

export type LineEnding = 'lf' | 'crlf'

export type MarkdownFile = {
  path: string
  markdown: string
  hasBom: boolean
  lineEnding: LineEnding
}

export type MarkdownTreeNode = {
  path: string
  name: string
  isDirectory: boolean
  children: MarkdownTreeNode[]
}

export type PastedImage = {
  bytes: number[]
  mimeType: string
}

export type ImageAsset = {
  path: string
  relativePath: string
}

export const macOSSafeSaveV2 = typeof navigator !== 'undefined'
  && /Mac/i.test(navigator.platform)

export function usesMacOSSafeSaveV2(): boolean {
  return macOSSafeSaveV2
}

const markdownFilter = [{ name: 'Markdown', extensions: ['md', 'markdown'] }]

export async function pickMarkdownFile(): Promise<string | null> {
  const selection = await open({
    filters: markdownFilter,
    multiple: false,
  })
  return typeof selection === 'string' ? selection : null
}

export async function pickMarkdownSavePath(defaultPath: string): Promise<string | null> {
  const selection = await save({
    defaultPath,
    filters: markdownFilter,
  })

  return selection ? ensureMarkdownExtension(selection) : null
}

export async function readMarkdownFile(path: string): Promise<MarkdownFile> {
  return invoke<MarkdownFile>('read_markdown_document', { path })
}

export async function recoverAndReadMarkdownFile(path: string, safeSaveEnabled = usesMacOSSafeSaveV2()): Promise<MarkdownFile> {
  if (safeSaveEnabled) {
    try {
      await invoke('recover_markdown_document_safe_v2', { path })
    } catch (reason) {
      const detail = String(reason)
      const classified = /^SAFE_SAVE_RECOVERY_BLOCKED\[([^\]]+)\]:\s*([\s\S]*)$/.exec(detail)
      if (classified) {
        throw new Error(
          'Milo detected an unfinished file recovery state.\n'
          + 'To avoid overwriting data, the file was not opened or modified.\n'
          + `Recovery category: ${classified[1]}.\n`
          + `Details: ${classified[2]}`,
        )
      }
      throw reason
    }
  }
  return readMarkdownFile(path)
}

export async function writeMarkdownFile(document: MarkdownFile): Promise<MarkdownFile> {
  return invoke<MarkdownFile>('write_markdown_document', { request: document })
}

export async function writeMarkdownFileSafely(
  document: MarkdownFile,
  expectedDisk: MarkdownFile | null,
): Promise<MarkdownFile> {
  return invoke<MarkdownFile>('write_markdown_document_safe_v2', {
    request: {
      ...document,
      expectedMarkdown: expectedDisk?.markdown ?? null,
      expectedLineEnding: expectedDisk?.lineEnding ?? null,
      expectedHasBom: expectedDisk?.hasBom ?? null,
    },
  })
}

export async function pickMarkdownFolder(): Promise<string | null> {
  const selection = await open({ directory: true, multiple: false })
  return typeof selection === 'string' ? selection : null
}

export async function browseMarkdownFolder(path: string): Promise<MarkdownTreeNode> {
  return invoke<MarkdownTreeNode>('browse_markdown_folder', { path })
}

export async function writeImageAsset(documentPath: string, image: PastedImage): Promise<ImageAsset> {
  return invoke<ImageAsset>('write_image_asset', { request: { documentPath, ...image } })
}

export function ensureMarkdownExtension(path: string): string {
  return /\.(md|markdown)$/i.test(path) ? path : `${path}.md`
}
