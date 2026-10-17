import { demoSource, type GamepadSession, type Pad } from '@dr4w-home/client'
import { type ControllerProfile, mask, NEUTRAL, PRESETS } from '@dr4w-home/device-sdk'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Builder from './Builder.tsx'
import { ControllerPanel } from './ControllerPanel.tsx'
import Player from './Player.tsx'
import { dpadButtons, stickValue, tiltX } from './pad.ts'

afterEach(() => {
  cleanup()
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
})

// 1000 x 500 px surface: A at (600, 250) and B at (800, 250), radius 50; the stick at (200, 250), radius 100.
const TEST: ControllerProfile = {
  id: 'test',
  name: 'Test',
  controls: [
    { id: 'a', kind: 'button', binds: 'a', x: 0.6, y: 0.5, size: 0.2, opacity: 1 },
    { id: 'b', kind: 'button', binds: 'b', x: 0.8, y: 0.5, size: 0.2, opacity: 1 },
    { id: 'left', kind: 'stick', binds: 'left', x: 0.2, y: 0.5, size: 0.4, opacity: 1 },
    { id: 'dpad', kind: 'dpad', binds: 'dpad', x: 0.4, y: 0.85, size: 0.2, opacity: 1 },
  ],
}

function play(profile = TEST) {
  const sent: Pad[] = []
  const session: GamepadSession = {
    send: (p) => void sent.push(p),
    release: vi.fn(),
    status: () => ({ state: 'connected', output: 'demo', latencyMs: 4 }),
    subscribe: () => () => {},
    close: vi.fn(),
  }
  const onExit = vi.fn()
  render(
    <Player
      source={{ gamepad: () => session }}
      deviceId="switch2"
      profile={profile}
      sound={false}
      onExit={onExit}
    />,
  )
  const surface = document.querySelector('.player-surface') as HTMLElement
  surface.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 1000, height: 500, right: 1000, bottom: 500 }) as DOMRect
  const at = (pointerId: number, clientX: number, clientY: number) => ({
    pointerId,
    clientX,
    clientY,
  })
  return {
    session,
    onExit,
    surface,
    last: () => sent.at(-1) ?? NEUTRAL,
    down: (id: number, x: number, y: number) => fireEvent.pointerDown(surface, at(id, x, y)),
    move: (id: number, x: number, y: number) => fireEvent.pointerMove(surface, at(id, x, y)),
    up: (id: number, x: number, y: number) => fireEvent.pointerUp(surface, at(id, x, y)),
  }
}

describe('controller geometry', () => {
  it('has a dead zone and clamps sticks to -100..100, up positive', () => {
    expect(stickValue(10, 0, 100)).toEqual({ x: 0, y: 0 })
    expect(stickValue(500, 0, 100)).toEqual({ x: 100, y: 0 })
    expect(stickValue(0, -500, 100)).toEqual({ x: 0, y: 100 })
    expect(stickValue(-1000, 1000, 100)).toEqual({ x: -71, y: -71 })
    const half = stickValue(57.5, 0, 100) // halfway between the dead zone and the edge
    expect(half.x).toBe(50)
  })
  it('reads eight D-pad directions and nothing in the middle', () => {
    expect(dpadButtons(2, 2, 100)).toEqual([])
    expect(dpadButtons(80, 0, 100)).toEqual(['dpadRight'])
    expect(dpadButtons(60, -60, 100)).toEqual(['dpadUp', 'dpadRight'])
    expect(dpadButtons(-60, 60, 100)).toEqual(['dpadDown', 'dpadLeft'])
  })
  it('turns roll into steering, with a small dead zone and a clamp', () => {
    const g = 9.81
    const roll = (deg: number) =>
      [-g * Math.sin((deg * Math.PI) / 180), g * Math.cos((deg * Math.PI) / 180)] as const
    expect(tiltX(...roll(0), 0, 30)).toBe(0)
    expect(tiltX(...roll(1), 0, 30)).toBe(0)
    expect(tiltX(...roll(15), 0, 30)).toBe(50)
    expect(tiltX(...roll(-45), 0, 30)).toBe(-100)
    // On its side (screen angle 90), level is gravity along the device's x axis.
    expect(tiltX(g, 0, 90, 30)).toBe(0)
  })
})

