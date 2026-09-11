# userscripts

Personal userscripts for local use.

[简体中文](README.zh-CN.md)

## Install

1. Install [Violentmonkey](https://violentmonkey.github.io/) or Tampermonkey.
2. Open a `.user.js` file in this repo.

| File | Site | What it does |
|---|---|---|
| [`nodeseek-checkin.user.js`](nodeseek-checkin.user.js) | [nodeseek.com](https://www.nodeseek.com/) | Daily check-in while logged in |
| [`linuxdo-browse.user.js`](linuxdo-browse.user.js) | [linux.do](https://linux.do/) | Browse latest topics; optional likes (cap 0 = off) |
| [`expireddomains-ingest.user.js`](expireddomains-ingest.user.js) | [member.expireddomains.net](https://member.expireddomains.net/) | Run saved searches in this tab (5 pages each) and dump rows to a local URL |

linux.do starts paused. Stay time, topic count, and like cap are in the page panel. expireddomains sends nothing until you set the URL. Pages default to 5 (200 rows each).

## License

[GPL-3.0-or-later](LICENSE).

`nodeseek-checkin.user.js` is derived from [NodeSeekX `signIn.js`](https://github.com/NodeSeekX/userscript) (GPL-3.0).
