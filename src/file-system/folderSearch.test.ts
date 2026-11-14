import { beforeEach, expect, it, vi } from 'vitest'
const browse = vi.hoisted(() => vi.fn())
vi.mock('./nativeMarkdownFile', () => ({ browseMarkdownFolder: browse }))
import { collectFolderFiles, filterFolderFiles } from './folderSearch'
beforeEach(() => browse.mockReset())
it('stays within the chosen folder, follows pages serially and returns filename plus relative path', async () => {
  const file = (path: string) => ({
    path,
    name: path.split('/').at(-1),
    isDirectory: false,
    children: [],
  })
  browse.mockImplementation(async (path: string, _excluded: boolean, offset: number) => {
    if (path === '/chosen' && offset === 0)
      return {
        children: [{ ...file('/chosen/nested'), isDirectory: true }, file('/chosen/中文.md')],
        nextOffset: 200,
      }
    if (path === '/chosen') return { children: [file('/chosen/other.md')], nextOffset: null }
    return { children: [file('/chosen/nested/file.md')], nextOffset: null }
  })
  const result = await collectFolderFiles('/chosen', new AbortController().signal)
  expect(result.truncated).toBe(false)
  expect(result.files.map((f) => f.relativePath)).toEqual(['中文.md', 'other.md', 'nested/file.md'])
  expect(browse.mock.calls).toEqual([
    ['/chosen', false, 0],
    ['/chosen', false, 200],
    ['/chosen/nested', false, 0],
  ])
  expect(filterFolderFiles(result.files, 'NESTED file')).toEqual([result.files[2]])
})
it('ignores a late page after cancellation and bounds results', async () => {
  const controller = new AbortController()
  browse.mockImplementation(async () => {
    controller.abort()
    return { children: [] }
  })
  await expect(collectFolderFiles('/chosen', controller.signal)).rejects.toThrow()
  expect(browse).toHaveBeenCalledTimes(1)
  expect(
    filterFolderFiles(
      Array.from({ length: 400 }, (_, i) => ({
        path: `/${i}.md`,
        name: `${i}.md`,
        relativePath: `${i}.md`,
      })),
      '',
    ),
  ).toHaveLength(100)
})
