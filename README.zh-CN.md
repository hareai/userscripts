# userscripts

个人使用的本地脚本。

[English](README.md)

## 安装

1. 安装 [Violentmonkey](https://violentmonkey.github.io/) 或 Tampermonkey。
2. 打开本仓库里的 `.user.js`。

| 文件 | 站点 | 做什么 |
|---|---|---|
| [`nodeseek-checkin.user.js`](nodeseek-checkin.user.js) | [nodeseek.com](https://www.nodeseek.com/) | 已登录时每日签到 |
| [`linuxdo-browse.user.js`](linuxdo-browse.user.js) | [linux.do](https://linux.do/) | 逛最新帖；可选点赞（上限 0 = 关） |
| [`expireddomains-ingest.user.js`](expireddomains-ingest.user.js) | [member.expireddomains.net](https://member.expireddomains.net/) | 当前页依次跑保存搜索（各 5 页），抽到你填的本地地址 |

linux.do 默认暂停。停留、篇数、点赞上限在页内面板改。expireddomains 没填 URL 不会发送。默认 5 页（每页 200 条）。

## 许可证

[GPL-3.0-or-later](LICENSE)。

`nodeseek-checkin.user.js` 改自 [NodeSeekX `signIn.js`](https://github.com/NodeSeekX/userscript)（GPL-3.0）。
