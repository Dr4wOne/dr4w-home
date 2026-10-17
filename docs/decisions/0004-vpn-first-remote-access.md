# 0004 · Remote access through a private VPN; HTTPS from Tailscale Serve

**Date:** 2026-10-16

## Context
An installable PWA on iPhone needs a secure context; `http://192.168…` is not one. The hub controls real
devices in a home, so it must not have a public endpoint. Options compared in
[https-on-lan.md](../https-on-lan.md).

## Decision
The recommended setup is Tailscale: `tailscale serve --bg <port>` gives the hub a real certificate on a
private `*.ts.net` name and the VPN for remote access in one tool, on the free plan. The advanced
alternative, documented but not the default, is an own domain with DNS-01 certificates plus any VPN.
mkcert and private CAs are not offered to kit users.

## Consequences
The hub's own port listens on loopback or the LAN only. The machine name goes into public Certificate
Transparency logs, so the docs tell users to name it neutrally (`hub`) first. The app works only while
the phone's VPN is on (VPN On Demand "Always"); the offline shell still opens without it.

## Status
Accepted.
