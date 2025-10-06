/* eslint-disable no-console */
// Deterministic boot hardener — top-level export, no conditional exports.
export async function ensureCoreThenPatches(manifest = {}) {
  // De-dup concurrent callers
  if (window.__BOOT_HARDENER_PROMISE__) return window.__BOOT_HARDENER_PROMISE__;
  window.__BOOT_HARDENER_PROMISE__ = (async () => {
    // Normalize telemetry arrays; tolerate legacy {ok,fail}
    const tl = window.__PATCHES_LOADED__;
    const tf = window.__PATCHES_FAILED__;
    window.__PATCHES_LOADED__ = Array.isArray(tl) ? tl.slice()
      : (tl && typeof tl === "object" && Array.isArray(tl.ok)) ? tl.ok.slice() : [];
    window.__PATCHES_FAILED__ = Array.isArray(tf) ? tf.slice()
      : (tf && typeof tf === "object" && Array.isArray(tf.fail)) ? tf.fail.slice() : [];

    const acc = { loaded: [], failed: [] };

    function corePrereqsReady() {
      return typeof window.openDB === "function" && !!(window.Selection || window.SelectionService);
    }

    async function importOne(path) {
      if (!path || typeof path !== "string") return;
      try {
        const base = (document?.baseURI) ? document.baseURI : (window.location?.href || "/");
        const spec = new URL(path, base).href;
        await import(spec);
        acc.loaded.push(spec);
        if (!window.__PATCHES_LOADED__.includes(spec)) window.__PATCHES_LOADED__.push(spec);
      } catch (err) {
        acc.failed.push(path);
        if (!window.__PATCHES_FAILED__.includes(path)) window.__PATCHES_FAILED__.push(path);
        console.error("[boot] failed to import", path, err);
      }
    }

    async function importSeq(list) {
      for (const p of (list || [])) {
        // eslint-disable-next-line no-await-in-loop
        await importOne(p);
      }
    }

    const CORE = Array.isArray(manifest.CORE) ? manifest.CORE : [];
    const PATCHES = Array.isArray(manifest.PATCHES) ? manifest.PATCHES : [];

    // CORE → PATCHES (strict order)
    await importSeq(CORE);
    if (!corePrereqsReady() && CORE.length) {
      console.warn("[boot] core prereqs missing after pass 1; retrying CORE once");
      await importSeq(CORE);
    }
    await importSeq(PATCHES);

    window.__BOOT_DONE__ = {
      loaded: Array.from(new Set(acc.loaded)),
      failed: Array.from(new Set(acc.failed)),
    };

    // Expose diagnostics helper without side effects
    window.__BOOT_HARDENER__ = Object.assign(window.__BOOT_HARDENER__ || {}, { corePrereqsReady });

    // Double-rAF repaint
    try {
      const raf = window.requestAnimationFrame || (cb => setTimeout(cb, 16));
      raf(() => raf(() => window.renderAll?.()));
    } catch (_) {}

    if (window.__BOOT_DONE__.failed.length) {
      console.warn("[boot] completed with failures:", window.__BOOT_DONE__.failed);
    } else {
      console.log("[boot] ok:", window.__BOOT_DONE__.loaded.length, "fail:0");
    }

    return window.__BOOT_DONE__;
  })();
  return window.__BOOT_HARDENER_PROMISE__;
}
