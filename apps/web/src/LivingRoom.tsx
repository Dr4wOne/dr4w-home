// The living room as one embeddable fragment: the showcase puts it on its stage, in demo mode.
import { DEMO_SCENES } from '@dr4w-home/adapter-demo'
import { demoSource } from '@dr4w-home/client'
import { useMemo, useState } from 'react'
import { CommandBar, ConfirmDialog, DeviceRow, HubState, Notice, ScenesStrip } from './parts.tsx'
import { useHome } from './useHome.ts'

export function LivingRoom({ id = 'living-room' }: { id?: string }) {
  const source = useMemo(() => demoSource({ dropRate: 0.03, extras: false }), [])
  const home = useHome(source, { devices: source.devices(), scenes: DEMO_SCENES })
  const [sound, setSound] = useState(false)
  const lamp = home.devices.find((d) => d.id === 'lamp')
  const lampOffline = lamp?.availability.status === 'offline'
  return (
    <div className="room" data-ui id={id}>
      <div className="room-head">
        <h2>Living room</h2>
        <HubState home={home} />
      </div>
      <ul className="devices" aria-label="Devices" aria-busy={!home.loaded}>
        {home.devices.map((d) => (
          <DeviceRow key={d.id} home={home} d={d} sound={sound} />
        ))}
      </ul>
      <ScenesStrip home={home} sound={sound} />
      <div className="room-command">
        <CommandBar home={home} label="Tell the living room what to do" />
      </div>
      <div className="room-foot">
        <button
          type="button"
          className="text-btn"
          onClick={() => source.adapter.setOnline('lamp', Boolean(lampOffline))}
        >
          {lampOffline ? 'Plug the lamp back in' : "Pull the lamp's plug"}
        </button>
        <button
          type="button"
          className="text-btn"
          aria-pressed={sound}
          onClick={() => setSound((s) => !s)}
        >
          Click sound {sound ? 'on' : 'off'}
        </button>
      </div>
      <Notice home={home} />
      <ConfirmDialog home={home} />
    </div>
  )
}
