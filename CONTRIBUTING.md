# Contributing

```text
main (protected)
  → feat/* | fix/* | docs/* | test/* | ci/*
  → Conventional Commit
  → PR
  → squash merge
```

Do not commit on `main`. This is a personal local extension.

Commit format: `type(scope): imperative summary`.
Allowed types: `feat` `fix` `refactor` `docs` `test` `ci` `chore`.

Run `node --test test/*.test.js` before opening a PR.
