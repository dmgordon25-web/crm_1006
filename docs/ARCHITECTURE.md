# Architecture

- **App Shell / Loaders**: Enforce module-only script loading for `/js` and `/patches`. Fallback injections log `loader: fallback-inject { path, as: 'module' }`.
- **Rendering**: `RenderGuard.registerHook(fn)` batches paints; `RenderGuard.requestRender()` coalesces updates. `window.renderAll` is the single repaint entry.
- **Data Flow**: Mutations commit to IndexedDB, then emit exactly one `app:data:changed` per batch → triggers a single repaint.
- **Selection & Action Bar**: Selection changes emit `selection:changed` in a microtask; action-bar wiring is idempotent.
- **Surfaces**: Dashboard (KPI widgets), Workbench (tables), Pipeline/Kanban, Calendar, Notifications, Email Templates, Doc Center, Settings.

See generated: `module_inventory.md`, `event_catalog.md`, `render_usage.md`.
