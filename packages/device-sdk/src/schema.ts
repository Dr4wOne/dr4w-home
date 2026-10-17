// zod schemas for everything that crosses the hub's HTTP boundary. Types stay in index.ts; these
// must accept exactly the same shapes (checked in schema.test.ts).
import { z } from 'zod'
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
