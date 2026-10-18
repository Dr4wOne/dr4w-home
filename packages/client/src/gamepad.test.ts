import { HEARTBEAT_MS, mask, NEUTRAL } from '@dr4w-home/device-sdk'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hubGamepad, socketUrl } from './gamepad.ts'
import { demoSource, hubSource } from './index.ts'

class FakeSocket {
  static all: FakeSocket[] = []
  readyState = 0
  bufferedAmount = 0
  sent: Record<string, number>[] = []
  onopen?: () => void
  onmessage?: (e: { data: string }) => void
  onclose?: () => void
  url: string
  constructor(url: string) {
    this.url = url
    FakeSocket.all.push(this)
  }
  send(data: string) {
    this.sent.push(JSON.parse(data))
  }
  close() {
    this.readyState = 3
    this.onclose?.()
  }
  open() {
    this.readyState = 1
    this.onopen?.()
  }
  say(m: unknown) {
    this.onmessage?.({ data: JSON.stringify(m) })
  }
}
const last = () => FakeSocket.all.at(-1) as FakeSocket

function setup() {
  const win = new EventTarget()
  const doc = Object.assign(new EventTarget(), {
    visibilityState: 'visible' as DocumentVisibilityState,
  })
  let t = 0
  const session = hubGamepad('ws://hub.test/api/gamepad/switch2', {
    WebSocket: FakeSocket as unknown as new (url: string) => WebSocket,
    win,
    doc,
    now: () => t,
  })
  return { session, win, doc, tick: (ms: number) => (t += ms) }
}

beforeEach(() => {
  FakeSocket.all = []
  vi.useFakeTimers()
})
afterEach(() => vi.useRealTimers())

const A = { ...NEUTRAL, b: mask(['a']) }

describe('hub gamepad session', () => {
  it('sends a heartbeat every HEARTBEAT_MS while open, and the frame at once on a change', () => {
    const { session } = setup()
    const ws = last()
    ws.open()
    expect(ws.sent).toHaveLength(1)
    vi.advanceTimersByTime(HEARTBEAT_MS * 5)
    expect(ws.sent).toHaveLength(6)
    session.send(A)
    expect(ws.sent).toHaveLength(7)
    expect(ws.sent.at(-1)).toMatchObject({ b: 1 })
    expect(ws.sent.map((f) => f.s)).toEqual([1, 2, 3, 4, 5, 6, 7])
    session.send(A) // unchanged: no extra frame
    expect(ws.sent).toHaveLength(7)
    session.close()
  })

  it('releases everything and closes when the page is hidden, then reconnects when it is back', () => {
    const { session, doc } = setup()
    const ws = last()
    ws.open()
    session.send(A)
    doc.visibilityState = 'hidden'
    doc.dispatchEvent(new Event('visibilitychange'))
    expect(ws.sent.at(-1)).toMatchObject(NEUTRAL)
    expect(ws.readyState).toBe(3)
    expect(session.status().state).toBe('closed')
    vi.advanceTimersByTime(2000)
    expect(FakeSocket.all).toHaveLength(1)
    doc.visibilityState = 'visible'
    doc.dispatchEvent(new Event('visibilitychange'))
    expect(FakeSocket.all).toHaveLength(2)
    last().open()
    // A new connection starts from neutral and counts from 1 again.
    expect(last().sent).toEqual([{ s: 1, ...NEUTRAL }])
    session.close()
  })

  it('releases on blur and on pagehide too', () => {
    const { session, win } = setup()
    last().open()
    session.send(A)
    win.dispatchEvent(new Event('blur'))
    expect(last().sent.at(-1)).toMatchObject(NEUTRAL)
    win.dispatchEvent(new Event('focus'))
    last().open()
    session.send(A)
    win.dispatchEvent(new Event('pagehide'))
    expect(last().sent.at(-1)).toMatchObject(NEUTRAL)
    session.close()
  })

  it('newest frame wins: nothing queues behind a busy socket or before it opens', () => {
    const { session } = setup()
    const ws = last()
    session.send({ ...NEUTRAL, lx: 10 })
    session.send({ ...NEUTRAL, lx: 20 })
    session.send({ ...NEUTRAL, lx: 30 })
    ws.open()
    expect(ws.sent).toEqual([{ s: 1, ...NEUTRAL, lx: 30 }])
    ws.bufferedAmount = 120
    session.send({ ...NEUTRAL, lx: 40 })
    session.send({ ...NEUTRAL, lx: 50 })
    vi.advanceTimersByTime(HEARTBEAT_MS)
    expect(ws.sent).toHaveLength(1)
    ws.bufferedAmount = 0
    vi.advanceTimersByTime(HEARTBEAT_MS)
    expect(ws.sent.at(-1)).toEqual({ s: 2, ...NEUTRAL, lx: 50 })
    session.close()
  })

  it('reports latency from acks, the output, and busy; reconnects with backoff', () => {
    const { session, tick } = setup()
    const seen: string[] = []
    session.subscribe((s) => seen.push(s.state))
    const ws = last()
    ws.open()
    tick(12)
    ws.say({ t: 'ack', s: 1, ms: 3 })
    ws.say({ t: 'state', connected: true, output: 'bluetooth' })
    expect(session.status()).toMatchObject({
      state: 'connected',
      latencyMs: 12,
      output: 'bluetooth',
      outputConnected: true,
    })
    ws.say({ t: 'error', reason: 'busy' })
    ws.close()
    expect(session.status().state).toBe('busy')
    vi.advanceTimersByTime(249)
    expect(FakeSocket.all).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(FakeSocket.all).toHaveLength(2)
    last().close()
    vi.advanceTimersByTime(499)
    expect(FakeSocket.all).toHaveLength(2)
    vi.advanceTimersByTime(1)
    expect(FakeSocket.all).toHaveLength(3)
    // Still busy while retrying; connected once a socket opens.
    expect(session.status().state).toBe('busy')
    last().open()
    expect(session.status().state).toBe('connected')
    session.close()
    expect(last().sent.at(-1)).toMatchObject(NEUTRAL)
    vi.advanceTimersByTime(10_000)
    expect(FakeSocket.all).toHaveLength(3)
    expect(seen).toContain('busy')
  })

  it('clears "refused" once input is acknowledged again, and passes on why the console waits', () => {
    const { session } = setup()
    const ws = last()
    ws.open()
    ws.say({ t: 'state', connected: false, output: 'bluetooth', waiting: 'starting' })
    expect(session.status()).toMatchObject({ outputConnected: false, outputWaiting: 'starting' })
    ws.say({ t: 'error', reason: 'invalid' })
    expect(session.status().state).toBe('error')
    ws.say({ t: 'ack', s: 1, ms: 1 })
    expect(session.status()).toMatchObject({ state: 'connected', detail: undefined })
    session.close()
  })

  it('builds the socket address on the page origin', () => {
    expect(socketUrl('', '/api/gamepad/sw', 'https://hub.test/x')).toBe(
      'wss://hub.test/api/gamepad/sw',
    )
    expect(socketUrl('', '/api/gamepad/sw', 'http://127.0.0.1:8790/')).toBe(
      'ws://127.0.0.1:8790/api/gamepad/sw',
    )
  })
})

