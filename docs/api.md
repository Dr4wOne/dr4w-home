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

## Results
A command answers `{ ok: true, applied: "confirmed" | "assumed", ms }` when the device confirmed the new
state (or, for devices that cannot report, when it was sent), or `{ ok: false, reason, detail?, ms }`
with `reason` one of `unsupported`, `invalidState`, `unreachable`, `timeout`, `needsConfirmation`,
`blocked`, `rejected`. `needsConfirmation` means: ask the person, then repeat with `confirmed: true`.
`blocked` commands are never sent, whatever the request says.

Errors outside commands use the dr4w error bodies: `400 { error: "invalid_request", issues }`,
`403 { error: "forbidden" }`, `404 { error: "not_found" }`, `429 { error: "rate_limited" }`,
`500 { error: "internal" }`.
