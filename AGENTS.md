# AI Project Contract

Binding for agents in this repository.

## Before editing

- Read this file, README, CONTRIBUTING, `git status`.
- Work on a topic branch. Do not commit to `main`.
- Do not invent site lists, cadence, like caps, or check-in hours.
- Personal local use. Do not add store publishing.

## During editing

- Prefer the unpacked MV3 in `extension/` (one extension, three sites).
- Keep NodeSeek check-in as check-in only.
- Public docs stay product pages: what it is, how to install, license.
- Do not put hostnames, cookies, tokens, or collector ops in this repo.
- Ingest URL/token and notify webhook secret live in extension options (`chrome.storage.local`), not in content scripts.
- Notify adapter is `hermes` (local webhook). Do not hardcode ports, tokens, or chat IDs.
- One job at a time (`jobs.lock`). Timeouts fail the job and notify. Notify failures queue and retry.

## Before commit

- `node --test test/*.test.js`
- Conventional Commit: `type(scope): imperative summary`
- Push the branch. Open a PR. Do not push `main`.