describe('demo gamepad and profiles', () => {
  it('drives the virtual console in memory and keeps layouts in storage', async () => {
    const m = new Map<string, string>()
    const s = demoSource({
      speed: 0,
      storage: () => ({ getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) }),
    })
    const session = s.gamepad('switch2')
    session.send(A)
    expect(s.pad.get().b).toBe(1)
    session.close()
    expect(s.pad.get()).toEqual(NEUTRAL)

    const p = { id: 'mine', name: 'Mine', controls: [] }
    await s.saveProfile(p)
    await s.saveProfile({ ...p, name: 'Renamed' })
    expect(await s.listProfiles()).toEqual([{ ...p, name: 'Renamed' }])
    await s.deleteProfile('mine')
    expect(await s.listProfiles()).toEqual([])
  })

  it('survives storage that throws, and ignores malformed saved layouts', async () => {
    const broken = demoSource({
      storage: () => {
        throw new Error('blocked')
      },
    })
    await broken.saveProfile({ id: 'mine', name: 'Mine', controls: [] })
    expect((await broken.listProfiles()).map((p) => p.id)).toEqual(['mine'])
    const junk = demoSource({
      storage: () => ({
        getItem: () => JSON.stringify([{ id: 'BAD id' }, { id: 'ok', name: 'Ok', controls: [] }]),
        setItem: () => {},
      }),
    })
    expect((await junk.listProfiles()).map((p) => p.id)).toEqual(['ok'])
  })

  it('uses the hub profiles API with the CSRF header', async () => {
    const seen: { url: string; method?: string }[] = []
    const hub = hubSource('', async (url, init) => {
      seen.push({ url: String(url), method: init?.method })
      return init?.method === 'DELETE'
        ? new Response(null, { status: 204 })
        : new Response(JSON.stringify([{ id: 'a', name: 'A', controls: [] }, { id: 'x' }]))
    })
    expect(await hub.listProfiles()).toEqual([{ id: 'a', name: 'A', controls: [] }])
    await hub.saveProfile({ id: 'a', name: 'A', controls: [] })
    await hub.deleteProfile('a')
    expect(seen).toEqual([
      { url: '/api/controller-profiles', method: undefined },
      { url: '/api/controller-profiles/a', method: 'PUT' },
      { url: '/api/controller-profiles/a', method: 'DELETE' },
    ])
  })
})
