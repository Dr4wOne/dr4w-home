// Where live controller input goes. `demo` records frames (tests, demo mode); `bluetooth` hands them
// to the root nxbt sidecar over a Unix socket (apps/hub/sidecar, protocol in docs/protocol.md).
import { createConnection, type Socket } from 'node:net'
import {
  type GamepadFrame,
  type GamepadOutput,
  type GamepadWaiting,
  NEUTRAL,
} from '@dr4w-home/device-sdk'

type Frame = Omit<GamepadFrame, 's'>
export type Log = (level: 'info' | 'error', msg: string, data?: Record<string, unknown>) => void

export class DemoOutput implements GamepadOutput {
  readonly kind = 'demo'
  /** Every frame written, release included as NEUTRAL. */
  readonly frames: Frame[] = []
  #up = false
  async connect() {
    this.#up = true
  }
  send(frame: Frame) {
    this.frames.push({ ...frame })
  }
  release() {
    this.frames.push({ ...NEUTRAL })
  }
  /** The input the console would see right now. */
  get current(): Frame {
    return this.frames.at(-1) ?? NEUTRAL
  }
  async close() {
    this.#up = false
  }
  connected() {
    return this.#up
  }
}

export type SidecarOptions = {
  path: string
  log?: Log
  statusMs?: number
  minBackoffMs?: number
  maxBackoffMs?: number
  /** How long to stay connected after the last phone stops, so a quick reopen does not restart anything. */
  lingerMs?: number
}

/**
 * Talks newline-delimited JSON to the sidecar. Only the newest unsent frame is kept, so a slow
 * socket never queues stale input; `connected()` is true only while the sidecar says the Switch is.
 * Connected only while a phone plays (plus `lingerMs`): with dr4w-home-nxbt.socket installed, connecting
 * starts the sidecar, and the sidecar stops itself once no hub is connected.
 */
export class BluetoothSidecarOutput implements GamepadOutput {
  readonly kind = 'bluetooth'
  #o: Required<Omit<SidecarOptions, 'log'>> & { log?: Log }
  #sock: Socket | undefined
  #pending: string | undefined
  #switch = false
  #closed = true
  #backoff: number
  #retry: ReturnType<typeof setTimeout> | undefined
  #status: ReturnType<typeof setInterval> | undefined
  #down = false
  /** The sidecar answered on this socket. Until then (socket activation: it is still starting) frames wait. */
  #ready = false
  /** Bumped by close(): events from a socket of an earlier connect() are ignored. */
  #gen = 0
  #sessions = 0
  #linger: ReturnType<typeof setTimeout> | undefined

  constructor(opts: SidecarOptions) {
    this.#o = { statusMs: 1000, minBackoffMs: 250, maxBackoffMs: 5000, lingerMs: 30_000, ...opts }
    this.#backoff = this.#o.minBackoffMs
  }

  sessionStarted() {
    this.#sessions++
    clearTimeout(this.#linger)
    void this.connect()
  }

  sessionEnded() {
    if (--this.#sessions > 0) return
    this.#linger = setTimeout(() => void this.close(), this.#o.lingerMs)
    this.#linger.unref?.()
  }

  /** Starts connecting in the background and keeps reconnecting with backoff until close(). */
  async connect() {
    if (!this.#closed) return
    this.#closed = false
    this.#dial()
    // One status request at a time while the sidecar starts: they would only pile up in the socket.
    this.#status = setInterval(
      () => this.#ready && this.#write('{"op":"status"}\n'),
      this.#o.statusMs,
    )
    this.#status.unref?.()
  }

  #dial() {
    const gen = this.#gen
    const sock = createConnection(this.#o.path)
    sock.setEncoding('utf8')
    sock.setNoDelay?.(true)
    let buf = ''
    sock.on('connect', () => {
      if (gen !== this.#gen) return void sock.end() // closed while dialing
      this.#down = false
      this.#ready = false
      this.#sock = sock
      this.#backoff = this.#o.minBackoffMs
      this.#o.log?.('info', 'gamepad sidecar connected', { path: this.#o.path })
      this.#write('{"op":"status"}\n')
      this.#flush()
    })
    sock.on('data', (chunk: string) => {
      if (gen !== this.#gen) return
      buf += chunk
      for (let i = buf.indexOf('\n'); i >= 0; i = buf.indexOf('\n')) {
        this.#line(buf.slice(0, i))
        buf = buf.slice(i + 1)
      }
    })
    sock.on('drain', () => this.#flush())
    sock.on('error', () => {}) // 'close' follows and schedules the retry
    sock.on('close', () => {
      if (gen !== this.#gen) return // a socket close() already let go of
      const was = this.#sock === sock
      if (was) {
        this.#sock = undefined
        this.#pending = undefined // the sidecar released everything when we dropped
        this.#o.log?.('error', 'gamepad sidecar disconnected', { path: this.#o.path })
      }
      this.#switch = false
      this.#down = true
      this.#retry = setTimeout(() => this.#dial(), this.#backoff)
      this.#backoff = Math.min(this.#backoff * 2, this.#o.maxBackoffMs)
    })
  }

  #line(line: string) {
    try {
      const m = JSON.parse(line) as { connected?: unknown; error?: unknown }
      if (typeof m.connected === 'boolean') {
        this.#switch = m.connected
        if (!this.#ready) {
          this.#ready = true
          this.#flush()
        }
      }
      if (m.error) this.#o.log?.('error', 'gamepad sidecar refused a message', { error: m.error })
    } catch {
      this.#o.log?.('error', 'gamepad sidecar sent invalid JSON')
    }
  }

  #write(line: string) {
    if (this.#sock && !this.#sock.writableNeedDrain) this.#sock.write(line)
  }

  #flush() {
    const p = this.#pending
    if (!p || !this.#sock || !this.#ready || this.#sock.writableNeedDrain) return
    this.#pending = undefined
    this.#sock.write(p)
  }

  send(frame: Frame) {
    const { b, lx, ly, rx, ry } = frame
    this.#pending = `${JSON.stringify({ op: 'frame', b, lx, ly, rx, ry })}\n`
    this.#flush()
  }

  /** No socket: the sidecar service is not running. A socket but no Switch: pair on the console. */
  waiting(): GamepadWaiting | undefined {
    if (this.#sock) return !this.#ready ? 'starting' : this.#switch ? undefined : 'pair'
    return this.#down ? 'down' : undefined // undefined: still dialing
  }

  release() {
    this.#pending = '{"op":"release"}\n'
    this.#flush()
  }

  async close() {
    this.#closed = true
    this.#down = false
    clearTimeout(this.#retry)
    clearTimeout(this.#linger)
    clearInterval(this.#status)
    this.#gen++
    const sock = this.#sock
    this.#sock = undefined
    this.#switch = false
    if (!sock) return
    this.#o.log?.('info', 'gamepad sidecar released', { path: this.#o.path })
    sock.write('{"op":"release"}\n')
    await new Promise<void>((r) => sock.end(r))
  }

  connected() {
    return !!this.#sock && this.#switch
  }
}
