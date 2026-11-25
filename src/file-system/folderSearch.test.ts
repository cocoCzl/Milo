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
        snapshotId: 'chosen-snapshot',
      }
    if (path === '/chosen') return { children: [file('/chosen/other.md')], nextOffset: null }
    return { children: [file('/chosen/nested/file.md')], nextOffset: null }
  })
  const result = await collectFolderFiles('/chosen', new AbortController().signal)
  expect(result.truncated).toBe(false)
  expect(result.files.map((f) => f.relativePath)).toEqual(['中文.md', 'other.md', 'nested/file.md'])
  expect(browse.mock.calls).toEqual([
    ['/chosen', false, 0],
    ['/chosen', false, 200, 'chosen-snapshot'],
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

it('continues other directories after a later page fails and reports incomplete results', async () => {
  const file = (path: string) => ({
    path,
    name: path.split('/').at(-1),
    isDirectory: false,
    children: [],
  })
  browse
    .mockResolvedValueOnce({
      children: [{ ...file('/chosen/nested'), isDirectory: true }, file('/chosen/first.md')],
      nextOffset: 200,
    })
    .mockRejectedValueOnce(new Error('page unavailable'))
    .mockResolvedValueOnce({ children: [file('/chosen/nested/目标.md')], nextOffset: null })
  const publish = vi.fn()
  const result = await collectFolderFiles('/chosen', new AbortController().signal, publish)
  expect(result.incomplete).toBe(true)
  expect(result.files.map((f) => f.name)).toEqual(['first.md', '目标.md'])
  expect(publish).toHaveBeenCalledTimes(3)
})

const match = (relativePath: string) => ({
  path: `/root/${relativePath}`,
  relativePath,
  name: relativePath.split('/').at(-1)!,
})

it('ranks the best 100 from all scanned candidates, with deterministic path ties', () => {
  const weak = Array.from({ length: 180 }, (_, i) => match(`target/${i}.md`))
  const best = [
    match('z/target.md'),
    match('a/target.markdown'),
    match('target-prefix.md'),
    match('my-target.md'),
  ]
  const ranked = filterFolderFiles([...weak, ...best], 'TARGET')
  expect(ranked).toHaveLength(100)
  expect(ranked.slice(0, 4)).toEqual([best[1], best[0], best[2], best[3]])
  expect(filterFolderFiles([...best, ...weak].reverse(), 'target')).toEqual(ranked)
  expect(filterFolderFiles(best, 'target.md')[0]).toBe(best[0])
})

it('preserves multiword path matching, preferring all filename words over path-only matches', () => {
  const paths = [match('draft/notes.md'), match('notes-draft.md'), match('draft notes.md')]
  expect(filterFolderFiles(paths, ' DRAFT   notes ')).toEqual([paths[2], paths[1], paths[0]])
  expect(filterFolderFiles(paths, 'notes draft')).toEqual([paths[2], paths[1], paths[0]])
})

it('publishes immutable deltas, deduplicates once and keeps snapshot continuations', async () => {
  const node = (path: string) => ({ ...match(path), isDirectory: false, children: [] })
  browse
    .mockResolvedValueOnce({
      children: [node('one.md')],
      nextOffset: 200,
      snapshotId: 'snap',
    })
    .mockResolvedValueOnce({
      children: [node('one.md'), node('two.md')],
      nextOffset: null,
      snapshotId: 'snap',
    })
  const batches: string[][] = []
  const result = await collectFolderFiles('/root', new AbortController().signal, (batch) => {
    batches.push(batch.files.map((f) => f.name))
  })
  expect(batches).toEqual([['one.md'], ['two.md']])
  expect(result.files.map((f) => f.name)).toEqual(['one.md', 'two.md'])
  expect(browse.mock.calls[1]).toEqual(['/root', false, 200, 'snap'])
})
