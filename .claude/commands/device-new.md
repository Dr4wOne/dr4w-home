---
description: Scaffold a new device adapter and walk the add-a-device recipe as a checklist
argument-hint: <name, kebab-case, e.g. demo-fan>
---

Scaffold and build a device adapter named `$ARGUMENTS`.

1. Run `pnpm device:new $ARGUMENTS`. It creates `packages/adapter-$ARGUMENTS/` (manifest, a simulated
   device so tests pass from the start, `fixtures/`, tests, `docs/discovery.md`, `docs/protocol.md`)
   and registers it with the hub and with demo mode. Read what it printed.
2. Open `docs/add-a-device.md` and work through it in order. Copy its checklist into the new package's
   `docs/discovery.md` and tick each item as you finish it. Do not skip the checks at the end of a step.
3. Rules while doing it: read-only exploration first; record real traffic, then scrub it with
   `node scripts/privacy.ts scrub` before it enters the repo; write the block-list before the first
   command that changes anything; read state back after every command.
4. Finish with `pnpm check` green and a new row in `docs/compatibility.md`.
