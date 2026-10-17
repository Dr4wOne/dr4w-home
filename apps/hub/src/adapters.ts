// Every adapter type the hub can load, keyed by the `type` used in the config. `pnpm device:new`
// adds new entries between the markers below; keep them in this shape.
import { AndroidTvAdapter } from '@dr4w-home/adapter-android-tv'
import { DemoAdapter } from '@dr4w-home/adapter-demo'
import type { DeviceAdapter } from '@dr4w-home/device-sdk'
import { IdSchema } from '@dr4w-home/device-sdk/schema'
import { z } from 'zod'
import type { log } from './log.ts'

// device:new imports

type Ctx = { log: typeof log }
type AdapterType<D> = {
  /** Schema for one device in the config; omit for adapters that take no devices. */
  device?: z.ZodType<D>
  create(devices: D[], ctx: Ctx): DeviceAdapter | Promise<DeviceAdapter>
}
const define = <D>(t: AdapterType<D>) => t

/** The fields every simple device needs in the config. */
export const BasicDevice = z.strictObject({
  id: IdSchema,
  name: z.string().min(1).max(60),
  room: z.string().max(60).optional(),
})

export const TvDevice = BasicDevice.extend({
  stateDir: z.string(),
  host: z.string().optional(),
  mac: z
    .string()
    .regex(/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i)
    .optional(),
})

export const ADAPTERS = {
  demo: define<never>({ create: () => new DemoAdapter() }),
  'android-tv': define({
    device: TvDevice,
    async create(devices, { log }) {
      const tv = new AndroidTvAdapter({ log })
      for (const d of devices) await tv.add(d)
      return tv
    },
  }),
  // device:new entries
} satisfies Record<
  string,
  | AdapterType<never>
  | AdapterType<z.infer<typeof TvDevice>>
  | AdapterType<z.infer<typeof BasicDevice>>
>

export type AdapterTypeName = keyof typeof ADAPTERS
