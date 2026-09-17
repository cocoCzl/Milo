import { useCallback, useEffect, useRef, useState } from 'react'

import {
  clampDocumentZoom,
  clampInterfaceZoom,
  clampSidebarWidth,
  defaultApplicationSettings,
  loadApplicationSettings,
  normalizeAppearancePreference,
  saveApplicationSettings,
  type ApplicationSettings,
  type AppearancePreference,
  type InterfaceLocale,
  type StartupSession,
} from './applicationSettings'

export function useApplicationSettings() {
  const [settings, setSettings] = useState(defaultApplicationSettings)
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const settingsRef = useRef(settings)
  const hasLocalUpdateRef = useRef(false)
  const pendingSaveRef = useRef(Promise.resolve())
  const saveVersionRef = useRef(0)

  settingsRef.current = settings

  useEffect(() => {
    let disposed = false

    void loadApplicationSettings().then((loadedSettings) => {
      if (!disposed && !hasLocalUpdateRef.current) {
        setSettings(normalizeSettings(loadedSettings))
      }
      if (!disposed) setIsLoading(false)
    }).catch((reason) => {
      if (!disposed) {
        setSettingsError(readableError(reason))
        setIsLoading(false)
      }
    })

    return () => {
      disposed = true
    }
  }, [])

  const updateSettings = useCallback((update: Partial<ApplicationSettings>) => {
    const nextSettings = normalizeSettings({ ...settingsRef.current, ...update })
    const saveVersion = saveVersionRef.current + 1

    hasLocalUpdateRef.current = true
    saveVersionRef.current = saveVersion
    settingsRef.current = nextSettings
    setSettings(nextSettings)
    setSettingsError(null)
    pendingSaveRef.current = pendingSaveRef.current
      .catch(() => undefined)
      .then(() => saveApplicationSettings(nextSettings))
      .then(() => undefined)
      .catch((reason) => {
        if (saveVersionRef.current === saveVersion) {
          setSettingsError(readableError(reason))
        }
      })
  }, [])

  const setAppearance = useCallback((appearance: AppearancePreference) => {
    updateSettings({ appearance })
  }, [updateSettings])

  const setLocale = useCallback((locale: InterfaceLocale) => {
    updateSettings({ locale })
  }, [updateSettings])

  const setDocumentZoom = useCallback((documentZoom: number) => {
    updateSettings({ documentZoom: clampDocumentZoom(documentZoom) })
  }, [updateSettings])

  const setInterfaceZoom = useCallback((interfaceZoom: number) => {
    updateSettings({ interfaceZoom: clampInterfaceZoom(interfaceZoom) })
  }, [updateSettings])

  const updateWorkspaceSettings = useCallback((update: Partial<Pick<ApplicationSettings, 'currentFolder' | 'recentFiles' | 'recentFolders' | 'sidebarVisible' | 'sidebarWidth'>>) => {
    updateSettings(update)
  }, [updateSettings])

  const setStartupSession = useCallback((startupSession: StartupSession) => {
    updateSettings({ startupSession })
  }, [updateSettings])

  return {
    setAppearance,
    setDocumentZoom,
    setInterfaceZoom,
    setLocale,
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
    settingsVersion: 4,
    appearance: normalizeAppearancePreference(merged.appearance),
    documentZoom: clampDocumentZoom(merged.documentZoom),
    interfaceZoom: clampInterfaceZoom(merged.interfaceZoom),
    sidebarWidth: clampSidebarWidth(merged.sidebarWidth),
    recentFiles: merged.recentFiles.slice(0, 12),
    recentFolders: merged.recentFolders.slice(0, 8),
    startupSession: {
      activeDocumentPath: merged.startupSession?.activeDocumentPath ?? null,
      openDocumentPaths: merged.startupSession?.openDocumentPaths?.slice(0, 12) ?? [],
    },
  }
}

function readableError(reason: unknown): string {
  return reason instanceof Error && reason.message
    ? reason.message
    : 'Could not save Milo preferences.'
}
