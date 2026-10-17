// The controller builder: move, resize and rebind controls on a landscape canvas, by touch, mouse or
// keyboard, then save the layout as a profile. Loaded on demand. Guide: docs/controller.md.
import type { HomeSource } from '@dr4w-home/client'
import {
  CONTROLLER_PRESETS,
  type Control,
  type ControllerProfile,
  GAMEPAD_BUTTONS,
  NEUTRAL,
} from '@dr4w-home/device-sdk'
import { ControllerProfileSchema } from '@dr4w-home/device-sdk/schema'
import { useEffect, useId, useRef, useState } from 'react'
import './controller.css'
import { PadFace, padClass, padStyle } from './PadFace.tsx'
import { bindName, controlName } from './pad.ts'

const MAX_CONTROLS = 40
const KIND_NAME: Record<Control['kind'], string> = {
  button: 'Button',
  shoulder: 'Shoulder button',
  stick: 'Stick',
  dpad: 'D-pad',
}
const DEFAULT_SIZE: Record<Control['kind'], number> = {
  button: 0.14,
  shoulder: 0.14,
  stick: 0.3,
  dpad: 0.3,
}
const MOVES: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
}

const r3 = (n: number) => Math.round(n * 1000) / 1000
const clamp = (n: number, lo: number, hi: number) => r3(Math.max(lo, Math.min(hi, n)))
const pct = (n: number) => `${Math.round(n * 100)}%`

export const slug = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'layout'

