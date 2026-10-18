// zod schemas for everything that crosses the hub's HTTP boundary. Types stay in index.ts; these
// must accept exactly the same shapes (checked in schema.test.ts).
import { z } from 'zod'
import { type ControllerProfile, GAMEPAD_BUTTONS } from './gamepad.ts'
import type { Command } from './index.ts'

const id = z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/)
const level = z.number().int().min(0).max(100)

export const KeyNameSchema = z.enum([
  'up',
  'down',
  'left',
  'right',
  'select',
  'back',
  'home',
  'menu',
  'playPause',
])

export const CommandSchema: z.ZodType<Command> = z.union([
  z.strictObject({ type: z.literal('power'), op: z.literal('set'), on: z.boolean() }),
  z.strictObject({ type: z.literal('volume'), op: z.literal('set'), level }),
  z.strictObject({
    type: z.literal('volume'),
    op: z.literal('step'),
    direction: z.enum(['up', 'down']),
  }),
  z.strictObject({ type: z.literal('mute'), op: z.literal('set'), muted: z.boolean() }),
  z.strictObject({ type: z.literal('keypad'), op: z.literal('press'), key: KeyNameSchema }),
  z.strictObject({ type: z.literal('appLauncher'), op: z.literal('launch'), appId: id }),
  z.strictObject({ type: z.literal('inputSource'), op: z.literal('select'), inputId: id }),
  z.strictObject({ type: z.literal('mode'), op: z.literal('set'), modeId: id }),
  z.strictObject({ type: z.literal('lightLevel'), op: z.literal('set'), level }),
  z.strictObject({
    type: z.literal('lightColor'),
    op: z.literal('set'),
    kelvin: z.number().int().min(1000).max(10000),
  }),
])

/** POST /api/devices/:id/commands */
export const CommandRequestSchema = z.strictObject({
  command: CommandSchema,
  confirmed: z.boolean().optional(),
})
export const IdSchema = id

// Live controller input and saved layouts (types and meaning: gamepad.ts).
const axis = z.number().int().min(-100).max(100)
export const GamepadFrameSchema = z.strictObject({
  s: z.number().int().nonnegative(),
  b: z
    .number()
    .int()
    .min(0)
    .max(2 ** GAMEPAD_BUTTONS.length - 1),
  lx: axis,
  ly: axis,
  rx: axis,
  ry: axis,
})

const unit = z.number().min(0).max(1)
export const ControllerProfileSchema: z.ZodType<ControllerProfile> = z.strictObject({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/),
  name: z.string().min(1).max(60),
  controls: z
    .array(
      z.strictObject({
        id: z.string().min(1).max(40),
        kind: z.enum(['button', 'dpad', 'stick', 'shoulder']),
        binds: z.union([z.enum(GAMEPAD_BUTTONS), z.enum(['left', 'right', 'dpad'])]),
        x: unit,
        y: unit,
        size: z.number().min(0.03).max(0.6),
        opacity: z.number().min(0.1).max(1),
        label: z.string().max(12).optional(),
      }),
    )
    .max(40),
  tilt: z
    .strictObject({
      stick: z.literal('left'),
      axis: z.literal('x'),
      maxDeg: z.number().min(10).max(90),
    })
    .optional(),
  macros: z
    .array(
      z.strictObject({
        id: z.string().min(1).max(40),
        label: z.string().min(1).max(30),
        steps: z
          .array(
            z.strictObject({
              b: GamepadFrameSchema.shape.b,
              ms: z.number().int().min(16).max(5000),
            }),
          )
          .min(1)
          .max(200),
      }),
    )
    .max(20)
    .optional(),
})
