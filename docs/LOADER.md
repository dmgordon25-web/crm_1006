# Loader Invariants

- Same-origin `/js` & `/patches` are injected as **type="module"**.
- Boot keeps a “module-enforcer” shim limited to same-origin.
- Fallbacks log: `loader: fallback-inject { path, as: 'module' }`.
- Self-test verifies module-only scripts and `renderAll` presence.
