// Read-only sampling of an explicitly named disposable app, never a broad process-name match.
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const [mode, baselineFile, appPath, outputPrefix] = process.argv.slice(2)
const processes = () =>
  Object.fromEntries(
    execFileSync('ps', ['-axo', 'pid=,comm='], { encoding: 'utf8' })
      .trim()
      .split('\n')
      .map((line) => {
        const [, pid, path] = line.match(/^\s*(\d+)\s+(.+)$/)
        return [pid, path]
      }),
  )
if (!baselineFile || !['baseline', 'sample'].includes(mode))
  throw new Error('Usage: baseline BASELINE.json | sample BASELINE.json TEMP_APP.app OUTPUT_PREFIX')
if (mode === 'baseline') {
  await mkdir(dirname(resolve(baselineFile)), { recursive: true })
  await writeFile(baselineFile, JSON.stringify(processes(), null, 2), { flag: 'wx' })
} else {
  if (!appPath || !outputPrefix) throw new Error('Missing app or output prefix')
  const app = await realpath(appPath)
  if (!app.startsWith('/private/tmp/') || !app.endsWith('.app'))
    throw new Error('Only an explicitly named disposable .app under /private/tmp is accepted')
  const before = JSON.parse(await readFile(baselineFile, 'utf8'))
  const current = processes()
  const main = Object.keys(current).filter((pid) => current[pid] === `${app}/Contents/MacOS/milo`)
  const web = Object.keys(current).filter(
    (pid) =>
      !(pid in before) &&
      current[pid].includes('/WebKit.framework/') &&
      /\.WebKit\.(WebContent|GPU|Networking)$/.test(current[pid]),
  )
  if (main.length !== 1 || web.length !== 3)
    throw new Error(`Ambiguous app/WebKit processes: ${JSON.stringify({ main, web })}`)
  if (main[0] in before) throw new Error('App was already running when baseline was recorded')
  const kinds = new Set(web.map((pid) => current[pid].split('.').at(-1)))
  if (kinds.size !== 3)
    throw new Error('Expected exactly one WebContent, GPU and Networking process')
  const pids = [...main, ...web]
  await mkdir(dirname(resolve(outputPrefix)), { recursive: true })
  await writeFile(
    `${outputPrefix}-identity.json`,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        app,
        processes: Object.fromEntries(pids.map((pid) => [pid, current[pid]])),
      },
      null,
      2,
    ),
  )
  await writeFile(
    `${outputPrefix}-ps.txt`,
    execFileSync('ps', ['-p', pids.join(','), '-o', 'pid,ppid,rss,%cpu,comm']),
  )
  await writeFile(
    `${outputPrefix}-footprint.txt`,
    execFileSync('footprint', [
      '-f',
      'bytes',
      '-j',
      `${outputPrefix}-footprint.json`,
      ...pids.flatMap((pid) => ['-p', pid]),
    ]),
  )
  for (const pid of pids)
    await writeFile(`${outputPrefix}-${pid}-vmmap.txt`, execFileSync('vmmap', ['-summary', pid]))
  const sample = JSON.parse(await readFile(`${outputPrefix}-footprint.json`, 'utf8'))
  console.log(
    JSON.stringify(
      {
        processes: sample.processes.map(({ name, pid, footprint }) => ({ name, pid, footprint })),
        totalFootprint: sample['total footprint'],
      },
      null,
      2,
    ),
  )
}
