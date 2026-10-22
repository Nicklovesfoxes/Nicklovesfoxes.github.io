---
layout: page
title: Auth Server
description: VM hosting Authentik and Vaultwarden
toc: "true"
---
**IP:** `192.168.20.10`

---

Authentik and Vaultwarden both run on this VM, each in Docker - grouped together since they're both auth-adjacent services.

Authentik provides SSO for the public services - forward-auth through Caddy for most of them, OIDC inside the app for Vaultwarden and Jellyfin.

Vaultwarden is the self-hosted password vault, public at `vault.example.com`. It logs in through Authentik with OIDC rather than forward-auth (see [Overview](/Documentation/Overview#core-public-routing)). Standard hardening is applied (admin panel token-protected and blocked from the internet at Caddy - LAN-only, new signups disabled). Some passwords are written down; most VM and locally-used passwords are randomly generated and stored in it.

The whole Auth Server VM (Authentik and Vaultwarden) is backed up weekly to Proxmox Backup Server on pve2 (see [Host Nodes - Backups](/Documentation/Proxmox/Host%20nodes#backups)). On top of that, every device using a Bitwarden client keeps a local encrypted copy of the vault, which covers changes made since the last weekly backup. In a full rebuild this VM is restored first, since everything else logs in through it (see [Emergency Plans](/Documentation/Emergency%20Plans)). 