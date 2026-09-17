import { isTauri } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'

export function isExternalHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && Boolean(parsed.hostname)
  } catch {
    return false
  }
}

export async function openExternalLink(url: string): Promise<void> {
  if (!isTauri() || !isExternalHttpUrl(url)) return
  await openUrl(url)
}
