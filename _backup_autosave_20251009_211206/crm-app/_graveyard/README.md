# Graveyard (Quarantine)
This folder holds files removed from active source to reduce noise. They remain available for reference and optional loading.

Conventions:
- `legacy_patches/patch_*.js`: Original patch files, physically moved here. A **shim** remains under `crm-app/js/patch_*.js` that side-effect imports the moved file so `?patches=on` still works.
- `orphans/...`: Orphan files not referenced by the app. When in doubt, a stub is left at the original path to avoid breaking accidental imports.
