---
layout: page
title: Obsidian Server
description: VM hosting CouchDB for Obsidian sync
toc: "true"
---
**IP:** `192.168.20.11`

---

Runs CouchDB, used as the sync backend for Obsidian notes app.

Public at `obsidian.example.com` through Caddy on the [VPS](/Documentation/Network/VPS%20Proxy) (see [Overview](/Documentation/Overview#core-public-routing)). From the public side, Caddy returns **403** for every server-level CouchDB endpoint (`/_*`, including the `/_utils` admin UI) except `/_session`, so only sync traffic gets through. Admin tasks are done internally. Login brute force is handled by a long random password - fail2ban can't ban real client IPs here because the traffic arrives through Cloudflare.

Uses three 2 TB hard drives in RAID 5.