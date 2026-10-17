import { expect, it } from 'vitest'
import { files, register } from './device-new.ts'

it('scaffolds a complete adapter package', () => {
  const f = files('demo-fan')
  expect(Object.keys(f).sort()).toEqual([
    'docs/discovery.md',
    'docs/protocol.md',
    'fixtures/README.md',
    'package.json',
    'src/adapter.test.ts',
    'src/index.ts',
    'tsconfig.json',
  ])
  expect(JSON.parse(f['package.json'] ?? '').name).toBe('@dr4w-home/adapter-demo-fan')
  expect(f['src/index.ts']).toContain('export class DemoFanAdapter implements DeviceAdapter')
})

it('registers at the markers and keeps them for the next adapter', () => {
  const src =
    'import x\n// device:new imports\n\nexport const A = {\n  a: 1,\n  // device:new entries\n}\n'
  const once = register(src, "import { FanAdapter } from 'fan'", 'fan: 2,')
  expect(once).toBe(
    "import x\nimport { FanAdapter } from 'fan'\n// device:new imports\n\nexport const A = {\n  a: 1,\n  fan: 2,\n  // device:new entries\n}\n",
  )
  expect(() => register('nothing', 'i', 'e')).toThrow('registry markers missing')
})
