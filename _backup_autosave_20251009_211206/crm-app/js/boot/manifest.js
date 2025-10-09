/* crm-app/js/boot/manifest.js — Phase 2: two-entry startup */
export const CORE = [
  "/js/app.core.js",
  "/js/app.main.js",
];

// SAFEBOOT DEFAULT: runtime patches remain disabled unless explicitly opted-in.
export const PATCHES = [];

export default { CORE, PATCHES };
