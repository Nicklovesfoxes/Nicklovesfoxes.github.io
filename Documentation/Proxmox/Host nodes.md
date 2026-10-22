---
layout: page
title: Host nodes
description: Proxmox cluster - hosts and access
toc: "true"
---
**Status:** Backed up weekly to Proxmox Backup Server on pve2

---

Servers use the following subnets 

| **Name** | **VLAN** | **Subnet**        | **Description**                            |
| -------- | -------- | ----------------- | ------------------------------------------ |
| Servers  | 20       | `192.168.20.0/24` | Used by the VMs and Services               |
| Core     | 25       | `192.168.25.0/24` | Core layer for hosts to talk to each other |
| Remote   | 35       | `192.168.35.0/24` | Mainly for proxied GUI.                    |


The hosts and most of the VMs will use manual IPs, DHCP exists for `192.168.20.0/24`


The IPs will start at 192.168.35.2 - 9 for the hosts (same IP for core IP 192.168.25.x) , then 192.168.20.10 - 99 for the VMs, 192.168.20.100 - 199 are for DHCP VMs. 


| **Hostname** | **Role**                      | **IP**         | **RAM** | Physically                             |
| ------------ | ----------------------------- | -------------- | ------- | -------------------------------------- |
| pve          | bulk storage and main node    | `192.168.35.2` | 64 GB   | Workstation PC                         |
| pve2         | Backup location and small VMs | `192.168.35.3` | 8 GB    | Junk in an old rack-mounted camera box. |
| pve3         | Tie Breaker and small VMs     | `192.168.35.4` | 16GB    | Mini PC                                |


---

## Cluster Configuration

Standard 3-node Proxmox cluster (pve, pve2, pve3) with quorum via corosync, running over the Core network (VLAN 25, `192.168.25.0/24`).

## Access / Auth

The Proxmox web UI is accessed through Authentik (see [Auth Server](/Documentation/VMs/Auth%20Server)), the same SSO pattern used for the other public-facing services (see [VPS Proxy](/Documentation/Network/VPS%20Proxy)).

## Backups

Every VM and the host configs (`/etc/pve`, host network config) are backed up **weekly** to a **Proxmox Backup Server (PBS) VM on pve2**, keeping the last **4** backups. The datastore sits on pve2's RAID.

There's no off-site copy yet - pve2 is in the same rack, so this covers a dead drive or a bad change, not fire, theft, or a surge. Restore steps and order are on [Emergency Plans](/Documentation/Emergency%20Plans).

---

![](/assets/images/proxmox-cluster-nodes.png)


