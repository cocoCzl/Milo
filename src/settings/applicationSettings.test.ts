import { describe, expect, it } from 'vitest'

import { clampDocumentZoom, clampInterfaceZoom, clampSidebarWidth, defaultApplicationSettings, normalizeAppearancePreference, normalizeDocumentFontStyle, normalizeLineHeight, normalizeReadingWidth, SIDEBAR_DEFAULT_WIDTH, SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH } from './applicationSettings'

describe('Application Settings', () => {
  it('starts with system appearance, system locale, and readable zoom defaults', () => {
    expect(defaultApplicationSettings).toEqual({
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
      sidebarWidth: 224,
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
    expect(SIDEBAR_DEFAULT_WIDTH).toBe(224)
    expect(SIDEBAR_MIN_WIDTH).toBe(208)
    expect(SIDEBAR_MAX_WIDTH).toBe(320)
    expect(clampSidebarWidth(180)).toBe(208)
    expect(clampSidebarWidth(240)).toBe(240)
    expect(clampSidebarWidth(280)).toBe(280)
    expect(clampSidebarWidth(278.6)).toBe(279)
    expect(clampSidebarWidth(420)).toBe(320)
  })

  it('keeps an invalid persisted appearance from escaping the system fallback', () => {
    expect(normalizeAppearancePreference('warm')).toBe('warm')
    expect(normalizeAppearancePreference('midnight')).toBe('system')
    expect(normalizeAppearancePreference(null)).toBe('system')
  })

  it('normalizes semantic reading preferences without storing presentation numbers', () => {
    expect(normalizeDocumentFontStyle('serif')).toBe('serif')
    expect(normalizeDocumentFontStyle('comic')).toBe('sans')
    expect(normalizeReadingWidth('narrow')).toBe('narrow')
    expect(normalizeReadingWidth('wide')).toBe('wide')
    expect(normalizeReadingWidth(920)).toBe('standard')
    expect(normalizeLineHeight('compact')).toBe('compact')
    expect(normalizeLineHeight('relaxed')).toBe('relaxed')
    expect(normalizeLineHeight(1.82)).toBe('standard')
  })
})
