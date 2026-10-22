---
layout: page
title: Overview
description: Homelab overview
toc: "true"
---
![](/assets/images/homelab-network-diagram.png)
> Device-specific detail lives in its own page.

![](/assets/images/rack-under-bed.jpg)
> Rack under bed.

---
## Core Services & Deployment

| **Service**     | **Environment**                      | **Function**                    | **Status / Notes**                                                        | Location       |
| --------------- | ------------------------------------ | ------------------------------- | ------------------------------------------------------------------------- | -------------- |
| **Webserver**   | GitHub Pages                         | Website hosting                 | ~~Proxied via Caddy~~ On GitHub Pages at `post.example.com`               | GitHub         |
| **Caddy**       | Native, systemd                      | Reverse Proxy & SSL             | Primary ingress router, behind Cloudflare                                 | VPS            |
| **HAProxy**     | Native (not containerized)           | Layer 4 Minecraft proxy         | A range of Minecraft ports                                                | VPS            |
| **Authentik**   | Docker                               | Authentication                  | Forward-auth or OIDC for public facing services                           | Auth Server VM |

---
## Core Public Routing

Domain: `example.com`. Everything below goes Cloudflare → Caddy on the [VPS](/Documentation/Network/VPS%20Proxy) → WireGuard → homelab.

| **Subdomain**          | **Internal Destination** | **Purpose / Service**   |
| ---------------------- | ------------------------ | ----------------------- |
| `auth.example.com`     | `192.168.20.10`          | Authentik               |
| `proxmox.example.com`  | `192.168.35.2`           | Proxmox VE              |
| `vault.example.com`    | `192.168.20.10`          | Vaultwarden             |
| `jelly.example.com`    | `192.168.20.8`           | Jellyfin                |
| `audio.example.com`    | `192.168.20.8`           | Audiobookshelf          |
| `panel.example.com`    | `192.168.20.9`           | Pterodactyl panel       |
| `wings.example.com`    | `192.168.20.9`           | Pterodactyl Wings API   |
| `obsidian.example.com` | `192.168.20.11`          | CouchDB (Obsidian sync) |

> **Auth:** most services sit behind Authentik forward-auth at Caddy. Apps with their own clients (mobile apps, sync clients, Wings) can't do an SSO redirect, so those use OIDC inside the app or their own token/login instead.

---
## Cloudflare

Cloudflare sits in front of the domain. Some records have to be DNS-only: Cloudflare's free proxy only handles HTTP/HTTPS (not raw TCP like Minecraft or SSH), and its terms limit streaming video through it.

| **Record**                                       | **Mode** | **Why**                                              |
| ------------------------------------------------ | -------- | ---------------------------------------------------- |
| `*.example.com` (wildcard)                             | Proxied  | Default for all web services                         |
| `audio` and the other web subdomains             | Proxied  | -                                                    |
| `example.com` (apex)                                   | DNS-only | Minecraft - raw TCP can't go through the proxy       |
| `jelly`                                          | DNS-only | Cloudflare free proxy ToS limits video streaming     |
| `highbl`                                         | DNS-only | Minecraft alias                                      |
| SRV record (`_minecraft._tcp.mc`)                | SRV      | Lets players connect to a name without typing a port |

> **Trade-off:** every DNS-only record resolves straight to the VPS IP, so the origin isn't hidden. The proxied records still get Cloudflare's protection because Caddy drops any request that doesn't come from Cloudflare (see [VPS Proxy - Caddy](/Documentation/Network/VPS%20Proxy#caddy)). See [Game Server - Exposure](/Documentation/VMs/Game%20Server#exposure).

---
## Other Notes

## MTU
MTU likes to break stuff, watch out for it. WireGuard's overhead shrinks the effective MTU of everything riding through the tunnel - see the [Router](/Documentation/Network/Router) page for the specific tunnel MTU setting.