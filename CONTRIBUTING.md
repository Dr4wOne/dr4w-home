# Contributing

Thanks for helping. The most useful contribution is a new device adapter: follow
[docs/add-a-device.md](docs/add-a-device.md).

## Setup
Node.js 24 and pnpm 12 (`corepack enable`). Then `pnpm install` and `pnpm check` (lint, privacy check,
typecheck, tests, build). `pnpm dev:demo` runs the app on simulated devices.

## Rules
- **Never commit anything from your home:** IP addresses, MAC addresses, serial numbers, device or
  account names, app lists, tokens, certificates. Scrub recordings with `node scripts/privacy.ts scrub`.
  CI rejects private addresses and real MACs.
- **Device safety:** no command that cannot be undone (factory reset, firmware, developer settings) in any
  adapter, even behind a flag. Read the state back after every command.
- **Code:** TypeScript ESM, Biome formatting (`pnpm format`), zod for every input that crosses a boundary,
  tests for every piece of logic. Accessibility is not optional: 44 px targets, VoiceOver names, both themes.
- **Versions** come from the `catalog:` in `pnpm-workspace.yaml`. New packages must be at least a few
  days old (pnpm's release-age policy); pin an older version rather than adding an exception.
- Pull requests: one topic each, a clear description, `pnpm check` green.

## Project memory
`docs/STATUS.md` says where things stand; decisions are in `docs/decisions/` (one file each).
