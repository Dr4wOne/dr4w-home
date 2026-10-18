# Hub API

The hub serves the web app and this API on the home network. The phone uses it through
`packages/client` (`hubSource`); demo mode uses the same interface without a network (`demoSource`).
Request bodies are validated with the zod schemas in `packages/device-sdk/src/schema.ts`.

## Signing a phone in
| Route | Who | What |
|---|---|---|
| `POST /admin/link` | The hub machine only (loopback) | Mints a single-use sign-in link, valid 10 minutes. `pnpm hub link` (`pnpm --filter @dr4w-home/hub cli link`) prints it as a QR code. |
| `GET /pair?t=<token>` | The phone | Uses the link once, sets the HttpOnly, SameSite=Strict session cookie `dr4w_home`, redirects to `/`. |
| `GET /health` | Anyone on the network | `{ ok, version, signedIn }`. `signedIn` lets the app show the sign-in screen without a failing call. |

Every route under `/api` needs the session cookie. Every request that is not `GET` also needs the
header `x-dr4w-client: 1` (a CSRF guard: a form on another site cannot set it). Each IP address gets
60 requests per 10 seconds.

## Routes
| Route | Body | Answer |
|---|---|---|
| `GET /api/devices` | | `Device[]` |
| `GET /api/scenes` | | `Scene[]` |
| `POST /api/devices/:id/commands` | `{ command: Command, confirmed?: boolean }` | `CommandResult` |
| `POST /api/scenes/:id/run` | | `{ ok, failedStep? }` (the hub runs the steps, so a scene finishes even if the phone locks) |
| `GET /api/events` | | Server-sent events: `device` (a `Device` as JSON, whenever its state changes) and `ping` every 15 s |
| `GET /api/gamepad/:id` | WebSocket upgrade | The live controller socket (below) |
| `GET /api/controller-profiles` | | `ControllerProfile[]`: the built-in presets (`PRESETS` in the device SDK) first, then the saved ones |
| `PUT /api/controller-profiles/:id` | `ControllerProfile` (its `id` must equal `:id`) | The saved profile. `409 { error: "read_only" }` for a preset id, `409 { error: "too_many" }` past 50 saved profiles |
| `DELETE /api/controller-profiles/:id` | | `{ ok: true }`; `409 { error: "read_only" }` for a preset, `404` if there is no such profile |

Saved profiles live in `controller-profiles.json` next to the hub config, mode 0600.

## Live controller socket
`GET /api/gamepad/:id` upgrades to a WebSocket for a device with a `gamepad` capability. It needs the
session cookie like every `/api` route. Browsers cannot add headers to a WebSocket, so instead of
`x-dr4w-client` the `Origin` header must be the hub's own origin (from `DR4W_HOME_URL`, or the address
the hub prints), or a loopback origin (`localhost`, `127.0.0.1`, `[::1]`) that equals the request's
`Host` (the dev server). Anything else gets `403` before the upgrade; an unknown device gets `404`, a
request without `Upgrade: websocket` gets `426 { error: "upgrade_required" }`.

Types are in `packages/device-sdk/src/gamepad.ts`.

| Direction | Message | Meaning |
|---|---|---|
| Phone to hub | `GamepadFrame` `{ s, b, lx, ly, rx, ry }` as JSON text | A full snapshot: `s` counts up, `b` is a bitmask in `GAMEPAD_BUTTONS` order, sticks -100 to 100. Send on every change and at least every `HEARTBEAT_MS` (40 ms). |
| Hub to phone | `{ t: "state", connected, output, waiting? }` | On connect and whenever the output's connection changes. When `connected` is false, `waiting` (if the output knows) says what is missing: `pair` (pair on the console, e.g. Change Grip/Order), `starting` (the service that drives the console is starting and has not answered yet; input waits) or `down` (the hub cannot reach that service) |
| Hub to phone | `{ t: "ack", s, ms }` | Frame `s` was written; `ms` is hub receive to output write |
| Hub to phone | `{ t: "error", reason: "invalid" }` | The frame did not match `GamepadFrameSchema` and was dropped. After 20 invalid frames in a row the hub closes the socket (code 1008). |
| Hub to phone | `{ t: "error", reason: "busy" }` | Another phone is the controller for this device; the socket is closed (code 1013) |
| Hub | closes with code 1001 | No message from the phone for 5 s (`SILENT_MS`; a phone sends every 40 ms): it is gone, and the device is free for the next phone. Messages over 1 KiB are refused |

Rules the hub keeps:
- A frame whose `s` is not greater than the last one is ignored (late or repeated).
- At most 250 frames per second per socket: a faster frame waits for the gap and is replaced by any
  newer one, so only the newest is written.
- **Watchdog:** when no frame arrives for `WATCHDOG_MS` (100 ms), or the socket closes or fails, the hub
  releases every button and centres the sticks. Nothing stays held after a Wi-Fi drop.
- One controller session per device at a time.

## Results
A command answers `{ ok: true, applied: "confirmed" | "assumed", ms }` when the device confirmed the new
state (or, for devices that cannot report, when it was sent), or `{ ok: false, reason, detail?, ms }`
with `reason` one of `unsupported`, `invalidState`, `unreachable`, `timeout`, `needsConfirmation`,
`blocked`, `rejected`. `needsConfirmation` means: ask the person, then repeat with `confirmed: true`.
`blocked` commands are never sent, whatever the request says.

Errors outside commands use the dr4w error bodies: `400 { error: "invalid_request", issues }`,
`403 { error: "forbidden" }`, `404 { error: "not_found" }`, `409 { error: "read_only" | "too_many" }`,
`426 { error: "upgrade_required" }`, `429 { error: "rate_limited" }`, `500 { error: "internal" }`.
