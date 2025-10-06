/* eslint-disable no-console */
import { CORE, PATCHES } from "./manifest.js";
import { ensureCoreThenPatches } from "./boot_hardener.js";

// Idempotent guard to avoid double-running
if (!window.__BOOT_LOADER_MAIN__) {
  window.__BOOT_LOADER_MAIN__ = (async () => {
    try {
      await ensureCoreThenPatches({ CORE, PATCHES });
    } catch (err) {
      console.error("[boot/loader] unrecoverable boot failure", err);
      try { window.showDiagnosticsOverlay && window.showDiagnosticsOverlay(err); } catch(_) {}
    }
  })();
}

export default window.__BOOT_LOADER_MAIN__;

