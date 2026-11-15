// Local JSONL only. Do not infer pixels, click-to-ready, or percentiles from these marks.
import { readFile } from 'node:fs/promises'
const [file, expectedBuild] = process.argv.slice(2)
if (!file || !expectedBuild)
  throw new Error('Usage: node scripts/summarize-native-profile.mjs FILE BUILD')
const records = (await readFile(file, 'utf8')).trim().split('\n').map(JSON.parse)
const results = []
for (const record of records) {
  if (record.kind === 'process-run' || record.kind === 'native-batch') {
    if (record.dropped) throw new Error(`Dropped native records: ${record.dropped}`)
    results.push(record)
    continue
  }
  if (record.build !== expectedBuild) throw new Error(`Unexpected build: ${record.build}`)
  if (!record.clock) throw new Error('Missing monotonic clock calibration')
  const { frontendToNativeOffsetMs: offset, uncertaintyMs } = record.clock
  if (!Number.isFinite(offset) || !Number.isFinite(uncertaintyMs)) throw new Error('Invalid clock')
  if (record.kind === 'lifecycle' || record.kind === 'frontend') {
    results.push({
      ...record,
      nativeEntryMarksMs: Object.fromEntries(
        Object.entries(record.marks).map(([name, ms]) => [
          name,
          ms + (record.startedMs ?? 0) + offset,
        ]),
      ),
    })
  } else results.push(record)
}
console.log(JSON.stringify(results, null, 2))
