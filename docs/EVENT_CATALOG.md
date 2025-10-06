# Event Catalog

Authoritative events are enumerated by the audit in `docs/generated/event_catalog.md`.

- `app:data:changed` — Single coalesced mutation signal; triggers repaint.
- `selection:changed` — Emitted in a microtask after selection changes.
- Additional surface events (importer, seed, docs, …) are listed in the generated catalog.
