# Quickstart

Three ways in, from no commitment to your own TV.

## 1. Try the showcase (1 minute)
Open <https://home.dr4w.io> on your phone. Everything runs in your browser on simulated devices; nothing
real is controlled and nothing is sent anywhere.

## 2. Run demo mode on your computer (under 5 minutes)
You need Git, Node.js 24 and pnpm 12. Check with `node -v` (v24.x) and `pnpm -v` (12.x). If pnpm is
missing, `corepack enable` installs the version this repo names in `package.json`; or see
<https://pnpm.io/installation>.

```bash
git clone https://github.com/Dr4wOne/dr4w-home
cd dr4w-home
pnpm install
pnpm dev:demo
```

Open the address it prints (usually `http://localhost:5180`; the port is higher if 5180 is busy). You get
the full app on a simulated living room: tap a card, open the TV remote, type "movie night" in the
command bar, or open **Settings → Simulate hub down** to see what the app does when it cannot reach home.

## 3. Connect your own TV (about 30 minutes)
Works with Android TV and Google TV (most Sony, Philips, TCL, Hisense and Chromecast with Google TV
devices). You need a computer that stays on at home (a Linux mini PC or a Raspberry Pi 4 or newer) on
the same network as the TV.

1. **Run the hub.** Either with Docker:
   ```bash
   git clone https://github.com/Dr4wOne/dr4w-home && cd dr4w-home
   docker compose up -d
   ```
   or from the clone: `pnpm install && pnpm --filter @dr4w-home/hub start`.
   Docker's host networking, which the hub needs for Wake-on-LAN and device discovery, works on Linux.
   On macOS or Windows, run the hub from the clone instead.
2. **Find the TV's address.** On the TV: Settings → Network → About (or your router's device list).
3. **Pair.** Stand in front of the TV and run `pnpm hub pair <tv-address>` (with Docker:
   `docker compose exec hub pnpm hub pair <tv-address>`). A six-character code appears on the TV; type it.
   The hub saves the TV's credentials in `~/.config/dr4w-home/` and adds it to your config.
4. **Phone.** Set up HTTPS and remote access with Tailscale ([remote-access.md](remote-access.md)),
   then run `pnpm hub link` on the hub and scan the QR code with your phone. Add the page to your Home
   Screen.
5. **Check.** Turn the TV's volume up and down from the phone. The number on the screen is the TV's own
   report, not a guess.

Your config, credentials and scenes stay in `~/.config/dr4w-home/`. Back that folder up (see
[examples/config](../examples/config)); without it you only need to pair again.

## If something fails
| Symptom | Fix |
|---|---|
| The app says "Not signed in" | Run `pnpm hub link` on the hub and open the new link on the phone |
| Pairing times out | The TV must be on and on the same network; some TVs need "Remote control" apps allowed in settings |
| The TV is "offline" after a router restart | Wait 30 s: the hub looks for the TV again by its certificate, not its address |
| The app will not install on the iPhone | It needs HTTPS: use the Tailscale address, not `http://192.168…` |
