---
layout: page
title: Emergency plans
description: What to do when bad stuff happens to the homeLab
toc: "true"
---

**Who:** me - I'm the only admin.

---
## Where Things Live

| **What**                | **Where**                                                                             | **Notes**                                                |
| ----------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| VM backups              | Proxmox Backup Server (PBS) VM on `pve2`, datastore on pve2's RAID                    | Weekly, keeps the last 4. Every VM is included.          |
| Proxmox host configs    | PBS on `pve2`                                                                         | `/etc/pve` and host network config of pve, pve2, pve3    |
| Cisco switch config     | Copy stored on `pve2`                                                                 | Restore over the console cable                           |
| Router (UDM Pro) config | UniFi cloud backup                                                                    | See [Router](/Documentation/Network/Router)              |
| VPS                     | Not backed up - rebuilt from the [VPS Proxy](/Documentation/Network/VPS%20Proxy) page | Stateless by design, holds no lab data                   |
| Passwords               | Vaultwarden on the [Auth Server](/Documentation/VMs/Auth%20Server)                    | Every Bitwarden client also keeps a local encrypted copy |
| Out-of-band access      | RackNerd web console (VPS), console cable (switch), physical access (hosts)           | Works even if SSH or the tunnel is down                  |

> **Before you need it:** the credentials needed to get the vault back (Proxmox root, PBS, switch, router) can't live *only* in the vault. They have to be in the written-down set or reachable from a client's local Bitwarden copy.

---
## Full Restore Order

Use this when several things are down at once (fire, hardware loss, a compromise that means rebuilding). Each step depends on the ones above it.

1. **Router** - reset or replace the UDM Pro, restore the UniFi cloud backup. Confirm VLANs and DHCP are back.
2. **Switch** - restore the config copy from `pve2` over the console cable. Confirm trunks and the native blackhole VLAN.
3. **pve2 + PBS** - get `pve2` booted and its RAID healthy, then bring up the PBS VM (or reinstall PBS and re-add the existing datastore from the RAID). Nothing else can be restored until PBS is reachable.
4. **pve / pve3** - reinstall if needed and rejoin the cluster. Quorum needs 2 of the 3 nodes.
5. **Auth Server** (Authentik + Vaultwarden) - restore it first, because every other service logs in through it and the passwords are in it.
6. **VPS + WireGuard tunnel** - if the VPS is gone, rebuild it from the [VPS Proxy](/Documentation/Network/VPS%20Proxy) page. Check the tunnel handshake.
7. **Everything else** - Obsidian Server, Game Server, Media Server, in whatever order is needed.
8. **Verify** - every subdomain loads through Cloudflare, Minecraft answers through Velocity, Obsidian syncs.

---
## DoS Attack (one source)

1. **Find the source IP.** Web traffic arrives through Cloudflare, so the real client IP is in Caddy's logs (Cloudflare headers), not in the connection itself.
2. **Block it where it actually lands:**
   - **Web services:** add an IP block rule in the Cloudflare dashboard (Security → WAF). Blocking it in iptables does nothing, because the connections come from Cloudflare's IPs.
   - **SSH:** fail2ban and the per-IP rate limit on the VPS already handle this.
   - **Minecraft (raw TCP):** drop the IP with iptables on the VPS.

## DDoS Attack

The attack hits the VPS, not the home network. The home network is never directly reachable anyway (see [Double NAT](/2026/06/02/Double-NAT-Proxy-architecture/)).

**Web services (proxied through Cloudflare):**
1. Turn on **Under Attack mode** in Cloudflare for the zone.
2. If needed, add WAF / rate-limiting rules for the targeted subdomain.
3. Caddy already drops any request that doesn't come from Cloudflare, so floods sent straight to the VPS IP don't reach the proxied backends. `jelly` is the exception - it's DNS-only, so it's covered in the next section instead.

**Anything aimed at the VPS IP directly** (Minecraft, `jelly`, raw floods):
1. **Confirm it's a flood** - RackNerd's control panel graphs, and whether SSH or the RackNerd web console still respond.
2. **Shed load** - remove the Minecraft range from the RackNerd network firewall so the attack is dropped at the provider instead of on the VPS. Web services keep working through Cloudflare.
3. **Contact RackNerd support** - they handle upstream mitigation and null routes.
4. **If the IP gets null-routed or stays targeted** - move to a fresh VPS / new IP (rebuild per [VPS Proxy](/Documentation/Network/VPS%20Proxy)) and update DNS. The DNS-only records reveal the new IP too, so consider putting Minecraft on its own small VPS or a Minecraft DDoS-protection proxy so the web origin stays hidden.
5. Turn Under Attack mode and any temporary firewall changes back off afterwards.

