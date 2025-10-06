# Project Overview

This repo is an offline-first single-page application (SPA) for a mortgage CRM built on:
- ES Modules (module-only loaders with fallback protection)
- IndexedDB for local data (via db.js helpers)
- A single global mutation event `app:data:changed` (coalesced per batch)
- Repaint scheduling via a double-rAF guard (`RenderGuard`) and a single UI root (`window.renderAll`)

Generated docs live in `docs/generated/` (run `node devtools/audit.mjs`).
