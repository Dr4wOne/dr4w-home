// The live controller link from the phone: a WebSocket to the hub (GET /api/gamepad/:deviceId), or an
// in-memory virtual console in demo mode. Contract and timings: packages/device-sdk/src/gamepad.ts.
import {
  type GamepadFrame,
  type GamepadOutput,
  type GamepadServerMessage,
  type GamepadWaiting,
  HEARTBEAT_MS,
  NEUTRAL,
} from '@dr4w-home/device-sdk'

export type Pad = Omit<GamepadFrame, 's'>

export type GamepadStatus = {
  /** `closed`: the app closed the session, or the page is hidden (it reopens when visible). */
  state: 'connecting' | 'connected' | 'busy' | 'error' | 'closed'
  output?: GamepadOutput['kind']
  /** Whether the output reaches the console, as the hub last said. */
  outputConnected?: boolean
  /** When it does not: what is missing (`pair`: pair on the console; `down`: the hub's service). */
  outputWaiting?: GamepadWaiting
  /** Phone send to hub acknowledgement, in ms, for the newest acknowledged frame. */
  latencyMs?: number
  detail?: string
}

export interface GamepadSession {
  /** The whole controller as it is now. Sent at once if it changed; repeated as a heartbeat. */
  send(pad: Pad): void
  release(): void
  status(): GamepadStatus
  subscribe(listener: (s: GamepadStatus) => void): () => void
  /** Sends NEUTRAL and closes for good. */
  close(): void
}

const same = (a: Pad, b: Pad) =>
  a.b === b.b && a.lx === b.lx && a.ly === b.ly && a.rx === b.rx && a.ry === b.ry

function statusStore(initial: GamepadStatus) {
  let status = initial
  const listeners = new Set<(s: GamepadStatus) => void>()
  return {
    get: () => status,
    set(next: Partial<GamepadStatus>) {
      status = { ...status, ...next }
      for (const l of listeners) l(status)
    },
    subscribe(l: (s: GamepadStatus) => void) {
      listeners.add(l)
      return () => void listeners.delete(l)
    },
  }
}

type Listens = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>
export type GamepadDeps = {
  WebSocket?: new (url: string) => WebSocket
  win?: Listens
  doc?: Listens & { visibilityState: DocumentVisibilityState }
  now?: () => number
}

const OPEN = 1
const MAX_BACKOFF_MS = 5000

