# Add a device

The recipe for a new adapter, with a check at the end of every step. Start it with
`pnpm device:new <name>` (or `/device-new <name>` in Claude Code), which scaffolds the package and copies
this checklist into its `docs/discovery.md`. A simulated "demo fan" is a good first run.

**Rules for the whole recipe:** read-only exploration first; never factory reset, update firmware or
enable developer settings; record real traffic and scrub it before it enters the repo; write the
block-list before the first command that changes anything; read state back after every command.

## 1. Discover the device and research its protocol
Find out what the device is, how it is reached and whether a documented local API exists (manufacturer
docs, the Home Assistant integration for it, open-source libraries). Look at the ports it answers on,
only on that one device: never scan the network. If nothing is documented, observe what the official app
sends (a packet capture of your own phone and device, or REA for an app's code).
**Check:** `docs/discovery.md` lists the device, the protocol and the evidence for each claim.

## 2. Write `docs/protocol.md` with evidence
For each capability: the message or call, how the new state is read back, whether it was verified on
real hardware, and the evidence (a recorded frame, a doc link).
**Check:** every row has evidence, and unverified rows say so.

## 3. Scaffold
`pnpm device:new <name>`. It creates the package (a simulated device, so its tests pass at once),
registers it with the hub (`apps/hub/src/adapters.ts`: config entries `{ "type": "<name>", "devices":
[{ "id", "name", "room" }] }` in `~/.config/dr4w-home/config.json`, or the file named by
`DR4W_HOME_CONFIG`; see `examples/config/config.example.json`) and with demo mode (`packages/client/src/demo-adapters.ts`, one simulated
device), installs and formats.
**Check:** `pnpm check` passes without any edit.

## 4. Map capabilities
Choose capability types from `packages/device-sdk/src/index.ts`; the reasoning and the Matter and Home
Assistant equivalents are in [capability-model.md](capability-model.md). Quick guide:

| The device has | Use |
|---|---|
| On and off | `power` (state `assumed` if the device cannot report it) |
| A level from 0 to 100 (brightness, volume) | `lightLevel` or `volume` |
| A few named settings (fan speed low/medium/high, picture mode) | `mode`, with the capability's own `label` (next to `id` and `type`, not in `features`) set, for example "Speed" |
| Inputs or sources | `inputSource` |
| Navigation keys | `keypad` (the web app then shows the remote) |

Set the device's `category` (`tv`, `console`, `light`, `speaker`, `fan` or `other`); it picks the icon.
Use `assumed` for anything the device cannot report. Do not invent a new type when one of these fits;
if none does, add it to the SDK, its zod schema, `predict` and `summary`, with tests.
**Check:** `pnpm dev:demo`, open the printed address (add `?demo` to force demo mode when a hub is
running), tap the device: the controls match its capabilities.

## 5. Record and scrub fixtures
Record real sessions into `~/.config/dr4w-home/fixtures-raw/` (outside the repo). Then
`node scripts/privacy.ts scrub ~/.config/dr4w-home/fixtures-raw/<file> packages/adapter-<name>/fixtures/<file>`.
Add your device's identifiers (serials, names) to `~/.config/dr4w-home/deny-list.txt` first.
**Check:** `pnpm privacy` passes; replay tests run on the scrubbed fixtures.

## 6. Write the block-list
List every command that could cause harm or cannot be undone, and return `blocked` from `danger()` for
them (the scaffold's `BLOCKED` list). If the device has no harmful command among the SDK's command
types, say so in `docs/protocol.md` and keep the scaffold's test that a blocked type never reaches the device. Mark `confirm` for commands a person should agree to (loud volume, power off mid-game).
**Check:** a test sends each blocked command and sees `{ ok: false, reason: "blocked" }` without
anything reaching the device.

## 7. Build a custom widget, if needed
The web app generates controls from capabilities (`CapabilityControls` in `apps/web/src/DeviceView.tsx`);
the TV remote is the one custom widget, chosen when a device has a `keypad`. Write a widget only if the
generated controls cannot express the device. Keep 44 px targets, VoiceOver names and both themes.
**Check:** axe reports 0 violations on the device view.

## 8. Pass tests and judges
Replace the simulation with the real protocol behind the same tests. When the adapter needs Node (network
sockets), remove its entry from `packages/client/src/demo-adapters.ts`: demo mode runs in the browser.
A change to a shared package can break others, so always finish with the full `pnpm check`. Run the real-device harness: every
command followed by a read-back, on your own device, with nobody else using it.
**Check:** `pnpm check` is green and the harness shows every command confirmed.

## 9. Update the compatibility table
Add a row to [compatibility.md](compatibility.md): what works, what is verified, on which hardware.
**Check:** the row says only what step 8 proved.
