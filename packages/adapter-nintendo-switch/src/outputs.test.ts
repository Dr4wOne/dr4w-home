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
function fakeSidecar(path: string, connected = true, answering = { now: true }) {
  const lines: unknown[] = []
  const held: Socket[] = [] // status requests not answered yet, as a still-starting sidecar leaves them
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
        if (m.op === 'status') {
          if (answering.now) s.write(`${JSON.stringify({ connected, state: 'connected' })}\n`)
          else held.push(s)
        } else lines.push(m)
      }
    })
  })
  const listening = new Promise<void>((r) => server.listen(path, r))
  const stop = () => {
    for (const s of socks) s.destroy()
    return new Promise<void>((r) => server.close(() => r()))
  }
  /** The sidecar is up: answer what waited, and everything from now on. */
  const answer = () => {
    answering.now = true
    for (const s of held.splice(0))
      s.write(`${JSON.stringify({ connected, state: 'connected' })}\n`)
  }
  return { lines, listening, stop, answer }
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

it('connects only while a phone plays, and lets go after lingerMs', async () => {
  const path = join(dir, `s${n++}.sock`)
  const fake = fakeSidecar(path)
  cleanup.push(fake.stop)
  await fake.listening
  const out = new BluetoothSidecarOutput({ path, minBackoffMs: 10, statusMs: 20, lingerMs: 40 })
  cleanup.push(() => out.close())
  await new Promise((r) => setTimeout(r, 30))
  expect(out.connected()).toBe(false) // nobody plays: the sidecar is not even dialed
  out.sessionStarted()
  await until(() => out.connected())
  out.sessionStarted() // a second phone, then both leave
  out.sessionEnded()
  out.sessionEnded()
  out.sessionStarted() // a quick reopen within lingerMs keeps the connection
  await new Promise((r) => setTimeout(r, 60))
  expect(out.connected()).toBe(true)
  out.sessionEnded()
  await until(() => !out.connected())
  expect(out.waiting()).toBeUndefined() // let go on purpose: not "down"
  out.sessionStarted()
  await until(() => out.connected())
})

it('says "starting" and holds frames back until the sidecar first answers', async () => {
  const path = join(dir, `s${n++}.sock`)
  const answering = { now: false } // socket activation: systemd accepted, the sidecar is starting
  const fake = fakeSidecar(path, true, answering)
  cleanup.push(fake.stop)
  await fake.listening
  const out = new BluetoothSidecarOutput({ path, minBackoffMs: 10, statusMs: 20 })
  cleanup.push(() => out.close())
  out.sessionStarted()
  await until(() => out.waiting() === 'starting')
  out.send(frame(1))
  out.send(frame(2))
  await new Promise((r) => setTimeout(r, 60))
  expect(fake.lines).toEqual([])
  fake.answer()
  await until(() => out.connected())
  await until(() => fake.lines.length > 0)
  expect(fake.lines).toEqual([{ op: 'frame', ...frame(2) }])
})
