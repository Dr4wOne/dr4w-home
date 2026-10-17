import { expect, it } from 'vitest'
import { CommandRequestSchema, CommandSchema } from './schema.ts'

it('accepts every command shape and rejects anything else', () => {
  expect(CommandSchema.safeParse({ type: 'volume', op: 'set', level: 18 }).success).toBe(true)
  expect(CommandSchema.safeParse({ type: 'keypad', op: 'press', key: 'home' }).success).toBe(true)
  for (const bad of [
    { type: 'volume', op: 'set', level: 500 },
    { type: 'keypad', op: 'press', key: 'settings' },
    { type: 'raw', code: 176 },
    { type: 'appLauncher', op: 'launch', appId: 'market://details' },
    { type: 'power', op: 'set', on: true, extra: 1 },
  ])
    expect(CommandSchema.safeParse(bad).success).toBe(false)
  expect(
    CommandRequestSchema.safeParse({
      command: { type: 'mute', op: 'set', muted: true },
      confirmed: true,
    }).success,
  ).toBe(true)
})