/** `url` is a ws:// or wss:// address. Opens at once and reconnects with backoff until closed. */
export function hubGamepad(url: string, deps: GamepadDeps = {}): GamepadSession {
  const WS = deps.WebSocket ?? globalThis.WebSocket
  const win = deps.win ?? globalThis.window
  const doc = deps.doc ?? globalThis.document
  const now = deps.now ?? (() => performance.now())
  const status = statusStore({ state: 'connecting' })
  let ws: WebSocket | undefined
  let pad: Pad = { ...NEUTRAL }
  let s = 0
  let attempt = 0
  let retry: ReturnType<typeof setTimeout> | undefined
  let beat: ReturnType<typeof setInterval> | undefined
  let closed = false
  let paused = false
  const sentAt = new Map<number, number>()

  const write = (sock: WebSocket, p: Pad) => {
    s += 1
    sentAt.set(s, now())
    if (sentAt.size > 64) sentAt.delete(sentAt.keys().next().value as number)
    sock.send(JSON.stringify({ s, ...p }))
  }
  const flush = () => {
    if (ws?.readyState !== OPEN) return
    // Newest frame wins: while the socket still holds an older frame, skip; the next beat sends the latest.
    if (ws.bufferedAmount > 0) return
    write(ws, pad)
  }

  const open = () => {
    if (closed || paused || ws) return
    if (status.get().state !== 'busy') status.set({ state: 'connecting' })
    const sock = new WS(url)
    ws = sock
    sock.onopen = () => {
      if (ws !== sock) return
      attempt = 0
      s = 0
      sentAt.clear()
      status.set({ state: 'connected', detail: undefined })
      flush()
      beat = setInterval(flush, HEARTBEAT_MS)
    }
    sock.onmessage = (e) => {
      let m: GamepadServerMessage
      try {
        m = JSON.parse(String(e.data))
      } catch {
        return
      }
      if (m?.t === 'ack' && typeof m.s === 'number') {
        const at = sentAt.get(m.s)
        if (at !== undefined) status.set({ latencyMs: Math.round(now() - at) })
        for (const k of sentAt.keys()) if (k <= m.s) sentAt.delete(k)
      } else if (m?.t === 'state')
        status.set({ output: m.output, outputConnected: m.connected, outputWaiting: m.waiting })
      else if (m?.t === 'error')
        status.set({ state: m.reason === 'busy' ? 'busy' : 'error', detail: m.detail ?? m.reason })
    }
    sock.onclose = () => {
      if (ws !== sock) return
      ws = undefined
      clearInterval(beat)
      if (closed || paused) return
      if (status.get().state === 'connected') status.set({ state: 'connecting' })
      retry = setTimeout(open, Math.min(MAX_BACKOFF_MS, 250 * 2 ** attempt++))
    }
  }

  /** Release everything on the console, then drop the socket. */
  const drop = () => {
    clearTimeout(retry)
    clearInterval(beat)
    pad = { ...NEUTRAL }
    const sock = ws
    ws = undefined
    if (sock?.readyState === OPEN) write(sock, pad)
    sock?.close()
  }
  const pause = () => {
    if (paused || closed) return
    paused = true
    drop()
    status.set({ state: 'closed', detail: 'hidden' })
  }
  const resume = () => {
    if (!paused || closed || doc?.visibilityState === 'hidden') return
    paused = false
    attempt = 0
    open()
  }
  const onVisibility = () => (doc?.visibilityState === 'hidden' ? pause() : resume())
  win?.addEventListener('pagehide', pause)
  win?.addEventListener('blur', pause)
  win?.addEventListener('focus', resume)
  doc?.addEventListener('visibilitychange', onVisibility)

  if (WS) open()
  else status.set({ state: 'error', detail: 'This browser has no WebSocket' })

  const send = (p: Pad) => {
    if (same(p, pad)) return
    pad = { ...p }
    flush()
  }
  return {
    send,
    release: () => send(NEUTRAL),
    status: status.get,
    subscribe: status.subscribe,
    close() {
      if (closed) return
      drop()
      closed = true
      win?.removeEventListener('pagehide', pause)
      win?.removeEventListener('blur', pause)
      win?.removeEventListener('focus', resume)
      doc?.removeEventListener('visibilitychange', onVisibility)
      status.set({ state: 'closed', detail: undefined })
    },
  }
}

/** The demo console: holds the newest frame in memory, for the showcase's virtual screen. */
export type VirtualPad = {
  get(): Pad
  subscribe(listener: (p: Pad) => void): () => void
}

export function virtualPad(): VirtualPad & { set(p: Pad): void } {
  let current: Pad = { ...NEUTRAL }
  const listeners = new Set<(p: Pad) => void>()
  return {
    get: () => current,
    set(p) {
      if (same(p, current)) return
      current = { ...p }
      for (const l of listeners) l(current)
    },
    subscribe(l) {
      listeners.add(l)
      return () => void listeners.delete(l)
    },
  }
}

export function demoGamepad(pad: ReturnType<typeof virtualPad>): GamepadSession {
  const status = statusStore({
    state: 'connected',
    output: 'demo',
    outputConnected: true,
    latencyMs: 0,
  })
  let closed = false
  return {
    send: (p) => !closed && pad.set(p),
    release: () => pad.set(NEUTRAL),
    status: status.get,
    subscribe: status.subscribe,
    close() {
      pad.set(NEUTRAL)
      closed = true
      status.set({ state: 'closed' })
    },
  }
}

/** ws:// or wss:// for a path on the page's own origin (or on `base`). */
export const socketUrl = (base: string, path: string, page = globalThis.location?.href) => {
  const u = new URL(`${base}${path}`, page)
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'
  return u.href
}