## VPS Compromised

The VPS is disposable and stateless (see the "Security" section of [Double NAT](/2026/06/02/Double-NAT-Proxy-architecture/)), so it gets destroyed and rebuilt, never cleaned.

1. **Cut it off from the lab** - disable the VPS WireGuard peer on the UDM Pro. This is the one case where cutting the tunnel is the right move.
2. **Destroy and rebuild** - reinstall a fresh Ubuntu 24.04 VPS by hand from the [VPS Proxy](/Documentation/Network/VPS%20Proxy) page: Caddy, HAProxy, WireGuard, iptables, fail2ban, tunnel alert.
3. **New WireGuard keys on both ends** before re-enabling the peer.
4. **Rotate everything that passed through it in plain text.** The VPS terminates TLS, so an attacker on it could read sessions and tokens:
   - Log out all Authentik sessions.
   - Rotate the Wings ↔ panel token.
   - Change the CouchDB password (and update every Obsidian client).
   - Change passwords for apps with their own login (Jellyfin, Audiobookshelf).
5. **Check the lab for lateral movement** - review logs on the VMs the VPS could reach (see the [To-Do](/Documentation/To-Do) for limiting that at the router).

## VM or Host Compromised

**A single VM:**
1. **Isolate it** - in Proxmox, set the VM's network device to disconnected (or shut the VM down). VMs on the same VLAN can still talk to each other, so isolate the VM itself - VLANs only separate segments, not VMs inside one segment.
2. **Keep evidence if wanted** - take a snapshot before changing anything.
3. **Restore from PBS** - pick a backup from **before** the first sign of compromise (with weekly backups, that can be up to a few weeks back).
4. **Rotate every credential the VM held**, and fix how they got in before reconnecting it.

**A Proxmox host:**
1. Unplug that host from the switch.
2. Reinstall it from scratch - don't restore the host config blindly, it may contain the attacker's changes.
3. Rejoin the cluster and restore its VMs from PBS.

**Unclear what's affected:** unplug the router as a last resort to cut the whole lab off at once, then work through it host by host.

## Drive Fails

| **Which drive**                 | **Steps**                                                                                                  |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| A drive in pve2's RAID          | Replace it and let the array rebuild. Backups are at risk until the rebuild finishes - don't delete old ones. |
| pve2 boot drive / PBS VM disk   | Reinstall, recreate the PBS VM, re-add the existing datastore from the RAID.                               |
| A VM disk on pve or pve3        | Replace the drive, restore the affected VMs from PBS (to any node with space).                             |
| A Proxmox host boot drive       | Reinstall the host, restore its config from PBS, rejoin the cluster.                                       |
| Switch                          | Replace or reset, restore the config copy from `pve2` over the console cable.                              |
| Router                          | Replace or reset, restore the UniFi cloud backup.                                                          |

## WireGuard Tunnel Down

The tunnel alert job on the VPS pages my phone when this happens (see [VPS Proxy](/Documentation/Network/VPS%20Proxy)).

1. **On the VPS:** check the latest handshake for the router peer. If the VPS itself is unreachable, use the RackNerd web console.
2. **On the UDM Pro:** check the WireGuard peer status and restart it.
3. **Check MTU** if the handshake works but traffic doesn't (see [Router](/Documentation/Network/Router)).
4. **Confirm** - a proxied subdomain loads instead of a 502.

(The old pfSense router sometimes failed to recover the tunnel after a power outage because of a hardware failure.)

## Power or Internet Is Down

A small UPS lets the hosts shut down gracefully when it drops below 70%.

**When power comes back:**
1. Router and switch come up first.
2. Start the Proxmox hosts - the cluster needs 2 of 3 nodes for quorum. `pve2` (PBS) can come up whenever.
3. Check that the VMs auto-started and the tunnel handshake is back.

**Internet down:** nothing to do. The tunnel reconnects on its own once the connection is back (PersistentKeepalive).

---
## Known Gaps

- **No off-site copy.** All backups are on `pve2` in the same rack - RAID covers a dead drive, not fire, theft, a power surge, or ransomware that reaches PBS. Free-ish options when possible: rotate a USB drive as a PBS removable datastore and keep it somewhere else, or sync PBS to a friend's PBS (see the redundancy item on the [To-Do](/Documentation/To-Do)).
- **VPS configs aren't backed up.** Rebuilding from this documentation works but is slow. A cheap fix is copying the Caddyfile, HAProxy config, WireGuard config, and iptables rules to `pve2` on a schedule.
- **Weekly backups** mean up to a week of changes can be lost (Vaultwarden entries, Obsidian notes on the server, game worlds).
