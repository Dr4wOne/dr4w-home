# HTTPS for a self-hosted smart-home hub PWA on iPhone

Research date: 2026-10-16. Sources were fetched on that date. A "validated" date means the date shown on the page.

## Problem

- A Node.js hub runs on a home Linux box at a LAN IP such as 192.168.x.y. It serves a React PWA.
- The main client is an iPhone with iOS Safari 26, which installs the app with Add to Home Screen.
- Service workers, and so an offline shell, need a secure context. `http://192.168.x.y` is not a secure context. `http://localhost` is, but only on the hub itself.
- Remote access must go through a private VPN only. The hub has no public endpoint.

## Short answer

- **Owner:** use Tailscale. Run `tailscale serve --bg 3000` on the hub and open `https://<machine>.<tailnet>.ts.net` on the iPhone. This one tool gives a real Let's Encrypt certificate and private remote access. It also works at home, over a direct peer-to-peer path. Setup takes about 15 minutes, costs nothing, and needs no router or DNS changes.
- **Kit users (quickstart):** make Tailscale the default path, with the same steps. Document "own domain + DNS-01" as the advanced path for users who already own a domain or do not want a third-party control plane. Do not offer mkcert or a private CA as a quickstart path. It is fragile on iOS and it is a security risk for non-experts.
- **Privacy cost of the default:** the full hostname, for example `hub.tail1234ab.ts.net`, is published in public Certificate Transparency (CT) logs. Choose a neutral machine name such as `hub`, not a name like `smiths-house-alarm`, before you enable HTTPS.

## Comparison

