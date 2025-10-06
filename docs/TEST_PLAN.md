# Test Plan

## Self-Test 2.0
- Module-only invariant for app scripts
- `renderAll` presence
- Single repaint on `app:data:changed`
- Seed/importer coalesce exactly once

## Smoke (Acceptance) Checklist
- Loader guard, Self-test PASS, Seed/Delete behavior, Dashboard “All”, Action bar, Calendar, Settings, No event storms.

## Suggested Follow-ups
- Add tiny headless checks around db helpers and surface hook idempotency.
