# userscripts

个人使用的本地 Chrome/Chromium 扩展（一个插件，三个站点）。

[English](README.md)

## 安装

1. 克隆本仓库。
2. Chrome → `chrome://extensions` → 开发者模式 → 加载已解压的扩展程序 → 选 `extension/`。
3. 打开扩展选项。用 ExpiredDomains 时再填 `127.0.0.1` ingest 地址。

| 站点 | 做什么 |
|---|---|
| [linux.do](https://linux.do/) | 逛最新帖；可选点赞（上限 0 = 关） |
| [nodeseek.com](https://www.nodeseek.com/) | 已登录时每日签到 |
| [member.expireddomains.net](https://member.expireddomains.net/) | 当前页依次跑保存搜索（各 5 页），抽到你填的本地地址 |

linux.do 默认暂停。停留、篇数、点赞上限在页内面板改。expireddomains 没在选项里填 `127.0.0.1` URL 不会发送。

仓库里仍保留 `.user.js`，想用脚本管理器也可以。

## 许可证

[GPL-3.0-or-later](LICENSE)。

NodeSeek 签到路径改自 [NodeSeekX `signIn.js`](https://github.com/NodeSeekX/userscript)（GPL-3.0）。
