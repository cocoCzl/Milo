import { describe, expect, it } from 'vitest'

import { clampDocumentZoom, clampInterfaceZoom, clampSidebarWidth, defaultApplicationSettings, normalizeAppearancePreference } from './applicationSettings'

describe('Application Settings', () => {
  it('starts with system appearance, system locale, and readable zoom defaults', () => {
    expect(defaultApplicationSettings).toEqual({
      settingsVersion: 4,
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
    })
  })

  it('keeps document zoom within the portable display range', () => {
    expect(clampDocumentZoom(64)).toBe(80)
    expect(clampDocumentZoom(128.4)).toBe(128)
    expect(clampDocumentZoom(180)).toBe(160)
  })

  it('keeps interface zoom readable without crowding the window chrome', () => {
    expect(clampInterfaceZoom(72)).toBe(90)
    expect(clampInterfaceZoom(118.6)).toBe(119)
    expect(clampInterfaceZoom(180)).toBe(140)
  })

  it('keeps the resizable navigation pane within the desktop shell range', () => {
    expect(clampSidebarWidth(180)).toBe(220)
    expect(clampSidebarWidth(278.6)).toBe(279)
    expect(clampSidebarWidth(520)).toBe(420)
  })

  it('keeps an invalid persisted appearance from escaping the system fallback', () => {
    expect(normalizeAppearancePreference('warm')).toBe('warm')
    expect(normalizeAppearancePreference('midnight')).toBe('system')
    expect(normalizeAppearancePreference(null)).toBe('system')
  })
})
