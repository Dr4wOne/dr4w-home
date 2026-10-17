# dr4w home — agent guide

An open-source home hub: device adapters as plugins, a hub server on the home network, a phone-first
web app, and a static demo. Public repository: write nothing personal into it, ever.

## Layout
| Path | What |
|---|---|
| `packages/device-sdk` | The adapter contract, capability types, `predict`, `runScene`, zod schemas (`/schema`) |
| `packages/adapter-*` | One package per device type (`adapter-android-tv`, `adapter-demo`) |
| `packages/intent` | The command bar's text → action engine (deterministic by default) |
| `packages/client` | `HomeSource`: the web app's one interface, for demo mode and a real hub |
| `apps/hub` | Node server: loads adapters from config, registry, scenes, API, serves the web app |
| `apps/web` | The phone app (PWA) |
| `apps/showcase` | The static demo site for home.dr4w.io |
| `docs/` | Quickstart, architecture, API, add-a-device recipe, security, decisions |

## Rules
- **Privacy.** No IP addresses, MAC addresses, serials, names, app lists or tokens from a real home.
  Recorded traffic goes through `node scripts/privacy.ts scrub` before it enters the repo. `pnpm privacy`
  must pass. Use documentation addresses (`192.0.2.x`) and locally administered MACs (`02:…`) in examples.
- **Devices.** Read-only exploration first. Every adapter keeps a block-list of commands it must never
  send (factory reset, firmware, developer settings). Read state back after every command. Never send a
  test command to a real device based on cached state, and never while someone may be using it without
  the owner's agreement.
- **Never** deploy (`wrangler deploy`), merge to `main`, change DNS or GitHub settings, or make the repo
  public without the owner's explicit "go".
- Code: TypeScript ESM, Node 24 type stripping (no enums, no parameter properties), Biome, zod at every
  boundary, one JSON log object per line. Versions: the `catalog:` in `pnpm-workspace.yaml`; never add
  `minimumReleaseAgeExclude`.
- Docs for people are plain, complete English. The repo is the memory: `docs/STATUS.md`, ADRs in
  `docs/decisions/`.

## Commands
`pnpm check` · `pnpm dev:demo` · `pnpm hub pair <tv-ip>` · `pnpm hub link` · `pnpm device:new <name>` ·
`pnpm privacy`. Adding a device: `docs/add-a-device.md` or `/device-new <name>`.
