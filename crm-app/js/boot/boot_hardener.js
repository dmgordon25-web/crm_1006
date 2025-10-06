/* eslint-disable no-console */
/**
 * boot_hardener.js
 * Deterministic boot: import CORE (ordered) then PATCHES (ordered), normalize telemetry,
 * expose __BOOT_DONE__, and schedule a double-rAF repaint.
 * Idempotent and JS-only.
 */

if (!window.__BOOT_HARDENER_RAN__) {
  window.__BOOT_HARDENER_RAN__ = true;

  // Ensure legacy-compatible telemetry arrays exist
  if (!Array.isArray(window.__PATCHES_LOADED__)) window.__PATCHES_LOADED__ = [];
  if (!Array.isArray(window.__PATCHES_FAILED__)) window.__PATCHES_FAILED__ = [];

  // Some older builds used an object { ok:[], fail:[] }. Normalize once if found.
  try {
    const t = window.__PATCHES_LOADED__;
    if (t && typeof t === "object" && !Array.isArray(t)) {
      const ok = Array.isArray(t.ok) ? t.ok : [];
      const fail = Array.isArray(t.fail) ? t.fail : [];
      window.__PATCHES_LOADED__ = ok.slice();
      window.__PATCHES_FAILED__ = fail.slice();
    }
  } catch (_) {}

  async function importOne(path, acc) {
    if (!path || typeof path !== "string") return;
    const url = path.startsWith("/") ? path : ("/" + path.replace(/^(\.\/)+/, ""));
    try {
      await import(url);
      acc.loaded.push(url);
      if (!window.__PATCHES_LOADED__.includes(url)) window.__PATCHES_LOADED__.push(url);
    } catch (err) {
      acc.failed.push(url);
      if (!window.__PATCHES_FAILED__.includes(url)) window.__PATCHES_FAILED__.push(url);
      console.error("[boot] failed to import", url, err);
    }
  }

  async function importSequential(paths, acc) {
    for (const p of (paths || [])) {
      // eslint-disable-next-line no-await-in-loop
      await importOne(p, acc);
    }
  }

  function corePrereqsReady() {
    const okOpenDB = typeof window.openDB === "function";
    const okSelection = !!(window.Selection || window.SelectionService);
    return okOpenDB && okSelection;
  }

  export async function ensureCoreThenPatches(manifest) {
    const CORE = (manifest && Array.isArray(manifest.CORE)) ? manifest.CORE.slice() : [];
    const PATCHES = (manifest && Array.isArray(manifest.PATCHES)) ? manifest.PATCHES.slice() : [];
    const acc = { loaded: [], failed: [] };

    if (!Object.prototype.hasOwnProperty.call(window, "__EXPECTED_PATCHES__")) {
      Object.defineProperty(window, "__EXPECTED_PATCHES__", {
        value: PATCHES.slice(),
        enumerable: false,
        writable: false,
        configurable: true,
      });
    }

    // 1) Import CORE in strict order
    await importSequential(CORE, acc);

    // 2) If core prereqs are still missing, try one more pass of CORE only
    if (!corePrereqsReady() && CORE.length) {
      console.warn("[boot] core prereqs not ready; attempting a second CORE pass once");
      await importSequential(CORE, acc);
    }

    // 3) Import PATCHES in strict order
    await importSequential(PATCHES, acc);

    // 4) Publish summary (de-duplicated)
    window.__BOOT_DONE__ = {
      loaded: Array.from(new Set(acc.loaded)),
      failed: Array.from(new Set(acc.failed)),
    };

    // 5) Schedule a double-rAF repaint if renderAll exists
    try {
      const raf = window.requestAnimationFrame || ((cb) => setTimeout(cb, 16));
      raf(() => raf(() => window.renderAll && window.renderAll()));
    } catch (_) {}

    if (window.__BOOT_DONE__.failed.length) {
      console.warn("[boot] completed with failures:", window.__BOOT_DONE__.failed);
    } else {
      console.log("[boot] ok:", window.__BOOT_DONE__.loaded.length, "fail:0");
    }
  }

  // Expose for diagnostics and late initializers
  window.__BOOT_HARDENER__ = {
    ensureCoreThenPatches,
    corePrereqsReady,
  };
}

