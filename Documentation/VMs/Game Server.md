---
layout: page
title: Game Server
description: Game Server for any hosted games
toc: "true"
---
**IP:** `192.168.20.9`

Pterodactyl (game server panel + node) is proxied through Caddy and gated by Authentik, same pattern as Proxmox - only the endpoint Wings uses to call back skips it (see [VPS Proxy - Caddy](/Documentation/Network/VPS%20Proxy#caddy)). Minecraft traffic itself (raw ports, not HTTP) is proxied separately through HAProxy on the VPS - see the [VPS Proxy](/Documentation/Network/VPS%20Proxy#minecraft-traffic-proxying-haproxy) page. Only the Velocity port gets the player's real IP; the other ports see the tunnel IP instead.

---
## Pterodactyl Install

Not Docker. Only the game servers themselves run in Docker containers that Wings launches.

### Panel
- Bare-metal install at `/var/www/pterodactyl`
- Public at `panel.example.com`, behind Authentik.

### Wings
- systemd service, config at `/etc/pterodactyl/config.yml`.
- API with **SSL off** - Caddy on the VPS terminates TLS for `wings.example.com`
- `remote` and `allowed_origins` are set to `panel.example.com`.

---
## Minecraft Ports

HAProxy on the VPS proxies each port at layer 4 to the same port on `192.168.20.9`.

A contiguous range of ports is used.

---

![](/assets/images/game-server-vm-specs.png)

**VM Specs:** 6 vCPUs, 30 GiB RAM, 200 GiB boot disk.

---
## Exposure

This is likely the most vulnerable point to DDoS attacks in the whole architecture. Every other public-facing subdomain goes through Cloudflare and then Caddy (see [Overview](/Documentation/Overview) - Core Public Routing), which gates HTTP traffic through an application-aware layer before it reaches anything else. The Minecraft ports skip that entirely - HAProxy on the VPS accepts raw TCP directly on those ports per the firewall rules on [VPS Proxy](/Documentation/Network/VPS%20Proxy), so a flood aimed at them hits the VPS's raw network stack instead of something that can inspect or rate-limit application traffic. It's also the widest open port range anywhere in the setup - a whole range of ports versus just HTTP/HTTPS for everything else.

Other things to know:
- **Arena and Lobby are reachable directly** on their own ports, but they only accept logins forwarded by Velocity with a shared secret (FabricProxy-Lite, modern forwarding). A direct login is disconnected with "This server requires you to connect with Velocity."
- **The apex `example.com` is DNS-only** so Minecraft works, which exposes the VPS IP. `jelly` and `highbl` are DNS-only too, so the VPS IP is public either way - Cloudflare only protects the proxied web subdomains.