describe('player', () => {
  it('slide-presses: a finger dragged from A onto B releases A and presses B', () => {
    const p = play()
    p.down(1, 600, 250)
    expect(p.last().b).toBe(mask(['a']))
    expect(document.querySelector('[data-control="a"]')?.className).toContain('is-down')
    p.move(1, 700, 250) // between the buttons: nothing
    expect(p.last().b).toBe(0)
    p.move(1, 800, 250)
    expect(p.last().b).toBe(mask(['b']))
    expect(document.querySelector('[data-control="a"]')?.className).not.toContain('is-down')
    p.up(1, 800, 250)
    expect(p.last()).toEqual(NEUTRAL)
  })

  it('tracks each finger separately: two pointers hold two buttons', () => {
    const p = play()
    p.down(1, 600, 250)
    p.down(2, 800, 250)
    expect(p.last().b).toBe(mask(['a', 'b']))
    p.up(1, 600, 250)
    expect(p.last().b).toBe(mask(['b']))
  })

  it('moves the stick with a dead zone, clamps it, and keeps it while the finger wanders', () => {
    const p = play()
    p.down(1, 200, 250)
    p.move(1, 205, 250)
    expect(p.last()).toEqual(NEUTRAL)
    p.move(1, 900, 250) // far outside the stick, over B: the stick keeps this finger
    expect(p.last()).toMatchObject({ lx: 100, ly: 0, b: 0 })
    p.move(1, 200, 0)
    expect(p.last()).toMatchObject({ lx: 0, ly: 100 })
  })

  it('presses D-pad diagonals', () => {
    const p = play()
    p.down(1, 430, 395) // up and right of the D-pad centre (400, 425)
    expect(p.last().b).toBe(mask(['dpadUp', 'dpadRight']))
  })

  it('releases everything on pointercancel and when the page is hidden', () => {
    const p = play()
    p.down(1, 600, 250)
    p.down(2, 200, 250)
    p.move(2, 300, 250)
    expect(p.last()).toMatchObject({ b: 1, lx: 100 })
    fireEvent.pointerCancel(p.surface, { pointerId: 2 })
    expect(p.last()).toEqual(NEUTRAL)

    p.down(3, 800, 250)
    expect(p.last().b).toBe(mask(['b']))
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    act(() => void document.dispatchEvent(new Event('visibilitychange')))
    expect(p.last()).toEqual(NEUTRAL)
    // The finger that was down before is forgotten: lifting it changes nothing.
    p.up(3, 800, 250)
    expect(p.last()).toEqual(NEUTRAL)
  })

  it('shows the link state and exits cleanly, closing the session', () => {
    const p = play()
    expect(screen.getByRole('status').textContent).toContain('Connected · Simulated · 4 ms')
    p.down(1, 600, 250)
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(p.last()).toEqual(NEUTRAL)
    expect(p.onExit).toHaveBeenCalled()
    cleanup()
    expect(p.session.close).toHaveBeenCalled()
  })

  it('asks before tilt and falls back to the stick when motion access is denied', async () => {
    const DM = Object.assign(class {}, { requestPermission: vi.fn(async () => 'denied') })
    vi.stubGlobal('DeviceMotionEvent', DM)
    const kart = PRESETS.find((x) => x.id === 'mario-kart') as ControllerProfile
    play(kart)
    expect(screen.getByRole('heading', { name: 'Steer by tilting the phone?' })).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Use tilt' })))
    expect(DM.requestPermission).toHaveBeenCalled()
    expect(screen.getByText(/Motion access is off/)).toBeTruthy()
    vi.unstubAllGlobals()
  })

  it('labels macros offline single-player only and asks before running one', () => {
    const p = play({
      ...TEST,
      macros: [{ id: 'm', label: 'Jump', steps: [{ b: mask(['a']), ms: 100 }] }],
    })
    fireEvent.click(screen.getByRole('button', { name: 'Macros' }))
    fireEvent.click(screen.getByRole('button', { name: 'Jump' }))
    expect(screen.getByText('Offline single-player only.')).toBeTruthy()
    expect(p.last().b).toBe(0)
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    expect(p.last().b).toBe(mask(['a']))
  })
})

