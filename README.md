# userscripts

One unpacked Chrome/Chromium extension for local use.

[简体中文](README.zh-CN.md)

## Install

1. Clone this repository.
2. Chrome → `chrome://extensions` → Developer mode → Load unpacked → select `extension/`.
3. Open the extension options. Optional: a `127.0.0.1` Hermes webhook URL for login-lost alerts, and an ingest URL for ExpiredDomains.

| Site | What it does |
|---|---|
| [linux.do](https://linux.do/) | Three random browse sessions per day; like cap 2 |
| [nodeseek.com](https://www.nodeseek.com/) | Daily check-in while logged in |
| [member.expireddomains.net](https://member.expireddomains.net/) | Run saved searches in this tab (5 pages each) and POST rows to a local URL |

Stay time and caps are in the page panel. Alerts and ingest POST only to `127.0.0.1` or `::1`. The notify adapter currently talks to a local Hermes webhook (`X-Hub-Signature-256`).

The older `.user.js` files are still here if you prefer a userscript manager.

## License

[GPL-3.0-or-later](LICENSE).

The NodeSeek check-in path is derived from [NodeSeekX `signIn.js`](https://github.com/NodeSeekX/userscript) (GPL-3.0).
