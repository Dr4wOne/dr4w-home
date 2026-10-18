# Nintendo Switch 2 adapter

The Switch 2 has no network API, so the hub works with it through two things it can reach: the TV the
console is docked to, and an emulated controller. Evidence for every choice: [docs/discovery.md](docs/discovery.md).

| Capability | How | State |
|---|---|---|
| `power` | Delegated to the TV (`via`). Turning on means "TV on, then the console's input". The hub never turns the console off: when the TV turns off, the console's Match TV Power State puts it to sleep. | Assumed |
| `activity` | "On screen" when the TV shows its input app and the hub itself selected the console's input. | Assumed |
| `gamepad` | Live input from the phone over `GET /api/gamepad/:id` ([docs/api.md](../../docs/api.md)), written to an output. | Connected, as the output reports it |

Danger rules: power off and every other command are blocked. Macros need a confirmation in the app
(they are offline single-player only). HOME and Capture are allowed in live input.

Known limit: the Android TV adapter blocks `inputSource` today, because the TV gives no read-back for an
input switch. Until it does, "turn on" switches the TV on and then answers that the TV did not switch to
the console's input, and "on screen" stays unknown.

## Config
One entry in the hub config (`~/.config/dr4w-home/config.json`, see `examples/config/config.example.json`):

```json
{
  "type": "nintendo-switch",
  "devices": [
    {
      "id": "switch2",
      "name": "Nintendo Switch 2",
      "tvDeviceId": "tv",
      "tvInputId": "hdmi2",
      "output": { "kind": "bluetooth", "socket": "/run/dr4w-home/gamepad.sock" }
    }
  ]
}
```

| Field | Meaning |
|---|---|
| `tvDeviceId` | The id of the TV the console is docked to |
| `tvInputId` | The TV input the dock is plugged into |
| `tvInputAppId` | Optional. The TV app id that means "an external input is showing" (default `com-mediatek-wwtv-tvcenter`, the input app found on the owner's TV) |
| `output` | `{ "kind": "demo" }` (default: frames are only recorded) or `{ "kind": "bluetooth", "socket": "…" }` |

A wired USB bridge will be a third output kind behind the same interface (`GamepadOutput`).

## Bluetooth output: the root sidecar
The Bluetooth output emulates a Switch 1 Pro Controller with [nxbt](https://github.com/Brikwerk/nxbt)
0.1.4. nxbt must run as root (it reconfigures BlueZ and opens raw Bluetooth sockets), and the hub must
not. So a small root process, `apps/hub/sidecar/nxbt-sidecar.py`, owns nxbt and nothing else, and the hub
talks to it over a Unix socket that only the `dr4w-home` group can open. Why this is safe enough and
what the sidecar can do: [docs/security.md](../../docs/security.md).

The sidecar is not installed by `pnpm install` or by the hub. Install it by hand, as root, once:

```sh
# 1. A group for the socket, and the hub's user in it (log out and in, or reboot, afterwards so the
#    hub's user service gets the new group).
sudo groupadd --system dr4w-home
sudo usermod -aG dr4w-home "$USER"

# 2. A root-owned venv with nxbt, and a root-owned copy of the sidecar (root never runs a file the
#    hub's user can edit).
sudo install -d -m 0755 /opt/dr4w-home
sudo apt install python3-dbus   # nxbt's dbus-python; building it from pip needs extra headers
sudo python3 -m venv --system-site-packages /opt/dr4w-home/nxbt-venv
sudo /opt/dr4w-home/nxbt-venv/bin/pip install --no-deps nxbt==0.1.4
sudo /opt/dr4w-home/nxbt-venv/bin/pip install blessed psutil pynput cryptography 'Flask<3' 'Flask-SocketIO<6' 'eventlet<0.36'
sudo install -m 0755 -o root -g root apps/hub/sidecar/nxbt-sidecar.py /opt/dr4w-home/nxbt-sidecar.py
sudo /opt/dr4w-home/nxbt-venv/bin/python -I /opt/dr4w-home/nxbt-sidecar.py --self-test

# 3. The system service and its socket. The socket starts the service when the hub connects (only
#    while a phone plays); the service stops itself 10 minutes after the last hub connection.
sudo install -m 0644 -o root -g root apps/hub/sidecar/dr4w-home-nxbt.service apps/hub/sidecar/dr4w-home-nxbt.socket /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now dr4w-home-nxbt.socket
journalctl -u dr4w-home-nxbt -f
```

Updating an install: copy the changed files the same way (step 2 for the sidecar, step 3 for the units),
then `sudo systemctl daemon-reload` and `sudo systemctl restart dr4w-home-nxbt.socket`. To keep the
service running all the time instead, `sudo systemctl start dr4w-home-nxbt` by hand: a service started by
hand never stops itself.

Pairing: on the console open **Controllers → Change Grip/Order** while the service runs. **On a
Switch 2, do this again after every sleep or restart** (of the console or of the service): the console
refuses the emulated controller's reconnect. Playing day to day, the limits and fixes:
[docs/switch-2.md](../../docs/switch-2.md).

How the sidecar recovers: after the first pairing it stores the Switch's address in
`/var/lib/dr4w-home-nxbt/switch-address.json` (root only). When the connection drops, nxbt marks the
controller crashed; 10 s later the sidecar starts a fresh one that tries the saved Switch first (a
Switch 1 may accept it; the Switch 2 does not) and then waits, discoverable, to be paired. nxbt's
discoverable window is 180 s, so the sidecar renews it every 170 s while nothing is paired.

While the service runs, nxbt has started BlueZ with all its plugins off (`--noplugin=*`), so other
Bluetooth keyboards, mice, game controllers and headphones on this machine stop working. When the
service stops (by itself, or `sudo systemctl stop dr4w-home-nxbt`) BlueZ gets its plugins back. To
remove it: `sudo systemctl disable --now dr4w-home-nxbt.socket dr4w-home-nxbt`, then delete
`/etc/systemd/system/dr4w-home-nxbt.service`, `/etc/systemd/system/dr4w-home-nxbt.socket` and
`/opt/dr4w-home`.

## Checking latency
`pnpm --filter @dr4w-home/hub latency` sends 1000 frames at 60 Hz over a real local WebSocket to the
demo output and prints p50, p95 and p99. Add `--sidecar /run/dr4w-home/gamepad.sock` to measure through
a running sidecar (this sends real input to the console: only with nobody playing).
