import { mkdtempSync, rmSync } from 'node:fs'
import { createServer, type Server, type Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { BluetoothSidecarOutput } from './outputs.ts'

const dir = mkdtempSync(join(tmpdir(), 'dr4w-sidecar-'))
let n = 0
const cleanup: (() => unknown)[] = []
afterEach(async () => {
  for (const f of cleanup.splice(0)) await f()
})
process.on('exit', () => rmSync(dir, { recursive: true, force: true }))

/** A fake sidecar: records every line, answers status with `connected`. */
function fakeSidecar(path: string, connected = true) {
  const lines: unknown[] = []
  const socks: Socket[] = []
  const server: Server = createServer((s) => {
    socks.push(s)
    let buf = ''
    s.setEncoding('utf8')
    s.on('data', (d: string) => {
      buf += d
      for (let i = buf.indexOf('\n'); i >= 0; i = buf.indexOf('\n')) {
        const m = JSON.parse(buf.slice(0, i)) as { op: string }
        buf = buf.slice(i + 1)
        if (m.op === 'status') s.write(`${JSON.stringify({ connected, state: 'connected' })}\n`)
        else lines.push(m)
      }
    })
  })
  const listening = new Promise<void>((r) => server.listen(path, r))
  const stop = () => {
    for (const s of socks) s.destroy()
    return new Promise<void>((r) => server.close(() => r()))
  }
  return { lines, listening, stop }
}

const until = async (ok: () => boolean, ms = 2000) => {
  const end = Date.now() + ms
  while (!ok()) {
    if (Date.now() > end) throw new Error('timed out')
    await new Promise((r) => setTimeout(r, 5))
  }
}
const frame = (b: number) => ({ b, lx: 0, ly: 0, rx: 0, ry: 0 })

it('sends only the newest pending frame and reports the Switch connection', async () => {
  const path = join(dir, `s${n++}.sock`)
  const out = new BluetoothSidecarOutput({ path, minBackoffMs: 10, statusMs: 20 })
  cleanup.push(() => out.close())
  await out.connect()
  out.send(frame(1))
  out.send(frame(2))
  out.send(frame(3)) // the sidecar is not up yet: only this one may arrive
  const fake = fakeSidecar(path)
  cleanup.push(fake.stop)
  await fake.listening
  await until(() => out.connected())
  await until(() => fake.lines.length > 0)
  expect(fake.lines).toEqual([{ op: 'frame', ...frame(3) }])
  out.release()
  await until(() => fake.lines.length === 2)
  expect(fake.lines[1]).toEqual({ op: 'release' })
})

it('reconnects with backoff after the sidecar restarts', async () => {
  const path = join(dir, `s${n++}.sock`)
  let fake = fakeSidecar(path)
  await fake.listening
  const out = new BluetoothSidecarOutput({ path, minBackoffMs: 10, statusMs: 20 })
  cleanup.push(() => out.close())
  await out.connect()
  await until(() => out.connected())
  expect(out.waiting()).toBeUndefined()
  await fake.stop()
  await until(() => !out.connected())
  expect(out.waiting()).toBe('down') // the sidecar service is not running
  fake = fakeSidecar(path)
  cleanup.push(fake.stop)
  await fake.listening
  await until(() => out.connected())
  out.send(frame(5))
  await until(() => fake.lines.length === 1)
  expect(fake.lines[0]).toEqual({ op: 'frame', ...frame(5) })
})

it('is not connected while the sidecar has no Switch', async () => {
  const path = join(dir, `s${n++}.sock`)
  const fake = fakeSidecar(path, false)
  cleanup.push(fake.stop)
  await fake.listening
  const out = new BluetoothSidecarOutput({ path, statusMs: 20 })
  cleanup.push(() => out.close())
  await out.connect()
  await new Promise((r) => setTimeout(r, 60))
  expect(out.connected()).toBe(false)
  expect(out.waiting()).toBe('pair') // the console has to pair on Change Grip/Order
})
