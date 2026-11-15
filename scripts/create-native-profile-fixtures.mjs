// Disposable repeatable inputs; no user data and no changes to release settings.
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { samples, describeSample } from './performanceSamples.mjs'
const output = resolve(
  process.argv[2] || process.env.MILO_FIXTURES_DIR || '.tmp/milo-native-review',
)
const writeFixture = (path, data) => writeFile(path, data, { flag: 'wx' })
await mkdir(`${output}/tabs`, { recursive: true })
await mkdir(`${output}/assets`, { recursive: true })
const manifest = {
  generatedBy: 'scripts/create-native-profile-fixtures.mjs',
  home: { bytes: 0, editors: 0 },
  tabCounts: [1, 5, 10, 20],
  tabPhases: ['restored', 'visited', 'edited', 'closed'],
  files: [],
}
for (const [name, markdown] of Object.entries(samples)) {
  await writeFixture(`${output}/${name}.md`, markdown)
  manifest.files.push(describeSample(`${name}.md`, markdown))
}
const image = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0ZkAAAAASUVORK5CYII=',
  'base64',
)
for (let i = 0; i < 80; i++) await writeFixture(`${output}/assets/image-${i}.png`, image)
for (let i = 1; i <= 20; i++)
  await writeFixture(`${output}/tabs/${String(i).padStart(2, '0')}.md`, samples['small-mixed'])
await writeFixture(`${output}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n')
console.log(JSON.stringify(manifest, null, 2))
