import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { MilkdownEditor } from '../editor/milkdown/MilkdownEditor'
import { stageOpenProfile, startOpenProfile } from './openProfile'
const mocks = vi.hoisted(() => ({ invoke: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@tauri-apps/api/core', async (original) => ({
  ...(await original<typeof import('@tauri-apps/api/core')>()),
  invoke: mocks.invoke,
}))
afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})
it('does not record document paths in ordinary builds', () => {
  vi.stubEnv('VITE_MILO_PROFILE', '')
  expect(startOpenProfile('/private/note.md', 'test')).toBeUndefined()
  expect(mocks.invoke).not.toHaveBeenCalled()
})
it('profiles the real initialization without parsing again or publishing a content change', async () => {
  vi.stubEnv('VITE_MILO_PROFILE', '1')
  const markdown = '# Profile\n\n```js\nconst answer = 42\n```\n'
  const profile = startOpenProfile('/profile.md', 'test')!
  stageOpenProfile('/profile.md', profile, markdown)
  const change = vi.fn()
  const { container } = render(
    <MilkdownEditor
      documentPath="/profile.md"
      initialMarkdown={markdown}
      onMarkdownChange={change}
    />,
  )
  await waitFor(() =>
    expect(mocks.invoke).toHaveBeenCalledWith(
      'record_open_profile',
      expect.objectContaining({ record: expect.objectContaining({ phase: 'ready' }) }),
    ),
  )
  expect(container.querySelector('.ProseMirror')).toHaveTextContent('const answer = 42')
  expect(profile.entries.filter((entry) => entry.stage === 'milkdown-parse')).toHaveLength(1)
  expect(profile.entries.filter((entry) => entry.stage === 'code-highlight')).toHaveLength(1)
  expect(profile.marks['view-dom-built']).toBeGreaterThanOrEqual(
    profile.marks['plugin-state-init-end'],
  )
  expect(change).not.toHaveBeenCalled()
})
