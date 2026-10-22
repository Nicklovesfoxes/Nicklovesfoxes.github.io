---
layout: page
title: VPS Proxy
description: Rented VPS Routing all inbound traffic
toc: "true"
---
**Hardware:** Rented VPS - RackNerd
**OS:** Ubuntu 24.04
**Management:** SSH Key
**Role:** Proxy
**Backup Located**: None - rebuilt from this page (see [Emergency Plans](/Documentation/Emergency%20Plans))

This environment utilizes a Virtual Private Server (VPS) as the primary public-facing ingress point. Cloudflare sits in front of it for the web records (see [Overview - Cloudflare](/Documentation/Overview#cloudflare)). Caddy is deployed on the VPS to handle all external HTTP and HTTPS traffic, managing SSL certificates and routing.

To securely access internal services, the VPS acts as a gateway, connected to the local Proxmox environment via a WireGuard VPN tunnel (see [Router](/Documentation/Network/Router)). Caddy forwards requests through the WireGuard tunnel to the internal `192.168.20.x` and `192.168.35.x` subnets, including to Authentik for single sign-on - Authentik runs on its own [Auth Server](/Documentation/VMs/Auth%20Server) VM, not on the VPS itself.

There is **no Docker on this box**. Caddy and HAProxy both run natively under systemd.

---
## Caddy

Caddy location: `/etc/caddy/Caddyfile` (systemd service `caddy`). The old `/opt/docker/caddy` container and the `proxy` Docker network are gone.

The Caddyfile has:
- A **global block** that trusts Cloudflare's IP ranges as proxies, so the real client IP comes from Cloudflare's headers instead of every request looking like it came from Cloudflare. It also sets `order abort first`, so the Cloudflare-only check below runs before `forward_auth` and `handle`.
- A **`(cloudflare_only)` snippet** that drops (`abort`) any request whose connection doesn't come from a Cloudflare IP. It's imported into every proxied site, so nobody can skip Cloudflare by sending requests straight to the VPS IP with a forged `Host:` header. `jelly` is the one exception - it's DNS-only (see [Overview - Cloudflare](/Documentation/Overview#cloudflare)).
- An **`(authentik)` snippet** with the forward-auth config, imported into each site that is gated by Authentik.
- One site block per subdomain - see [Overview - Core Public Routing](/Documentation/Overview#core-public-routing) for the full list.

Per-site rules (2026-10-16):
- **Vaultwarden:** `/admin` returns 403 from the internet. The admin panel is only reachable on the LAN.
- **CouchDB (Obsidian):** every server-level endpoint (`/_*` - `/_utils`, `/_node`, `/_users`, `/_all_dbs`, ...) returns 403 except `/_session`. Sync only needs the database path and the session endpoint.
- **Pterodactyl panel:** only the endpoint Wings uses to call back skips Authentik. Everything else, including the rest of the API, needs an Authentik login.

Changes are applied with a graceful `systemctl reload caddy` after `caddy validate`, with a timestamped backup of the old Caddyfile in `/etc/caddy/`.
---
## Firewall

There are two firewalls in front of this box. Inbound traffic hits RackNerd's Network Firewall first, then the OS iptables rules below. A port has to be allowed in both to get through.

### Provider firewall (RackNerd Firewall)

![](/assets/images/racknerd-firewall-rules.png)
> Anything not listed is blocked inbound; outbound is open.

| **Protocol** | **Port**      | **Note**         |
| ------------ | ------------- | ---------------- |
| TCP          | `<ssh>`       | SSH              |
| TCP          | `80`          | HTTP             |
| TCP          | `443`         | HTTPS            |
| TCP          | `<minecraft>` | Minecraft range  |
| UDP          | `<wireguard>` | WireGuard tunnel |

---
### OS firewall (iptables)

> IPv6 is disabled on this VPS, so there is no `ip6tables` ruleset - only the IPv4 rules below apply.

**Current iptables ruleset**
```
*nat
:PREROUTING ACCEPT [0:0]
:INPUT ACCEPT [0:0]
:OUTPUT ACCEPT [0:0]
:POSTROUTING ACCEPT [0:0]
-A POSTROUTING -s 10.8.0.0/24 -o eth0 -j MASQUERADE
-A POSTROUTING -s 192.168.20.0/24 -o eth0 -j MASQUERADE
COMMIT

*filter
:INPUT DROP [0:0]
:FORWARD DROP [0:0]
:OUTPUT ACCEPT [0:0]

# fail2ban adds its own f2b-sshd chain + jump at runtime (NOT saved - see Persistence)

# Loopback
-A INPUT -i lo -j ACCEPT

# Established/related traffic (this is what lets Caddy/HAProxy replies back in)
-A INPUT -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT
-A FORWARD -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT

# Drop invalid packets
-A INPUT -m conntrack --ctstate INVALID -j DROP

# From the tunnel: only ping and SSH - no public ping
-A INPUT -i wg0 -p icmp -j ACCEPT
-A INPUT -i wg0 -p tcp --dport <ssh> -j ACCEPT

# SSH from the internet: drop more than 4 new connections/min (burst 6) per source IP
-A INPUT -p tcp --dport <ssh> -m conntrack --ctstate NEW -m hashlimit --hashlimit-name ssh --hashlimit-mode srcip --hashlimit-above 4/minute --hashlimit-burst 6 -j DROP

# Service ports
-A INPUT -p tcp --dport <ssh> -j ACCEPT
-A INPUT -p udp --dport <wireguard> -j ACCEPT
-A INPUT -p tcp --dport <http> -j ACCEPT
-A INPUT -p tcp --dport <https> -j ACCEPT
-A INPUT -p tcp --dport <minecraft> -j ACCEPT

# Forward: only lab -> internet, only from the tunnel and server subnets
-A FORWARD -s 10.8.0.0/24 -i wg0 -o eth0 -j ACCEPT
-A FORWARD -s 192.168.20.0/24 -i wg0 -o eth0 -j ACCEPT

COMMIT
```

**What the 2026-10-14 tightening changed:**
- INPUT from `wg0` is limited to ping + SSH. The lab can no longer reach other ports on the VPS (Caddy/HAProxy are unaffected - they open the connections, replies come back as established).
- SSH is rate limited per source IP on top of key-only auth and fail2ban.
- FORWARD only allows `10.8.0.0/24` and `192.168.20.0/24` out `eth0` (was anything from `wg0`, anywhere). Return traffic is covered by the established rule.
- Added the INVALID drop (it was documented before but wasn't actually live).
- Applied with `iptables-apply` (60s auto-rollback). Backups of the previous rules are in `/etc/iptables/rules.v4.bak-20261014-183926` and `/root/iptables-live-20261014-183926.txt`.
- Verified after: fresh SSH, every web subdomain, and a Minecraft status ping through HAProxy to Velocity.

**Changes from the old VPS:**
- Tunnel subnet is `10.8.0.0/24` (was `10.10.0.0/24`).
- NAT masquerades both `10.8.0.0/24` and `192.168.20.0/24`.
- ICMP is only accepted on `wg0`. No public ping, and no DHCP client rule.
- fail2ban adds an `f2b-sshd` chain.

#### Persistence

Rules are saved with `netfilter-persistent`, but **with fail2ban's lines stripped out**:

```
iptables-save | grep -v f2b- > /etc/iptables/rules.v4
```

Why: fail2ban creates its `f2b-*` chains and jump rules itself when it starts. If they get saved into `rules.v4`, then on reboot the saved copy loads first and fail2ban adds its own on top, giving duplicate jumps and stale bans baked into the file. Keeping them out lets fail2ban own its rules.

---
## WireGuard Tunnel (VPS side)

The VPS runs a WireGuard interface `wg0` that tunnels to the router, giving Caddy and HAProxy a path into the 192.168.20.x and 192.168.35.x Proxmox subnets without exposing them directly to the internet. Router-side peer config is documented on the [Router](/Documentation/Network/Router) page.

| **Item**        | **Value**                                     |     |
| --------------- | --------------------------------------------- | --- |
| **Interface**   | `wg0`, `10.8.0.1/24`                          |     |
| **MTU**         | `1420`                                        |     |
| **Listen Port** | Not published                                 |     |
| **Peer**        | UDM Pro, `10.8.0.2`                           |     |
| **AllowedIPs**  | `192.168.20.0/24`, `192.168.35.0/24`          |     |

---

## Minecraft Traffic Proxying (HAProxy)

Minecraft traffic is proxied through **HAProxy**, running directly on the VPS (not containerized). It's a plain layer 4 (TCP) proxy: it listens on a range of Minecraft ports and forwards each one to the same port on `192.168.20.9` over the WireGuard tunnel. Nothing is port-forwarded at the network level - HAProxy ends the player's connection on the VPS and opens a new one to the backend.

**Config: `/etc/haproxy/haproxy.cfg`** 

---

## Tunnel Monitoring / Alerting

A small job on the VPS checks whether the WireGuard tunnel is down. If it is, it pushes the equivalent of an amber alert to my phone, even through Do Not Disturb. It existed on the old VPS and has been set up on the new one.

---

## Hardening
Unnecessary services have been disabled to harden the public-facing VPS. Automatic unattended upgrades are enabled. SSH is key-only (`PasswordAuthentication no`, `PermitRootLogin no`), fail2ban watches it, and new SSH connections are rate limited per IP (see [Firewall](/Documentation/Network/VPS%20Proxy#os-firewall-iptables)).
