import { expect, it } from 'vitest'
import { demoSource, HubError, hubSource } from './index.ts'

it('demo source runs a scene step by step', async () => {
  const s = demoSource({ speed: 0, random: () => 0.5 })
  const steps: number[] = []
  expect(await s.runScene('movie-night', (i) => steps.push(i))).toMatchObject({ ok: true })
  expect(steps).toEqual([1, 2, 3, 4, 5])
})

it('hub source sends commands with the CSRF header and reports a signed-out phone', async () => {
  const seen: { url: string; init?: RequestInit }[] = []
  const ok = hubSource('', async (url, init) => {
    seen.push({ url: String(url), init })
    return new Response(JSON.stringify({ ok: true, applied: 'confirmed', ms: 50 }))
  })
  await ok.execute('tv', { type: 'mute', op: 'set', muted: true })
  expect(seen[0]?.url).toBe('/api/devices/tv/commands')
  expect(seen[0]?.init?.headers).toMatchObject({ 'x-dr4w-client': '1' })
  expect(JSON.parse(String(seen[0]?.init?.body))).toEqual({
    command: { type: 'mute', op: 'set', muted: true },
  })
  const out = hubSource('', async () => new Response('{}', { status: 403 }))
  await expect(out.load()).rejects.toBeInstanceOf(HubError)
})
