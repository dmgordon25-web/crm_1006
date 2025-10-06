# Rendering & Scheduling

- **Single entry**: `window.renderAll()`
- **Batching**: `RenderGuard.requestRender()` (double-rAF)
- **Hooks**: `RenderGuard.registerHook()` for post-paint enhancers (DnD, badges, etc.)

Generated usage: `docs/generated/render_usage.md`.
