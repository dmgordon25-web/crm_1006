# Quarantined Files (2024-05-26)

- `js/_legacy/patch_2025-09-27_workbench.js` → `_graveyard/js/_legacy/patch_2025-09-27_workbench.js` — Referenced only by legacy self-test hooks.
- `js/store/db_core.js` → `_graveyard/js/store/db_core.js` — Imported exclusively by legacy workbench patch.
- `js/ui/FormFooter.tsx` → `_graveyard/js/ui/FormFooter.tsx` — TypeScript variant unused by runtime; JS version is active.
- `js/ui/GhostButton.tsx` → `_graveyard/js/ui/GhostButton.tsx` — TypeScript variant unused; JS counterpart covers runtime.
- `js/ui/PrimaryButton.tsx` → `_graveyard/js/ui/PrimaryButton.tsx` — TypeScript variant unused; JS counterpart covers runtime.
- `js/ui/strings.ts` → `_graveyard/js/ui/strings.ts` — No inbound references; JS module supplies strings.
- `js/views/data_tables.js` → `_graveyard/js/views/data_tables.js` — No inbound references in active code.

These files had no live inbound references at time of move. Restore by moving back to original path if required.
