import { describe, expect, it } from 'vitest'
import { GAMEPAD_BUTTONS, mask, pressed } from './gamepad.ts'
import { PRESETS } from './presets.ts'
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
})

describe('presets', () => {
  it('are valid profiles whose controls fit on screen without overlapping (2:1 landscape)', () => {
    expect(PRESETS.map((p) => p.id)).toEqual([
      'pro-controller',
      'mario-kart',
      'party',
      'one-handed-right',
    ])
    for (const p of PRESETS) {
      expect(ControllerProfileSchema.safeParse(p).success).toBe(true)
      for (const [i, a] of p.controls.entries()) {
        const r = a.size / 2
        expect(a.y - r >= 0 && a.y + r <= 1 && a.x - r / 2 >= 0 && a.x + r / 2 <= 1).toBe(true)
        for (const b of p.controls.slice(i + 1)) {
          const d = Math.hypot((a.x - b.x) * 2, a.y - b.y)
          expect(d, `${p.id}: ${a.id} overlaps ${b.id}`).toBeGreaterThanOrEqual(
            (a.size + b.size) / 2,
          )
        }
      }
    }
  })
})
