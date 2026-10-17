# Nintendo Switch 2: protocol

The console itself is never addressed over the network. The adapter speaks to the TV through the hub
(the TV adapter's own protocol) and to an output for live input.

| Capability | Message or call | Read-back | Verified on real hardware | Evidence |
|---|---|---|---|---|
| Power on | TV `power set on`, then TV `inputSource select <tvInputId>` | None from the console; the TV's state only | No (the TV adapter blocks `inputSource` today) | discovery.md |
| Power off | Never sent: blocked. The console sleeps through Match TV Power State when the TV turns off | None | Setting read on the owner's console; Nintendo documents the behaviour | discovery.md |
| Activity | The TV's current app is `tvInputAppId` and the hub selected the console's input | Assumed | Input app seen on the owner's TV | discovery.md |
| Gamepad | Frames to the nxbt sidecar (below) | The sidecar's `status` | nxbt input verified on the owner's console; the sidecar itself not yet | discovery.md |

## Sidecar socket
Newline-delimited JSON on a Unix socket (default `/run/dr4w-home/gamepad.sock`, mode 0660, group
`dr4w-home`). A line longer than 512 bytes closes the connection.

| Hub sends | Sidecar does | Reply |
|---|---|---|
| `{"op":"frame","b":…,"lx":…,"ly":…,"rx":…,"ry":…}` | Sets the whole controller input (buttons in `GAMEPAD_BUTTONS` order; sticks -100 to 100, the same range and direction as nxbt) | None |
| `{"op":"release"}` | Releases every button and centres the sticks | None |
| `{"op":"status"}` | Nothing | `{"connected": bool, "state": "<nxbt state>"}` (`initializing`, `connecting`, `reconnecting`, `connected`, `crashed`) |
| Anything else (unknown op or field, out-of-range value, not JSON) | Nothing | `{"error":"invalid"}` |

The sidecar releases all input whenever a client disconnects, and on exit (SIGTERM, SIGINT) also gives
BlueZ its plugins back (`toggle_clean_bluez(False)`).

## Blocked commands

| Command | Why |
|---|---|
| `power set off` | The hub must not turn a console off mid-game; Match TV Power State does it with the TV |
| Every other command type | The console has no other control path |
