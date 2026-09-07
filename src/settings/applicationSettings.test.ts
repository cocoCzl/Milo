import { describe, expect, it } from 'vitest'

import { clampDocumentZoom, clampInterfaceZoom, defaultApplicationSettings } from './applicationSettings'

describe('Application Settings', () => {
  it('starts with system appearance, system locale, and readable zoom defaults', () => {
    expect(defaultApplicationSettings).toEqual({
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
})