const unique = (base: string, taken: string[]) => {
  let id = base
  for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`
  return id
}

/** The first problem with a layout, in words a person can act on. */
function problem(p: ControllerProfile): string | undefined {
  if (!p.name.trim()) return 'Give the layout a name.'
  if (!p.controls.length) return 'Add at least one control.'
  const r = ControllerProfileSchema.safeParse(p)
  if (r.success) return undefined
  const path = r.error.issues[0]?.path ?? []
  if (path[0] === 'name') return 'Keep the name to 60 characters or fewer.'
  if (path[0] === 'controls' && path[2] === 'label')
    return 'A control label can be at most 12 characters.'
  if (path[0] === 'controls' && path.length === 1)
    return `A layout can have at most ${MAX_CONTROLS} controls.`
  return `This layout cannot be saved: ${r.error.issues[0]?.message ?? 'it is not valid'}.`
}

function newControl(kind: Control['kind'], controls: Control[]): Control {
  const used = new Set(controls.map((c) => c.binds))
  const binds: Control['binds'] =
    kind === 'stick'
      ? used.has('left')
        ? 'right'
        : 'left'
      : kind === 'dpad'
        ? 'dpad'
        : (GAMEPAD_BUTTONS.find((b) => !used.has(b)) ?? 'a')
  return {
    id: unique(
      `${kind}-1`,
      controls.map((c) => c.id),
    ),
    kind,
    binds,
    x: 0.5,
    y: 0.5,
    size: DEFAULT_SIZE[kind],
    opacity: 0.9,
  }
}

export default function Builder({
  source,
  start,
  saved,
  onClose,
  onSaved,
  onDeleted,
}: {
  source: Pick<HomeSource, 'saveProfile' | 'deleteProfile'>
  start: ControllerProfile
  saved: ControllerProfile[]
  onClose: () => void
  onSaved: (p: ControllerProfile) => void
  onDeleted: (id: string) => void
}) {
  const id = useId()
  const canvas = useRef<HTMLFieldSetElement>(null)
  const drag = useRef<{ id: string; px: number; py: number; x: number; y: number }>(undefined)
  const isSaved = (pid: string) => saved.some((s) => s.id === pid)
  const [draft, setDraft] = useState<ControllerProfile>(() => structuredClone(start))
  const [savedId, setSavedId] = useState(isSaved(start.id) ? start.id : undefined)
  const [sel, setSel] = useState(start.controls[0]?.id)
  const [addKind, setAddKind] = useState<Control['kind']>('button')
  const [msg, setMsg] = useState<{ text: string; tone: 'info' | 'error' }>()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const selected = draft.controls.find((c) => c.id === sel)
  const choices = [...saved, ...CONTROLLER_PRESETS.filter((p) => !isSaved(p.id))]

  useEffect(() => document.getElementById(`${id}-title`)?.focus(), [id])
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    addEventListener('keydown', esc)
    return () => removeEventListener('keydown', esc)
  }, [onClose])

  const patch = (cid: string, next: Partial<Control>) =>
    setDraft((d) => ({
      ...d,
      controls: d.controls.map((c) => (c.id === cid ? { ...c, ...next } : c)),
    }))

  const load = (pid: string) => {
    const p = choices.find((x) => x.id === pid)
    if (!p) return
    setDraft(structuredClone(p))
    setSavedId(isSaved(p.id) ? p.id : undefined)
    setSel(p.controls[0]?.id)
    setMsg(undefined)
    setConfirmDelete(false)
  }

  const save = async () => {
    const name = draft.name.trim()
    const pid =
      savedId ??
      unique(
        slug(name),
        [...saved, ...CONTROLLER_PRESETS].map((p) => p.id),
      )
    const p: ControllerProfile = { ...draft, id: pid, name }
    const bad = problem(p)
    if (bad) return setMsg({ text: bad, tone: 'error' })
    try {
      await source.saveProfile(p)
    } catch {
      return setMsg({ text: 'The layout was not saved. Try again.', tone: 'error' })
    }
    setDraft(p)
    setSavedId(pid)
    onSaved(p)
    setMsg({ text: `Saved “${name}”.`, tone: 'info' })
  }

  const remove = async () => {
    if (!savedId) return
    try {
      await source.deleteProfile(savedId)
    } catch {
      return setMsg({ text: 'The layout was not deleted. Try again.', tone: 'error' })
    }
    onDeleted(savedId)
    setSavedId(undefined)
    setConfirmDelete(false)
    setMsg({ text: `Deleted “${draft.name}”. It stays open here until you leave.`, tone: 'info' })
  }

  const onKey = (c: Control) => (e: React.KeyboardEvent) => {
    const d = MOVES[e.key]
    if (!d) return
    e.preventDefault()
    const step = 0.01
    if (e.shiftKey) patch(c.id, { size: clamp(c.size + (d[0] - d[1]) * step, 0.03, 0.6) })
    else patch(c.id, { x: clamp(c.x + d[0] * step, 0, 1), y: clamp(c.y + d[1] * step, 0, 1) })
  }
  const onDown = (c: Control) => (e: React.PointerEvent<HTMLButtonElement>) => {
    setSel(c.id)
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId)
    } catch {}
    drag.current = { id: c.id, px: e.clientX, py: e.clientY, x: c.x, y: c.y }
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    const r = canvas.current?.getBoundingClientRect()
    if (!d || !r?.width) return
    patch(d.id, {
      x: clamp(d.x + (e.clientX - d.px) / r.width, 0, 1),
      y: clamp(d.y + (e.clientY - d.py) / r.height, 0, 1),
    })
  }
  const endDrag = () => {
    drag.current = undefined
  }

  const bindOptions: Control['binds'][] =
    selected?.kind === 'stick'
      ? ['left', 'right']
      : selected?.kind === 'dpad'
        ? ['dpad']
        : [...GAMEPAD_BUTTONS]

  return (
    <div className="builder" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}>
      <div className="builder-head">
        <h2 id={`${id}-title`} tabIndex={-1}>
          Controller builder
        </h2>
        <button type="button" className="btn ink" onClick={onClose}>
          Done
        </button>
      </div>

      <div className="builder-row">
        <label className="field">
          <span>Start from</span>
          <select value={savedId ?? draft.id} onChange={(e) => load(e.target.value)}>
            {choices.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {isSaved(p.id) ? ' (yours)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Name</span>
          <input
            value={draft.name}
            maxLength={60}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          />
        </label>
      </div>

      <fieldset
        ref={canvas}
        className="pad-canvas builder-canvas"
        aria-label="Layout, as the phone shows it on its side"
        onPointerMove={onMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {draft.controls.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`${padClass(c, NEUTRAL)}${c.id === sel ? ' is-selected' : ''}`}
            style={padStyle(c)}
            aria-label={`${controlName(c)}, ${pct(c.x)} across, ${pct(c.y)} down, size ${Math.round(c.size * 100)}`}
            aria-describedby={`${id}-hint`}
            aria-current={c.id === sel ? 'true' : undefined}
            onPointerDown={onDown(c)}
            onFocus={() => setSel(c.id)}
            onKeyDown={onKey(c)}
          >
            <PadFace c={c} frame={NEUTRAL} />
          </button>
        ))}
      </fieldset>
      <p id={`${id}-hint`} className="hint">
        Drag a control, or select it and use the arrow keys to move it. Shift and the arrow keys
        change its size.
      </p>

      <div className="builder-row">
        {selected ? (
          <fieldset className="builder-panel">
            <legend>{controlName(selected)}</legend>
            <label className="field">
              <span>Presses</span>
              <select
                value={selected.binds}
                onChange={(e) => patch(selected.id, { binds: e.target.value as Control['binds'] })}
              >
                {bindOptions.map((b) => (
                  <option key={b} value={b}>
                    {bindName(b)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Size: {Math.round(selected.size * 100)}</span>
              <input
                type="range"
                min={0.03}
                max={0.6}
                step={0.01}
                value={selected.size}
                onChange={(e) => patch(selected.id, { size: Number(e.target.value) })}
              />
            </label>
            <label className="field">
              <span>Opacity: {pct(selected.opacity)}</span>
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={selected.opacity}
                onChange={(e) => patch(selected.id, { opacity: Number(e.target.value) })}
              />
            </label>
            <label className="field">
              <span>Label (optional)</span>
              <input
                value={selected.label ?? ''}
                maxLength={12}
                onChange={(e) =>
                  patch(selected.id, { label: e.target.value ? e.target.value : undefined })
                }
              />
            </label>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setDraft((d) => ({
                  ...d,
                  controls: d.controls.filter((c) => c.id !== selected.id),
                }))
                setSel(draft.controls.find((c) => c.id !== selected.id)?.id)
              }}
            >
              Remove {controlName(selected)}
            </button>
          </fieldset>
        ) : (
          <p className="hint">No control selected. Add one, or pick a layout to start from.</p>
        )}

        <fieldset className="builder-panel">
          <legend>Add and adjust</legend>
          <label className="field">
            <span>Kind</span>
            <select value={addKind} onChange={(e) => setAddKind(e.target.value as Control['kind'])}>
              {(Object.keys(KIND_NAME) as Control['kind'][]).map((k) => (
                <option key={k} value={k}>
                  {KIND_NAME[k]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn"
            disabled={draft.controls.length >= MAX_CONTROLS}
            onClick={() => {
              const c = newControl(addKind, draft.controls)
              setDraft((d) => ({ ...d, controls: [...d.controls, c] }))
              setSel(c.id)
            }}
          >
            Add {KIND_NAME[addKind].toLowerCase()}
          </button>
          <label className="check">
            <input
              type="checkbox"
              checked={Boolean(draft.tilt)}
              onChange={(e) =>
                setDraft(({ tilt: _, ...d }) =>
                  e.target.checked ? { ...d, tilt: { stick: 'left', axis: 'x', maxDeg: 30 } } : d,
                )
              }
            />
            Steer the left stick by tilting the phone
          </label>
          {Boolean(draft.macros?.length) && (
            <div>
              <p className="macro-warn">Macros: offline single-player only.</p>
              {/* shortcut: macros are shown and run, not recorded or edited; add a recorder when someone asks. */}
              <ul className="hint">
                {draft.macros?.map((m) => (
                  <li key={m.id}>{m.label}</li>
                ))}
              </ul>
            </div>
          )}
        </fieldset>
      </div>

      <div className="builder-actions">
        <button type="button" className="btn primary" onClick={() => void save()}>
          {savedId ? 'Save changes' : 'Save as my layout'}
        </button>
        {savedId &&
          (confirmDelete ? (
            <span className="builder-confirm">
              Delete “{draft.name}”? This cannot be undone.
              <button type="button" className="btn" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
              <button type="button" className="btn primary" onClick={() => void remove()}>
                Delete
              </button>
            </span>
          ) : (
            <button type="button" className="btn" onClick={() => setConfirmDelete(true)}>
              Delete layout
            </button>
          ))}
      </div>
      <div role={msg?.tone === 'error' ? 'alert' : 'status'}>
        {msg && <p className={`builder-msg ${msg.tone}`}>{msg.text}</p>}
      </div>
    </div>
  )
}
