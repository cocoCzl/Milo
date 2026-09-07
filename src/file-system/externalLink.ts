import { isTauri } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'

export function isExternalHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url)
}

export async function openExternalLink(url: string): Promise<void> {
  if (!isTauri() || !isExternalHttpUrl(url)) return
  await openUrl(url)
}
