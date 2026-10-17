// The showcase's console: a virtual screen that shows what the phone controller sends, with the same
// player and builder as the app. Everything runs in the browser; layouts stay in this browser.
import { demoSource } from '@dr4w-home/client'
import { useMemo, useState } from 'react'
import { ControllerPanel } from './ControllerPanel.tsx'
import { VirtualScreen } from './PadFace.tsx'

export function ControllerDemo({ id = 'controller' }: { id?: string }) {
  const source = useMemo(() => demoSource({ extras: false }), [])
  const [sound, setSound] = useState(false)
  return (
    <div className="room pad-demo" data-ui id={id}>
      <div className="room-head">
        <h3>Switch 2</h3>
        <span className="hub-state">
          <span className="dot" aria-hidden="true" />
          Simulated console
        </span>
      </div>
      <VirtualScreen pad={source.pad} />
      <ControllerPanel
        source={source}
        deviceId="switch2"
        sound={sound}
        preview={<VirtualScreen pad={source.pad} compact />}
      />
      <div className="room-foot">
        <span>Open the player and hold a button: the screen shows what the console receives.</span>
        <button
          type="button"
          className="text-btn"
          aria-pressed={sound}
          onClick={() => setSound((s) => !s)}
        >
          Click sound {sound ? 'on' : 'off'}
        </button>
      </div>
    </div>
  )
}
