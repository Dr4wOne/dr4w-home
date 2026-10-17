// Which data source the app starts on. A hub answers GET /health with { ok, version, signedIn };
// demo mode runs every device in the browser. The app never calls /api before the hub says the
// phone is signed in.
import { demoSource, type HomeSource, hubSource } from '@dr4w-home/client'

export type Start =
  | { mode: 'demo'; source: ReturnType<typeof demoSource> }
  | { mode: 'hub'; source: HomeSource; version: string }
  | { mode: 'signed-out' }
  | { mode: 'unreachable' }

const SEEN = 'dr4w-home:hub-seen'

type Env = {
  search?: string
  demo?: string
  fetchImpl?: typeof fetch
  storage?: Pick<Storage, 'getItem' | 'setItem'>
}

const safeStorage = (): Env['storage'] => {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

export async function pickSource({
  search = location.search,
  demo = import.meta.env.VITE_DEMO,
  fetchImpl = (...a) => fetch(...a),
  storage = safeStorage(),
}: Env = {}): Promise<Start> {
  if (demo === '1' || new URLSearchParams(search).has('demo'))
    return { mode: 'demo', source: demoSource({ dropRate: 0.03 }) }
  try {
    const res = await fetchImpl('/health', { credentials: 'same-origin', cache: 'no-store' })
    const body = (await res.json()) as { ok?: boolean; version?: string; signedIn?: boolean }
    if (!res.ok || body.ok !== true || typeof body.signedIn !== 'boolean')
      throw new Error('not a hub')
    try {
      storage?.setItem(SEEN, '1')
    } catch {}
    if (!body.signedIn) return { mode: 'signed-out' }
    return { mode: 'hub', source: hubSource(), version: body.version ?? '' }
  } catch {
    // A phone that has used a hub before is offline or away from home: never show it fake devices.
    let seen: string | null | undefined
    try {
      seen = storage?.getItem(SEEN)
    } catch {}
    return seen ? { mode: 'unreachable' } : { mode: 'demo', source: demoSource({ dropRate: 0.03 }) }
  }
}
