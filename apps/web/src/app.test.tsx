import { demoSource, type HomeSource } from '@dr4w-home/client'
import type { CommandResult } from '@dr4w-home/device-sdk'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, expect, it, vi } from 'vitest'
import { App } from './App.tsx'
import { pickSource } from './source.ts'

beforeAll(() => {
  // jsdom has no modal dialogs or view transitions; the app falls back without them.
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true
  }
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false
  }
  window.matchMedia ??= (() => ({ matches: false })) as unknown as typeof window.matchMedia
})
afterEach(cleanup)

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const memory = (seen?: string) => {
  const m = new Map(seen ? [['dr4w-home:hub-seen', seen]] : [])
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  }
}

it('picks demo, hub or the sign-in screen, and never calls /api before the hub says signed in', async () => {
  expect((await pickSource({ search: '?demo', fetchImpl: vi.fn() })).mode).toBe('demo')

  const hub = vi.fn(async () => json({ ok: true, version: '0.1.0', signedIn: true }))
  expect((await pickSource({ search: '', demo: '', fetchImpl: hub, storage: memory() })).mode).toBe(
    'hub',
  )

  const out = vi.fn(async (_url: string | URL | Request) =>
    json({ ok: true, version: '0.1.0', signedIn: false }),
  )
  expect((await pickSource({ search: '', demo: '', fetchImpl: out, storage: memory() })).mode).toBe(
    'signed-out',
  )
  expect(out.mock.calls.map((c) => c[0])).toEqual(['/health'])

  const none = vi.fn(async () => {
    throw new TypeError('offline')
  })
  expect(
    (await pickSource({ search: '', demo: '', fetchImpl: none, storage: memory() })).mode,
  ).toBe('demo')
  // A phone that has used a hub before must not be shown fake devices when the hub is away.
  expect(
    (await pickSource({ search: '', demo: '', fetchImpl: none, storage: memory('1') })).mode,
  ).toBe('unreachable')
})

/** The demo living room with the TV already on, and a hook to change what commands answer. */
async function tvOn(answer?: (n: number) => CommandResult | undefined) {
  const demo = demoSource({ speed: 0, random: () => 0.5 })
  await demo.adapter.execute('tv', { type: 'power', op: 'set', on: true })
  let n = 0
  const calls: { confirmed?: boolean }[] = []
  const source: HomeSource = {
    ...demo,
    execute: async (id, c, confirmed) => {
      calls.push({ confirmed })
      const fixed = answer?.(n++)
      if (fixed) {
        await new Promise((r) => setTimeout(r, 30))
        return fixed
      }
      return demo.execute(id, c, confirmed)
    },
  }
  render(
    <App
      start={{
        mode: 'demo',
        source: Object.assign(source, { adapter: demo.adapter, devices: demo.devices }),
      }}
    />,
  )
  await screen.findByText(/On · Home · Volume 18/)
  return calls
}

it('shows the change at once and rolls back when the TV does not confirm', async () => {
  await tvOn(() => ({ ok: false, reason: 'timeout', ms: 30 }))
  fireEvent.click(screen.getByRole('button', { name: 'Living room TV: turn off' }))
  expect(screen.getByRole('button', { name: /Open Living room TV\. Off/ })).toBeTruthy()
  expect(await screen.findByText(/did not confirm/)).toBeTruthy()
  expect(screen.getByRole('button', { name: /Open Living room TV\. On/ })).toBeTruthy()
})

it('asks in a dialog before a loud volume, then repeats the command confirmed', async () => {
  const calls = await tvOn((n) =>
    n === 0 ? { ok: false, reason: 'needsConfirmation', ms: 1 } : undefined,
  )
  const bar = screen.getByRole('combobox')
  fireEvent.change(bar, { target: { value: 'volume 90' } })
  fireEvent.submit(bar.closest('form') as HTMLFormElement)
  const dialog = await screen.findByRole('dialog')
  expect(within(dialog).getByText(/volume 90/)).toBeTruthy()
  await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Volume 90' })))
  await screen.findByText(/On · Home · Volume 90/)
  expect(calls.map((c) => Boolean(c.confirmed))).toEqual([false, true])
})

it('runs "movie night" from the command bar', async () => {
  await tvOn()
  const bar = screen.getByRole('combobox')
  fireEvent.change(bar, { target: { value: 'movie night' } })
  fireEvent.submit(bar.closest('form') as HTMLFormElement)
  expect(await screen.findByText('Movie night is set.')).toBeTruthy()
  await waitFor(() => expect(screen.getByText(/On · Netflix · Volume 18/)).toBeTruthy())
})
