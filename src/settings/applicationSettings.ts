import { invoke, isTauri } from '@tauri-apps/api/core'

export type AppearancePreference = 'system' | 'light' | 'dark' | 'warm'
export type ResolvedTheme = 'light' | 'dark' | 'warm'
export type InterfaceLocale = 'system' | 'en' | 'zh-CN'
export type DocumentFontStyle = 'sans' | 'serif'
export type ReadingWidthPreference = 'narrow' | 'standard' | 'wide'
export type LineHeightPreference = 'compact' | 'standard' | 'relaxed'

export type StartupSession = {
  activeDocumentPath: string | null
  openDocumentPaths: string[]
}

export type ApplicationSettings = {
  settingsVersion: number
  appearance: AppearancePreference
  locale: InterfaceLocale
  documentZoom: number
  interfaceZoom: number
  documentFontStyle: DocumentFontStyle
  readingWidth: ReadingWidthPreference
  lineHeight: LineHeightPreference
  currentFolder: string | null
  recentFiles: string[]
  recentFolders: string[]
  sidebarVisible: boolean
  sidebarWidth: number
  startupSession: StartupSession
}

export const SIDEBAR_DEFAULT_WIDTH = 224
export const SIDEBAR_MIN_WIDTH = 208
export const SIDEBAR_MAX_WIDTH = 320

export const defaultApplicationSettings: ApplicationSettings = {
  settingsVersion: 5,
  appearance: 'system',
  locale: 'system',
  documentZoom: 100,
  interfaceZoom: 120,
  documentFontStyle: 'sans',
  readingWidth: 'standard',
  lineHeight: 'standard',
  currentFolder: null,
  recentFiles: [],
  recentFolders: [],
  sidebarVisible: true,
  sidebarWidth: SIDEBAR_DEFAULT_WIDTH,
  startupSession: { activeDocumentPath: null, openDocumentPaths: [] },
}

export async function loadApplicationSettings(): Promise<ApplicationSettings> {
  if (!isTauri()) {
    return defaultApplicationSettings
  }

  return invoke<ApplicationSettings>('load_application_settings')
}

export async function saveApplicationSettings(
  settings: ApplicationSettings,
): Promise<ApplicationSettings> {
  if (!isTauri()) {
    return settings
  }

  return invoke<ApplicationSettings>('save_application_settings', { settings })
}

export function clampDocumentZoom(zoom: number): number {
  return Math.min(160, Math.max(80, Math.round(zoom)))
}

export function clampInterfaceZoom(zoom: number): number {
  return Math.min(140, Math.max(90, Math.round(zoom)))
}

export function clampSidebarWidth(width: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(width)))
}

export function normalizeAppearancePreference(value: unknown): AppearancePreference {
  return value === 'light' || value === 'dark' || value === 'warm' || value === 'system'
    ? value
    : 'system'
}

export function normalizeDocumentFontStyle(value: unknown): DocumentFontStyle {
  return value === 'serif' ? 'serif' : 'sans'
}

export function normalizeReadingWidth(value: unknown): ReadingWidthPreference {
  return value === 'narrow' || value === 'wide' ? value : 'standard'
}

export function normalizeLineHeight(value: unknown): LineHeightPreference {
  return value === 'compact' || value === 'relaxed' ? value : 'standard'
}
