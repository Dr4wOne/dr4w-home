# Security and privacy

## Who can do what
| Who | Can |
|---|---|
| Anyone on your home network | Load the app's files and `/health` (which says only whether *they* are signed in) |
| A signed-in phone | Read device state, send allowed commands, run scenes |
| The hub machine's own user | Mint sign-in links (`pnpm hub link`, which proves it can read the hub secret), pair devices |
| Anyone on the internet | Nothing: the hub has no public address ([remote-access.md](remote-access.md)) |

- **Minting links** needs a loopback request *and* a proof made from `hub-secret`, and is refused if a
  proxy header is present. Loopback alone is not enough: `tailscale serve` forwards every tailnet request
  from 127.0.0.1 (found and fixed on 2026-10-17).
- **Sign-in.** A link minted on the hub works once and expires after 10 minutes. It sets an HttpOnly,
  SameSite=Strict cookie. To sign every phone out, delete `~/.config/dr4w-home/lan-secret` and restart
  the hub.
- **Requests.** Every body is validated with zod; unknown fields are rejected. Requests that change
  anything need the `x-dr4w-client: 1` header, which another website cannot add. 60 requests per 10 s
  per address.
- **Dangerous commands.** Every adapter keeps a block-list (factory reset, firmware, developer settings,
  pairing); blocked commands never leave the hub, whatever the request says. Commands marked `confirm`
  (loud volume, powering off a console mid-game) need a yes in the app.
- **Device credentials** (client keys, pinned certificates) live in the hub's state directory, mode 0600.
  They never leave the hub.

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
