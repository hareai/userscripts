# userscripts

个人使用的本地 Chrome/Chromium 扩展（一个插件，三个站点）。

[English](README.md)

## 安装

1. 克隆本仓库。
2. Chrome → `chrome://extensions` → 开发者模式 → 加载已解压的扩展程序 → 选 `extension/`。
3. 把 `config.example.yaml` 复制成 `extension/config.yaml`，在里面填通知、ingest、各站节奏。改完重新加载扩展。

| 站点 | 做什么 |
|---|---|
| [linux.do](https://linux.do/) | 每天随机逛 3 次；点赞上限 2 |
| [nodeseek.com](https://www.nodeseek.com/) | 已登录时每日签到 |
| [member.expireddomains.net](https://member.expireddomains.net/) | 当前页依次跑保存搜索（各 5 页），抽到你填的本地地址 |

停留、点赞上限、NodeSeek 签到、ExpiredDomains 翻页都在 `config.yaml`。ingest 只发到 `127.0.0.1` / `::1`。提醒走该文件里选的通知适配器。同一时刻只跑一个任务：扩展自己开标签，做完关掉。

仓库里仍保留 `.user.js`，想用脚本管理器也可以。

## 许可证

[GPL-3.0-or-later](LICENSE)。

NodeSeek 签到路径改自 [NodeSeekX `signIn.js`](https://github.com/NodeSeekX/userscript)（GPL-3.0）。
