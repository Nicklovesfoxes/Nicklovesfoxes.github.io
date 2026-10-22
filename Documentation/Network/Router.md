---
layout: page
title: Router
description: UniFi Dream Machine Pro - firewall, WireGuard, and known issues
toc: "true"
---
**Hardware:** UniFi Dream Machine Pro (replaced the old pfSense box)
**Management:** Management subnet
**Role:** Primary network gateway and firewall
**Backup Located**: Cloud

---
## ACL / Firewall

Nothing is let in the wan, all inbound is through the WireGuard tunnel, the vlans are set up to not allow cross talk.

---
## WireGuard

A Virtual Private Server (VPS) is used to expose internal services securely. The VPS server routes traffic through this tunnel (see [VPS Proxy](/Documentation/Network/VPS%20Proxy)).

| **Configuration Item** | **Value**                       | **Note**                                           |
| ---------------------- | ------------------------------- | -------------------------------------------------- |
| **Description**        | WireGuard to VPS                | The router is a peer                               |
| **Tunnel Address**     | `10.8.0.2`                      | VPS is `10.8.0.1`                                  |
| **Listen Port**        | Not published                   |                                                    |
| **MTU**                | `1420`                          | (Recommended for WireGuard to avoid fragmentation) |
| **Allowed IPs**        | `10.8.0.1/32`, `0.0.0.0/0`      | Routes traffic for the tunnel and the Internet     |

> **WireGuard note:** When replacing a router, **export and document every WireGuard peer setting** from the old router before decommissioning it. `AllowedIPs = 0.0.0.0/0` is required on any peer that is being used as a default gateway for internet traffic, not just for tunnel-to-tunnel communication. This is easy to miss because the tunnel itself will appear healthy (handshake succeeds, gateway monitoring passes) while internet traffic is silently dropped.

---
## DHCP Server 
The router gives out DHCP leases for many of the VLANS, generally I will hand them out  at 192.168.x.100 - 192.168.x.199

---
## Known Issues / Notes

## Subnet mask

![](/assets/images/router-subnet-mask-mistake.png)
Don't make this mistake again use the correct subnet mask on new interfaces. 

---
## Old Router (pfSense) - History

Before the UDM Pro, the router was a pile of junk running pfSense. Notes kept for reference:

- **C States:** Something was causing the system to freeze, there were no crash reports the whole thing would freeze till reboot. Fixed by disabling all the power saving options and C States in BIOS.
- **Single Point of Failure:** The boot drive was a 12+ year old 2.5 inch SATA hard drive from Apple, with old unbranded RAM.
