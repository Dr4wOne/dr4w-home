# Remote access

**Recommended: a private VPN, with Tailscale.** The hub has no public address, and nothing in the kit
opens a port on your router. Away from home, your phone joins your own private network and reaches the
hub as if it were at home. The same tool gives the hub a real HTTPS certificate, which an iPhone needs to
install the app properly. Why this and not the alternatives: [https-on-lan.md](https-on-lan.md),
[ADR 0004](decisions/0004-vpn-first-remote-access.md).

## Why there is no public endpoint
The hub can turn on your TV and change your devices. A public URL, even behind a login, invites every
scanner on the internet to try. A VPN makes the hub invisible to anyone who is not on your network.

## Set it up (about 15 minutes, free)
1. On the hub machine, install Tailscale from <https://tailscale.com/download/linux> and run
   `sudo tailscale up`.
2. In the Tailscale admin console → **Machines**, rename the hub to something neutral, such as `hub`.
   Do this first: the name is published in public certificate logs when HTTPS is turned on.
3. Admin console → **DNS**: check that MagicDNS is on; then enable **HTTPS certificates**.
4. On the hub: `sudo tailscale serve --bg 8790` (the hub's port). It prints the address, for example
   `https://hub.tail1234ab.ts.net`. Then set `"bind": "127.0.0.1"` in the config, so plain HTTP is no
   longer reachable on your Wi-Fi, and set `DR4W_HOME_URL` to that address in the hub's environment (the
   systemd unit or Compose file), so sign-in links use it. Restart the hub.
5. On the iPhone: install Tailscale from the App Store, sign in with the same account, and set
   **VPN On Demand** to "Always" for Wi-Fi and cellular.
6. Open the printed address in Safari, sign the phone in with `pnpm hub link`, then Share →
   **Add to Home Screen**.
7. Check: with Wi-Fi off, on mobile data, open the app and turn the TV's volume up and down.

## Without Tailscale
Own domain plus DNS-01 certificates (Caddy or acme.sh) for HTTPS, plus any VPN (WireGuard, Headscale)
for remote access. It avoids a third-party control plane but takes more steps; see
[https-on-lan.md](https-on-lan.md) option 2. Do not forward the hub's port on your router.
