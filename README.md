# userscripts

Browser userscripts. Install with a userscript manager. Not published to Greasy Fork.

[简体中文](README.zh-CN.md)

## Install

1. Install [Violentmonkey](https://violentmonkey.github.io/) or Tampermonkey.
2. Open a `.user.js` file in this repo, or paste its raw URL into the manager.

| File | Site | What it does |
|---|---|---|
| [`nodeseek-checkin.user.js`](nodeseek-checkin.user.js) | [nodeseek.com](https://www.nodeseek.com/) | Daily check-in while logged in (`POST /api/attendance?random=true`) |

You must already be logged in on that site. The script does not store cookies or send them anywhere.

## License

[GPL-3.0-or-later](LICENSE).

`nodeseek-checkin.user.js` is derived from [NodeSeekX `signIn.js`](https://github.com/NodeSeekX/userscript) (GPL-3.0). Check-in only; the rest of that toolbox is not included.
