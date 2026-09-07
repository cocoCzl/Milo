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

export async function writeMarkdownFile(document: MarkdownFile): Promise<MarkdownFile> {
  return invoke<MarkdownFile>('write_markdown_document', { request: document })
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
