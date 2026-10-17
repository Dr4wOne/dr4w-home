// Control connection on port 6466 (Android TV Remote v2). Answers the TV's handshake and pings,
// turns its pushed messages into state, and sends allow-listed keys and app links.

import { X509Certificate } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { connect, type TLSSocket } from 'node:tls'
import type { Identity } from './certs.ts'
import { keyCode } from './keys.ts'
import { type Decoded, decode, encode, type Field, frame, msg, num, str, unframe } from './proto.ts'

export const CONTROL_PORT = 6466
// Features we announce: ping, key, IME (current app), power, volume, app link. No voice.
const FEATURES = 1 | 2 | 4 | 32 | 64 | 512
const SHORT = 3
const SETTLE_MS = 400
// The TV pings every ~5.2 s. Three missed pings means the session is dead even if the socket looks
// open: a TV going into deep standby leaves the network without closing TCP, and the old bridge kept
// such a half-open session (and its last state) for 14 hours on 2026-10-16.
export const SILENCE_MS = 16_000

export interface TvState {
  power?: boolean
  volume?: { level: number; max: number; muted: boolean }
  app?: string
  model?: string
  vendor?: string
}

export interface Recorded {
  dir: 'in' | 'out'
  t: number
  hex: string
}

export interface ConnectOptions {
  host: string
  identity: Identity
  /** PEM of the TV's certificate from pairing; the connection is refused if it differs. */
  pinnedCert: string
  timeoutMs?: number
  /** Optional sink for raw frames (used to record fixtures). */
  record?: (r: Recorded) => void
  /** Connect to a different port (tests use a local replay server). */
  port?: number
  /** Close the session after this long without any frame from the TV (default SILENCE_MS). */
  silenceMs?: number
}

export class CertificateMismatchError extends Error {}

const DEVICE_INFO: Field[] = [
  [1, 'dr4w'],
  [2, 'dr4w'],
  [3, 1],
  [4, '1'],
  [5, 'atvremote'],
  [6, '1.0.0'],
]

/**
 * What one message from the TV means: a state change, the reply the protocol requires, and whether
 * it completes the handshake. Pure, so recorded sessions can be replayed against it in tests.
 */
export function interpret(d: Decoded): { patch: TvState; reply?: Field[]; active: boolean } {
  const patch: TvState = {}
  let reply: Field[] | undefined
  const configure = msg(d, 1)
  if (configure) {
    const info = msg(configure, 2)
    const model = info && str(info, 1)
    const vendor = info && str(info, 2)
    if (model) patch.model = model
    if (vendor) patch.vendor = vendor
    reply = [
      [
        1,
        [
          [1, FEATURES],
          [2, DEVICE_INFO],
        ],
      ],
    ]
  }
  const active = d.has(2)
  if (active) reply = [[2, [[1, FEATURES]]]]
  const ping = msg(d, 8)
  if (ping) reply = [[9, [[1, num(ping, 1) ?? 0]]]]
  const ime = msg(d, 20)
  const app = ime && str(msg(ime, 1) ?? new Map(), 12)
  if (app) patch.app = app
  const start = msg(d, 40)
  if (start) patch.power = num(start, 1) === 1
  const vol = msg(d, 50)
  if (vol)
    patch.volume = { level: num(vol, 7) ?? 0, max: num(vol, 6) ?? 100, muted: num(vol, 8) === 1 }
  return { patch, ...(reply ? { reply } : {}), active }
}

/** The bytes of a key press, as sent on the wire. */
export const keyFrame = (name: string): Field[] => [
  [
    10,
    [
      [1, keyCode(name)],
      [2, SHORT],
    ],
  ],
]

export class AndroidTvRemote extends EventEmitter<{ state: [TvState]; close: [] }> {
  state: TvState = {}
  /** When the TV last sent anything (ms since epoch); state is only as fresh as this. */
  lastFrameAt = 0
  #socket?: TLSSocket
  #watchdog?: NodeJS.Timeout
  #t0 = Date.now()
  #active = false
  #opts: ConnectOptions
  constructor(opts: ConnectOptions) {
    super()
    this.#opts = opts
  }

