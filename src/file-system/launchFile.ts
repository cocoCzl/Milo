import { invoke, isTauri } from '@tauri-apps/api/core'

export async function initialLaunchMarkdownFile(): Promise<string | null> {
  if (!isTauri()) return null
  return invoke<string | null>('initial_launch_markdown_file')
}