| Option | Secure context on iPhone | Also remote access | Setup time | Cost | Privacy | Main failure modes |
|---|---|---|---|---|---|---|
| 1. Tailscale + `tailscale serve` (`*.ts.net` Let's Encrypt cert) | Yes, publicly trusted cert | Yes, built-in VPN | ~15 min | Free (Personal plan: up to 6 users, unlimited user devices) | Machine name and tailnet name appear in CT logs. Tailscale (company) runs the control plane but never sees the private key. | Name does not resolve when the Tailscale VPN on the iPhone is off. Origin changes if the machine or tailnet is renamed. Depends on Tailscale's service. |
| 2. Own domain + DNS-01 (Caddy or acme.sh + Cloudflare token) | Yes, publicly trusted cert | No, needs a VPN as well (WireGuard, Tailscale, or Headscale) | 30-90 min | Domain about $10/year; Cloudflare DNS free | Name appears in CT logs. A wildcard cert (`*.home.example.com`) hides the host label. | Router DNS rebinding protection drops answers with private IPs. A Cloudflare API token sits on the hub. Caddy needs a custom build with the DNS module. |
| 3. mkcert or a private CA, root trusted on iOS | Yes, after manual trust (see notes) | No | 20-40 min per device | Free | Nothing is published | Every client needs the root profile installed and trusted by hand. A stolen root key can intercept all TLS traffic of that phone. Hard to support in a quickstart. |
| 4a. Plain WireGuard | No, a VPN alone does not give HTTPS | Yes | 30-60 min plus router port forward | Free | Fully self-hosted | Needs an open UDP port on the router (a public endpoint, though only for WireGuard) and still needs option 2 or 3 for HTTPS. Dynamic IP needs DDNS. |
| 4b. Headscale | No `*.ts.net` certs; still needs option 2 or 3 | Yes, with the Tailscale apps | 1-3 h | Free, plus a public server for the control plane | Self-hosted control plane | Needs a publicly reachable Headscale server with its own TLS. `tailscale cert` is not documented as supported. |
| 5. `.local` mDNS + self-signed cert | No: Safari shows a certificate error, and a service worker does not register on an untrusted cert | No | n/a | Free | n/a | Does not work. A self-signed leaf without a trusted root is the same as option 3 done badly. |
| 5b. Let's Encrypt IP certificate | No: IP certs need http-01 or tls-alpn-01 from the public internet, so a private 192.168.x.y IP cannot be validated | No | n/a | n/a | n/a | Does not work for a LAN-only hub. |

## Option 1: Tailscale (recommended)

### Facts, with sources

- **HTTPS certificates need a tailnet setting.** In the admin console, open the DNS page, enable MagicDNS (it is on by default for tailnets created on or after 2022-10-20), then select **Enable HTTPS** under HTTPS Certificates. You must acknowledge that machine names and the tailnet DNS name will be published on a public ledger. Source: <https://tailscale.com/kb/1153/enabling-https> (last updated 2025-12-10), <https://tailscale.com/kb/1081/magicdns> (validated 2026-01-05).
- **`tailscale serve` provisions and renews the cert itself.** If HTTPS is not enabled yet, the command sends you to a consent web page. Source: <https://tailscale.com/kb/1312/serve> (validated 2026-01-20).
- **`--bg` makes Serve persistent.** It survives reboots and `tailscale down`/`up`. Without `--bg`, Serve stops when the session ends. `tailscale serve status` lists it and `tailscale serve reset` clears it. Source: <https://tailscale.com/kb/1242/tailscale-serve> (validated 2026-01-26).
- **Certificates.** They come from Let's Encrypt with a 90-day lifetime. The certificate private key and the ACME account key are generated and stored on the machine, and Tailscale never sees them. If you run `tailscale cert` and install the files yourself, you must renew them. Requesting certs too often can hit Let's Encrypt rate limits. Source: <https://tailscale.com/kb/1153/enabling-https>.
- **Certificate Transparency.** Only machines where a cert is issued appear in the logs. The tailnet name hides the owner's identity, but the machine name is visible. Tailscale advises renaming machines with sensitive names first. Source: <https://tailscale.com/kb/1153/enabling-https>. Anyone can search the logs, for example at <https://crt.sh/?q=%25.ts.net>.
- **Free plan.** The Personal plan is free for non-commercial use: up to 6 users, unlimited user devices, 50 tagged resources, and "nearly all" features. Source: <https://tailscale.com/pricing> (fetched 2026-10-16).
- **iPhone.** The Tailscale iOS app supports VPN On Demand. Set Wi-Fi to "Always" and Cellular to "Always" so the tunnel comes up by itself. Badly set rules can stop Tailscale from connecting. Source: <https://tailscale.com/kb/1291/ios-vpn-on-demand>.
- **At home (LAN).** Tailscale sends packets directly peer to peer over UDP when it can, and falls back to a peer relay or DERP when NAT traversal fails. Two devices on the same LAN normally connect directly. Check with `tailscale ping <iphone>` or `tailscale status` ("direct" vs "relay"). Source: <https://tailscale.com/kb/1257/connection-types> (validated 2026-06-01). Forum reports exist of LAN peers going through DERP, for example because of NAT-PMP port conflicts: <https://forum.tailscale.com/t/same-lan-multiple-devices-only-one-can-make-direct-connections-via-tailscale/1424>.

### Failure modes and mitigations

1. **VPN off means no name resolution.** `*.ts.net` names resolve only through MagicDNS while the Tailscale VPN is active. Mitigation: turn on VPN On Demand "Always" for Wi-Fi and cellular. The service worker still serves the cached offline shell when the VPN is off, so the app opens and can show "hub unreachable".
2. **The origin is the hostname.** Renaming the machine or the tailnet changes the origin. The installed PWA, its storage and its push subscription then belong to the old origin. Choose the names once, before installing the app.
3. **Third-party dependency.** If Tailscale's coordination service is down, existing connections usually keep working, but new logins and cert renewals fail. Headscale is the escape hatch (option 4b).
4. **Non-Tailscale LAN devices.** Sensors or other devices without Tailscale cannot reach the `ts.net` name. Keep the hub's plain HTTP port on the LAN for device APIs if needed, and serve the PWA through Serve.
5. **CT exposure.** The hostname is public forever once a cert is issued. It does not expose an IP address that anyone can reach, because the 100.x address answers only inside the tailnet.

### Exact steps (owner and kit quickstart)

1. Hub: make the Node server listen on `127.0.0.1:3000` only, so the plain HTTP port is not reachable from the LAN (optional, but safer).
2. Hub: install Tailscale with the official method from <https://tailscale.com/download/linux>, then run `sudo tailscale up` and log in.
3. Admin console, **Machines**: rename the hub to a neutral name such as `hub`. Do this before step 5, because the name goes into public CT logs.
4. Admin console, **DNS**: check that MagicDNS is on. Optionally pick the tailnet DNS name now, because it is part of the origin.
5. Hub: run `sudo tailscale serve --bg 3000`. If HTTPS is not enabled yet, open the consent link that the command prints, and enable HTTPS. The command prints the URL, for example `https://hub.tail1234ab.ts.net`.
6. Hub: run `tailscale serve status` and check that `/` proxies to `http://127.0.0.1:3000`.
7. iPhone: install Tailscale from the App Store and log in with the same account.
8. iPhone, Tailscale app, profile picture, **VPN On Demand**: set Wi-Fi to "Always" and Cellular to "Always".
9. iPhone, Safari: open the printed URL. The first request can take a few seconds while the cert is issued.
10. iPhone, Safari: tap Share, then **Add to Home Screen**. Keep **Open as Web App** on (the default on iOS 26).
11. Check: open the app from the Home Screen, turn on Airplane Mode, and reopen the app. The offline shell must load.
12. Check at home: on the hub, run `tailscale status` and check that the iPhone shows "direct".

For extra users in a kit household, invite them to the tailnet (up to 6 users on the free plan). Each one repeats steps 7 to 10.

## Option 2: own domain + DNS-01

- DNS-01 proves control with a TXT record. The server does not need to be reachable from the internet, and it is required for wildcard certs. The drawback is that DNS API credentials sit on the server. DNS-01 cannot validate IP addresses. Source: <https://letsencrypt.org/docs/challenge-types/> (last updated 2026-02-12).
- Caddy needs a DNS provider module, which is a community plugin and needs a custom build (for example with `xcaddy build --with github.com/caddy-dns/cloudflare`, or the download page at <https://caddyserver.com/download>). Source: <https://caddyserver.com/docs/automatic-https>.
- The Cloudflare token needs `Zone.Zone:Read` and `Zone.DNS:Edit`, scoped to the one zone. Caddyfile: `tls { dns cloudflare {env.CF_API_TOKEN} }`. Source: <https://github.com/caddy-dns/cloudflare>.
- acme.sh works the same way with `dns_cf` and a `CF_Token`, then installs the cert for the Node server or a reverse proxy.

Steps, in short: buy a domain and move its DNS to Cloudflare. Create a scoped API token. Build Caddy with the module. Add an `A` record for `hub.home.example.com` that points to the hub's tailnet IP (100.x) or LAN IP (192.168.x.y). Run Caddy with `reverse_proxy 127.0.0.1:3000`. Then add a VPN for remote access.

Failure modes:

- **DNS rebinding protection.** Many home routers drop public DNS answers that point to private addresses, for example Fritz!Box by default and OpenWrt/dnsmasq with `rebind_protection`. The name then does not resolve on the LAN. The fix is a per-domain exception (`rebind_domain` on OpenWrt, `rebind-domain-ok` in dnsmasq) or a local DNS override. Sources: <https://discourse.pi-hole.net/t/why-wont-pi-hole-work-with-dns-rebind-protection-enabled/3142>, <https://ddev.com/blog/fritzbox-routers-and-ddev/>. Not checked: whether a 100.64.0.0/10 tailnet IP triggers the same protection on each router model.
- **CT exposure.** `hub.home.example.com` appears in CT logs. A wildcard cert hides the host label but still shows the domain, and the domain's WHOIS data can identify the owner.
- **Secret on the hub.** A leaked token lets an attacker change DNS for the zone, so scope it to one zone.
- **Remote access is still missing.** The result is a public DNS name for a private IP, plus a VPN that you need anyway.

Verdict: a good advanced option. It has no third party in the data path, and it can use Headscale or WireGuard for the VPN. It is too many steps for a quickstart.

## Option 3: mkcert or a private CA on iOS

Steps:

1. On the hub, run `mkcert -install` and `mkcert hub.lan 192.168.x.y`, and configure Node or Caddy with the generated files.
2. Copy `rootCA.pem` from `mkcert -CAROOT` to the iPhone, for example with AirDrop or a download.
3. iPhone: Settings > General > VPN & Device Management > install the profile.
4. iPhone: Settings > General > About > Certificate Trust Settings > under "Enable full trust for root certificates", turn the root on. A manually installed profile is not trusted for TLS until this switch is on. Source: Apple, <https://support.apple.com/en-us/102390>. The step exists since iOS 10.3.

Service workers and Add to Home Screen: once the root has full trust, the page is a secure context, so a service worker should register. I found no official Apple or WebKit statement that confirms or denies this for Home Screen web apps. I found only indirect guidance (the root CA must be on the device: <https://doc-kurento.readthedocs.io/en/latest/knowledge/selfsigned_certs.html>). This needs a test on a device before anyone relies on it.

Risks:

- The mkcert root can issue a trusted certificate for any domain, for example a bank. Anyone who steals `rootCA-key.pem` from the hub can intercept the phone's TLS traffic. mkcert's own README warns against sharing the root key.
- Every new phone, and every reinstall, repeats steps 2 to 4. Non-technical users find the profile and trust screens confusing.
- It gives no remote access.

Verdict: acceptable for one technical owner who tests it on a device. Not acceptable for kit users.

## Option 4: WireGuard or Headscale

- **Plain WireGuard** (official iOS app) gives remote access, but no certificate. You still need option 2 or 3 for HTTPS. It also needs a forwarded UDP port and DDNS on most home connections, so the router becomes a public endpoint (for WireGuard only).
- **Headscale** is a self-hosted Tailscale control server. It supports MagicDNS, ACLs, subnet routers, an embedded DERP server and the official Tailscale apps. Source: <https://headscale.net/stable/about/features/>. Its feature page does not list `tailscale cert` or HTTPS certificates. Serve and Funnel appear only as links to GitHub issues, so treat `*.ts.net`-style certs as not available and pair Headscale with option 2. Headscale itself needs a publicly reachable server with TLS, for example a small VPS.

## Option 5: other options that fail

- **`.local` mDNS with a self-signed certificate.** Safari rejects the certificate. A service worker does not register on a page with a certificate error, and Let's Encrypt cannot issue for `.local`.
- **Let's Encrypt IP certificates.** These are generally available since 2026-01-15 as short-lived (160-hour) certs, but they need http-01 or tls-alpn-01 validation from the internet. A private 192.168.x.y address cannot be validated. Source: <https://www.helpnetsecurity.com/2026/01/20/lets-encrypt-6-day-tls-certificates/>.
- **`http://localhost`.** It is a secure context only on the hub, not on the phone.

## iOS Safari facts (as of October 2026)

Note: caniuse already lists iOS Safari 27.x. iOS 27 probably shipped in September 2026, so check the version on the target phone.

| Feature | iOS Safari status | Source |
|---|---|---|
| Web Bluetooth | Not supported in any version, including 26.x and 27.x. Only a third-party Safari extension (iOSWebBLE) polyfills it. | <https://caniuse.com/web-bluetooth> |
| WebHID | Not supported in any version | <https://caniuse.com/webhid> |
| Vibration API (`navigator.vibrate`) | Not supported in any version (3.2 to 27.2) | <https://caniuse.com/vibration> |
| DeviceMotion | Needs `DeviceMotionEvent.requestPermission()` since iOS 13. Call it from a tap handler (transient activation), in a secure context. Feature-detect with `typeof DeviceMotionEvent.requestPermission === "function"`. | <https://developer.mozilla.org/en-US/docs/Web/API/DeviceMotionEvent/requestPermission_static>, <https://bugs.webkit.org/show_bug.cgi?id=201676> |
| Web Push | Works for Home Screen web apps since iOS 16.4. Needs a manifest with `display: standalone` or `fullscreen`, and the permission request must follow a user tap. | <https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/> (2023-02-16) |
| View Transitions (same-document) | Supported since Safari 18.0 / iOS 18.0 | <https://caniuse.com/view-transitions> |
| Add to Home Screen on iOS 26 | Every site added to the Home Screen opens as a web app by default; the user can turn off "Open as Web App". Existing web app features stay. | <https://webkit.org/blog/16993/news-from-wwdc25-web-technology-coming-this-fall-in-safari-26-beta/> |

Consequence for the hub: Bluetooth or HID device access and haptics cannot run in the PWA on iPhone. They must run on the hub, which then exposes them over HTTP or WebSocket. Push notifications to the iPhone work, but only after installation and a user tap.

## Not verified

- No device test of mkcert with a Home Screen web app and a service worker.
- Whether Headscale supports `tailscale cert`: it is not documented, and I did not search the source code.
- Whether router rebinding protection blocks 100.64.0.0/10 answers.
- WebSocket handling through `tailscale serve` was not checked in the docs. The Serve docs describe an HTTP reverse proxy.
