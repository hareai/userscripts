# AI Project Contract

Binding for agents in this repository.

## Before editing

- Read this file, README, CONTRIBUTING, `git status`.
- Work on a topic branch. Do not commit to `main`.
- Do not invent site lists, cadence, like caps, or check-in hours. Those live in `extension/config.yaml`.
- Personal local use. Do not add store publishing.

## During editing

- Prefer the unpacked MV3 in `extension/` (one extension, three sites).
- Keep NodeSeek check-in as check-in only.
- Public docs stay product pages: what it is, how to install, license.
- Do not put hostnames, cookies, tokens, or collector ops in this repo.
- Ingest URL/token, notify secrets, and per-site cadence live in `extension/config.yaml` (copy `config.example.yaml`; gitignored). Not in content scripts, not in git. Page panels are read-only.
- Notify is an adapter registry (`hermes` local webhook, `telegram` bot) selected in that yaml. Unknown adapter names fail closed. Do not hardcode ports, tokens, or chat IDs.
- One job at a time. `jobs.lock` is that job's lifetime and equals one tab: open tab → lock → work only there → release closes the tab. Same-day NodeSeek check-in and linux.do session cap skip without opening a tab. Owner tabs are never reused.

## Before commit

- `node --test test/*.test.js`
- Conventional Commit: `type(scope): imperative summary`
- Push the branch. Open a PR. Do not push `main`.
