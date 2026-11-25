import { useCallback, useEffect, useRef, useState } from 'react'

import { readableError } from '../lib/readableError'
import { createSettingsSaveQueue } from './settingsSaveQueue'

import {
  clampDocumentZoom,
  clampInterfaceZoom,
  clampSidebarWidth,
  defaultApplicationSettings,
  loadApplicationSettings,
  normalizeAppearancePreference,
  normalizeDocumentFontStyle,
  normalizeLineHeight,
  normalizeReadingWidth,
  saveApplicationSettings,
  type ApplicationSettings,
  type AppearancePreference,
  type InterfaceLocale,
  type DocumentFontStyle,
  type LineHeightPreference,
  type ReadingWidthPreference,
  type StartupSession,
} from './applicationSettings'

type WorkspaceSettings = Pick<
  ApplicationSettings,
  'currentFolder' | 'recentFiles' | 'recentFolders' | 'sidebarVisible' | 'sidebarWidth'
>

export function useApplicationSettings() {
  const [settings, setSettings] = useState(defaultApplicationSettings)
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const settingsRef = useRef(settings)
  const hasLocalUpdateRef = useRef(false)
  const [saveQueue] = useState(() =>
    createSettingsSaveQueue(saveApplicationSettings, (result) => {
      setSettingsError(
        result.ok ? null : readableError(result.reason, 'Could not save Milo preferences.'),
      )
    }),
  )

  useEffect(() => {
    let disposed = false

    void loadApplicationSettings()
      .then((loadedSettings) => {
        if (!disposed && !hasLocalUpdateRef.current) {
          const normalized = normalizeSettings(loadedSettings)
          settingsRef.current = normalized
          setSettings(normalized)
        }
        if (!disposed) setIsLoading(false)
      })
      .catch((reason) => {
        if (!disposed) {
          setSettingsError(readableError(reason, 'Could not save Milo preferences.'))
          setIsLoading(false)
        }
      })

    return () => {
      disposed = true
    }
  }, [])

  const updateSettings = useCallback(
    (
      update:
        | Partial<ApplicationSettings>
        | ((current: ApplicationSettings) => Partial<ApplicationSettings>),
    ) => {
      const current = settingsRef.current
      const nextSettings = normalizeSettings({
        ...current,
        ...(typeof update === 'function' ? update(current) : update),
      })
      hasLocalUpdateRef.current = true
      settingsRef.current = nextSettings
      setSettings(nextSettings)
      setSettingsError(null)
      saveQueue.enqueue(nextSettings)
    },
    [saveQueue],
  )

  const setAppearance = useCallback(
    (appearance: AppearancePreference) => {
      updateSettings({ appearance })
    },
    [updateSettings],
  )

  const setLocale = useCallback(
    (locale: InterfaceLocale) => {
      updateSettings({ locale })
    },
    [updateSettings],
  )

  const setDocumentZoom = useCallback(
    (documentZoom: number) => {
      updateSettings({ documentZoom: clampDocumentZoom(documentZoom) })
    },
    [updateSettings],
  )

  const setInterfaceZoom = useCallback(
    (interfaceZoom: number) => {
      updateSettings({ interfaceZoom: clampInterfaceZoom(interfaceZoom) })
    },
    [updateSettings],
  )

  const setDocumentFontStyle = useCallback(
    (documentFontStyle: DocumentFontStyle) => {
      updateSettings({ documentFontStyle })
    },
    [updateSettings],
  )

  const setReadingWidth = useCallback(
    (readingWidth: ReadingWidthPreference) => {
      updateSettings({ readingWidth })
    },
    [updateSettings],
  )

  const setLineHeight = useCallback(
    (lineHeight: LineHeightPreference) => {
      updateSettings({ lineHeight })
    },
    [updateSettings],
  )

  const updateWorkspaceSettings = useCallback(
    (
      update:
        | Partial<WorkspaceSettings>
        | ((current: Readonly<ApplicationSettings>) => Partial<WorkspaceSettings>),
    ) => {
      updateSettings(update)
    },
    [updateSettings],
  )

  const setStartupSession = useCallback(
    (startupSession: StartupSession) => {
      updateSettings({ startupSession })
    },
    [updateSettings],
  )

  return {
    flushSettings: saveQueue.flush,
    setAppearance,
    setDocumentZoom,
    setDocumentFontStyle,
    setInterfaceZoom,
    setLineHeight,
    setLocale,
    setReadingWidth,
    settings,
    settingsError,
    isLoading,
    setStartupSession,
    updateWorkspaceSettings,
  }
}

function normalizeSettings(settings: ApplicationSettings): ApplicationSettings {
  const merged = { ...defaultApplicationSettings, ...settings }
  return {
    ...merged,
    settingsVersion: 5,
    appearance: normalizeAppearancePreference(merged.appearance),
    documentFontStyle: normalizeDocumentFontStyle(merged.documentFontStyle),
    readingWidth: normalizeReadingWidth(merged.readingWidth),
    lineHeight: normalizeLineHeight(merged.lineHeight),
    documentZoom: clampDocumentZoom(merged.documentZoom),
    interfaceZoom: clampInterfaceZoom(merged.interfaceZoom),
    sidebarWidth: clampSidebarWidth(merged.sidebarWidth),
    recentFiles: merged.recentFiles.slice(0, 12),
    recentFolders: merged.recentFolders.slice(0, 8),
    startupSession: {
      activeDocumentPath: merged.startupSession?.activeDocumentPath ?? null,
      openDocumentPaths: merged.startupSession?.openDocumentPaths?.slice(0, 64) ?? [],
    },
  }
}
