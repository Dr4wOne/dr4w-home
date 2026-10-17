// Simulated adapters shown in demo mode next to the demo living room. `pnpm device:new` adds new
// adapters here while they are still simulated; remove an entry once its adapter needs real hardware
// (Node-only code cannot run in the browser).
import type { DeviceAdapter } from '@dr4w-home/device-sdk'
// device:new imports

export const extraDemoAdapters = (): DeviceAdapter[] => [
  // device:new entries
]
