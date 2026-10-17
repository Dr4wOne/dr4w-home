// pnpm --filter @dr4w-home/hub latency [--sidecar <socket>]
// Starts the hub's live controller route in-process on a loopback port (demo output by default, or a
// running nxbt sidecar), sends 1000 frames at 60 Hz over a real WebSocket and prints p50/p95/p99 of
// hub receive -> output write (the ack's `ms`) and client send -> ack. Target: p95 below 40 ms.
import { BluetoothSidecarOutput, DemoOutput } from '@dr4w-home/adapter-nintendo-switch'
import type { GamepadServerMessage } from '@dr4w-home/device-sdk'
import WebSocket from 'ws'
import { startTestHub } from '../src/testing.ts'

const FRAMES = 1000
const at = process.argv.indexOf('--sidecar')
const socket = at > 0 ? process.argv[at + 1] : undefined
const output = socket ? new BluetoothSidecarOutput({ path: socket }) : new DemoOutput()
const hub = await startTestHub(output)

const ws = new WebSocket(hub.wsUrl(), { headers: { cookie: hub.cookie, origin: hub.baseUrl } })
await new Promise((resolve, reject) => ws.once('open', resolve).once('error', reject))

const sentAt = new Map<number, number>()
const hubMs: number[] = []
const rtt: number[] = []
ws.on('message', (data) => {
  const m = JSON.parse(String(data)) as GamepadServerMessage
  if (m.t !== 'ack') return
  rtt.push(performance.now() - (sentAt.get(m.s) ?? Number.NaN))
  hubMs.push(m.ms)
})

for (let s = 1; s <= FRAMES; s++) {
  sentAt.set(s, performance.now())
  // Alternate A and a stick sweep, like a person playing.
  ws.send(JSON.stringify({ s, b: s % 2, lx: (s % 201) - 100, ly: 0, rx: 0, ry: 0 }))
  await new Promise((r) => setTimeout(r, 1000 / 60))
}
await new Promise((r) => setTimeout(r, 200))
ws.close()
await hub.close()

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] ?? Number.NaN
}
const row = (name: string, xs: number[]) =>
  `${name.padEnd(28)} p50 ${pct(xs, 50).toFixed(2)} ms  p95 ${pct(xs, 95).toFixed(2)} ms  p99 ${pct(xs, 99).toFixed(2)} ms`
console.log(`output: ${output.kind}, frames sent: ${FRAMES}, acked: ${rtt.length}`)
console.log(row('hub receive -> output write', hubMs))
console.log(row('client send -> ack', rtt))
const ok = rtt.length === FRAMES && pct(rtt, 95) < 40
console.log(ok ? 'PASS: p95 below 40 ms' : 'FAIL: target is p95 below 40 ms with every frame acked')
process.exit(ok ? 0 : 1)
