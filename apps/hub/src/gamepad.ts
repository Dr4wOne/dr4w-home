// The live controller socket (GET /api/gamepad/:deviceId, docs/api.md). One session per device;
// every frame is a full snapshot, so the hub never queues: stale or excess frames are dropped, and a
// silent or closed socket releases everything within WATCHDOG_MS.
import {
  type GamepadFrame,
  type GamepadOutput,
  type GamepadServerMessage,
  type GamepadWaiting,
  WATCHDOG_MS,
} from '@dr4w-home/device-sdk'
import { GamepadFrameSchema } from '@dr4w-home/device-sdk/schema'

/** 250 frames per second at most; a faster frame waits for the gap and is replaced by newer ones. */
export const MIN_GAP_MS = 4
export const MAX_INVALID = 20
const STATE_POLL_MS = 500

export type Socket = { send(data: string): void; close(code?: number, reason?: string): void }

export class GamepadSessions {
  #active = new Set<string>()

  /** Starts a session, or answers busy and closes when the device already has one. */
  open(deviceId: string, output: GamepadOutput, ws: Socket): GamepadSession | undefined {
    if (this.#active.has(deviceId)) {
      send(ws, { t: 'error', reason: 'busy' })
      ws.close(1013, 'busy')
      return undefined
    }
    this.#active.add(deviceId)
    return new GamepadSession(output, ws, () => this.#active.delete(deviceId))
  }
}

const send = (ws: Socket, m: GamepadServerMessage) => ws.send(JSON.stringify(m))

export class GamepadSession {
  #out: GamepadOutput
  #ws: Socket
  #done: (() => void) | undefined
  #lastS = -1
  #invalid = 0
  #lastWrite = Number.NEGATIVE_INFINITY
  #pending: { frame: GamepadFrame; t0: number } | undefined
  #gap: ReturnType<typeof setTimeout> | undefined
  #watchdog: ReturnType<typeof setTimeout> | undefined
  #poll: ReturnType<typeof setInterval>
  #connected: boolean
  #waiting: GamepadWaiting | undefined

  constructor(output: GamepadOutput, ws: Socket, done: () => void) {
    this.#out = output
    this.#ws = ws
    this.#done = done
    output.sessionStarted?.()
    this.#connected = output.connected()
    this.#waiting = this.#why(this.#connected)
    this.#state()
    this.#poll = setInterval(() => {
      const connected = this.#out.connected()
      const waiting = this.#why(connected)
      if (connected !== this.#connected || waiting !== this.#waiting) {
        this.#connected = connected
        this.#waiting = waiting
        this.#state()
      }
    }, STATE_POLL_MS)
  }

  #why(connected: boolean) {
    return connected ? undefined : this.#out.waiting?.()
  }

  #state() {
    const { kind } = this.#out
    const waiting = this.#waiting
    send(this.#ws, {
      t: 'state',
      connected: this.#connected,
      output: kind,
      ...(waiting && { waiting }),
    })
  }

  message(data: unknown) {
    if (!this.#done) return
    const t0 = performance.now()
    let json: unknown
    try {
      json = typeof data === 'string' ? JSON.parse(data) : undefined
    } catch {}
    const f = GamepadFrameSchema.safeParse(json)
    if (!f.success) {
      send(this.#ws, { t: 'error', reason: 'invalid' })
      if (++this.#invalid >= MAX_INVALID) {
        this.#ws.close(1008, 'invalid')
        this.close()
      }
      return
    }
    this.#invalid = 0
    if (f.data.s <= this.#lastS) return // late or repeated: a newer snapshot already won
    this.#lastS = f.data.s
    clearTimeout(this.#watchdog)
    this.#watchdog = setTimeout(() => this.#release(), WATCHDOG_MS)
    const wait = this.#lastWrite + MIN_GAP_MS - t0
    if (wait > 0) {
      this.#pending = { frame: f.data, t0 }
      this.#gap ??= setTimeout(() => {
        this.#gap = undefined
        const p = this.#pending
        this.#pending = undefined
        if (p) this.#write(p.frame, p.t0)
      }, wait)
      return
    }
    this.#write(f.data, t0)
  }

  #write({ s, ...frame }: GamepadFrame, t0: number) {
    this.#out.send(frame)
    this.#lastWrite = performance.now()
    send(this.#ws, { t: 'ack', s, ms: Math.round((this.#lastWrite - t0) * 100) / 100 })
  }

  #release() {
    clearTimeout(this.#gap)
    this.#gap = undefined
    this.#pending = undefined
    this.#out.release()
  }

  /** Socket closed or failed: release at once and free the device for the next session. */
  close() {
    if (!this.#done) return
    clearTimeout(this.#watchdog)
    clearInterval(this.#poll)
    this.#release()
    this.#out.sessionEnded?.()
    this.#done()
    this.#done = undefined
  }
}
