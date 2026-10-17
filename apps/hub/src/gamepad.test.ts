import { DemoOutput } from '@dr4w-home/adapter-nintendo-switch'
import { mask, NEUTRAL, WATCHDOG_MS } from '@dr4w-home/device-sdk'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GamepadSessions, MAX_INVALID } from './gamepad.ts'

function fakeSocket() {
  const sent: Record<string, unknown>[] = []
  let closed: number | undefined
  return {
    sent,
    closed: () => closed,
    send: (d: string) => sent.push(JSON.parse(d)),
    close: (code?: number) => {
      closed = code ?? 1000
    },
  }
}
const frame = (s: number, b = 0, lx = 0) => JSON.stringify({ s, b, lx, ly: 0, rx: 0, ry: 0 })

async function start() {
  const out = new DemoOutput()
  await out.connect()
  const ws = fakeSocket()
  const session = new GamepadSessions().open('switch2', out, ws)
  if (!session) throw new Error('no session')
  return { out, ws, session }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('live controller session', () => {
  it('says its state on connect, applies frames and acks them', async () => {
    const { out, ws, session } = await start()
    expect(ws.sent[0]).toEqual({ t: 'state', connected: true, output: 'demo' })
    session.message(frame(1, mask(['a']), 50))
    expect(out.current).toEqual({ b: mask(['a']), lx: 50, ly: 0, rx: 0, ry: 0 })
    expect(ws.sent[1]).toMatchObject({ t: 'ack', s: 1 })
    session.close()
  })

  it('ignores frames that are not newer than the last one', async () => {
    const { out, session } = await start()
    session.message(frame(5, mask(['b'])))
    vi.advanceTimersByTime(10)
    session.message(frame(4, mask(['a'])))
    session.message(frame(5, mask(['a'])))
    expect(out.frames).toEqual([{ ...NEUTRAL, b: mask(['b']) }])
    session.close()
  })

  it('answers invalid frames and closes after 20 in a row', async () => {
    const { out, ws, session } = await start()
    session.message('{"s":1,"b":0}')
    session.message('not json')
    expect(ws.sent.slice(1)).toEqual([
      { t: 'error', reason: 'invalid' },
      { t: 'error', reason: 'invalid' },
    ])
    session.message(frame(1)) // a valid frame resets the count
    for (let i = 0; i < MAX_INVALID - 1; i++) session.message('{}')
    expect(ws.closed()).toBeUndefined()
    session.message('{}')
    expect(ws.closed()).toBe(1008)
    expect(out.current).toEqual(NEUTRAL)
  })

  it('lets one session per device and frees it when that one closes', async () => {
    const sessions = new GamepadSessions()
    const out = new DemoOutput()
    const first = sessions.open('switch2', out, fakeSocket())
    const second = fakeSocket()
    expect(sessions.open('switch2', out, second)).toBeUndefined()
    expect(second.sent).toEqual([{ t: 'error', reason: 'busy' }])
    expect(second.closed()).toBe(1013)
    first?.close()
    const third = sessions.open('switch2', out, fakeSocket())
    expect(third).toBeDefined()
    third?.close()
  })

  it('drops frames above 250 per second and keeps the newest', async () => {
    const { out, ws, session } = await start()
    session.message(frame(1, 1))
    session.message(frame(2, 2))
    session.message(frame(3, 3))
    expect(out.frames.map((f) => f.b)).toEqual([1])
    vi.advanceTimersByTime(4)
    expect(out.frames.map((f) => f.b)).toEqual([1, 3])
    expect(ws.sent.filter((m) => m.t === 'ack').map((m) => m.s)).toEqual([1, 3])
    session.close()
  })
})

describe('watchdog', () => {
  it('releases every button at most 100 ms after the last frame', async () => {
    const { out, session } = await start()
    session.message(frame(1, mask(['a', 'zr']), 100))
    vi.advanceTimersByTime(WATCHDOG_MS - 1)
    expect(out.current.b).not.toBe(0)
    vi.advanceTimersByTime(1)
    expect(WATCHDOG_MS).toBeLessThanOrEqual(100)
    expect(out.current).toEqual(NEUTRAL)
    session.close()
  })

  it('keeps holding while heartbeats arrive', async () => {
    const { out, session } = await start()
    for (let s = 1; s <= 10; s++) {
      session.message(frame(s, mask(['a'])))
      vi.advanceTimersByTime(40)
    }
    expect(out.frames.every((f) => f.b === mask(['a']))).toBe(true)
    session.close()
  })

  it('releases at once when the socket closes', async () => {
    const { out, session } = await start()
    session.message(frame(1, mask(['a'])))
    session.close()
    expect(out.current).toEqual(NEUTRAL)
    vi.advanceTimersByTime(1000)
    expect(out.frames).toHaveLength(2)
  })

  it('leaves nothing stuck after a Wi-Fi blip', async () => {
    const { out, session } = await start()
    session.message(frame(1, mask(['a']), 80))
    vi.advanceTimersByTime(300) // nothing arrives
    expect(out.current).toEqual(NEUTRAL)
    session.message(frame(2, mask(['a']), 80)) // a frame sent during the blip, delivered late
    session.message(frame(3)) // the phone's current state: nothing pressed
    vi.advanceTimersByTime(4)
    expect(out.current).toEqual(NEUTRAL)
    session.message(frame(2, mask(['a']))) // a duplicate of the late frame
    vi.advanceTimersByTime(WATCHDOG_MS)
    expect(out.current).toEqual(NEUTRAL)
    session.close()
  })
})
