import { DemoOutput } from '@dr4w-home/adapter-nintendo-switch'
import { mask, NEUTRAL } from '@dr4w-home/device-sdk'
import { afterAll, beforeAll, expect, it } from 'vitest'
import WebSocket from 'ws'
import { startTestHub } from './testing.ts'

const output = new DemoOutput()
let hub: Awaited<ReturnType<typeof startTestHub>>
beforeAll(async () => {
  hub = await startTestHub(output)
})
afterAll(() => hub.close())

const open = (headers: Record<string, string>, deviceId?: string) => {
  const ws = new WebSocket(hub.wsUrl(deviceId), { headers })
  const messages: Record<string, unknown>[] = []
  ws.on('message', (d) => messages.push(JSON.parse(String(d))))
  const ready = new Promise<number>((resolve) => {
    ws.on('open', () => resolve(101))
    ws.on('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0))
    ws.on('error', () => resolve(0))
  })
  return { ws, messages, ready }
}
const until = async (ok: () => boolean) => {
  for (let i = 0; i < 200 && !ok(); i++) await new Promise((r) => setTimeout(r, 5))
  expect(ok()).toBe(true)
}

it('refuses the upgrade without the session cookie or from another origin', async () => {
  expect(await open({ origin: hub.baseUrl }).ready).toBe(403)
  expect(await open({ cookie: hub.cookie, origin: 'https://evil.example' }).ready).toBe(403)
  expect(await open({ cookie: hub.cookie }).ready).toBe(403)
  expect(
    await open({ cookie: hub.cookie, origin: 'http://localhost:5173', host: 'other:5173' }).ready,
  ).toBe(403)
  expect(await open({ cookie: hub.cookie, origin: hub.baseUrl }, 'nope').ready).toBe(404)
})

it('accepts a loopback page served from the same host (dev server proxy)', async () => {
  const c = open({ cookie: hub.cookie, origin: 'http://localhost:5173', host: 'localhost:5173' })
  expect(await c.ready).toBe(101)
  c.ws.close()
  await until(() => c.ws.readyState === WebSocket.CLOSED)
})

it('streams frames to the output, acks them, refuses a second controller, releases on close', async () => {
  const a = open({ cookie: hub.cookie, origin: hub.baseUrl })
  expect(await a.ready).toBe(101)
  await until(() => a.messages.length > 0)
  expect(a.messages[0]).toEqual({ t: 'state', connected: true, output: 'demo' })
  a.ws.send(JSON.stringify({ s: 1, b: mask(['a']), lx: 0, ly: 0, rx: 0, ry: 0 }))
  await until(() => a.messages.some((m) => m.t === 'ack'))
  expect(output.current.b).toBe(mask(['a']))

  const b = open({ cookie: hub.cookie, origin: hub.baseUrl })
  await b.ready
  await until(() => b.messages.length > 0)
  expect(b.messages).toContainEqual({ t: 'error', reason: 'busy' })

  a.ws.close()
  await until(() => output.current.b === 0)
  expect(output.current).toEqual(NEUTRAL)
})
