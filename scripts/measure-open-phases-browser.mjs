// Production profiling build recommended: dev StrictMode discards the first
// effect's profile. Native IPC is simulated; never treat these as disk timings.
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { open, browser, output, errors } from './browserHarness.mjs'
import { samples, describeSample } from './performanceSamples.mjs'
const results = []
try {
  for (const name of ['small-mixed', 'plain-1mb', 'code', 'structured-1mb']) {
    const page = await open({ content: samples[name] })
    await page.waitForFunction(() =>
      window.__miloOutlineTest.profiles.some((p) => p.phase === 'ready'),
    )
    const profiles = await page.evaluate(() => window.__miloOutlineTest.profiles)
    const ready = profiles.find((p) => p.phase === 'ready')
    assert(ready.entries.some((e) => e.stage === 'milkdown-parse'))
    assert(ready.entries.some((e) => e.stage === 'safety-parse'))
    results.push({ fixture: describeSample(name, samples[name]), ...ready })
    await page.close()
  }
  assert.deepEqual(errors, [])
  await writeFile(
    `${output}/open-phases.json`,
    JSON.stringify(
      {
        engine: browser.version(),
        mode: 'production profiling build; Chromium; simulated native IPC; one sample per fixture, not a native budget or percentile',
        results,
      },
      null,
      2,
    ) + '\n',
  )
  console.log(
    results.map((result) => ({
      sample: result.fixture.name,
      entries: result.entries,
      marks: result.marks,
    })),
  )
} finally {
  await browser.close()
}
