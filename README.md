# userscripts

One unpacked Chrome/Chromium extension for local use.

[简体中文](README.zh-CN.md)

## Install

1. Clone this repository.
2. Chrome → `chrome://extensions` → Developer mode → Load unpacked → select `extension/`.
3. Open the extension options. Set a `127.0.0.1` ingest URL if you use ExpiredDomains.

| Site | What it does |
|---|---|
| [linux.do](https://linux.do/) | Browse latest topics; optional likes (cap 0 = off) |
| [nodeseek.com](https://www.nodeseek.com/) | Daily check-in while logged in |
| [member.expireddomains.net](https://member.expireddomains.net/) | Run saved searches in this tab (5 pages each) and POST rows to a local URL |

linux.do starts paused. Stay time, topic count, and like cap are in the page panel. expireddomains sends nothing until you set a `127.0.0.1` URL in options.

The older `.user.js` files are still here if you prefer a userscript manager.

## License

[GPL-3.0-or-later](LICENSE).

The NodeSeek check-in path is derived from [NodeSeekX `signIn.js`](https://github.com/NodeSeekX/userscript) (GPL-3.0).
