/* crm-app/js/boot/loader.js
 * Authoritative entry point. Do not branch or duplicate boot logic elsewhere.
 */
import { CORE, PATCHES } from "./manifest.js";
import { ensureCoreThenPatches } from "./boot_hardener.js";

async function bootstrap() {
  // Single success/fail path; any fatal inside ensure* will throw or overlay.
  await ensureCoreThenPatches({ CORE, PATCHES });

  // Only proceed to app wiring after Boot OK.
  if (window.__BOOT_OK__) {
    // Render bootstrap: respect the repaint contract
    try {
      // If app has a dedicated init, call it; otherwise just trigger a repaint
      if (typeof window.dispatchAppDataChanged === "function") {
        window.dispatchAppDataChanged("boot");
      } else if (typeof window.renderAll === "function") {
        // Fallback: schedule a direct render (kept minimal)
        window.requestAnimationFrame(() => window.renderAll?.());
      }
    } catch (err) {
      // Any exception here is a fatal boot error
      throw err;
    }
  }
}

// Kick it off (no other side effects here)
bootstrap().catch((err) => {
  // Last-chance guard: ensure a visible failure in strict mode
  // boot_hardener.fatal() handles overlay; here we only log.
  console.error("[BOOT:UNHANDLED]", err);
});
