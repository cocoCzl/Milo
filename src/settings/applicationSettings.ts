import { invoke, isTauri } from '@tauri-apps/api/core'

export type AppearancePreference = 'system' | 'light' | 'dark'
export type InterfaceLocale = 'system' | 'en' | 'zh-CN'

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
  currentFolder: string | null
  recentFiles: string[]
  recentFolders: string[]
  sidebarVisible: boolean
  sidebarWidth: number
  startupSession: StartupSession
}

export const defaultApplicationSettings: ApplicationSettings = {
  settingsVersion: 3,
  appearance: 'system',
  locale: 'system',
  documentZoom: 100,
  interfaceZoom: 120,
  currentFolder: null,
  recentFiles: [],
  recentFolders: [],
  sidebarVisible: true,
  sidebarWidth: 240,
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
  return Math.min(520, Math.max(180, Math.round(width)))
}
