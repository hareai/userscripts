# userscripts

浏览器用户脚本。用脚本管理器本地安装。不发 Greasy Fork。

[English](README.md)

## 安装

1. 安装 [Violentmonkey](https://violentmonkey.github.io/) 或 Tampermonkey。
2. 打开本仓库里的 `.user.js`，或把 raw URL 贴进管理器。

| 文件 | 站点 | 做什么 |
|---|---|---|
| [`nodeseek-checkin.user.js`](nodeseek-checkin.user.js) | [nodeseek.com](https://www.nodeseek.com/) | 已登录时每日签到（`POST /api/attendance?random=true`） |

需要你自己先登录。脚本不存 cookie，也不把 cookie 发出去。

## 许可证

[GPL-3.0-or-later](LICENSE)。

`nodeseek-checkin.user.js` 改自 [NodeSeekX `signIn.js`](https://github.com/NodeSeekX/userscript)（GPL-3.0）。只保留签到，不含那套论坛工具箱的其余功能。