  /** Connects and resolves once the TV has accepted us (after its "set active"). */
  connect(): Promise<void> {
    const { host, identity, pinnedCert, timeoutMs = 5000, port = CONTROL_PORT } = this.#opts
    const pinned = new X509Certificate(pinnedCert).fingerprint256
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.destroy()
        reject(new Error(`No answer from the TV at ${host} within ${timeoutMs} ms`))
      }, timeoutMs)
      const socket = connect({
        host,
        port,
        key: identity.key,
        cert: identity.cert,
        rejectUnauthorized: false,
      })
      this.#socket = socket
      socket.setKeepAlive(true, 5000)
      socket.once('secureConnect', () => {
        if (socket.getPeerX509Certificate()?.fingerprint256 !== pinned) {
          clearTimeout(timer)
          socket.destroy()
          reject(
            new CertificateMismatchError('The TV certificate changed since pairing; pair again'),
          )
        }
      })
      let rest = new Uint8Array()
      socket.on('data', (chunk: Buffer) => {
        const out = unframe(Uint8Array.from([...rest, ...chunk]))
        rest = Uint8Array.from(out.rest)
        if (out.frames.length) this.lastFrameAt = Date.now()
        for (const f of out.frames) {
          this.#opts.record?.({
            dir: 'in',
            t: Date.now() - this.#t0,
            hex: Buffer.from(f).toString('hex'),
          })
          if (this.#handle(decode(f)) && !this.#active) {
            // Keys sent before the TV's own start-up burst (power, volume, app) are dropped by the
            // TV (observed 2026-10-16), so ready = power, volume and current app known, or 1.5 s after "set active".
            this.#active = true
            // …and it still drops keys for ~200 ms after that burst (8 traced connections), so settle.
            const ready = () => {
              clearTimeout(grace)
              this.off('state', check)
              setTimeout(() => {
                clearTimeout(timer)
                resolve()
              }, SETTLE_MS)
            }
            const check = (st: TvState) => {
              if (st.power !== undefined && st.volume && st.app) ready()
            }
            const grace = setTimeout(ready, 1500)
            this.on('state', check)
          }
        }
      })
      socket.once('error', (e) => {
        clearTimeout(timer)
        reject(e)
      })
      const silenceMs = this.#opts.silenceMs ?? SILENCE_MS
      this.#watchdog = setInterval(
        () => {
          if (this.lastFrameAt && Date.now() - this.lastFrameAt > silenceMs) socket.destroy()
        },
        Math.min(2000, silenceMs / 2),
      )
      this.#watchdog.unref()
      socket.once('close', () => {
        clearInterval(this.#watchdog)
        this.emit('close')
      })
    })
  }

  #send(fields: Field[]) {
    const body = encode(fields)
    this.#opts.record?.({
      dir: 'out',
      t: Date.now() - this.#t0,
      hex: Buffer.from(body).toString('hex'),
    })
    if (!this.#socket?.writable) throw new Error('Not connected to the TV')
    this.#socket.write(frame(body))
  }

  /** Returns true once the handshake has completed. */
  #handle(d: Decoded): boolean {
    const { patch, reply, active } = interpret(d)
    if (reply) this.#send(reply)
    if (Object.keys(patch).length) this.#update(patch)
    return active || this.#active
  }

  #update(patch: TvState) {
    const clean = Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined),
    ) as TvState
    this.state = { ...this.state, ...clean }
    this.emit('state', this.state)
  }

  /** Sends one allow-listed key press. Throws for anything not on the allow-list. */
  sendKey(name: string) {
    this.#send([
      [
        10,
        [
          [1, keyCode(name)],
          [2, SHORT],
        ],
      ],
    ])
  }

  /** Opens an app by an https:// deep link (e.g. https://www.youtube.com). market:// links make this
   * TV close the session (observed 2026-10-16), so only https:// is accepted. */
  launchAppLink(link: string) {
    if (!/^https:\/\/[\w.-]+(\/[\w.\-/?=&%:]*)?$/.test(link))
      throw new Error('Only https:// app links are allowed')
    this.#send([[90, [[1, link]]]])
  }

  /** Resolves when `test(state)` is true, or rejects after `timeoutMs`. */
  waitFor(test: (s: TvState) => boolean, timeoutMs = 3000): Promise<TvState> {
    if (test(this.state)) return Promise.resolve(this.state)
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        this.off('state', on)
        reject(new Error('The TV did not report the expected state in time'))
      }, timeoutMs)
      const on = (s: TvState) => {
        if (!test(s)) return
        clearTimeout(t)
        this.off('state', on)
        resolve(s)
      }
      this.on('state', on)
    })
  }

  close() {
    clearInterval(this.#watchdog)
    this.#socket?.end()
  }
}
