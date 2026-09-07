import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const readProjectFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')
const projectFileExists = (path: string) => existsSync(resolve(process.cwd(), path))

describe('macOS package metadata', () => {
  it('declares GPL-3.0 material and optional Markdown editor associations', () => {
    const config = JSON.parse(readProjectFile('src-tauri/tauri.conf.json')) as {
      bundle: {
        icon: string[]
        licenseFile: string
        fileAssociations: Array<{ ext: string[]; mimeType: string; role: string }>
      }
    }

    expect(config.bundle.licenseFile).toBe('../LICENSE')
    expect(config.bundle.icon).toContain('icons/icon.icns')
    expect(config.bundle.icon).toContain('icons/icon.png')
    expect(projectFileExists('src-tauri/icons/icon.icns')).toBe(true)
    expect(projectFileExists('src-tauri/icons/32x32.png')).toBe(true)
    expect(projectFileExists('src-tauri/icons/128x128@2x.png')).toBe(true)
    expect(readProjectFile('LICENSE')).toContain('GNU GENERAL PUBLIC LICENSE')
    expect(readProjectFile('LICENSE')).toContain('Version 3, 29 June 2007')
    expect(config.bundle.fileAssociations).toContainEqual({
      ext: ['md', 'markdown'],
      mimeType: 'text/markdown',
      name: 'Markdown document',
      role: 'Editor',
    })
  })
})
