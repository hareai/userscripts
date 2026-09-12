# userscripts

个人使用的本地 Chrome/Chromium 扩展（一个插件，三个站点）。

[English](README.md)

## 安装

1. 克隆本仓库。
2. Chrome → `chrome://extensions` → 开发者模式 → 加载已解压的扩展程序 → 选 `extension/`。
3. 打开扩展选项。可选：填 `127.0.0.1` Hermes webhook（掉登录提醒）和 ingest 地址（ExpiredDomains）。

| 站点 | 做什么 |
|---|---|
| [linux.do](https://linux.do/) | 每天随机逛 3 次；点赞上限 2 |
| [nodeseek.com](https://www.nodeseek.com/) | 已登录时每日签到 |
| [member.expireddomains.net](https://member.expireddomains.net/) | 当前页依次跑保存搜索（各 5 页），抽到你填的本地地址 |

停留和上限在页内面板改。提醒和 ingest 只发到 `127.0.0.1` / `::1`。通知适配器目前接本机 Hermes webhook（`X-Hub-Signature-256`）。同一时刻只跑一个任务；超时或通知失败会重试，然后告警。

仓库里仍保留 `.user.js`，想用脚本管理器也可以。

## 许可证

[GPL-3.0-or-later](LICENSE)。

NodeSeek 签到路径改自 [NodeSeekX `signIn.js`](https://github.com/NodeSeekX/userscript)（GPL-3.0）。
