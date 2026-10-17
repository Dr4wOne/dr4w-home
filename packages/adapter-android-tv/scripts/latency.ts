// node scripts/latency.ts <state-dir> [n] — n volume steps through the adapter, each confirmed by the
// TV's own report (tap to confirmed effect). Alternates up and down so the volume ends where it began.
// Changes the TV's volume by one step at a time: run it only with the owner's go.
import { AndroidTvAdapter } from '../src/index.ts'

const [dir, count] = process.argv.slice(2)
if (!dir) throw new Error('usage: node scripts/latency.ts <state-dir> [n]')
const n = Number(count ?? 100)
const tv = new AndroidTvAdapter()
await tv.add({ id: 'tv', name: 'TV', stateDir: dir })
await new Promise((r) => setTimeout(r, 2500))
const times: number[] = []
let failures = 0
for (let i = 0; i < n; i++) {
  const r = await tv.execute('tv', { type: 'volume', op: 'step', direction: i % 2 ? 'down' : 'up' })
  if (r.ok) times.push(r.ms)
  else failures++
  await new Promise((res) => setTimeout(res, 150))
}
times.sort((a, b) => a - b)
const q = (p: number) => times[Math.min(times.length - 1, Math.floor((p / 100) * times.length))]
console.log(
  JSON.stringify({ n, confirmed: times.length, failures, p50: q(50), p95: q(95), p99: q(99) }),
)
await tv.close()
process.exit(0)
