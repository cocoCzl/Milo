import { isExternalHttpUrl } from './externalLink'

export type DocumentLink =
  | { kind: 'external'; url: string }
  | { kind: 'document'; path: string | null; anchor: string }
export function resolveDocumentLink(
  href: string,
  documentPath: string | null,
): DocumentLink | null {
  if (isExternalHttpUrl(href)) return { kind: 'external', url: href }
  if (!href || hasControl(href) || href.startsWith('//')) return null
  try {
    // Decode once, after URL parsing, so %23 and %3F remain filename characters.
    if (href.startsWith('#'))
      return { kind: 'document', path: documentPath, anchor: decodeURIComponent(href.slice(1)) }
    if (!documentPath || /^[a-z][\w+.-]*:/i.test(href)) return null
    const url = new URL(href, `file://${documentPath.split('/').map(encodeURIComponent).join('/')}`)
    if (url.protocol !== 'file:' || url.hostname || url.search) return null
    const path = decodeURIComponent(url.pathname)
    if (!/\.(md|markdown)$/i.test(path) || hasControl(path)) return null
    return { kind: 'document', path, anchor: decodeURIComponent(url.hash.slice(1)) }
  } catch {
    return null
  }
}
export function isSupportedLink(href: string): boolean {
  return isExternalHttpUrl(href) || resolveDocumentLink(href, '/document.md') !== null
}
export type NavigationTarget = { token: number; anchor?: string; scrollTop?: number }

function hasControl(value: string) {
  return [...value].some((char) => char.charCodeAt(0) < 32)
}
