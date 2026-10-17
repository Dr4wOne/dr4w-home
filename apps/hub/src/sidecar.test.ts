import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const python = spawnSync('python3', ['--version']).status === 0

// The sidecar's mapping and validation, without nxbt, root or Bluetooth.
it.skipIf(!python)('the nxbt sidecar passes its self-test', () => {
  const file = fileURLToPath(new URL('../sidecar/nxbt-sidecar.py', import.meta.url))
  const r = spawnSync('python3', ['-I', file, '--self-test'], { encoding: 'utf8' })
  expect(r.stderr).toBe('')
  expect(r.stdout.trim()).toBe('self-test ok')
})