describe('builder', () => {
  const pro = PRESETS[0] as ControllerProfile
  const build = (saveProfile = vi.fn(async () => {})) => {
    const onSaved = vi.fn()
    render(
      <Builder
        source={{ saveProfile, deleteProfile: vi.fn(async () => {}) }}
        start={pro}
        saved={[]}
        onClose={vi.fn()}
        onSaved={onSaved}
        onDeleted={vi.fn()}
      />,
    )
    return { saveProfile, onSaved }
  }

  it('moves a control with the arrow keys and resizes it with shift', () => {
    build()
    const a = screen.getByRole('button', { name: /^A \(A\), 93% across, 48% down, size 13$/ })
    fireEvent.keyDown(a, { key: 'ArrowRight' })
    fireEvent.keyDown(a, { key: 'ArrowDown' })
    expect(a.getAttribute('aria-label')).toBe('A (A), 94% across, 49% down, size 13')
    fireEvent.keyDown(a, { key: 'ArrowUp', shiftKey: true })
    fireEvent.keyDown(a, { key: 'ArrowRight', shiftKey: true })
    expect(a.getAttribute('aria-label')).toBe('A (A), 94% across, 49% down, size 15')
    fireEvent.keyDown(a, { key: 'ArrowLeft', shiftKey: true })
    expect(a.getAttribute('aria-label')).toMatch(/size 14$/)
  })

  it('refuses to save a layout without a valid name, then saves it as a new profile', async () => {
    const { saveProfile, onSaved } = build()
    const name = screen.getByRole('textbox', { name: 'Name' })
    const save = screen.getByRole('button', { name: 'Save as my layout' })
    fireEvent.change(name, { target: { value: '   ' } })
    await act(async () => fireEvent.click(save))
    expect(screen.getByRole('alert').textContent).toBe('Give the layout a name.')
    fireEvent.change(name, { target: { value: 'x'.repeat(61) } })
    await act(async () => fireEvent.click(save))
    expect(screen.getByRole('alert').textContent).toBe('Keep the name to 60 characters or fewer.')
    expect(saveProfile).not.toHaveBeenCalled()

    fireEvent.change(name, { target: { value: 'My kart' } })
    await act(async () => fireEvent.click(save))
    expect(saveProfile).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'my-kart', name: 'My kart' }),
    )
    expect(onSaved).toHaveBeenCalled()
    expect(screen.getByRole('status').textContent).toBe('Saved “My kart”.')
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy()
  })

  it('adds and removes controls and rebinds the selected one', () => {
    build()
    const canvas = screen.getByRole('group', { name: /Layout, as the phone/ })
    const before = within(canvas).getAllByRole('button').length
    fireEvent.click(screen.getByRole('button', { name: 'Add button' }))
    expect(within(canvas).getAllByRole('button')).toHaveLength(before + 1)
    fireEvent.change(screen.getByRole('combobox', { name: 'Presses' }), { target: { value: 'zr' } })
    expect(within(canvas).getByRole('button', { name: /^ZR, 50% across/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Remove ZR' }))
    expect(within(canvas).getAllByRole('button')).toHaveLength(before)
  })
})

it('drives the demo console from the device panel, with nothing on the network', async () => {
  const source = demoSource({ speed: 0, storage: () => undefined })
  render(<ControllerPanel source={source} deviceId="switch2" sound={false} />)
  fireEvent.click(screen.getByRole('button', { name: 'Party' }))
  fireEvent.click(screen.getByRole('button', { name: 'Play with Party' }))
  await screen.findByRole('dialog', { name: 'Controller: Party' })
  const surface = document.querySelector('.player-surface') as HTMLElement
  surface.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 500 }) as DOMRect
  fireEvent.pointerDown(surface, { pointerId: 1, clientX: 840, clientY: 230 }) // Party's A
  expect(source.pad.get().b).toBe(mask(['a']))
  fireEvent.click(screen.getByRole('button', { name: 'Done' }))
  expect(source.pad.get()).toEqual(NEUTRAL)
})
