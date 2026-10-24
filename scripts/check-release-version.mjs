import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const pkg = JSON.parse(read('package.json'))
const lock = JSON.parse(read('package-lock.json'))
const config = JSON.parse(read('src-tauri/tauri.conf.json'))
const cargo = read('src-tauri/Cargo.toml').match(/^version = "([^"]+)"/m)?.[1]
const cargoLock = read('src-tauri/Cargo.lock').match(/name = "milo"\nversion = "([^"]+)"/)?.[1]
const tag = process.argv[2]
assert.match(pkg.version, /^\d+\.\d+\.\d+$/)
for (const version of [lock.version, lock.packages[''].version, config.version, cargo, cargoLock]) {
  assert.equal(version, pkg.version, 'Milo versions must agree')
}
assert.equal(tag, `v${pkg.version}`, 'Release tag must match the application version')
assert.equal(config.identifier, 'io.github.milo.editor')
assert.equal(config.bundle.macOS.minimumSystemVersion, '13.0')
assert.equal(
  config.bundle.macOS.signingIdentity,
  '-',
  'This prerelease explicitly uses ad-hoc signing',
)
console.log(`${tag}: versions, application identity, macOS minimum and ad-hoc mode agree`)
