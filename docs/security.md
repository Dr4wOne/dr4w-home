# Security and privacy

## Who can do what
| Who | Can |
|---|---|
| Anyone on your home network | Load the app's files and `/health` (which says only whether *they* are signed in) |
| A signed-in phone | Read device state, send allowed commands, run scenes, be a console's live controller, save controller layouts |
| The hub machine's own user | Mint sign-in links (`pnpm hub link`, which proves it can read the hub secret), pair devices |
| Anyone on the internet | Nothing: the hub has no public address ([remote-access.md](remote-access.md)) |

- **Minting links** needs a loopback request *and* a proof made from `hub-secret`, and is refused if a
  proxy header is present. Loopback alone is not enough: `tailscale serve` forwards every tailnet request
  from 127.0.0.1 (found and fixed on 2026-10-17).
- **Sign-in.** A link minted on the hub works once and expires after 10 minutes. It sets an HttpOnly,
  SameSite=Strict cookie. To sign every phone out, delete `~/.config/dr4w-home/hub-secret` and restart
  the hub.
- **Requests.** Every body is validated with zod; unknown fields are rejected. Requests that change
  anything need the `x-dr4w-client: 1` header, which another website cannot add. 60 requests per 10 s
  per address.
- **Live controller socket.** A WebSocket cannot carry `x-dr4w-client`, so `GET /api/gamepad/:id` needs
  the session cookie and an `Origin` equal to the hub's own origin (or, for the dev server, a loopback
  origin equal to the request's `Host`). A page on another site cannot open it with the phone's cookie.
  Every frame is validated; the hub releases all input 100 ms after the last frame or when the socket
  closes, and only one phone at a time can be a device's controller.
- **Dangerous commands.** Every adapter keeps a block-list (factory reset, firmware, developer settings,
  pairing); blocked commands never leave the hub, whatever the request says. Commands marked `confirm`
  (loud volume, powering off a console mid-game) need a yes in the app.
- **Device credentials** (client keys, pinned certificates) live in the hub's state directory, mode 0600.
  They never leave the hub.

## The Bluetooth sidecar runs as root
Emulating a controller over Bluetooth needs nxbt, and nxbt needs root: it rewrites BlueZ's systemd
override, restarts Bluetooth and opens raw L2CAP sockets. The hub must not run as root, so this one job
lives in a separate system service, `dr4w-home-nxbt` (`apps/hub/sidecar/`), installed by the owner by
hand ([adapter README](../packages/adapter-nintendo-switch/README.md)).
- **What it can do:** press controller buttons and move sticks on the paired Switch, and nothing else.
  It accepts three messages (`frame`, `release`, `status`) with exactly the expected fields and ranges;
  anything else is refused. It has no network listener and runs no commands it receives.
- **Who can talk to it:** its Unix socket `/run/dr4w-home/gamepad.sock` is mode 0660, owned by root and
  the `dr4w-home` group, in a directory of that group (0750). Only root and members of that group (the
  hub's user) can connect. Any process of the hub's user can therefore send controller input, which is
  no more than the hub itself can do.
- **What it changes on the machine:** while it runs, BlueZ runs with all plugins off (`--noplugin=*`),
  so other Bluetooth keyboards, mice, controllers and headphones on the hub machine do not work. On exit it puts BlueZ back.
- **What it stores:** the paired Switch's Bluetooth address, in `/var/lib/dr4w-home-nxbt/` (root only, 0600).
- **Hardening:** root runs only root-owned copies under `/opt/dr4w-home` (never a file the hub's user
  could edit), with `NoNewPrivileges`, `ProtectHome`, `ProtectSystem=full`, a limited capability set and
  only Unix, Bluetooth and netlink sockets. These options are not tested on hardware yet.

## Privacy in this repository
This repository is public. Nothing from a real home goes into it.
- `node scripts/privacy.ts check` (run by `pnpm check` and CI) fails on private IP addresses, real MAC
  addresses and anything on the owner's deny-list, which CI gets as the `PRIVACY_DENYLIST` secret so the
  list itself never leaks. CI also runs gitleaks over the whole history.
- Recorded device traffic is scrubbed with `node scripts/privacy.ts scrub <raw> <public>` before it
  enters the repo: addresses become documentation addresses, MACs become locally administered fakes,
  certificates are removed, and deny-listed names become same-length fakes so recorded frames still decode.
- Examples use documentation addresses (`192.0.2.x`) and fake MACs (`02:…`).

## Reporting a problem
See [SECURITY.md](../SECURITY.md).
