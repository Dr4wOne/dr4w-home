// One supervised session with a TV: connects, reconnects with backoff when the TV closes it,
// sleeps, reboots or changes IP, and says how fresh its state is.
import { execFile } from 'node:child_process'
import { X509Certificate } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { connect as tlsConnect } from 'node:tls'
import { promisify } from 'node:util'
import {
  AndroidTvRemote,
  CertificateMismatchError,
  type Identity,
  SILENCE_MS,
  type TvState,
} from './protocol/index.ts'

/** What the session needs from a connection; the real one is AndroidTvRemote, tests use a fake. */
export interface Remote {
  state: TvState
  lastFrameAt: number
  connect(): Promise<void>
  sendKey(name: string): void
  launchAppLink(link: string): void
  waitFor(test: (s: TvState) => boolean, ms?: number): Promise<unknown>
  on(event: 'state' | 'close', fn: () => void): unknown
  close(): void
}

export type Log = (level: 'info' | 'error', msg: string, data?: Record<string, unknown>) => void

export interface SessionOptions {
  host: string
  identity: Identity
  pinnedCert: string
  makeRemote?: (host: string) => Remote
  rediscover?: () => Promise<string | undefined>
  onHostChange?: (host: string) => void
  log?: Log
  /** State older than this (no frame from the TV) is not trusted. */
  freshMs?: number
}

const run = promisify(execFile)
const BACKOFF = [500, 1000, 2000, 5000, 10_000, 30_000]

export class TvSession extends EventEmitter<{ change: [] }> {
  host: string
  remote?: Remote
  #opts: SessionOptions
  #failures = 0
  #stopped = true
  #timer?: NodeJS.Timeout
  #log: Log
  constructor(opts: SessionOptions) {
    super()
    this.#opts = opts
    this.host = opts.host
    this.#log = opts.log ?? (() => {})
  }

  /** True when a session is open and the TV has spoken recently. */
  get fresh(): boolean {
    const r = this.remote
    return !!r && Date.now() - r.lastFrameAt <= (this.#opts.freshMs ?? SILENCE_MS)
  }

  start() {
    this.#stopped = false
    void this.#connect()
  }

  stop() {
    this.#stopped = true
    clearTimeout(this.#timer)
    this.remote?.close()
  }

  /** A fresh session before a command: drops a stale one and connects now instead of waiting for backoff. */
  async ensure(): Promise<Remote | undefined> {
    if (this.remote && !this.fresh) {
      this.#log('info', 'tv session stale; reconnecting', { host: this.host })
      this.#drop(this.remote)
    }
    if (this.remote) return this.remote
    clearTimeout(this.#timer)
    await this.#connect()
    return this.remote
  }

  #drop(r: Remote) {
    if (this.remote !== r) return
    this.remote = undefined
    r.close()
    this.emit('change')
  }

  async #connect(): Promise<void> {
    if (this.remote) return
    const make =
      this.#opts.makeRemote ??
      ((host) =>
        new AndroidTvRemote({
          host,
          identity: this.#opts.identity,
          pinnedCert: this.#opts.pinnedCert,
          timeoutMs: 3000,
        }))
    const r = make(this.host)
    try {
      await r.connect()
      this.#failures = 0
      this.remote = r
      r.on('state', () => this.emit('change'))
      r.on('close', () => {
        if (this.remote !== r) return
        this.remote = undefined
        this.#log('info', 'tv session closed', { host: this.host })
        this.emit('change')
        this.#schedule()
      })
      this.#log('info', 'tv session open', { host: this.host })
      this.emit('change')
    } catch (e) {
      r.close()
      this.#failures++
      if (e instanceof CertificateMismatchError)
        this.#log('error', 'tv certificate changed; pair again', { host: this.host })
      else
        this.#log('info', 'tv unreachable', {
          host: this.host,
          error: (e as Error).message,
          attempt: this.#failures,
        })
      // After a failure, look for the TV at another address (DHCP may have moved it).
      if ((this.#failures === 1 || this.#failures % 3 === 0) && this.#opts.rediscover) {
        const found = await this.#opts.rediscover()
        if (found && found !== this.host) {
          this.#log('info', 'tv found at a new address', { from: this.host, to: found })
          this.host = found
          this.#opts.onHostChange?.(found)
        }
      }
      this.emit('change')
      this.#schedule()
    }
  }

  #schedule() {
    if (this.#stopped) return
    clearTimeout(this.#timer)
    const delay = BACKOFF[Math.min(this.#failures, BACKOFF.length - 1)] ?? 30_000
    this.#timer = setTimeout(() => void this.#connect(), delay)
  }
}

/** Does `host` answer on 6466 with exactly the pinned certificate? */
export function isOurTv(host: string, pinnedCert: string, timeoutMs = 1500): Promise<boolean> {
  const want = new X509Certificate(pinnedCert).fingerprint256
  return new Promise((resolve) => {
    const s = tlsConnect({ host, port: 6466, rejectUnauthorized: false, timeout: timeoutMs })
    const done = (v: boolean) => {
      s.destroy()
      resolve(v)
    }
    s.once('secureConnect', () => done(s.getPeerX509Certificate()?.fingerprint256 === want))
    s.once('timeout', () => done(false))
    s.once('error', () => done(false))
  })
}

/** Candidate addresses from passive sources only: the ARP table (by MAC) and the TV's own mDNS
 * announcement (`_androidtvremote2._tcp`). No other device is contacted; the network is never swept. */
export async function candidates(mac?: string): Promise<string[]> {
  const found = new Set<string>()
  if (mac) {
    try {
      const arp = readFileSync('/proc/net/arp', 'utf8')
      for (const line of arp.split('\n').slice(1)) {
        const [ip, , , hw] = line.trim().split(/\s+/)
        if (ip && hw?.toLowerCase() === mac.toLowerCase()) found.add(ip)
      }
    } catch {}
  }
  try {
    const { stdout } = await run('avahi-browse', ['-rpt', '_androidtvremote2._tcp'], {
      timeout: 6000,
    })
    for (const line of stdout.split('\n')) {
      const f = line.split(';')
      if (f[0] === '=' && f[2] === 'IPv4' && f[7]) found.add(f[7])
    }
  } catch {}
  return [...found]
}

/** Finds the TV's current address, verifying the pinned certificate on each candidate. */
export async function rediscoverTv(pinnedCert: string, mac?: string): Promise<string | undefined> {
  for (const host of await candidates(mac)) if (await isOurTv(host, pinnedCert)) return host
  return undefined
}
