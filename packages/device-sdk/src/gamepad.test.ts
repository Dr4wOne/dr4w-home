import { describe, expect, it } from 'vitest'
import { GAMEPAD_BUTTONS, mask, pressed } from './gamepad.ts'
import { CONTROLLER_PRESETS } from './presets.ts'
import { ControllerProfileSchema, GamepadFrameSchema } from './schema.ts'

describe('gamepad frames', () => {
  it('round-trips buttons through the bitmask', () => {
    expect(pressed(mask(['a', 'zr', 'rStick']))).toEqual(['a', 'zr', 'rStick'])
    expect(mask(GAMEPAD_BUTTONS)).toBe(2 ** GAMEPAD_BUTTONS.length - 1)
  })
  it('rejects out-of-range sticks and unknown bits', () => {
    expect(GamepadFrameSchema.safeParse({ s: 1, b: 0, lx: 101, ly: 0, rx: 0, ry: 0 }).success).toBe(
      false,
    )
    expect(
      GamepadFrameSchema.safeParse({ s: 1, b: 2 ** 18, lx: 0, ly: 0, rx: 0, ry: 0 }).success,
    ).toBe(false)
    expect(
      GamepadFrameSchema.safeParse({ s: 1, b: 3, lx: -100, ly: 100, rx: 0, ry: 0 }).success,
    ).toBe(true)
  })
  it('accepts a minimal profile and refuses extra fields', () => {
    const p = {
      id: 'party',
      name: 'Party',
      controls: [{ id: 'a', kind: 'button', binds: 'a', x: 0.8, y: 0.5, size: 0.2, opacity: 1 }],
    }
    expect(ControllerProfileSchema.safeParse(p).success).toBe(true)
    expect(ControllerProfileSchema.safeParse({ ...p, owner: 'x' }).success).toBe(false)
  })
  it('ships presets that pass the profile schema', () => {
    expect(CONTROLLER_PRESETS.map((p) => p.name)).toEqual([
      'Pro Controller',
      'Mario Kart',
      'Party',
      'One-handed (right)',
    ])
    for (const p of CONTROLLER_PRESETS) expect(ControllerProfileSchema.parse(p)).toEqual(p)
    expect(CONTROLLER_PRESETS.find((p) => p.id === 'mario-kart')?.tilt?.stick).toBe('left')
  })
})
