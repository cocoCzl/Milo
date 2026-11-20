// Read-only sampling of an explicitly named disposable app, never a broad process-name match.
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'

const [mode, baselineFile, appPath, outputPrefix] = process.argv.slice(2)
const requestedAt = new Date().toISOString()
const requestedMonotonic = performance.now()
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
  const tempRoots = await Promise.all([realpath(tmpdir()), realpath('/tmp')])
  if (!tempRoots.some((root) => app.startsWith(`${root}/`)) || !app.endsWith('.app'))
    throw new Error(
      `Only an explicitly named disposable .app under ${tempRoots.join(' or ')} is accepted`,
    )
  const before = JSON.parse(await readFile(baselineFile, 'utf8'))
  const current = processes()
  const main = Object.keys(current).filter((pid) => current[pid] === `${app}/Contents/MacOS/milo`)
  if (main.length !== 1 || main[0] in before)
    throw new Error('Expected one newly launched isolated main process')
  const membershipFile = `${baselineFile}.members.json`
  let membership
  try {
    membership = JSON.parse(await readFile(membershipFile, 'utf8'))
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  const web = membership
    ? Object.keys(membership.processes).filter((pid) => pid !== main[0])
    : Object.keys(current).filter(
        (pid) =>
          !(pid in before) &&
          current[pid].includes('/WebKit.framework/') &&
          /\.WebKit\.(WebContent|GPU|Networking)$/.test(current[pid]),
      )
  if (web.length !== 3)
    throw new Error(`Ambiguous app/WebKit processes: ${JSON.stringify({ main, web })}`)
  const kinds = new Set(web.map((pid) => current[pid]?.split('.').at(-1)))
  if (kinds.size !== 3 || kinds.has(undefined))
    throw new Error('An isolated WebKit process exited or its identity changed')
  const pids = [...main, ...web]
  const starts = Object.fromEntries(
    execFileSync('ps', ['-p', pids.join(','), '-o', 'pid=,lstart='], { encoding: 'utf8' })
      .trim()
      .split('\n')
      .map((line) => {
        const [, pid, started] = line.match(/^\s*(\d+)\s+(.+)$/)
        return [pid, started.trim()]
      }),
  )
  if (membership) {
    if (membership.app !== app || membership.main !== main[0])
      throw new Error('Sampler membership belongs to another app instance')
    for (const pid of pids)
      if (membership.processes[pid] !== current[pid] || membership.starts[pid] !== starts[pid])
        throw new Error(`Process identity changed: ${pid}`)
  } else {
    membership = {
      app,
      main: main[0],
      at: new Date().toISOString(),
      processes: Object.fromEntries(pids.map((pid) => [pid, current[pid]])),
      starts,
    }
    await writeFile(membershipFile, JSON.stringify(membership, null, 2), { flag: 'wx' })
  }
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
  const footprintStartedAt = new Date().toISOString()
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
  const footprintFinishedAt = new Date().toISOString()
  await writeFile(
    `${outputPrefix}-timing.json`,
    JSON.stringify(
      {
        requestedAt,
        footprintStartedAt,
        footprintFinishedAt,
        beforeVmmapMs: performance.now() - requestedMonotonic,
      },
      null,
      2,
    ),
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
