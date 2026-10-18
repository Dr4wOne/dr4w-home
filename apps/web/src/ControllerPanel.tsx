// The "Controller" action of a console: pick a layout, then play or edit. The player and the builder
// load only when opened, so the device view and the showcase ship without them.
import type { HomeSource } from '@dr4w-home/client'
import { type ControllerProfile, PRESETS } from '@dr4w-home/device-sdk'
import { lazy, type ReactNode, Suspense, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Choice } from './parts.tsx'

const Player = lazy(() => import('./Player.tsx'))
const Builder = lazy(() => import('./Builder.tsx'))
const FIRST = PRESETS[0] as ControllerProfile

export function ControllerPanel({
  source,
  deviceId,
  sound,
  disabled = false,
  preview,
}: {
  source: Pick<HomeSource, 'gamepad' | 'listProfiles' | 'saveProfile' | 'deleteProfile'>
  deviceId: string
  sound: boolean
  disabled?: boolean
  preview?: ReactNode
}) {
  const [saved, setSaved] = useState<ControllerProfile[]>([])
  const [pick, setPick] = useState(FIRST.id)
  const [open, setOpen] = useState<'play' | 'edit'>()
  useEffect(() => {
    let live = true
    source
      .listProfiles()
      .then((p) => live && setSaved(p))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [source])
  const all = [...saved, ...PRESETS.filter((p) => !saved.some((s) => s.id === p.id))]
  const profile = all.find((p) => p.id === pick) ?? FIRST
  const close = () => {
    setOpen(undefined)
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>(`[data-controller="${deviceId}"] .btn.primary`)?.focus(),
    )
  }
  return (
    <div className="controller" data-controller={deviceId}>
      <Choice
        label="Controller layout"
        options={all}
        current={profile.id}
        onPick={setPick}
        disabled={disabled}
      />
      <div className="row2">
        <button
          type="button"
          className="btn primary"
          disabled={disabled}
          onClick={() => setOpen('play')}
        >
          Play with {profile.name}
        </button>
        <button type="button" className="btn" disabled={disabled} onClick={() => setOpen('edit')}>
          Edit layouts
        </button>
      </div>
      {/* On the body, so the card's styles around the panel never reach the full-screen views. */}
      {open &&
        createPortal(
          <Suspense fallback={<div className="player" aria-busy="true" />}>
            {open === 'play' ? (
              <Player
                source={source}
                deviceId={deviceId}
                profile={profile}
                sound={sound}
                onExit={close}
                preview={preview}
              />
            ) : (
              <Builder
                source={source}
                start={profile}
                saved={saved}
                onClose={close}
                onSaved={(p) => {
                  setSaved((all) =>
                    all.some((x) => x.id === p.id)
                      ? all.map((x) => (x.id === p.id ? p : x))
                      : [...all, p],
                  )
                  setPick(p.id)
                }}
                onDeleted={(pid) => {
                  setSaved((all) => all.filter((x) => x.id !== pid))
                  setPick(FIRST.id)
                }}
              />
            )}
          </Suspense>,
          document.body,
        )}
    </div>
  )
}
