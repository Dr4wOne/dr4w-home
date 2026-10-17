import { DEMO_SCENES, DemoAdapter } from '@dr4w-home/adapter-demo'
import { expect, it } from 'vitest'
import { interpret, palette } from './index.ts'

const ctx = { devices: new DemoAdapter().devices(), scenes: DEMO_SCENES }
const top = (text: string) => interpret(text, ctx)[0]

it('maps scene names and synonyms, including misheard dictation', () => {
  expect(top('movie night')?.action).toEqual({ kind: 'scene', sceneId: 'movie-night' })
  expect(top("Let's play Mario Kart")?.action).toEqual({
    kind: 'scene',
    sceneId: 'play-mario-kart',
  })
  expect(top('movie nite')?.action).toEqual({ kind: 'scene', sceneId: 'movie-night' })
  expect(top('bedtime')?.action).toEqual({ kind: 'scene', sceneId: 'goodnight' })
})

it('maps device commands', () => {
  expect(top('turn the TV off')?.action).toEqual({
    kind: 'command',
    deviceId: 'tv',
    command: { type: 'power', op: 'set', on: false },
  })
  expect(top('switch 2 on')?.action).toMatchObject({ deviceId: 'switch2' })
  expect(top('volume 20')?.action).toMatchObject({
    command: { type: 'volume', op: 'set', level: 20 },
  })
  expect(top('open youtube')?.action).toMatchObject({
    command: { type: 'appLauncher', appId: 'youtube' },
  })
  expect(top('dim the lights')?.action).toMatchObject({
    deviceId: 'lamp',
    command: { type: 'lightLevel', level: 20 },
  })
  expect(top('mute')?.action).toMatchObject({ command: { type: 'mute', muted: true } })
})

it('returns nothing for text it does not understand, and every action for the palette', () => {
  expect(interpret('order a pizza', ctx)).toEqual([])
  expect(palette(ctx).map((i) => i.label)).toContain('Turn Living room TV on')
})
