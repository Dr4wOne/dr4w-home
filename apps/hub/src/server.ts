// The hub's API and web app on the home network (docs/api.md). Everything under /api needs the
// session cookie, which a phone gets once from a single-use link minted on the hub machine itself.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  CommandRequestSchema,
  ControllerProfileSchema,
  IdSchema,
} from '@dr4w-home/device-sdk/schema'
import { upgradeWebSocket } from '@hono/node-server'
import { getConnInfo } from '@hono/node-server/conninfo'
import { serveStatic } from '@hono/node-server/serve-static'
import { type Context, Hono } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import { streamSSE } from 'hono/streaming'
import { type GamepadSession, GamepadSessions } from './gamepad.ts'
import { log } from './log.ts'
import type { ProfileStore } from './profiles.ts'
import type { Registry } from './registry.ts'

const COOKIE = 'dr4w_home'
const LINK_TTL_MS = 10 * 60_000
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

export interface ServerDeps {
  registry: Registry
  /** Saved controller layouts (controller-profiles.json next to the config). */
  profiles: ProfileStore
  /** Secret the session cookie is derived from (state dir, mode 0600). */
  secret: Buffer
  /** The hub's address as the phone sees it, used in sign-in links. */
  baseUrl: string
  version: string
  /** Built web app (apps/web/dist); served with an SPA fallback when present. */
  webDir?: string
  clientIp?: (c: Context) => string | undefined
  pingMs?: number
}

/**
 * Proof that a request to /admin/link comes from the hub machine's own CLI: an HMAC of the hub
 * secret, which only the hub's user can read. Loopback alone is not enough, because a reverse proxy
 * on the same machine (`tailscale serve`) forwards every tailnet request from 127.0.0.1.
 */
export const adminProof = (secret: Buffer) =>
  createHmac('sha256', secret).update('dr4w-home-admin-v1').digest('base64url')
const PROXY_HEADERS = [
  'x-forwarded-for',
  'forwarded',
  'x-forwarded-host',
  'tailscale-user-login',
  'tailscale-funnel-request',
]

