/* crm-app/js/boot/manifest.js
 * Authoritative boot manifest for SafeBoot. Patches are OFF by default.
 * To temporarily enable patches for dev: add ?patches=on OR localStorage['crm:patches']='on'
 */
export const CORE = [
  // Keep core in strict, deterministic order. Most dependent services first.
  "/js/env.js",
  "/js/db.js",
  "/js/db_compat.js",
  "/js/core/renderGuard.js",
  "/js/services/selection.js",
  "/js/utils.js",
  "/js/render.js",
  "/js/ui/Toast.js",
  "/js/ui/Confirm.js",
  "/js/data/settings.js",
  "/js/migrations.js",
  "/js/presets.js",
  "/js/services/pipelineStages.js",
  "/js/services/softDelete.js",
  // Add more core modules HERE if absolutely required by baseline tabs,
  // but do not include any dated patch files.
];

// SAFEBOOT DEFAULT: no patches are loaded unless explicitly enabled via query/localStorage.
export const PATCHES = [];

export default { CORE, PATCHES };
