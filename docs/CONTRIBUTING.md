# Contributing

- JS-only changes; no runtime deps/CDNs.
- Respect invariants: single mutation event; RenderGuard batching; module-only loader.
- For surface enhancers, always use idempotent wiring with post-paint hooks and microtasks.
- Update `CHANGELOG.md` and run `node devtools/audit.mjs` to refresh `docs/generated/`.