export function createApp(deps: ServerDeps) {
  const { registry, baseUrl } = deps
  const ip = deps.clientIp ?? ((c: Context) => getConnInfo(c).remote.address)
  const sessionValue = createHmac('sha256', deps.secret)
    .update('dr4w-home-session-v1')
    .digest('base64url')
  const links = new Map<string, number>() // single-use token → expiry
  const hits = new Map<string, { n: number; t: number }>()
  const app = new Hono()

  app.onError((e, c) => {
    log('error', 'unhandled', { error: e.message, path: c.req.path })
    return c.json({ error: 'internal' }, 500)
  })

  // 60 requests per 10 s per address (holding volume up is about 5 a second).
  app.use('*', async (c, next) => {
    const key = ip(c) ?? 'unknown'
    const now = Date.now()
    const h = hits.get(key)
    if (!h || now - h.t > 10_000) hits.set(key, { n: 1, t: now })
    else if (++h.n > 60) return c.json({ error: 'rate_limited' }, 429)
    await next()
  })

  const signedIn = (c: Context) => {
    const got = Buffer.from(getCookie(c, COOKIE) ?? '')
    const want = Buffer.from(sessionValue)
    return got.length === want.length && timingSafeEqual(got, want)
  }

  app.get('/health', (c) => c.json({ ok: true, version: deps.version, signedIn: signedIn(c) }))

  app.post('/admin/link', (c) => {
    const proof = Buffer.from(c.req.header('x-dr4w-admin') ?? '')
    const want = Buffer.from(adminProof(deps.secret))
    const proxied = PROXY_HEADERS.some((h) => c.req.header(h) !== undefined)
    if (
      !LOOPBACK.has(ip(c) ?? '') ||
      proxied ||
      proof.length !== want.length ||
      !timingSafeEqual(proof, want)
    )
      return c.json({ error: 'forbidden' }, 403)
    const token = randomBytes(18).toString('base64url')
    links.set(token, Date.now() + LINK_TTL_MS)
    return c.json({ url: `${baseUrl}/pair?t=${token}`, expiresInMinutes: LINK_TTL_MS / 60_000 })
  })

  app.get('/pair', (c) => {
    const t = c.req.query('t') ?? ''
    const exp = links.get(t)
    links.delete(t)
    if (!exp || exp < Date.now())
      return c.text(
        'This link has expired or was already used. On the hub, run: pnpm --filter @dr4w-home/hub cli link',
        403,
      )
    setCookie(c, COOKIE, sessionValue, {
      httpOnly: true,
      sameSite: 'Strict',
      path: '/',
      maxAge: 365 * 86_400,
      secure: baseUrl.startsWith('https:'),
    })
    log('info', 'phone signed in', { ip: ip(c) })
    return c.redirect('/')
  })

  app.use('/api/*', async (c, next) => {
    if (!signedIn(c)) return c.json({ error: 'forbidden' }, 403)
    // CSRF guard: a form on another site cannot set this header.
    if (c.req.method !== 'GET' && c.req.header('x-dr4w-client') !== '1')
      return c.json({ error: 'forbidden' }, 403)
    await next()
  })

  /**
   * Browsers cannot add headers to a WebSocket, so the live controller socket checks Origin instead
   * of x-dr4w-client: the hub's own address, or a loopback page served from the same host (dev).
   */
  const ownOrigin = new URL(baseUrl).origin
  const sameOrigin = (c: Context) => {
    const origin = c.req.header('origin')
    if (!origin) return false
    if (origin === ownOrigin) return true
    try {
      const u = new URL(origin)
      return LOOPBACK_HOSTS.has(u.hostname) && u.host === c.req.header('host')
    } catch {
      return false
    }
  }
  const sessions = new GamepadSessions()

  app.get('/api/gamepad/:id', async (c, next) => {
    if (!sameOrigin(c)) return c.json({ error: 'forbidden' }, 403)
    if (c.req.header('upgrade')?.toLowerCase() !== 'websocket')
      return c.json({ error: 'upgrade_required' }, 426)
    const id = IdSchema.safeParse(c.req.param('id'))
    const output = id.success ? registry.gamepad(id.data) : undefined
    if (!id.success || !output) return c.json({ error: 'not_found' }, 404)
    let session: GamepadSession | undefined
    const upgrade = upgradeWebSocket(() => ({
      onOpen: (_e, ws) => {
        session = sessions.open(id.data, output, ws)
        log('info', session ? 'gamepad session started' : 'gamepad session refused: busy', {
          deviceId: id.data,
        })
      },
      onMessage: (e) => session?.message(e.data),
      onClose: () => {
        if (session) log('info', 'gamepad session ended', { deviceId: id.data })
        session?.close()
      },
      onError: () => session?.close(),
    }))
    return (await upgrade(c, next)) ?? c.json({ error: 'internal' }, 500)
  })

  app.get('/api/controller-profiles', (c) => c.json(deps.profiles.list()))

  app.put('/api/controller-profiles/:id', async (c) => {
    const body = ControllerProfileSchema.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: 'invalid_request', issues: body.error.issues }, 400)
    if (body.data.id !== c.req.param('id'))
      return c.json(
        {
          error: 'invalid_request',
          issues: [{ path: ['id'], message: 'The id in the path and the body differ' }],
        },
        400,
      )
    const r = deps.profiles.put(body.data)
    return r === 'ok' ? c.json(body.data) : c.json({ error: r }, 409)
  })

  app.delete('/api/controller-profiles/:id', (c) => {
    const r = deps.profiles.delete(c.req.param('id'))
    if (r === 'not_found') return c.json({ error: 'not_found' }, 404)
    return r === 'ok' ? c.json({ ok: true }) : c.json({ error: r }, 409)
  })

  app.get('/api/devices', (c) => c.json(registry.devices()))
  app.get('/api/scenes', (c) => c.json(registry.scenes))

  app.post('/api/devices/:id/commands', async (c) => {
    const id = IdSchema.safeParse(c.req.param('id'))
    if (!id.success) return c.json({ error: 'not_found' }, 404)
    const body = CommandRequestSchema.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: 'invalid_request', issues: body.error.issues }, 400)
    if (!registry.devices().some((d) => d.id === id.data))
      return c.json({ error: 'not_found' }, 404)
    return c.json(await registry.execute(id.data, body.data.command, body.data.confirmed ?? false))
  })

  app.post('/api/scenes/:id/run', async (c) => {
    const r = await registry.runScene(c.req.param('id'))
    return r ? c.json(r) : c.json({ error: 'not_found' }, 404)
  })

  app.get('/api/events', (c) =>
    streamSSE(c, async (stream) => {
      const off = registry.subscribe(
        (d) => void stream.writeSSE({ event: 'device', data: JSON.stringify(d) }),
      )
      for (const d of registry.devices())
        await stream.writeSSE({ event: 'device', data: JSON.stringify(d) })
      const ping = setInterval(
        () => void stream.writeSSE({ event: 'ping', data: '' }),
        deps.pingMs ?? 15_000,
      )
      await new Promise<void>((resolve) => stream.onAbort(resolve))
      clearInterval(ping)
      off()
    }),
  )

  app.all('/api/*', (c) => c.json({ error: 'not_found' }, 404))

  const web = deps.webDir
  if (web && existsSync(join(web, 'index.html'))) {
    const root = web
    // Hashed build files never change; the page and the service worker must always be re-checked.
    app.use('/*', async (c, next) => {
      await next()
      if (c.req.method === 'GET' && c.res.ok)
        c.res.headers.set(
          'cache-control',
          c.req.path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
        )
    })
    app.use('/*', serveStatic({ root }))
    app.get('*', serveStatic({ path: join(root, 'index.html') }))
  }
  return app
}
