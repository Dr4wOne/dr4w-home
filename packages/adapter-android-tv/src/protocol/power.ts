// Turning the TV on, from whatever standby it is in (observed 2026-10-16):
// - light standby (first ~10 s): the control port answers, the TV reports power off, but ignores
//   WAKEUP; the next step covers it.
// - deep standby (after ~1 min): the TV leaves the network; a Wake-on-LAN packet switches it on.
import { connect as tcp } from 'node:net'
import { sendWakeOnLan } from './wol.ts'

export function portOpen(host: string, port: number, timeoutMs = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const s = tcp({ host, port })
    const done = (ok: boolean) => {
      s.destroy()
      resolve(ok)
    }
    s.setTimeout(timeoutMs, () => done(false))
    s.once('connect', () => done(true))
    s.once('error', () => done(false))
  })
}

/** Sends Wake-on-LAN until the control port answers; resolves with how long it took, or throws. */
export async function wakeUntilReachable(opts: {
  host: string
  mac: string
  port?: number
  timeoutMs?: number
}): Promise<number> {
  const { host, mac, port = 6466, timeoutMs = 30_000 } = opts
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    if (await portOpen(host, port)) return Date.now() - t0
    await sendWakeOnLan(mac)
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error(`The TV did not wake up within ${timeoutMs / 1000} s`)
}
